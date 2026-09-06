import { test, expect } from '../fixtures/test-fixtures';
import { Config } from '../configuration/environment';

test.describe('Identity: User Authentication Suite', () => {
  const tenantId = Config.tenants.alpha.id;
  const testEmail = `auth_user_${Date.now()}@fintech.test`;
  const password = 'CorrectPassword999!';

  test.beforeAll(async ({ request }) => {
    // Setup user
    await request.post('/auth/register', {
      headers: { 'X-Tenant-ID': tenantId },
      data: {
        tenant_id: tenantId,
        email: testEmail,
        password: password,
        currency: 'EUR',
      },
    });
  });

  test('AUTH-01: Should authenticate valid credentials and return access token', async ({ authHelper }) => {
    const response = await authHelper.login({
      tenant_id: tenantId,
      email: testEmail,
      password: password,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body.expires_in).toBe(3600);
    expect(body.token_type).toBe('Bearer');
  });

  test('AUTH-02: Should reject login with invalid password with 401 Unauthorized', async ({ authHelper }) => {
    const response = await authHelper.login({
      tenant_id: tenantId,
      email: testEmail,
      password: 'WrongPassword!',
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('ERR_INVALID_CREDENTIALS');
  });
});
