# FinTech QA Engineering Assessment (Money + Integration Focus)

Comprehensive technical evaluation package for a multi-tenant financial wallet and gaming integration platform covering Identity, PSP Deposit Callbacks, GSP Bet/Win rounds, Idempotency guarantees, Concurrency handling, and Tenant Isolation.

---

## 📑 Deliverables Index

| # | Deliverable | Description | File Link |
|---|---|---|---|
| 1 | **Test Plan** | Scope, strategy, test levels, environments, entry/exit criteria, and risk matrix with mitigations | [TEST-PLAN.md](TEST-PLAN.md) |
| 2 | **Test Cases** | 36 comprehensive test cases covering functional, negative, integration, idempotency, security, concurrency, and tenant isolation | [TEST-CASES.md](TEST-CASES.md) |
| 3 | **Postman Collection** | Complete Postman suite with dynamic HMAC-SHA256 signing, variable chaining, schema validation, and replay tests | [postman_collection1.json](postman_collection1.json) & [postman_environment1.json](postman_environment1.json) |
| 4 | **Test Automation** | Production-ready Playwright + TypeScript test automation suite (19 automated tests, typed API helpers, fixtures, and self-contained mock server) | [automation/](automation/) |
| 5 | **Bug Reports** | 3 high-impact FinTech defect reports (Race condition double credit, Replay attack, Cross-tenant data leakage) with reproduction steps, logs, and remediation code | [BUG-REPORTS.md](BUG-REPORTS.md) |

---

## 🚀 Quick Start for Automation Suite

To run the automated tests locally:

```bash
cd automation
npm install
npm test
```

> Detailed instructions, configuration parameters, and CI/CD setup are available in [automation/README.md](automation/README.md).
