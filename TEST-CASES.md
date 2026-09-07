Comprehensive Test Cases Suite: Financial & Integration Flow

System: Multi-Tenant Core Wallet & Gaming Integration Platform (Mini-MVP)  
Total Test Cases: 36  
Standards: ISO/IEC/IEEE 29119-3 Software Testing Standards  

---

Summary Matrix

| Category / Feature | Test IDs | Count | Primary Focus |
| :--- | :--- | :---: | :--- |
| Identity: Registration | TC-REG-001 – TC-REG-004 | 4 | Input validation, unique constraints, tenant binding |
| Identity: Authentication & AuthZ | TC-AUTH-001 – TC-AUTH-004 | 4 | JWT issuance, password hashing, RBAC, session termination |
| PSP Integration: Deposit Callbacks | TC-DEP-001 – TC-DEP-005 | 5 | HMAC verification, balance increment, currency matching |
| Idempotency & Replay Protection | TC-IDEMP-001 – TC-IDEMP-003 | 3 | Race conditions, duplicate webhooks, nonce replay |
| GSP Integration: Bet Callbacks | TC-GSP-001 – TC-GSP-005 | 5 | Balance debits, overdraft prevention, round locking |
| GSP Integration: Win Callbacks | TC-GSP-006 – TC-GSP-009 | 4 | Payout credits, out-of-order handling, push rounds |
| Core Wallet & Ledger System | TC-WAL-001 – TC-WAL-004 | 4 | Double-entry balancing, sub-cent precision, wallet freezes |
| Transaction History & Audit | TC-TXN-001 – TC-TXN-003 | 3 | Immutable ledger audit, pagination, IDOR prevention |
| Multi-Tenant Isolation & Leakage | TC-TEN-001 – TC-TEN-003 | 3 | Cross-tenant boundaries, secret keys, data leakage |
| Performance Sanity & Latency | TC-PERF-001 – TC-PERF-002 | 2 | Webhook throughput, SLA latency bounds (< 150ms) |

---

1. Identity & Registration

TC-REG-001: Successful User Registration with Default Tenant Wallet Initialization
Feature: Registration / Identity
Title: Verify new user registration generates auth record and initializes isolated zero-balance wallet
Preconditions: Tenant tenant_alpha is active and configured in API Gateway.
Test Data:
  {
    "tenant_id": "tenant_alpha",
    "email": "user_alpha_01@fintech.test",
    "password": "SecurePassword123!",
    "currency": "EUR"
  }
Steps:
  1. Send POST /api/v1/auth/register with headers Content-Type: application/json and X-Tenant-ID: tenant_alpha.
  2. Provide valid user payload with unique email, strong password, and EUR currency.
  3. Inspect HTTP response status code, header, and response body.
  4. Query internal wallet service via GET /api/v1/wallet/balance with issued JWT.
Expected Result:
  - HTTP status is 201 Created.
  - Response body contains user_id (UUIDv4), email, tenant_id: "tenant_alpha", and excludes password or password hash.
  - An isolated wallet is automatically created with balance: 0, currency: "EUR", and status ACTIVE.
Severity: Critical
Priority: P0
Test Type: Functional / Integration
Source: Existing

---

TC-REG-002: Rejection of Duplicate Email within Same Tenant
Feature: Registration / Validation
Title: Verify registration rejects duplicate email for the same tenant with 409 Conflict
Preconditions: User user_alpha_01@fintech.test already exists in tenant_alpha.
Test Data:
  {
    "tenant_id": "tenant_alpha",
    "email": "user_alpha_01@fintech.test",
    "password": "AnotherPassword456!",
    "currency": "EUR"
  }
Steps:
  1. Send POST /api/v1/auth/register with identical email address for tenant_alpha.
  2. Inspect response code, error code, and error message.
Expected Result:
  - HTTP status is 409 Conflict.
  - Response body contains {"error": "ERR_USER_EXISTS", "message": "Email already registered for this tenant"}.
  - No secondary database record or duplicate wallet is created.
Severity: High
Priority: P1
Test Type: Negative / Validation
Source: Existing

---

