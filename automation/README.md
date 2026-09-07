# FinTech API Automation Suite (Playwright + TypeScript)

Automated integration test suite for mission-critical financial and gaming flows: Identity, PSP Deposit Callbacks, GSP Bet/Win rounds, Race Condition / Idempotency guarantees, and Multi-Tenant Isolation.

---

 Quick Start

Run from the `automation/` directory:

```bash
npm install
npm test
```

> **Note:** Playwright automatically launches the self-contained Mock API server on port `3000` via its `webServer` configuration. No external backend setup is required.

---

##  Run Individual Test Suites

Run specific targeted tests via npm scripts:

```bash
npm run test:idempotency   # Concurrent race conditions & duplicate callback replays
npm run test:deposit       # PSP Deposit webhook & HMAC-SHA256 signature verification
npm run test:gsp           # GSP Bet -> Win round settlement & overdraft prevention
npm run test:wallet        # Core wallet balance calculations & unauthorized access
npm run test:tenant        # Cross-tenant data isolation & IDOR protection
npm run test:registration  # User registration & schema validation
npm run test:login         # Authentication & JWT issuance
```

### Run with Interactive UI / Debug Mode
```bash
npx playwright test --ui   # Interactive visual test runner
npm run test:debug         # Step-by-step debugger
npm run report             # View HTML execution report
```

---

##  Configuration & Environment Variables

By default, tests run against the built-in mock server (`http://127.0.0.1:3000/api/v1`). To target a live staging environment:

```bash
BASE_URL=https://api-staging.fintech-platform.internal/v1 npm test
```

| Variable | Description | Default |
| `BASE_URL` | Target API Base URL | `http://127.0.0.1:3000/api/v1` |
| `TEST_TIMEOUT` | Test execution timeout (ms) | `10000` |
| `PSP_SECRET_ALPHA` | HMAC secret key for Tenant Alpha PSP | `sec_live_alpha_psp_8f93bc817` |
| `GSP_SECRET_ALPHA` | HMAC secret key for Tenant Alpha GSP | `sec_live_alpha_gsp_4d1109aa7` |
| `TENANT_ALPHA_ID` | Primary tenant identifier | `tenant_alpha` |
| `TENANT_BETA_ID` | Secondary tenant identifier (isolation tests) | `tenant_beta` |
