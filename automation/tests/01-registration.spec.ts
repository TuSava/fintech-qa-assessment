import { test, expect } from '../fixtures/test-fixtures';
import { Config } from '../configuration/environment';

test.describe('Identity: User Registration Suite', () => {
  const tenantId = Config.tenants.alpha.id;

  // Registration screen: verify new user registration and initial wallet
  test('REG-01: Should successfully register a new user and initialize an empty wallet', async ({ authHelper }) => {
    const uniqueEmail = `test_player_${Date.now()}@fintech.test`;
    const response = await authHelper.register({
      tenant_id: tenantId,
      email: uniqueEmail,
      password: 'SecurePassword123!',
      currency: 'EUR',
    });

    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body).toHaveProperty('user_id');
    expect(body.email).toBe(uniqueEmail);
    expect(body.tenant_id).toBe(tenantId);
    expect(body).toHaveProperty('wallet_id');
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');
  });

  // Registration screen: verify duplicate email rejection
  test('REG-02: Should reject registration with duplicate email in same tenant with 409 Conflict', async ({ authHelper }) => {
    const existingEmail = `dup_player_${Date.now()}@fintech.test`;

    // First registration
    const res1 = await authHelper.register({
      tenant_id: tenantId,
      email: existingEmail,
      password: 'SecurePassword123!',
      currency: 'EUR',
    });
    expect(res1.status()).toBe(201);

    // Duplicate attempt
    const res2 = await authHelper.register({
      tenant_id: tenantId,
      email: existingEmail,
      password: 'AnotherPassword456!',
      currency: 'EUR',
    });

    expect(res2.status()).toBe(409);
    const body = await res2.json();
    expect(body.error).toBe('ERR_USER_EXISTS');
  });

  // Registration screen: verify missing password input validation
  test('REG-03: Should reject registration with missing password with 400 Bad Request', async ({ authHelper }) => {
    const response = await authHelper.register({
      tenant_id: tenantId,
      email: `invalid_${Date.now()}@fintech.test`,
      password: '',
      currency: 'EUR',
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('ERR_INVALID_INPUT');
  });
});