TC-REG-003: Password Schema & Input Sanitization Validation
Feature: Registration / Validation
Title: Verify registration rejects weak passwords and malicious script tags in input fields
Preconditions: None.
Test Data:
  {
    "tenant_id": "tenant_alpha",
    "email": "<script>alert('xss')</script>@test.com",
    "password": "123",
    "currency": "EUR"
  }
Steps:
  1. Send POST /api/v1/auth/register with short password (< 8 chars, no special characters) and XSS attempt in email field.
Expected Result:
  - HTTP status is 400 Bad Request.
  - Response contains field-level validation errors: password fails complexity policy; email fails RFC 5322 regex.
  - Request payload is sanitized; zero script execution in server logs.
Severity: Medium
Priority: P2
Test Type: Negative / Security
Source: Improved

---

TC-REG-004: Cross-Tenant Same Email Registration Permitted (Tenant Segregation)
Feature: Registration / Multi-Tenant
Title: Verify identical email can be registered independently across different tenant IDs
Preconditions: user_global@test.com is registered in tenant_alpha.
Test Data:
  {
    "tenant_id": "tenant_beta",
    "email": "user_global@test.com",
    "password": "SecurePassword123!",
    "currency": "USD"
  }
Steps:
  1. Send POST /api/v1/auth/register with X-Tenant-ID: tenant_beta using user_global@test.com.
  2. Inspect response and verify separate user_id generation.
Expected Result:
  - HTTP status is 201 Created.
  - User is created under tenant_beta with a distinct user_id.
  - Unique constraint is composite (tenant_id, email) rather than global email.
Severity: High
Priority: P1
Test Type: Integration / Tenant Isolation
Source: New

---

2. Authentication & Authorization

TC-AUTH-001: Successful Authentication and JWT Token Issuance
Feature: Authentication
Title: Verify valid credentials return signed JWT access token and refresh token
Preconditions: User user_alpha_01@fintech.test registered with password SecurePassword123!.
Test Data:
  {
    "email": "user_alpha_01@fintech.test",
    "password": "SecurePassword123!",
    "tenant_id": "tenant_alpha"
  }
Steps:
  1. Send POST /api/v1/auth/login.
  2. Decode returned JWT access token payload (header.payload.signature).
Expected Result:
  - HTTP status is 200 OK.
  - Response body contains access_token, refresh_token, and expires_in: 3600.
  - Decoded JWT claims contain sub: <user_id>, tenant_id: "tenant_alpha", roles: ["PLAYER"], and standard iat/exp timestamps.
Severity: Critical
Priority: P0
Test Type: Functional / Security
Source: Existing

---

TC-AUTH-002: Login Rejection on Invalid Password with Rate Limiting
Feature: Authentication / Security
Title: Verify authentication fails with 401 on wrong password and triggers rate limiting after 5 failures
Preconditions: User exists.
Test Data: Wrong password: "WrongPass999!".
Steps:
  1. Submit POST /api/v1/auth/login with wrong password 5 consecutive times.
  2. Submit 6th login attempt.
Expected Result:
  - Attempts 1–5 return HTTP 401 Unauthorized with generic message "Invalid credentials".
  - Attempt 6 returns HTTP 429 Too Many Requests with header Retry-After: 60.
  - No timing attack discrepancy between existing and non-existing emails (constant-time response).
Severity: High
Priority: P1
Test Type: Security / Negative
Source: Improved

---

TC-AUTH-003: Rejection of Expired or Tampered JWT Access Token
Feature: Authentication / Security
Title: Verify API Gateway rejects expired JWT tokens and tokens with altered cryptographic signatures
Preconditions: A valid JWT token generated for user_alpha_01.
Test Data: Token with modified payload claim ("roles": ["ADMIN"]) keeping original signature.
Steps:
  1. Send GET /api/v1/wallet/balance using tampered JWT in header Authorization: Bearer <tampered_token>.
  2. Send GET /api/v1/wallet/balance with expired JWT (exp in past).
Expected Result:
  - Both requests fail immediately with HTTP 401 Unauthorized.
  - Error code ERR_INVALID_TOKEN or ERR_TOKEN_EXPIRED.
  - No backend business logic or database query is executed.
