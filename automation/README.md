# FinTech Core Wallet & Gaming Integration Test Automation Framework

An enterprise-grade API test automation framework built with **Playwright** and **TypeScript** designed to validate mission-critical financial ledger flows, payment provider (PSP) webhooks, gaming provider (GSP) rounds, idempotency guarantees, and multi-tenant data boundaries.

---

## Architecture Overview

```
automation/
├── configuration/
│   └── environment.ts        # Dynamic environment configuration & tenant secrets
├── test-data/
│   └── constants.ts          # Seed test users, amounts, and error codes
├── utilities/
│   ├── crypto.ts             # HMAC-SHA256 signer, nonce & UUID generator
│   └── logger.ts             # Structured execution logger
├── fixtures/
│   └── test-fixtures.ts      # Playwright test extensions with typed API helpers
├── api-helpers/
│   ├── auth.helper.ts        # User registration and JWT authentication client
│   ├── wallet.helper.ts      # Wallet balance & transaction history queries
│   ├── psp.helper.ts         # PSP deposit callback dispatcher with HMAC signing
│   └── gsp.helper.ts         # GSP Bet & Win round settlement dispatcher
├── mock-server/
│   └── server.ts             # Self-contained Staging Mock API Server with ledger
├── tests/
│   ├── 01-registration.spec.ts
│   ├── 02-login.spec.ts
│   ├── 03-deposit-callback.spec.ts
│   ├── 04-duplicate-callback-idempotency.spec.ts
│   ├── 05-wallet-balance-validation.spec.ts
│   ├── 06-bet-win-gsp.spec.ts
│   └── 07-tenant-isolation.spec.ts
├── playwright.config.ts      # Playwright runner config with auto webServer spawn
├── tsconfig.json             # TypeScript compiler settings
├── package.json              # NPM dependencies & test script aliases
└── README.md                 # Complete setup and execution documentation
```

---

## Key Testing Capabilities
1. **Cryptographic HMAC-SHA256 Verification:** Pre-calculates exact HMAC signatures over request body using tenant-specific secret keys, with tests for tampered signatures and expired timestamp windows.
2. **Deterministic Idempotency Testing:** Evaluates sequential duplicate callbacks and fires **concurrent parallel blasts** (10 simultaneous HTTP requests) using `Promise.all()` to catch double-credit race conditions.
3. **Double-Entry Ledger & Balance Integrity:** Validates that credits and debits reflect integer cents without floating-point precision drift.
4. **Multi-Tenant Isolation (IDOR & Key Segregation):** Validates that JWT tokens and HMAC signatures belonging to `tenant_alpha` cannot query or manipulate entities in `tenant_beta`.
5. **Self-Contained Execution:** Includes a high-performance in-memory mock server automatically launched by Playwright's `webServer` runner.

---

## Installation & Prerequisites

### Prerequisites
* **Node.js:** v18.x or v20.x LTS installed (`node -v`)
* **npm:** v9.x or higher (`npm -v`)

### Installation Steps
From the `automation/` directory, install all required dependencies:

```bash
cd /Users/romansavran/AQA/automation
npm install
```

---

## Environment Variables & Configuration

The framework dynamically reads configuration from environment variables or defaults to the local staging sandbox:

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `BASE_URL` | Base URL of target API | `http://127.0.0.1:3000/api/v1` |
| `TEST_TIMEOUT` | Test case timeout in ms | `10000` |
| `TENANT_ALPHA_ID` | Identifier for Tenant A | `tenant_alpha` |
| `TENANT_BETA_ID` | Identifier for Tenant B | `tenant_beta` |
| `PSP_SECRET_ALPHA` | HMAC secret for Tenant Alpha PSP | `sec_live_alpha_psp_8f93bc817` |
| `GSP_SECRET_ALPHA` | HMAC secret for Tenant Alpha GSP | `sec_live_alpha_gsp_4d1109aa7` |

### Setting Environment Variables (Example)
```bash
export BASE_URL=https://api-staging.fintech-platform.internal/v1
export PSP_SECRET_ALPHA=sec_staging_alpha_custom_key_999
npx playwright test
```

---

## Test Execution Commands

### 1. Run All Automated Tests
Runs the complete test suite (Playwright will automatically start the built-in mock server):
```bash
npm test
# or:
npx playwright test
```

### 2. Run Individual Test Suites
Execute specific test files using npm shortcuts:
```bash
# 1. Registration tests
npm run test:registration

# 2. Authentication & JWT tests
npm run test:login

# 3. PSP Deposit Callback & HMAC tests
npm run test:deposit

# 4. Idempotency & Race Condition tests
npm run test:idempotency

# 5. Core Wallet Balance validation
npm run test:wallet

# 6. Gaming GSP Bet & Win lifecycle
npm run test:gsp

# 7. Multi-Tenant Isolation & IDOR
npm run test:tenant
```

### 3. Run a Single Test by Name Pattern
```bash
npx playwright test -g "Concurrent parallel duplicate callbacks"
```

### 4. Interactive Debugging & UI Mode
```bash
# Open Playwright interactive UI
npx playwright test --ui

# Run in debug mode (step-through execution)
npm run test:debug
```

### 5. Generate and View HTML Test Report
```bash
npm run report
```

---

## CI/CD Integration (GitHub Actions / GitLab CI)

Sample GitHub Actions workflow snippet:

```yaml
name: Financial Integration Regression

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  api-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: automation/package-lock.json

      - name: Install dependencies
        run: |
          cd automation
          npm ci

      - name: Run Playwright Tests
        run: |
          cd automation
          npx playwright test

      - name: Publish Test Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: automation/playwright-report/
```
