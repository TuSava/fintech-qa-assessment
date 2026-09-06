export const TEST_USERS = {
  playerAlpha: {
    emailPrefix: 'player_alpha',
    password: 'SecurePassword123!',
    tenantId: 'tenant_alpha',
    currency: 'EUR',
  },
  playerBeta: {
    emailPrefix: 'player_beta',
    password: 'SecureBetaPass123!',
    tenantId: 'tenant_beta',
    currency: 'USD',
  },
};

export const FINANCIAL_AMOUNTS = {
  DEPOSIT_STANDARD: 5000, // 50.00 EUR in cents
  DEPOSIT_LARGE: 50000,   // 500.00 EUR
  BET_STANDARD: 2000,     // 20.00 EUR
  WIN_STANDARD: 8000,     // 80.00 EUR
  BET_OVERDRAFT: 99999999,// Out of bounds
};

export const ERROR_CODES = {
  USER_EXISTS: 'ERR_USER_EXISTS',
  INVALID_CREDENTIALS: 'ERR_INVALID_CREDENTIALS',
  INVALID_SIGNATURE: 'ERR_INVALID_SIGNATURE',
  TIMESTAMP_EXPIRED: 'ERR_TIMESTAMP_EXPIRED',
  INSUFFICIENT_FUNDS: 'ERR_INSUFFICIENT_FUNDS',
  TENANT_MISMATCH: 'ERR_TENANT_MISMATCH',
  IDEMPOTENT_CONFLICT: 'ERR_IDEMPOTENT_CONFLICT',
};