Severity: Critical
Priority: P0
Test Type: Security
Source: New

---

TC-AUTH-004: Role-Based Authorization Enforcement (RBAC)
Feature: Authorization
Title: Verify regular player token cannot access operator administrative or internal reconciliation endpoints
Preconditions: Standard player JWT issued to user_alpha_01.
Steps:
  1. Send GET /api/v1/admin/tenants/tenant_alpha/financial-overview with player JWT.
  2. Send POST /api/v1/admin/ledger/reconcile with player JWT.
Expected Result:
  - HTTP status is 403 Forbidden.
  - Response body: {"error": "ERR_INSUFFICIENT_PERMISSIONS"}.
Severity: High
Priority: P1
Test Type: Security / Authorization
Source: New

---

3. Payment Service Provider (PSP) Deposit Callbacks

TC-DEP-001: Successful Deposit Webhook Processing and Balance Increment
Feature: Deposit Callback
Title: Verify valid signed PSP deposit callback credits player wallet and writes double-entry ledger record
Preconditions: User user_alpha_01 has initial balance 0.00 EUR.
Test Data:
  {
    "event_type": "DEPOSIT_SUCCESS",
    "event_id": "evt_psp_1001",
    "tenant_id": "tenant_alpha",
    "user_id": "<valid_user_uuid>",
    "psp_reference_id": "psp_tx_998877",
    "amount": 5000,
    "currency": "EUR",
    "timestamp": 1772827200
  }
  - Signature: Valid HMAC-SHA256 calculated with sec_live_alpha_psp_8f93bc817.
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit with payload and header X-PSP-Signature: <valid_hmac>.
  2. Check HTTP response status and body.
  3. Query GET /api/v1/wallet/balance for the user.
Expected Result:
  - HTTP status is 200 OK with {"status": "PROCESSED", "transaction_id": "txn_...", "new_balance": 5000}.
  - Player wallet balance increments by exactly 5000 cents (50.00 EUR).
  - Ledger table records: DEBIT PSP_CLEARING_ACCOUNT: 5000, CREDIT PLAYER_WALLET: 5000.
Severity: Critical
Priority: P0
Test Type: Functional / Integration
Source: Existing

---

TC-DEP-002: Rejection of Deposit Callback with Invalid HMAC Signature
Feature: Deposit Callback / Security
Title: Verify deposit callback is rejected with 401 when HMAC signature does not match payload
Preconditions: Valid user exists.
Test Data: Legitimate payload, but header X-PSP-Signature: invalid_sha256_hash_value.
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit with corrupted signature.
  2. Query user wallet balance.
Expected Result:
  - HTTP status is 401 Unauthorized with {"error": "ERR_INVALID_SIGNATURE"}.
  - Wallet balance remains unchanged.
  - Security audit event logged: SECURITY_ALERT: Invalid PSP callback signature.
Severity: Critical
Priority: P0
Test Type: Security / Negative
Source: Improved

---

TC-DEP-003: Rejection of Expired Deposit Callback Timestamp (Replay Prevention)
Feature: Deposit Callback / Security
Title: Verify webhook with timestamp older than 300 seconds is rejected
Preconditions: Current server time T. Webhook payload timestamp set to T - 301s.
Test Data: Valid HMAC signature matching the expired payload.
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit with valid signature but expired timestamp.
Expected Result:
  - HTTP status is 400 Bad Request or 401 Unauthorized.
  - Response body: {"error": "ERR_TIMESTAMP_EXPIRED", "message": "Callback timestamp outside allowable tolerance window"}.
  - Balance is not modified.
Severity: High
Priority: P1
Test Type: Security / Replay Attack
Source: New

---

TC-DEP-004: Validation of Negative, Zero, or Non-Integer Deposit Amounts
Feature: Deposit Callback / Validation
Title: Verify callback fails if deposit amount is negative, zero, or floating point
Preconditions: Valid user exists.
Test Data: Amounts: [0, -5000, 49.99, "fifty"].
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit for each invalid amount test data.
Expected Result:
  - HTTP status is 422 Unprocessable Entity or 400 Bad Request.
  - Error code ERR_INVALID_AMOUNT.
  - Zero balance alteration.
