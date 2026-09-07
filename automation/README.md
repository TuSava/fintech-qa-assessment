FinTech API Automation Suite (Playwright + TypeScript)

Automated integration test suite for mission-critical financial and gaming flows: Identity, PSP Deposit Callbacks, GSP Bet and Win rounds, Race Condition and Idempotency guarantees, and Multi-Tenant Isolation.

Quick Start

Run from the automation directory:

npm install
npm test

Note: Playwright automatically launches the self-contained Mock API server on port 3000 via its webServer configuration. No external backend setup is required.

Run Individual Test Suites

Run specific targeted tests via npm scripts:

npm run test:idempotency: Concurrent race conditions and duplicate callback replays
npm run test:deposit: PSP Deposit webhook and HMAC-SHA256 signature verification
npm run test:gsp: GSP Bet to Win round settlement and overdraft prevention
npm run test:wallet: Core wallet balance calculations and unauthorized access
npm run test:tenant: Cross-tenant data isolation and IDOR protection
npm run test:registration: User registration and schema validation
npm run test:login: Authentication and JWT issuance

Run with Interactive UI or Debug Mode:

npx playwright test --ui: Interactive visual test runner
npm run test:debug: Step-by-step debugger
npm run report: View HTML execution report

Configuration and Environment Variables

By default, tests run against the built-in mock server (http://127.0.0.1:3000/api/v1). To target a live staging environment:

BASE_URL=https://api-staging.fintech-platform.internal/v1 npm test

BASE_URL: Target API Base URL (default: http://127.0.0.1:3000/api/v1)
TEST_TIMEOUT: Test execution timeout in ms (default: 10000)
PSP_SECRET_ALPHA: HMAC secret key for Tenant Alpha PSP (default: sec_live_alpha_psp_8f93bc817)
GSP_SECRET_ALPHA: HMAC secret key for Tenant Alpha GSP (default: sec_live_alpha_gsp_4d1109aa7)
TENANT_ALPHA_ID: Primary tenant identifier (default: tenant_alpha)
TENANT_BETA_ID: Secondary tenant identifier for isolation tests (default: tenant_beta)
