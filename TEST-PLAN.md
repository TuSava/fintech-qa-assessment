# Test Plan: Core Financial & Gaming Integration Flow (Mini-MVP)

**Document Version:** 1.0.0  
**Author:** Senior QA Engineer (Money & Integration Focus)  
**System:** Multi-Tenant Core Wallet & Gaming Integration Platform  
**Target Environment:** Staging / Pre-Production Sandbox  

---

## 1. Executive Summary & Scope

This Test Plan outlines the testing strategy, architecture, risk mitigations, and execution criteria for the **Mini-MVP Financial & Gaming Integration Flow**. The system processes real-money transactions across multi-tenant boundaries involving Identity services, Payment Service Provider (PSP) callbacks, Game Service Provider (GSP) bet/win rounds, and real-time wallet ledger updates.

### 1.1 In Scope
* **Identity & Access Management:**
  * User Registration (data validation, tenant assignment, wallet initialization).
  * User Authentication (JWT issuance, refresh tokens, role-based access, password hashing).
* **Payment Service Provider (PSP) Integration:**
  * Deposit webhook/callback processing.
  * Cryptographic signature validation (HMAC-SHA256, RSA).
  * Transaction status transitions (`PENDING` -> `SETTLED` / `FAILED` / `EXPIRED`).
* **Game Service Provider (GSP) Integration:**
  * Game round lifecycle: Debit/Bet callback and Credit/Win callback.
  * Rollback/Refund callback for cancelled rounds.
  * Session validation and player token verification.
* **Core Wallet & Ledger System:**
  * Real-time balance calculations, debiting, crediting.
  * Double-entry bookkeeping ledger integrity (immutable journal entries).
  * Concurrency control (optimistic/pessimistic locking against balance overdrafts).
* **Multi-Tenant Isolation:**
  * Logical data segregation across Tenant A, Tenant B, etc.
  * Cross-tenant query protection (API boundaries, database row-level security).
  * Tenant-specific cryptographic keys for PSP and GSP integrations.
* **Idempotency & Replay Protection:**
  * Duplicate callback handling across PSP and GSP endpoints.
  * Distributed lock handling on idempotent keys (`idempotency_key`, `psp_reference_id`, `round_id`).
  * Replay attacks mitigation via cryptographic nonces, timestamp verification windows, and signed payload validation.

### 1.2 Out of Scope
* Physical payment method frontend forms (Apple Pay / Google Pay / 3D-Secure 2.0 SDK mobile views handled by PSP iframe).
* KYC Document OCR scanning and manual compliance back-office verification workflows (mocked via mock KYC flags).
* Long-term financial reconciliation reporting (monthly accounting audits outside the operational ledger).
* Native iOS/Android biometric authentication (FaceID/Fingerprint hardware layer).

---

## 2. Objectives
1. **Zero Financial Drift:** Guarantee 100% financial consistency—every deposit, bet, and win must precisely match ledger balances without rounding discrepancies or double-credits.
2. **Deterministic Idempotency:** Validate that duplicate, delayed, or replayed webhooks return identical HTTP status and body without altering user balances or ledger states.
3. **Rigid Multi-Tenant Partitioning:** Ensure zero cross-tenant data leakage or financial crossover between distinct operator tenants.
4. **Resilience under Concurrency:** Prevent race conditions where simultaneous bet or withdrawal requests could result in negative balances.
5. **High Automation Coverage:** Implement an automated Playwright + TypeScript regression test suite integrated into CI/CD pipelines.

---

## 3. Test Strategy & Methodologies

Testing follows a layered, shift-left engineering approach focused on API-first and integration-level validation.

```
       / \
      / E2E \       <-- Automated Smoke & Critical Path Flows (Playwright)
     /-------\
    / Concurr \     <-- Race conditions, double-spend, replay tests
   /-----------\
  / Integration \   <-- PSP/GSP Callbacks, Ledger Updates, Multi-Tenant
 /---------------\
/   API Contract  \ <-- Postman, Bruno, JSON Schema Validation, HMAC checks
-------------------
```

### 3.1 Test Strategy Pillars
* **API & Integration Testing:** Automated validation of RESTful endpoints, webhook receivers, HMAC verification, JSON schemas, and HTTP response codes.
* **Idempotency & Concurrency Stress:** Rapid-fire concurrent callback execution using parallel worker threads and simulated network latency to catch race conditions.
* **Security & Negative Path Audits:** Tampered payload signatures, expired timestamps, SQL injection in query parameters, IDOR / cross-tenant parameter manipulation, and replay attack simulations.
* **Data Consistency Verification:** Direct database inspection (read-replicas) validating that every transaction creates a balanced credit/debit double-entry row.

---

## 4. Test Levels