Severity: High
Priority: P1
Test Type: Negative / Validation
Source: Improved

---

TC-DEP-005: Currency Mismatch Rejection Between Callback and User Wallet
Feature: Deposit Callback / Business Logic
Title: Verify deposit callback in USD is rejected if target user's wallet is locked to EUR
Preconditions: User user_alpha_01 wallet currency is EUR.
Test Data: Callback payload specifies currency: "USD" and amount: 2500.
Steps:
  1. Send signed POST /api/v1/callbacks/psp/deposit with currency USD.
Expected Result:
  - HTTP status is 422 Unprocessable Entity.
  - Error code ERR_CURRENCY_MISMATCH.
  - System rejects automatic conversion without dedicated FX provider instructions.
Severity: High
Priority: P1
Test Type: Integration / Negative
Source: New

---

4. Idempotency & Duplicate Callback Handling

TC-IDEMP-001: Sequential Duplicate Deposit Callback Idempotency
Feature: Idempotency / Duplicate Callback
Title: Verify sending the exact same PSP deposit callback twice returns identical success without double-crediting
Preconditions: User balance is 1000 cents (10.00 EUR).
Test Data: psp_reference_id: "psp_tx_duplicate_seq_001", amount: 2000.
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit (Request 1).
  2. Verify balance increments to 3000 cents.
  3. Send identical POST /api/v1/callbacks/psp/deposit (Request 2) with identical event_id and psp_reference_id.
  4. Inspect HTTP status, response body, and user balance.
Expected Result:
  - Request 1 returns HTTP 200 OK (or 201 Created).
  - Request 2 returns HTTP 200 OK with header X-Idempotent-Replay: true and identical payload.
  - Final wallet balance is strictly 3000 cents (credited exactly ONCE).
Severity: Critical
Priority: P0
Test Type: Idempotency / Financial Integrity
Source: Existing

---

TC-IDEMP-002: Concurrent Duplicate Deposit Callbacks (Race Condition Stress)
Feature: Concurrency / Idempotency
Title: Verify 10 simultaneous identical deposit callbacks under 10ms window credit the wallet exactly once
Preconditions: User balance is 5000 cents.
Test Data: Identical payload with psp_reference_id: "psp_race_condition_777", amount: 1000.
Steps:
  1. Dispatch 10 parallel HTTP requests simultaneously using Promise.all() in Playwright.
  2. Collect all 10 responses (HTTP status codes, transaction IDs).
  3. Query wallet balance via GET /api/v1/wallet/balance.
  4. Check transaction database table for count of records matching psp_reference_id.
Expected Result:
  - Exactly ONE request performs ledger settlement; remaining 9 return idempotent success or 409 Conflict handled cleanly.
  - Wallet balance increases by exactly 1000 cents (final: 6000, NOT 15000).
  - Exactly 1 ledger entry exists for psp_race_condition_777.
Severity: Critical
Priority: P0
Test Type: Concurrency / Security / Money
Source: New

---

TC-IDEMP-003: Replay Attack with Reused Nonce
Feature: Replay Attack / Security
Title: Verify callback with duplicate nonce within active time window is blocked
Preconditions: Webhook sent with nonce: "nonce_sec_random_abc_123".
Test Data: Identical payload and signature replayed 5 seconds later.
Steps:
  1. Send legitimate signed callback containing nonce.
  2. Send secondary signed callback with different amount but reusing previous nonce.
Expected Result:
  - Second request is rejected with HTTP 409 Conflict or 401 Unauthorized (ERR_NONCE_REUSED).
  - Nonce cache in Redis prevents execution.
Severity: High
Priority: P1
Test Type: Security / Replay Attack
Source: New

---

5. Game Service Provider (GSP) Bet Callbacks

