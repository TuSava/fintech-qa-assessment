import { test, expect } from '../fixtures/test-fixtures';
import { Config } from '../configuration/environment';
import { CryptoUtil } from '../utilities/crypto';

test.describe('Gaming Integration: GSP Bet & Win Round Lifecycle Suite', () => {
  const tenantConfig = Config.tenants.alpha;
  let userId: string;
  let token: string;

  test.beforeEach(async ({ authHelper, pspHelper }) => {
    const email = `gaming_user_${Date.now()}@fintech.test`;
    const regRes = await authHelper.register({
      tenant_id: tenantConfig.id,
      email,
      password: 'GamingPassword123!',
      currency: 'EUR',
    });
    userId = (await regRes.json()).user_id;

    const loginRes = await authHelper.login({
      tenant_id: tenantConfig.id,
      email,
      password: 'GamingPassword123!',
    });
    token = (await loginRes.json()).access_token;

    // Seed initial balance with 100.00 EUR (10,000 cents)
    await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: CryptoUtil.generateId('psp_seed'),
        amount: 10000,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.pspSecret
    );
  });

  // Game screen: verify full round bet win settlement
  test('GSP-01: Full Round Lifecycle: Bet debit -> Win payout -> Round settlement', async ({ gspHelper, walletHelper }) => {
    const roundId = CryptoUtil.generateId('rnd_spin');
    const betAmount = 2500; // 25.00 EUR
    const winAmount = 7500; // 75.00 EUR

    // 1. Place Bet (debit)
    const betRes = await gspHelper.sendBetCallback(
      {
        event_type: 'BET',
        round_id: roundId,
        tenant_id: tenantConfig.id,
        user_id: userId,
        game_id: 'slot_book_of_wealth',
        bet_amount: betAmount,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.gspSecret
    );
    expect(betRes.status()).toBe(200);
    const betBody = await betRes.json();
    expect(betBody.status).toBe('ACCEPTED');
    expect(betBody.remaining_balance).toBe(7500);

    // 2. Settle Win (credit)
    const winRes = await gspHelper.sendWinCallback(
      {
        event_type: 'WIN',
        round_id: roundId,
        tenant_id: tenantConfig.id,
        user_id: userId,
        game_id: 'slot_book_of_wealth',
        win_amount: winAmount,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.gspSecret
    );
    expect(winRes.status()).toBe(200);
    const winBody = await winRes.json();
    expect(winBody.status).toBe('SETTLED');
    expect(winBody.new_balance).toBe(15000); // 7500 + 7500

    // 3. Verify Wallet
    const walletRes = await walletHelper.getBalance(token, tenantConfig.id);
    const walletBody = await walletRes.json();
    expect(walletBody.available_balance).toBe(15000);
  });

  // Game screen: verify insufficient funds rejection
  test('GSP-02: Should reject bet when bet exceeds available wallet balance with 402', async ({ gspHelper }) => {
    const betRes = await gspHelper.sendBetCallback(
      {
        event_type: 'BET',
        round_id: CryptoUtil.generateId('rnd_overdraft'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        game_id: 'slot_book_of_wealth',
        bet_amount: 9999999, // Way more than 10,000 cents
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.gspSecret
    );

    expect(betRes.status()).toBe(402);
    const body = await betRes.json();
    expect(body.error).toBe('ERR_INSUFFICIENT_FUNDS');
  });

  // Game screen: verify uninitialized round rejection
  test('GSP-03: Win callback for uninitialized round should be rejected with 409', async ({ gspHelper }) => {
    const winRes = await gspHelper.sendWinCallback(
      {
        event_type: 'WIN',
        round_id: 'rnd_non_existent_999999',
        tenant_id: tenantConfig.id,
        user_id: userId,
        game_id: 'slot_book_of_wealth',
        win_amount: 5000,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.gspSecret
    );

    expect(winRes.status()).toBe(409);
    const body = await winRes.json();
    expect(body.error).toBe('ERR_ROUND_NOT_INITIALIZED');
  });
});