| Test Level | Scope & Objective | Primary Tooling | Owner |
| :--- | :--- | :--- | :--- |
| **Component / Contract** | Request/Response payload validation, JSON Schema verification, HTTP status codes. | Postman / Newman, Bruno | QA Engineer |
| **Integration** | PSP & GSP webhook handling, HMAC validation, internal ledger updates, DB state checks. | Playwright (API), TypeScript | QA Engineer / Dev |
| **System / E2E** | Complete lifecycle: Register -> Deposit -> Balance Check -> Bet -> Win -> Ledger Check. | Playwright Test Suite | QA Engineer |
| **Non-Functional / Security** | Replay attacks, race conditions, parameter tampering, cross-tenant isolation checks. | Custom TS Runners, Postman, Artillery | QA Engineer (Money/Sec) |

---

## 5. Test Environment Architecture

```
+-----------------------------------------------------------------------------------+
|                            STAGING / SANDBOX CLUSTER                              |
|                                                                                   |
|   +-----------------------+     +-----------------------+     +----------------+  |
|   | Mock PSP Server       |     | Mock GSP Server       |     | Test Runner    |  |
|   | (HMAC-SHA256 Signer)  |     | (Round Simulators)    |     | (Playwright/   |  |
|   +-----------+-----------+     +-----------+-----------+     |  Postman)      |  |
|               |                             |                 +-------+--------+  |
|               +----------------------+      |                         |           |
|                                      |      |                         |           |
|                                      v      v                         v           |
|   +---------------------------------------------------------------------------+   |
|   |                       API GATEWAY (Tenant Routing)                        |   |
|   +---------------------------------------------------------------------------+   |
|                                      |                                            |
|          +---------------------------+---------------------------+                |
|          v                                                       v                |
|   +---------------------------------------+   +--------------------------------+  |
|   | Core Wallet & Identity Service        |   | Integration Webhook Consumer   |  |
|   | (Tenant A / Tenant B partitioned)     |   | (Idempotency Engine & Lockers) |  |
|   +-------------------+-------------------+   +---------------+----------------+  |
|                       |                                       |                   |
|                       +-------------------+-------------------+                   |
|                                           v                                       |
|                       +---------------------------------------+                   |
|                       | PostgreSQL (Ledger) + Redis (Locks)   |                   |
|                       +---------------------------------------+                   |
+-----------------------------------------------------------------------------------+
```

### Environment Configurations:
* **Base URL:** `https://api-staging.fintech-platform.internal/v1`
* **Tenant Identifiers:**
  * Tenant 1: `tenant_alpha` (EUR currency default)
  * Tenant 2: `tenant_beta` (USD currency default)
* **Secret Keys:** Separate HMAC signature keys configured per tenant:
  * Tenant Alpha PSP Secret: `sec_live_alpha_psp_8f93bc817`
  * Tenant Alpha GSP Secret: `sec_live_alpha_gsp_4d1109aa7`
  * Tenant Beta PSP Secret: `sec_live_beta_psp_1a2b3c4d5`
* **Persistence & Caching:** PostgreSQL 16 with schema isolation per tenant; Redis 7.2 cluster with Redis distributed locks (`Redlock`).

---

## 6. Entry and Exit Criteria

### 6.1 Entry Criteria
1. Feature code deployed to Staging environment with successful health-check (`GET /health` returns `200 OK`).
2. Database schema migrations applied, including idempotency record tables and double-entry ledger constraints.
3. Test credentials, API keys, and HMAC secrets provisioned for Tenant Alpha and Tenant Beta.
4. Mock PSP and GSP webhook simulators reachable from the test runner.
5. All automated unit tests passing in CI with >85% code coverage on financial calculation services.

### 6.2 Exit Criteria
1. 100% of P0 and P1 test cases executed with a 100% pass rate.
2. No open Critical or High severity bugs related to financial calculations, idempotency, or tenant isolation.
3. Zero occurrences of race conditions or double-crediting in concurrent callback execution.
4. Automated regression suite (Playwright + TypeScript) passing cleanly in CI.
5. Postman Collection and environment verified against the target environment.
6. All identified edge-case bugs documented with root cause analysis and remediation verification.

---

## 7. Dependencies & Assumptions

### 7.1 Dependencies
* **Clock Synchronization:** NTP synchronization across API nodes and Redis cluster (maximum drift < 50ms) to ensure timestamp-based replay protection functions reliably.
* **Mock Provider Services:** High-availability mock PSP and GSP webhook dispatchers capable of signing arbitrary payloads with legitimate and corrupted signatures.
* **Database Access:** Staging database read-only credentials available for automation fixtures to assert internal ledger records directly.