TC-GSP-001: Successful Bet Placement Callback with Real-Time Balance Debit
Feature: Bet Callback / GSP
Title: Verify GSP bet callback debits user balance and locks game round
Preconditions: User balance is 10000 cents (100.00 EUR).
Test Data:
  {
    "event_type": "BET",
    "round_id": "rnd_spin_889911",
    "tenant_id": "tenant_alpha",
    "user_id": "<valid_user_uuid>",
    "game_id": "slot_book_of_wealth",
    "bet_amount": 2500,
    "currency": "EUR",
    "timestamp": 1772827250
  }
  - Header: X-GSP-Signature: <valid_hmac>
Steps:
  1. Send POST /api/v1/callbacks/gsp/bet.
  2. Query GET /api/v1/wallet/balance.
Expected Result:
  - HTTP status is 200 OK with {"status": "ACCEPTED", "round_id": "rnd_spin_889911", "remaining_balance": 7500}.
  - Balance is reduced by exactly 2500 cents (new balance: 7500).
  - Double-entry ledger registers: DEBIT PLAYER_WALLET: 2500, CREDIT OPERATOR_ESCROW: 2500.
Severity: Critical
Priority: P0
Test Type: Functional / Integration
Source: Existing

---

TC-GSP-002: Rejection of Bet Callback on Insufficient Balance
Feature: Bet Callback / Money
Title: Verify GSP bet callback is rejected with 402/422 when bet exceeds available wallet balance
Preconditions: User balance is 1000 cents (10.00 EUR).
Test Data: bet_amount: 5000 cents (50.00 EUR).
Steps:
  1. Send signed POST /api/v1/callbacks/gsp/bet.
  2. Inspect response body and user balance.
Expected Result:
  - HTTP status is 402 Payment Required or 422 Unprocessable Entity.
  - Response body contains {"error": "ERR_INSUFFICIENT_FUNDS", "current_balance": 1000}.
  - User balance remains strictly 1000 cents.
Severity: Critical
Priority: P0
Test Type: Negative / Validation
Source: Existing

---

TC-GSP-003: Idempotent Duplicate Bet Callback Handling
Feature: Bet Callback / Idempotency
Title: Verify duplicate bet callback for the same round_id returns identical balance without deducting funds twice
Preconditions: Initial balance is 10000 cents.
Test Data: Same payload as TC-GSP-001 (round_id: "rnd_spin_889911", bet_amount: 2500).
Steps:
  1. Send POST /api/v1/callbacks/gsp/bet (first call).
  2. Send identical POST /api/v1/callbacks/gsp/bet (second call).
Expected Result:
  - Both calls return HTTP 200 OK.
  - Balance is deducted only once (remains 7500, not 5000).
Severity: Critical
Priority: P0
Test Type: Idempotency / Concurrency
Source: Improved

---

TC-GSP-004: Negative and Zero Bet Amount Validation
Feature: Bet Callback / Validation
Title: Verify system rejects bet requests where amount <= 0
Preconditions: User balance is 5000.
Test Data: bet_amount: -100 and bet_amount: 0.
Steps:
  1. Send POST /api/v1/callbacks/gsp/bet with bet_amount: -100.
  2. Send POST /api/v1/callbacks/gsp/bet with bet_amount: 0.
Expected Result:
  - HTTP status 422 Unprocessable Entity (ERR_INVALID_BET_AMOUNT).
  - Balance remains 5000.
Severity: High
Priority: P1
Test Type: Negative / Validation
Source: Existing

---

TC-GSP-005: Bet Callback for Frozen/Suspended Player Account
Feature: Bet Callback / Compliance
Title: Verify bet callback is rejected if user account status is SUSPENDED or SELF_EXCLUDED
Preconditions: User account status updated to SUSPENDED via admin API.
Test Data: Valid signed bet payload.
Steps:
  1. Send POST /api/v1/callbacks/gsp/bet.
Expected Result:
  - HTTP status is 403 Forbidden.
  - Response body: {"error": "ERR_ACCOUNT_SUSPENDED", "message": "Player wallet is suspended from real-money play"}.
  - No funds are debited.
Severity: High
Priority: P1
Test Type: Security / Integration
Source: New

---

6. Game Service Provider (GSP) Win Callbacks

