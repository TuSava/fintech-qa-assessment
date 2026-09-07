import { test, expect } from '../fixtures/base-test';
import { Config } from '../configuration/environment';
import { CryptoUtil } from '../utilities/crypto';

test.describe('Security & Multi-Tenancy: Tenant Isolation Suite', () => {
  const tenantAlpha = Config.tenants.alpha;
  const tenantBeta = Config.tenants.beta;

  let userAlphaId: string;
  let userBetaId: string;
  let userAlphaToken: string;

  test.beforeEach(async ({ authHelper }) => {
    // Register User in Tenant Alpha
    const resAlpha = await authHelper.register({
      tenant_id: tenantAlpha.id,
      email: `alpha_iso_${Date.now()}@fintech.test`,
      password: 'AlphaPassword123!',
      currency: 'EUR',
    });
    userAlphaId = (await resAlpha.json()).user_id;

    const loginAlpha = await authHelper.login({
      tenant_id: tenantAlpha.id,
      email: (await resAlpha.json()).email,
      password: 'AlphaPassword123!',
    });
    userAlphaToken = (await loginAlpha.json()).access_token;

    // Register User in Tenant Beta
    const resBeta = await authHelper.register({
      tenant_id: tenantBeta.id,
      email: `beta_iso_${Date.now()}@fintech.test`,
      password: 'BetaPassword123!',
      currency: 'USD',
    });
    userBetaId = (await resBeta.json()).user_id;
  });

  // Tenant screen: verify cross tenant wallet access blocked
  test('TEN-01: Tenant Alpha user cannot access Tenant Beta user wallet balance (IDOR)', async ({ walletHelper }) => {
    // User Alpha attempts to query User Beta's wallet balance
    const response = await walletHelper.getBalance(userAlphaToken, tenantAlpha.id, userBetaId);

    // Should return 404 Not Found (User Beta does not exist in Tenant Alpha scope)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('ERR_NOT_FOUND');
  });

  // Tenant screen: verify cross tenant token header mismatch
  test('TEN-02: Tenant Alpha token cannot be used with Tenant Beta header', async ({ walletHelper }) => {
    // User Alpha token presented with X-Tenant-ID: tenant_beta
    const response = await walletHelper.getBalance(userAlphaToken, tenantBeta.id);

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('ERR_TENANT_MISMATCH');
  });

  // Tenant screen: verify cross tenant secret key mismatch
  test('TEN-03: Webhook signed with Tenant Alpha secret must fail when sent to Tenant Beta', async ({ pspHelper }) => {
    const payload = {
      event_type: 'DEPOSIT_SUCCESS',
      event_id: CryptoUtil.generateId('evt'),
      tenant_id: tenantBeta.id,
      user_id: userBetaId,
      psp_reference_id: CryptoUtil.generateId('psp_cross'),
      amount: 5000,
      currency: 'USD',
      timestamp: CryptoUtil.currentTimestamp(),
    };

    // Sign with Alpha secret instead of Beta secret
    const crossTenantSignature = CryptoUtil.signHmacSha256(payload, tenantAlpha.pspSecret);

    const response = await pspHelper.sendDepositCallback(
      payload,
      tenantBeta.pspSecret,
      crossTenantSignature,
      tenantBeta.id
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('ERR_INVALID_SIGNATURE');
  });
});
