import { test, expect } from '../fixtures/test-fixtures';
import { Config } from '../configuration/environment';
import { CryptoUtil } from '../utilities/crypto';

test.describe('Core Wallet: Balance Validation Suite', () => {
  const tenantConfig = Config.tenants.alpha;
  let userId: string;
  let token: string;

  test.beforeEach(async ({ authHelper }) => {
    const email = `wallet_user_${Date.now()}@fintech.test`;
    const regRes = await authHelper.register({
      tenant_id: tenantConfig.id,
      email,
      password: 'WalletPassword123!',
      currency: 'EUR',
    });
    const regData = await regRes.json();
    userId = regData.user_id;

    const loginRes = await authHelper.login({
      tenant_id: tenantConfig.id,
      email,
      password: 'WalletPassword123!',
    });
    token = (await loginRes.json()).access_token;
  });

  test('WAL-01: Brand new wallet should start with 0 balance and correct currency', async ({ walletHelper }) => {
    const response = await walletHelper.getBalance(token, tenantConfig.id);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.user_id).toBe(userId);
    expect(body.tenant_id).toBe(tenantConfig.id);
    expect(body.currency).toBe('EUR');
    expect(body.available_balance).toBe(0);
    expect(body.total_balance).toBe(0);
  });

  test('WAL-02: Balance should accurately reflect consecutive deposits', async ({ pspHelper, walletHelper }) => {
    // Deposit 1: 30.00 EUR (3000 cents)
    await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: CryptoUtil.generateId('psp_dep1'),
        amount: 3000,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.pspSecret
    );

    // Deposit 2: 70.00 EUR (7000 cents)
    await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: CryptoUtil.generateId('psp_dep2'),
        amount: 7000,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.pspSecret
    );

    // Verify cumulative balance = 10000 cents (100.00 EUR)
    const walletRes = await walletHelper.getBalance(token, tenantConfig.id);
    expect(walletRes.status()).toBe(200);
    const body = await walletRes.json();
    expect(body.available_balance).toBe(10000);
  });

  test('WAL-03: Should reject balance query without authentication token with 401', async ({ request }) => {
    const response = await request.get('/wallet/balance', {
      headers: { 'X-Tenant-ID': tenantConfig.id },
    });
    expect(response.status()).toBe(401);
  });
});