TC-GSP-006: Successful Win Callback and Round Settlement
Feature: Win Callback / GSP
Title: Verify GSP win callback credits user wallet and closes game round
Preconditions: Bet placed for round_id: "rnd_spin_889911" with remaining balance 7500 cents.
Test Data:
  {
    "event_type": "WIN",
    "round_id": "rnd_spin_889911",
    "tenant_id": "tenant_alpha",
    "user_id": "<valid_user_uuid>",
    "game_id": "slot_book_of_wealth",
    "win_amount": 10000,
    "currency": "EUR",
    "timestamp": 1772827260
  }
Steps:
  1. Send signed POST /api/v1/callbacks/gsp/win.
  2. Query GET /api/v1/wallet/balance.
Expected Result:
  - HTTP status is 200 OK with {"status": "SETTLED", "round_id": "rnd_spin_889911", "new_balance": 17500}.
  - Balance increases by 10000 cents to 17500 cents (175.00 EUR).
  - Game round state transitions to SETTLED.
Severity: Critical
Priority: P0
Test Type: Functional / Integration
Source: Existing

---

TC-GSP-007: Zero Win (Loss / Push) Settlement Processing
Feature: Win Callback / GSP
Title: Verify win callback with win_amount: 0 closes the round without changing balance
Preconditions: Active round rnd_spin_999000 with bet already debited. Balance: 4000 cents.
Test Data: win_amount: 0.
Steps:
  1. Send POST /api/v1/callbacks/gsp/win with win_amount: 0.
Expected Result:
  - HTTP status is 200 OK.
  - Round state transitions to SETTLED_NO_PAYOUT.
  - Balance remains unchanged at 4000 cents.
Severity: Medium
Priority: P2
Test Type: Functional / Boundary
Source: Improved

---

TC-GSP-008: Out-of-Order Win Callback Handling (Win Arrives Before Bet)
Feature: Win Callback / Concurrency
Title: Verify Win callback arriving before Bet callback for unknown round is deferred or rejected gracefully
Preconditions: Round rnd_unseen_001 has no record in the system.
Test Data: Win callback for rnd_unseen_001.
Steps:
  1. Send POST /api/v1/callbacks/gsp/win for uninitialized round.
Expected Result:
  - System returns HTTP 409 Conflict or 422 Unprocessable Entity with ERR_ROUND_NOT_INITIALIZED.
  - Alternatively, places into a 5-second retry buffer without crediting until Bet callback registers.
  - Balance is never credited blindly for non-existent bets.
Severity: High
Priority: P1
Test Type: Negative / Concurrency
Source: New

---

TC-GSP-009: Duplicate Win Callback Idempotency
Feature: Win Callback / Idempotency
Title: Verify duplicate win callback for an already settled round does not credit winnings a second time
Preconditions: Round rnd_spin_889911 is already SETTLED with win amount 10000. Balance is 17500.
Test Data: Same win payload for rnd_spin_889911.
Steps:
  1. Send POST /api/v1/callbacks/gsp/win a second time.
Expected Result:
  - HTTP status is 200 OK (idempotent replay).
  - Balance remains strictly 17500 cents.
  - No secondary credit entry generated in ledger.
Severity: Critical
Priority: P0
Test Type: Idempotency / Financial Integrity
Source: Existing

---

7. Core Wallet & Ledger Integrity

TC-WAL-001: Real-Time Wallet Balance Query with Tenant Verification
Feature: Wallet
Title: Verify authenticated player retrieves accurate, real-time balance matching ledger sum
Preconditions: User has settled transactions (Deposit +5000, Bet -2500, Win +10000 = 12500).
Steps:
  1. Send GET /api/v1/wallet/balance with valid JWT.
Expected Result:
  - HTTP status is 200 OK.
  - Response body:
    {
      "user_id": "<uuid>",
      "tenant_id": "tenant_alpha",
      "currency": "EUR",
      "available_balance": 12500,
      "locked_balance": 0,
      "total_balance": 12500
    }
Severity: Critical
Priority: P0
Test Type: Functional
Source: Existing

---

