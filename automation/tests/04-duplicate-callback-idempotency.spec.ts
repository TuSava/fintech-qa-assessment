import { test, expect } from '../fixtures/test-fixtures';
import { Config } from '../configuration/environment';
import { CryptoUtil } from '../utilities/crypto';

test.describe('Payment Integration: Idempotency & Duplicate Callback Suite', () => {
  const tenantConfig = Config.tenants.alpha;
  let userId: string;
  let token: string;

  test.beforeEach(async ({ authHelper }) => {
    const email = `idemp_user_${Date.now()}@fintech.test`;
    const regRes = await authHelper.register({
      tenant_id: tenantConfig.id,
      email,
      password: 'IdempPassword123!',
      currency: 'EUR',
    });
    const regData = await regRes.json();
    userId = regData.user_id;

    const loginRes = await authHelper.login({
      tenant_id: tenantConfig.id,
      email,
      password: 'IdempPassword123!',
    });
    token = (await loginRes.json()).access_token;
  });

  // Idempotency screen: verify sequential duplicate callback
  test('IDEMP-01: Sequential duplicate callback must be recognized and not credit balance twice', async ({
    pspHelper,
    walletHelper,
  }) => {
    const pspRef = CryptoUtil.generateId('psp_seq_idemp');
    const depositAmount = 4000; // 40.00 EUR

    const payload = {
      event_type: 'DEPOSIT_SUCCESS',
      event_id: CryptoUtil.generateId('evt'),
      tenant_id: tenantConfig.id,
      user_id: userId,
      psp_reference_id: pspRef,
      amount: depositAmount,
      currency: 'EUR',
      timestamp: CryptoUtil.currentTimestamp(),
    };

    // First Call
    const res1 = await pspHelper.sendDepositCallback(payload, tenantConfig.pspSecret);
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.is_duplicate).toBe(false);
    expect(body1.new_balance).toBe(4000);

    // Second Call (Sequential Duplicate)
    const res2 = await pspHelper.sendDepositCallback(payload, tenantConfig.pspSecret);
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.is_duplicate).toBe(true);
    expect(res2.headers()['x-idempotent-replay']).toBe('true');

    // Verify final balance is 4000 (NOT 8000)
    const walletRes = await walletHelper.getBalance(token, tenantConfig.id);
    const walletData = await walletRes.json();
    expect(walletData.available_balance).toBe(4000);
  });

  // Idempotency screen: verify parallel duplicate callbacks race condition
  test('IDEMP-02: Concurrent parallel duplicate callbacks must resolve idempotently without double-spend', async ({
    pspHelper,
    walletHelper,
  }) => {
    const pspRef = CryptoUtil.generateId('psp_race_condition');
    const depositAmount = 2500; // 25.00 EUR

    const payload = {
      event_type: 'DEPOSIT_SUCCESS',
      event_id: CryptoUtil.generateId('evt'),
      tenant_id: tenantConfig.id,
      user_id: userId,
      psp_reference_id: pspRef,
      amount: depositAmount,
      currency: 'EUR',
      timestamp: CryptoUtil.currentTimestamp(),
    };

    // Dispatch 10 parallel identical requests simultaneously
    const requests = Array.from({ length: 10 }).map(() =>
      pspHelper.sendDepositCallback(payload, tenantConfig.pspSecret)
    );

    const responses = await Promise.all(requests);

    // All responses should succeed with 200 OK
    for (const res of responses) {
      expect(res.status()).toBe(200);
    }

    // Exactly one should be marked is_duplicate: false
    const bodies = await Promise.all(responses.map(r => r.json()));
    const initialProcessings = bodies.filter(b => b.is_duplicate === false);
    const idempotentReplays = bodies.filter(b => b.is_duplicate === true);

    expect(initialProcessings.length).toBe(1);
    expect(idempotentReplays.length).toBe(9);

    // Assert final balance is 2500 (NOT 25000)
    const walletRes = await walletHelper.getBalance(token, tenantConfig.id);
    const walletData = await walletRes.json();
    expect(walletData.available_balance).toBe(2500);
  });
});
