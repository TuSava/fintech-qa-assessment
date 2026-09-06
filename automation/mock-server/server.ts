import * as http from 'http';
import * as crypto from 'crypto';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  currency: string;
  walletId: string;
  createdAt: string;
}

interface Wallet {
  id: string;
  userId: string;
  tenantId: string;
  currency: string;
  balance: number; // in integer cents
  status: 'ACTIVE' | 'LOCKED';
}

interface Transaction {
  id: string;
  tenantId: string;
  userId: string;
  type: 'DEPOSIT' | 'BET' | 'WIN';
  amount: number;
  currency: string;
  referenceId: string;
  createdAt: string;
}

interface GameRound {
  roundId: string;
  tenantId: string;
  userId: string;
  betAmount: number;
  winAmount?: number;
  status: 'OPEN' | 'SETTLED';
}

const PORT = 3000;

// Secrets store per tenant
const SECRETS: Record<string, { psp: string; gsp: string }> = {
  tenant_alpha: {
    psp: 'sec_live_alpha_psp_8f93bc817',
    gsp: 'sec_live_alpha_gsp_4d1109aa7',
  },
  tenant_beta: {
    psp: 'sec_live_beta_psp_1a2b3c4d5',
    gsp: 'sec_live_beta_gsp_9z8y7x6w5',
  },
};

// In-Memory Database
const users = new Map<string, User>(); // key: `${tenantId}:${email}`
const usersById = new Map<string, User>();
const wallets = new Map<string, Wallet>(); // key: userId
const transactions: Transaction[] = [];
const pspProcessed = new Map<string, { status: string; psp_reference_id: string; credited_amount: number; new_balance: number }>();
const gameRounds = new Map<string, GameRound>(); // key: roundId
const activeTokens = new Map<string, { userId: string; tenantId: string }>();