TC-WAL-002: Sub-Cent Precision and Rounding Drift Validation
Feature: Wallet / Financial Precision
Title: Verify wallet does not drop fractional values or exhibit IEEE 754 floating-point drift
Preconditions: System operates on integer base units (cents / satoshis).
Test Data: 10,000 fractional micro-transactions of 0.01 EUR (1 cent).
Steps:
  1. Execute automated loop adding and subtracting 1 cent 100 times.
  2. Verify balance after operations.
Expected Result:
  - Math is exact: final balance exactly equals Initial + (100 x 1) - (100 x 1) = Initial.
  - Zero representation error like 0.0000000000000001 in API responses.
Severity: High
Priority: P1
Test Type: Money / Boundary
Source: New

---

TC-WAL-003: High-Concurrency Balance Debit Race Condition (Double Spend Prevention)
Feature: Wallet / Concurrency
Title: Verify two concurrent bets of 60 EUR each against a 100 EUR wallet result in exactly one success and one overdraft failure
Preconditions: User balance is exactly 10000 cents (100.00 EUR).
Test Data: Two distinct bet requests (round_id_A, round_id_B) of 6000 cents (60.00 EUR) each.
Steps:
  1. Fire Request A and Request B in parallel within < 1 millisecond.
  2. Wait for both responses.
  3. Query final balance.
Expected Result:
  - Exactly one request succeeds with HTTP 200 OK.
  - Exactly one request fails with HTTP 402 Payment Required (ERR_INSUFFICIENT_FUNDS).
  - Final wallet balance is 4000 cents (10000 - 6000). Balance NEVER goes negative (-2000).
Severity: Critical
Priority: P0
Test Type: Concurrency / Security / Money
Source: New

---

TC-WAL-004: Wallet Lock During Administrative Investigation
Feature: Wallet / Security
Title: Verify transactions are rejected when wallet is set to LOCKED state
Preconditions: Admin locks player wallet (wallet_status: "LOCKED").
Steps:
  1. Attempt deposit callback, bet callback, and withdrawal.
Expected Result:
  - All transactional operations return HTTP 423 Locked.
  - Balances remain completely untouched.
Severity: High
Priority: P1
Test Type: Security / Functional
Source: New

---

8. Transaction History & Audit Ledger

TC-TXN-001: Double-Entry Bookkeeping Ledger Conservation
Feature: Transactions / Ledger
Title: Verify sum of all debits equals sum of all credits across the entire ledger for every transaction
Preconditions: 5 mixed transactions processed (2 deposits, 2 bets, 1 win).
Steps:
  1. Query internal ledger journal entries for the tenant.
  2. Calculate Sum(Debit) - Sum(Credit).
Expected Result:
  - Sum(Debit) - Sum(Credit) == 0 with zero imbalance.
  - Every transaction row contains immutable created_at, nonce, and hash-chain pointer to previous block/row.
Severity: Critical
Priority: P0
Test Type: Financial Integrity / Integration
Source: New

---

TC-TXN-002: Transaction History Pagination, Filtering, and Sorting
Feature: Transactions
Title: Verify GET /api/v1/transactions returns paginated, correctly sorted results for authenticated user
Preconditions: User has 25 transactions on record.
Steps:
  1. Send GET /api/v1/transactions?page=1&limit=10&sort=desc with user JWT.
  2. Send GET /api/v1/transactions?page=2&limit=10&sort=desc.
Expected Result:
  - Page 1 returns items 1–10 sorted from newest to oldest.
  - Page 2 returns items 11–20 with no duplication or omissions.
  - Response headers include X-Total-Count: 25, X-Page-Count: 3.
Severity: Medium
Priority: P2
Test Type: Functional
Source: Existing

---

TC-TXN-003: Prevention of IDOR in Transaction Details Retrieval
Feature: Transactions / Security
Title: Verify user cannot view transaction details belonging to another user (IDOR)
Preconditions: User A has txn_alpha_111. User B authenticated with own JWT.
Steps:
  1. User B sends GET /api/v1/transactions/txn_alpha_111.
Expected Result:
  - HTTP status is 404 Not Found (or 403 Forbidden).
  - No metadata (amount, recipient, timestamps) is leaked to User B.
Severity: High
Priority: P1
Test Type: Security / IDOR
Source: Improved

