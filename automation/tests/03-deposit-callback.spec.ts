import { test, expect } from '../fixtures/base-test';
import { Config } from '../configuration/environment';
import { CryptoUtil } from '../utilities/crypto';

test.describe('Payment Integration: PSP Deposit Callback Suite', () => {
  const tenantConfig = Config.tenants.alpha;
  let userId: string;
  let token: string;

  test.beforeEach(async ({ authHelper, request }) => {
    const email = `deposit_user_${Date.now()}@fintech.test`;
    const regRes = await authHelper.register({
      tenant_id: tenantConfig.id,
      email,
      password: 'DepositPassword123!',
      currency: 'EUR',
    });
    const regData = await regRes.json();
    userId = regData.user_id;

    const loginRes = await authHelper.login({
      tenant_id: tenantConfig.id,
      email,
      password: 'DepositPassword123!',
    });
    const loginData = await loginRes.json();
    token = loginData.access_token;
  });

  // Deposit screen: verify valid signed callback credits balance
  test('DEP-01: Should process valid signed deposit callback and credit balance', async ({ pspHelper, walletHelper }) => {
    const depositAmount = 5000; // 50.00 EUR
    const pspRef = CryptoUtil.generateId('psp_tx');

    const response = await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: pspRef,
        amount: depositAmount,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.pspSecret
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('PROCESSED');
    expect(body.psp_reference_id).toBe(pspRef);
    expect(body.credited_amount).toBe(depositAmount);
    expect(body.new_balance).toBe(depositAmount);

    // Verify wallet reflects new balance
    const walletRes = await walletHelper.getBalance(token, tenantConfig.id);
    const walletData = await walletRes.json();
    expect(walletData.available_balance).toBe(depositAmount);
  });

  // Deposit screen: verify invalid signature rejection
  test('DEP-02: Should reject deposit callback with invalid HMAC signature with 401', async ({ pspHelper }) => {
    const response = await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: CryptoUtil.generateId('psp_tx'),
        amount: 2500,
        currency: 'EUR',
        timestamp: CryptoUtil.currentTimestamp(),
      },
      tenantConfig.pspSecret,
      'invalid_corrupted_signature_hash_1234567890'
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('ERR_INVALID_SIGNATURE');
  });

  // Deposit screen: verify expired timestamp replay rejection
  test('DEP-03: Should reject expired callback timestamp (>300s drift) with 400', async ({ pspHelper }) => {
    const expiredTimestamp = CryptoUtil.currentTimestamp() - 600; // 10 minutes ago
    const response = await pspHelper.sendDepositCallback(
      {
        event_type: 'DEPOSIT_SUCCESS',
        event_id: CryptoUtil.generateId('evt'),
        tenant_id: tenantConfig.id,
        user_id: userId,
        psp_reference_id: CryptoUtil.generateId('psp_tx'),
        amount: 1000,
        currency: 'EUR',
        timestamp: expiredTimestamp,
      },
      tenantConfig.pspSecret
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('ERR_TIMESTAMP_EXPIRED');
  });
});