function sendJson(res: http.ServerResponse, statusCode: number, data: any, headers: Record<string, string> = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

function verifyHmac(body: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return signature === expected;
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method || 'GET';

  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', () => {
    try {
      // 1. Health check
      if (pathname === '/api/v1/health' || pathname === '/health') {
        return sendJson(res, 200, { status: 'HEALTHY' });
      }

      // 2. Auth: Register
      if (pathname === '/api/v1/auth/register' && method === 'POST') {
        const payload = JSON.parse(body);
        const { tenant_id, email, password, currency } = payload;
        const tenantHeader = req.headers['x-tenant-id'] as string;
        const activeTenant = tenantHeader || tenant_id;

        if (!email || !password) {
          return sendJson(res, 400, { error: 'ERR_INVALID_INPUT', message: 'Email and password required' });
        }

        const userKey = `${activeTenant}:${email.toLowerCase()}`;
        if (users.has(userKey)) {
          return sendJson(res, 409, { error: 'ERR_USER_EXISTS', message: 'Email already registered for this tenant' });
        }

        const userId = `usr_${crypto.randomUUID()}`;
        const walletId = `wal_${crypto.randomUUID()}`;
        const newUser: User = {
          id: userId,
          email: email.toLowerCase(),
          passwordHash: crypto.createHash('sha256').update(password).digest('hex'),
          tenantId: activeTenant,
          currency: currency || 'EUR',
          walletId,
          createdAt: new Date().toISOString(),
        };

        users.set(userKey, newUser);
        usersById.set(userId, newUser);
        wallets.set(userId, {
          id: walletId,
          userId,
          tenantId: activeTenant,
          currency: newUser.currency,
          balance: 0,
          status: 'ACTIVE',
        });

        return sendJson(res, 201, {
          user_id: userId,
          email: newUser.email,
          tenant_id: activeTenant,
          wallet_id: walletId,
          created_at: newUser.createdAt,
        });
      }

      // 3. Auth: Login
      if (pathname === '/api/v1/auth/login' && method === 'POST') {
        const payload = JSON.parse(body);
        const { tenant_id, email, password } = payload;
        const tenantHeader = req.headers['x-tenant-id'] as string;
        const activeTenant = tenantHeader || tenant_id;

        const userKey = `${activeTenant}:${(email || '').toLowerCase()}`;
        const user = users.get(userKey);
        if (!user) {
          return sendJson(res, 401, { error: 'ERR_INVALID_CREDENTIALS', message: 'Invalid email or password' });
        }

        const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
        if (inputHash !== user.passwordHash) {
          return sendJson(res, 401, { error: 'ERR_INVALID_CREDENTIALS', message: 'Invalid email or password' });
        }

        const token = `jwt_${crypto.randomBytes(24).toString('hex')}`;
        activeTokens.set(token, { userId: user.id, tenantId: user.tenantId });

        return sendJson(res, 200, {
          access_token: token,
          refresh_token: `ref_${crypto.randomBytes(24).toString('hex')}`,
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }

      // 4. Wallet: Balance
      if (pathname === '/api/v1/wallet/balance' && method === 'GET') {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return sendJson(res, 401, { error: 'ERR_UNAUTHORIZED', message: 'Missing or invalid token' });
        }

        const token = authHeader.split(' ')[1];
        const session = activeTokens.get(token);
        if (!session) {
          return sendJson(res, 401, { error: 'ERR_INVALID_TOKEN', message: 'Token expired or invalid' });
        }

        const requestedUserId = urlObj.searchParams.get('user_id') || session.userId;
        const tenantHeader = (req.headers['x-tenant-id'] as string) || session.tenantId;

        // Tenant Isolation Check
        if (tenantHeader !== session.tenantId) {
          return sendJson(res, 403, { error: 'ERR_TENANT_MISMATCH', message: 'Token not authorized for this tenant' });
        }

        const targetUser = usersById.get(requestedUserId);
        if (!targetUser || targetUser.tenantId !== session.tenantId) {
          return sendJson(res, 404, { error: 'ERR_NOT_FOUND', message: 'User not found in this tenant context' });
        }

        const wallet = wallets.get(requestedUserId);
        if (!wallet) {
          return sendJson(res, 404, { error: 'ERR_WALLET_NOT_FOUND', message: 'Wallet does not exist' });
        }

        return sendJson(res, 200, {
          user_id: wallet.userId,
          tenant_id: wallet.tenantId,
          currency: wallet.currency,
          available_balance: wallet.balance,
          locked_balance: 0,
          total_balance: wallet.balance,
        });
      }

      // 5. PSP Deposit Callback
      if (pathname === '/api/v1/callbacks/psp/deposit' && method === 'POST') {
        const signature = req.headers['x-psp-signature'] as string;
        const tenantHeader = req.headers['x-tenant-id'] as string;
        const payload = JSON.parse(body);
        const { tenant_id, user_id, psp_reference_id, amount, currency, timestamp } = payload;
        const activeTenant = tenantHeader || tenant_id;

        const tenantSecrets = SECRETS[activeTenant];
        if (!tenantSecrets || !verifyHmac(body, signature, tenantSecrets.psp)) {
          return sendJson(res, 401, { error: 'ERR_INVALID_SIGNATURE', message: 'HMAC signature verification failed' });
        }

        // Replay Protection: Timestamp tolerance (300 seconds)
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestamp) > 300) {
          return sendJson(res, 400, { error: 'ERR_TIMESTAMP_EXPIRED', message: 'Webhook timestamp outside tolerance window' });
        }

        // Validation
        if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
          return sendJson(res, 422, { error: 'ERR_INVALID_AMOUNT', message: 'Amount must be a positive integer in cents' });
        }

        // Idempotency Check
        const idempKey = `${activeTenant}:${psp_reference_id}`;
        if (pspProcessed.has(idempKey)) {
          const cached = pspProcessed.get(idempKey)!;
          return sendJson(res, 200, {
            status: 'PROCESSED',
            is_duplicate: true,
            psp_reference_id: cached.psp_reference_id,
            credited_amount: cached.credited_amount,
            new_balance: cached.new_balance,
          }, { 'X-Idempotent-Replay': 'true' });
        }

        const wallet = wallets.get(user_id);
        if (!wallet || wallet.tenantId !== activeTenant) {
          return sendJson(res, 404, { error: 'ERR_USER_NOT_FOUND', message: 'User wallet not found for this tenant' });
        }

        // Atomic Credit
        wallet.balance += amount;
        const responseData = {
          status: 'PROCESSED',
          is_duplicate: false,
          psp_reference_id,
          credited_amount: amount,
          new_balance: wallet.balance,
        };

        pspProcessed.set(idempKey, responseData);
        transactions.push({
          id: `txn_${crypto.randomUUID()}`,
          tenantId: activeTenant,
          userId: user_id,
          type: 'DEPOSIT',
          amount,
          currency: currency || wallet.currency,
          referenceId: psp_reference_id,
          createdAt: new Date().toISOString(),
        });

        return sendJson(res, 200, responseData);
      }

      // 6. GSP Bet Callback
      if (pathname === '/api/v1/callbacks/gsp/bet' && method === 'POST') {
        const signature = req.headers['x-gsp-signature'] as string;
        const payload = JSON.parse(body);
        const { tenant_id, user_id, round_id, bet_amount } = payload;

        const tenantSecrets = SECRETS[tenant_id];
        if (!tenantSecrets || !verifyHmac(body, signature, tenantSecrets.gsp)) {
          return sendJson(res, 401, { error: 'ERR_INVALID_SIGNATURE', message: 'HMAC signature failed' });
        }

        // Idempotency
        if (gameRounds.has(round_id)) {
          const existing = gameRounds.get(round_id)!;
          const wallet = wallets.get(user_id);
          return sendJson(res, 200, {
            status: 'ACCEPTED',
            is_duplicate: true,
            round_id: existing.roundId,
            debited_amount: existing.betAmount,
            remaining_balance: wallet ? wallet.balance : 0,
          });
        }

        const wallet = wallets.get(user_id);
        if (!wallet) {
          return sendJson(res, 404, { error: 'ERR_USER_NOT_FOUND' });
        }

        if (wallet.balance < bet_amount) {
          return sendJson(res, 402, {
            error: 'ERR_INSUFFICIENT_FUNDS',
            current_balance: wallet.balance,
            required_amount: bet_amount,
          });
        }

        wallet.balance -= bet_amount;
        gameRounds.set(round_id, {
          roundId: round_id,
          tenantId: tenant_id,
          userId: user_id,
          betAmount: bet_amount,
          status: 'OPEN',
        });

        transactions.push({
          id: `txn_${crypto.randomUUID()}`,
          tenantId: tenant_id,
          userId: user_id,
          type: 'BET',
          amount: bet_amount,
          currency: wallet.currency,
          referenceId: round_id,
          createdAt: new Date().toISOString(),
        });

        return sendJson(res, 200, {
          status: 'ACCEPTED',
          is_duplicate: false,
          round_id,
          debited_amount: bet_amount,
          remaining_balance: wallet.balance,
        });
      }

      // 7. GSP Win Callback
      if (pathname === '/api/v1/callbacks/gsp/win' && method === 'POST') {
        const signature = req.headers['x-gsp-signature'] as string;
        const payload = JSON.parse(body);
        const { tenant_id, user_id, round_id, win_amount } = payload;

        const tenantSecrets = SECRETS[tenant_id];
        if (!tenantSecrets || !verifyHmac(body, signature, tenantSecrets.gsp)) {
          return sendJson(res, 401, { error: 'ERR_INVALID_SIGNATURE' });
        }

        const round = gameRounds.get(round_id);
        if (!round) {
          return sendJson(res, 409, { error: 'ERR_ROUND_NOT_INITIALIZED', message: 'Round was not found or not debited yet' });
        }

        if (round.status === 'SETTLED') {
          const wallet = wallets.get(user_id);
          return sendJson(res, 200, {
            status: 'SETTLED',
            is_duplicate: true,
            round_id,
            win_amount: round.winAmount || 0,
            current_balance: wallet ? wallet.balance : 0,
          });
        }

        const wallet = wallets.get(user_id);
        if (!wallet) {
          return sendJson(res, 404, { error: 'ERR_USER_NOT_FOUND' });
        }

        wallet.balance += win_amount;
        round.winAmount = win_amount;
        round.status = 'SETTLED';

        transactions.push({
          id: `txn_${crypto.randomUUID()}`,
          tenantId: tenant_id,
          userId: user_id,
          type: 'WIN',
          amount: win_amount,
          currency: wallet.currency,
          referenceId: round_id,
          createdAt: new Date().toISOString(),
        });

        return sendJson(res, 200, {
          status: 'SETTLED',
          is_duplicate: false,
          round_id,
          win_amount,
          new_balance: wallet.balance,
        });
      }

      // 8. Transactions
      if (pathname === '/api/v1/transactions' && method === 'GET') {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return sendJson(res, 401, { error: 'ERR_UNAUTHORIZED' });
        }
        const session = activeTokens.get(authHeader.split(' ')[1]);
        if (!session) {
          return sendJson(res, 401, { error: 'ERR_INVALID_TOKEN' });
        }

        const userTxns = transactions.filter(t => t.userId === session.userId && t.tenantId === session.tenantId);
        return sendJson(res, 200, {
          items: userTxns,
          total_count: userTxns.length,
          page: 1,
          limit: 10,
        });
      }

      // Catch-all
      return sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
    } catch (err: any) {
      return sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR', details: err.message });
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[MOCK SERVER] Staging Core Wallet & Integration API listening on http://127.0.0.1:${PORT}`);
});