---

9. Multi-Tenant Isolation & Leakage

TC-TEN-001: Cross-Tenant Wallet Balance Query Isolation (IDOR)
Feature: Tenant Isolation / Security
Title: Verify JWT from Tenant Alpha cannot access wallet belonging to Tenant Beta
Preconditions:
  - User A registered in tenant_alpha (user_id_alpha).
  - User B registered in tenant_beta (user_id_beta).
Steps:
  1. Authenticate as User A and acquire JWT for tenant_alpha.
  2. Send GET /api/v1/wallet/balance?user_id=<user_id_beta> with header X-Tenant-ID: tenant_alpha.
  3. Send GET /api/v1/wallet/balance?user_id=<user_id_beta> with header X-Tenant-ID: tenant_beta using User A's token.
Expected Result:
  - Step 2 returns 404 Not Found (User B does not exist in Tenant Alpha).
  - Step 3 returns 403 Forbidden (Token tenant mismatch: token claims tenant_alpha while header/path requests tenant_beta).
  - Zero cross-tenant data leakage.
Severity: Critical
Priority: P0
Test Type: Security / Tenant Leakage
Source: New

---

TC-TEN-002: Tenant Secret Key Isolation on PSP Callbacks
Feature: Tenant Isolation / Security
Title: Verify webhook signed with Tenant Alpha secret is rejected when targeting Tenant Beta endpoint
Preconditions:
  - Tenant Alpha secret: sec_live_alpha_psp_8f93bc817.
  - Tenant Beta secret: sec_live_beta_psp_1a2b3c4d5.
Test Data: Callback payload specifying tenant_id: "tenant_beta", but HMAC signed using Tenant Alpha's secret.
Steps:
  1. Send POST /api/v1/callbacks/psp/deposit with X-Tenant-ID: tenant_beta and signature made with Tenant Alpha secret.
Expected Result:
  - HTTP status is 401 Unauthorized (ERR_INVALID_SIGNATURE).
  - Signature verification uses strictly Tenant Beta's secret key from vault; cross-tenant signatures are rejected.
Severity: Critical
Priority: P0
Test Type: Security / Tenant Isolation
Source: New

---

TC-TEN-003: Cross-Tenant Transaction Ledger Query Isolation
Feature: Tenant Isolation / Security
Title: Verify operator admin for Tenant Alpha cannot query transaction records of Tenant Beta
Preconditions: Operator Admin JWT for tenant_alpha.
Steps:
  1. Send GET /api/v1/admin/transactions?tenant_id=tenant_beta using Tenant Alpha Admin token.
Expected Result:
  - HTTP status is 403 Forbidden.
  - Database query enforces tenant filter WHERE tenant_id = 'tenant_alpha'; zero Tenant Beta records exposed.
Severity: Critical
Priority: P0
Test Type: Security / Tenant Isolation
Source: New

---

10. Performance Sanity & Latency

TC-PERF-001: PSP Deposit Callback Latency SLA Verification (< 150ms)
Feature: Performance Sanity
Title: Verify 99th percentile response time for deposit webhook is under 150ms
Preconditions: System under nominal staging load (50 req/sec).
Test Data: 100 sequential valid signed deposit callbacks.
Steps:
  1. Send 100 deposit requests measuring response time from first byte sent to last byte received.
  2. Calculate p50, p90, and p99 latency metrics.
Expected Result:
  - p95 latency < 100ms.
  - p99 latency < 150ms.
  - Zero 5xx server errors or timeouts.
Severity: Medium
Priority: P2
Test Type: Performance Sanity
Source: New

---

TC-PERF-002: Real-Time Wallet Balance Read Throughput
Feature: Performance Sanity
Title: Verify GET /wallet/balance responds in < 30ms under 200 concurrent read requests
Preconditions: User wallet pre-populated.
Steps:
  1. Blast 200 concurrent GET /api/v1/wallet/balance requests.
Expected Result:
  - Redis read-through cache serves requests in < 30ms.
  - 100% of requests return HTTP 200 OK.
Severity: Medium
Priority: P2
Test Type: Performance Sanity
Source: New