### 7.2 Assumptions
* Network transport uses TLS 1.3 exclusively.
* Financial balances are stored and computed in integer cents (e.g., 1000 EUR = `100000` integer units) to avoid IEEE 754 floating-point rounding errors.
* External providers (PSP/GSP) include a unique request identifier (`message_id`, `event_id`, or `round_id`) and a timestamp in every webhook payload.

---

## 8. Risk Matrix & Mitigation Plan

### 8.1 Risk Matrix

| Risk ID | Risk Description | Probability | Impact | Severity |
| :--- | :--- | :---: | :---: | :---: |
| **RSK-01** | Duplicate deposit callback credited twice due to race condition under high load. | High | Critical | **HIGH** |
| **RSK-02** | Cross-tenant data leakage exposing customer balances or transactions between operators. | Low | Critical | **HIGH** |
| **RSK-03** | Webhook replay attacks executing financial credits using previously valid signed payloads. | Med | Critical | **HIGH** |
| **RSK-04** | Bet/Win balance overdraft caused by out-of-order callback arrival (Win arrives before Bet). | Med | High | **HIGH** |
| **RSK-05** | Distributed lock timeout causing partial ledger writes during database latency spikes. | Med | High | **MEDIUM** |
| **RSK-06** | Floating-point rounding errors in multi-currency conversion or bonus splits. | Low | High | **MEDIUM** |
| **RSK-07** | Signature algorithm downgrade or missing secret key rotation handling. | Low | Med | **LOW** |

---

### 8.2 Detailed Risk Mitigation Strategy

#### RSK-01: Duplicate Deposit Credited Twice (Race Condition)
* **Root Vulnerability:** Concurrent HTTP requests with identical transaction IDs arriving within milliseconds before database transaction commit.
* **Mitigation Plan:**
  1. Implement distributed Redis locking on `lock:deposit:{tenant_id}:{transaction_id}` with 5-second TTL.
  2. Enforce an unconditional unique database constraint on `(tenant_id, psp_reference_id)` in the transactions table.
  3. QA Test Action: Execute concurrent automated blasts (10 parallel requests) with the same `psp_reference_id` via Playwright and assert that exactly one yields HTTP 200 with balance increment, while 9 yield HTTP 200/409 with identical idempotent status and zero secondary balance modification.

#### RSK-02: Cross-Tenant Data Leakage
* **Root Vulnerability:** API controllers accepting tenant IDs from request bodies without cross-checking the caller's authenticated JWT claims or omitting tenant filters in SQL queries.
* **Mitigation Plan:**
  1. Enforce JWT claim extraction at the API Gateway level; inject validated `X-Tenant-ID` header into internal requests.
  2. Implement PostgreSQL Row-Level Security (RLS) enforcing `tenant_id = current_setting('app.current_tenant')`.
  3. QA Test Action: Execute automated matrix tests where User A (Tenant Alpha) attempts to fetch wallet balances, transaction records, and trigger callbacks for User B (Tenant Beta), asserting HTTP 403 / 404 with zero sensitive data in response.

#### RSK-03: Webhook Replay Attacks
* **Root Vulnerability:** System accepting validly signed callbacks indefinitely without checking request timestamps or nonces.
* **Mitigation Plan:**
  1. Reject any webhook where `timestamp` is older than 300 seconds (5 minutes) or skewed forward by >30 seconds.
  2. Cache received nonces in Redis with 10-minute expiration; reject duplicates with HTTP 401/400.
  3. QA Test Action: Capture a legitimate PSP deposit callback, record the timestamp, replay after 301 seconds, and assert HTTP 401 Unauthorized (`ERR_TIMESTAMP_EXPIRED`).

#### RSK-04: Out-of-Order GSP Bet/Win Callbacks
* **Root Vulnerability:** Network jitter causing a Win callback to be delivered before the originating Bet callback for the same `round_id`.
* **Mitigation Plan:**
  1. GSP engine must maintain a round state machine (`CREATED` -> `BET_PLACED` -> `SETTLED`).
  2. If Win arrives before Bet, queue the Win callback in a Dead-Letter/Retry queue with exponential backoff (up to 3 retries) or reject with `ERR_ROUND_NOT_INITIALIZED`.
  3. QA Test Action: Simulate network inversion by sending Win before Bet for `round_id_88192` and verify ledger consistency.

---

## 9. Deliverables & Sign-Off Criteria

* `TEST-PLAN.md` (This document)
* `TEST-CASES.md` (35+ detailed functional, negative, integration, security, and concurrency test cases)
* `postman_collection.json` & `postman_environment.json` (Full Postman suite with pre-request HMAC scripts, schema tests, and idempotency checks)
* `automation/` (Executable Playwright + TypeScript test automation framework with mock server and CI integration)
* `BUG-REPORTS.md` (3 production-grade, highly technical bug reports with reproduction steps, payloads, logs, and remediation code)
