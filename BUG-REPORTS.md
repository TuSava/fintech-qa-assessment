# Defect Investigation Reports (FinTech & Integration)

**System:** Multi-Tenant Core Wallet & Payment Integration Gateway  
**Document Version:** 1.0.0  
**Target Audience:** Engineering Leads, Tech Leads, Financial Risk & Compliance  

---

## Bug Report 1: Concurrent Duplicate Deposit Callbacks Cause Double Crediting (Race Condition)

### 1. Header & Classification
* **Bug ID:** `BUG-FIN-001`
* **Title:** Concurrent duplicate PSP deposit webhooks cause double crediting to player wallet due to missing distributed lock
* **Environment:** Staging Cluster 02 (`api-staging.fintech-platform.internal`)
* **Build Version:** `v2.14.0-rc3` (Commit `b7a9f14`)
* **Severity:** **Critical** (S1 – Direct Financial Loss / Balance Inflation)
* **Priority:** **P0** (Blocker – Must be resolved prior to release)

### 2. Preconditions
1. Player `user_alpha_49102` exists in `tenant_alpha` with initial wallet balance `0.00 EUR` (`0` integer cents).
2. PSP webhook endpoint `/api/v1/callbacks/psp/deposit` is active and reachable.
3. System has 4 horizontally scaled application instances behind load balancer.

### 3. Steps to Reproduce
1. Prepare a valid PSP deposit webhook payload for amount `5000` cents (50.00 EUR) with `psp_reference_id: "psp_tx_race_49102_a"`.
2. Compute valid HMAC-SHA256 signature using Tenant Alpha secret key.
3. Using an automated script (or Playwright `Promise.all()`), dispatch two identical HTTP POST requests simultaneously (< 2ms arrival difference across instances #1 and #3):
   ```bash
   # Parallel dispatch simulation
   curl -X POST https://api-staging.fintech-platform.internal/v1/callbacks/psp/deposit \
     -H "Content-Type: application/json" -H "X-Tenant-ID: tenant_alpha" \
     -H "X-PSP-Signature: 3a9f07..." -d @payload.json &
   curl -X POST https://api-staging.fintech-platform.internal/v1/callbacks/psp/deposit \
     -H "Content-Type: application/json" -H "X-Tenant-ID: tenant_alpha" \
     -H "X-PSP-Signature: 3a9f07..." -d @payload.json &
   wait
   ```
4. Check HTTP response codes and response bodies for both requests.
5. Query player wallet balance via `GET /api/v1/wallet/balance`.
6. Inspect `transactions` and `ledger_entries` tables in database.

### 4. Test Data
```json
{
  "event_type": "DEPOSIT_SUCCESS",
  "event_id": "evt_psp_990182",
  "tenant_id": "tenant_alpha",
  "user_id": "usr_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "psp_reference_id": "psp_tx_race_49102_a",
  "amount": 5000,
  "currency": "EUR",
  "timestamp": 1772827300
}
```

### 5. Expected Result
* First request processes transaction, creates ledger record, increments balance by `5000` cents, and returns HTTP `200 OK` (`is_duplicate: false`).
* Second concurrent request encounters a distributed lock or database unique constraint violation on `(tenant_id, psp_reference_id)`, returns HTTP `200 OK` (`is_duplicate: true`) or `409 Conflict`.
* Final player wallet balance is strictly **`5000` cents** (50.00 EUR).
* Exactly one transaction record exists in the database.

### 6. Actual Result
* Both requests returned HTTP `200 OK` with `status: "PROCESSED"` and `is_duplicate: false`.
* Two separate rows were inserted into the `transactions` table (`txn_01` and `txn_02`).
* Final player wallet balance is **`10000` cents** (100.00 EUR) — player received double the deposited funds!

### 7. Example Logs
```
[2026-09-06T19:02:14.102Z] [Instance-01] [INFO] [Req-ID: 7a81b] Handling PSP callback psp_tx_race_49102_a for tenant_alpha
[2026-09-06T19:02:14.103Z] [Instance-03] [INFO] [Req-ID: 9c42e] Handling PSP callback psp_tx_race_49102_a for tenant_alpha
[2026-09-06T19:02:14.115Z] [Instance-01] [DEBUG] [Req-ID: 7a81b] SELECT * FROM psp_events WHERE psp_reference_id = 'psp_tx_race_49102_a' -> 0 rows found
[2026-09-06T19:02:14.116Z] [Instance-03] [DEBUG] [Req-ID: 9c42e] SELECT * FROM psp_events WHERE psp_reference_id = 'psp_tx_race_49102_a' -> 0 rows found
[2026-09-06T19:02:14.140Z] [Instance-01] [INFO] [Req-ID: 7a81b] Crediting wallet usr_9b1deb4d balance from 0 to 5000
[2026-09-06T19:02:14.141Z] [Instance-03] [INFO] [Req-ID: 9c42e] Crediting wallet usr_9b1deb4d balance from 5000 to 10000
[2026-09-06T19:02:14.150Z] [Instance-01] [INFO] [Req-ID: 7a81b] Transaction committed successfully. Response 200 OK
[2026-09-06T19:02:14.152Z] [Instance-03] [INFO] [Req-ID: 9c42e] Transaction committed successfully. Response 200 OK
```

### 8. Business Impact
Direct, irrecoverable financial loss for the company. Malicious actors or automated PSP network retry storms will siphon capital by triggering rapid duplicate callback bursts, leaving player accounts over-funded and draining payout reserves.

### 9. Possible Root Cause
Classic check-then-act race condition (TOCTOU). The application verifies whether `psp_reference_id` exists in the database using a standard `SELECT` query before starting the transaction. Because both requests execute the `SELECT` query before either commits, neither finds an existing record. Furthermore, there is no Redis distributed mutex lock or composite database unique constraint on `(tenant_id, psp_reference_id)`.

### 10. Suggested Fix
1. **Distributed Mutex Lock:** Acquire a Redis distributed lock (`Redlock`) using key `lock:psp:deposit:{tenant_id}:{psp_reference_id}` with a 5-second TTL prior to processing:
   ```typescript
   const lock = await redisLocker.acquire(`lock:psp:deposit:${tenantId}:${pspReferenceId}`, 5000);
   if (!lock) {
     return res.status(409).json({ error: 'ERR_CONCURRENT_REQUEST', message: 'Transaction is currently being settled' });
   }
   ```
2. **Database Unique Constraint:** Add a database-level composite unique constraint on `(tenant_id, psp_reference_id)` in the PostgreSQL migration:
   ```sql
   ALTER TABLE psp_transactions 
   ADD CONSTRAINT uq_tenant_psp_reference UNIQUE (tenant_id, psp_reference_id);
   ```
3. Use atomic upsert (`INSERT ... ON CONFLICT (tenant_id, psp_reference_id) DO NOTHING`) inside a serializable transaction.

---

## Bug Report 2: Webhook Replay Attack Without Nonce / Timestamp Expiry Credits Balance Multiple Times

### 1. Header & Classification
* **Bug ID:** `BUG-SEC-002`
* **Title:** Legitimate signed PSP deposit callback can be captured and replayed indefinitely after hours/days without expiration
* **Environment:** Staging Cluster 01 (`api-staging.fintech-platform.internal`)
* **Build Version:** `v2.14.0-rc3`
* **Severity:** **Critical** (S1 – Payment Security Vulnerability / Exploit)
* **Priority:** **P0** (Blocker – Financial Security Violation)

### 2. Preconditions
1. A legitimate user completed a real 100.00 EUR deposit via PSP.
2. The PSP sent a valid signed webhook callback with `timestamp: 1772820000` (4 hours ago).
3. Attacker intercepted or re-transmitted the raw HTTP request payload and headers.

### 3. Steps to Reproduce
1. Capture legitimate deposit callback sent by PSP at 14:00:
   * Header: `X-PSP-Signature: 8b6a1e...`
   * Body: Contains `timestamp: 1772820000`, `amount: 10000`, `user_id: "usr_attacker"`.
2. Wait 4 hours (current time: 18:00, timestamp: `1772834400`).
3. Modify the `psp_reference_id` query parameter or use endpoint without reference deduping, or re-transmit the exact same HTTP request to `POST /api/v1/callbacks/psp/deposit`.
4. Inspect HTTP response code and wallet balance.

### 4. Test Data
```http
POST /api/v1/callbacks/psp/deposit HTTP/1.1
Host: api-staging.fintech-platform.internal
Content-Type: application/json
X-Tenant-ID: tenant_alpha
X-PSP-Signature: 8b6a1ef8632e12a4128f72921b7100b3f588c21a59ecae70335e2197607730e2

{
  "event_type": "DEPOSIT_SUCCESS",
  "event_id": "evt_replay_001",
  "tenant_id": "tenant_alpha",
  "user_id": "usr_attacker_uuid_88",
  "psp_reference_id": "psp_tx_legit_original",
  "amount": 10000,
  "currency": "EUR",
  "timestamp": 1772820000
}
```

### 5. Expected Result
* The server inspects payload `timestamp` against current server time ($T$).
* Since $|T_{current} - T_{payload}| = 14,400\text{s} > 300\text{s}$, the request must be immediately rejected with HTTP `400 Bad Request` or `401 Unauthorized` (`ERR_TIMESTAMP_EXPIRED`).
* No database balance updates are performed.

### 6. Actual Result
* The server only performs an HMAC calculation (`Crypto.hmacSha256(payload, secret) === signature`).
* Because the attacker did not change the signed body, the HMAC matches 100%.
* Server accepts the request, returns HTTP `200 OK`, and credits the attacker's wallet again.

### 7. Example Logs
```
[2026-09-06T19:15:02.312Z] [API-Gateway] [INFO] Incoming POST /callbacks/psp/deposit for tenant_alpha
[2026-09-06T19:15:02.315Z] [Auth-Service] [DEBUG] Verifying HMAC signature: expected=8b6a1e... actual=8b6a1e... -> MATCH
[2026-09-06T19:15:02.316Z] [Auth-Service] [WARN] No timestamp tolerance verification implemented! Proceeding...
[2026-09-06T19:15:02.340Z] [Wallet-Service] [INFO] User usr_attacker_uuid_88 credited with 10000 EUR cents.
```

### 8. Business Impact
Catastrophic financial exploit. Any network eavesdropper, malicious intermediary, or rogue internal agent with access to ingress logs can replay past deposit webhooks repeatedly to manufacture infinite wallet funds and immediately cash out via casino games or crypto withdrawals.

### 9. Possible Root Cause
The webhook validation middleware only validates mathematical integrity of the cryptographic hash (`HMAC-SHA256`). It completely omits freshness checks (timestamp tolerance window) and does not require or track a cryptographically random `nonce`.

### 10. Suggested Fix
1. **Timestamp Freshness Enforcement:** Implement strict timestamp boundary validation (e.g. 5 minutes / 300 seconds maximum drift):
   ```typescript
   const MAX_DRIFT_SECONDS = 300;
   const currentTime = Math.floor(Date.now() / 1000);
   if (Math.abs(currentTime - payload.timestamp) > MAX_DRIFT_SECONDS) {
     logger.warn('Callback rejected due to expired timestamp', { payloadTime: payload.timestamp, currentTime });
     return res.status(400).json({
       error: 'ERR_TIMESTAMP_EXPIRED',
       message: 'Callback timestamp outside acceptable 300s window',
     });
   }
   ```
2. **Nonce Cache in Redis:** Require PSP to pass a `nonce` in header or payload; store seen nonces in Redis with 10-minute TTL:
   ```typescript
   const nonceKey = `nonce:${payload.tenant_id}:${payload.nonce}`;
   const isNewNonce = await redis.set(nonceKey, '1', 'EX', 600, 'NX');
   if (!isNewNonce) {
     return res.status(401).json({ error: 'ERR_NONCE_REUSED', message: 'Replay detected: nonce already used' });
   }
   ```

---

## Bug Report 3: Cross-Tenant Data Leakage & Unauthorized Balance Exposure in Transaction Ledger API

### 1. Header & Classification
* **Bug ID:** `BUG-TEN-003`
* **Title:** User authenticated in Tenant Alpha can query and view transaction records belonging to Tenant Beta users
* **Environment:** Staging Cluster 01 (`api-staging.fintech-platform.internal`)
* **Build Version:** `v2.14.0-rc3`
* **Severity:** **High** (S2 – Multi-Tenant Data Breach / Privacy Violation)
* **Priority:** **P1** (Must fix before enterprise launch)

### 2. Preconditions
1. User A is registered in `tenant_alpha` with `user_id_alpha: "usr_aaaa-1111"`.
2. User B is registered in `tenant_beta` with `user_id_beta: "usr_bbbb-2222"`.
3. User B has completed transactions in `tenant_beta` (Deposit `100.00 USD`).
4. User A is authenticated and possesses a valid JWT token issued by `tenant_alpha`.

### 3. Steps to Reproduce
1. Log in as User A (`tenant_alpha`) to acquire `Bearer <token_alpha>`.
2. Send `GET /api/v1/transactions?user_id=usr_bbbb-2222` with headers:
   * `Authorization: Bearer <token_alpha>`
   * `X-Tenant-ID: tenant_alpha`
3. Inspect HTTP response status code and JSON payload.

### 4. Test Data
```http
GET /api/v1/transactions?user_id=usr_bbbb-2222 HTTP/1.1
Host: api-staging.fintech-platform.internal
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfYWFhYS0xMTExIiwidGVuYW50X2lkIjoidGVuYW50X2FscGhhIn0...
X-Tenant-ID: tenant_alpha
```

### 5. Expected Result
* Server verifies that `user_id` in query parameters does not match `sub` claim in JWT, or verifies that `usr_bbbb-2222` does not belong to `tenant_alpha`.
* Server returns HTTP `403 Forbidden` or `404 Not Found`.
* Zero financial or personal information regarding User B is returned.

### 6. Actual Result
* Server returns HTTP `200 OK`.
* Response body exposes User B's entire transaction ledger, including deposit amounts, masked card numbers, payment references, and timestamps:
```json
{
  "items": [
    {
      "transaction_id": "txn_beta_99812",
      "tenant_id": "tenant_beta",
      "user_id": "usr_bbbb-2222",
      "type": "DEPOSIT",
      "amount": 10000,
      "currency": "USD",
      "reference_id": "psp_beta_dep_44",
      "created_at": "2026-09-06T18:12:00Z"
    }
  ],
  "total_count": 1
}
```

### 7. Example Logs
```
[2026-09-06T19:20:45.012Z] [API] GET /transactions?user_id=usr_bbbb-2222
[2026-09-06T19:20:45.014Z] [Auth] JWT verified: sub=usr_aaaa-1111, tenant=tenant_alpha
[2026-09-06T19:20:45.018Z] [SQL-Query] SELECT * FROM transactions WHERE user_id = 'usr_bbbb-2222' LIMIT 10 OFFSET 0;
[2026-09-06T19:20:45.022Z] [API] Query returned 1 row. Returning 200 OK to caller.
```

### 8. Business Impact
Severe regulatory and contractual liability (GDPR violation, PCI-DSS compliance failure). Tenant B's proprietary business volume and private customer financial histories are exposed to competitors or arbitrary users operating on Tenant A.

### 9. Possible Root Cause
In `TransactionRepository.find()`, the SQL query directly uses `WHERE user_id = :userId` without scoping by `AND tenant_id = :tenantId`. Furthermore, the controller allows regular users to specify an arbitrary `user_id` query parameter rather than enforcing the authenticated user's ID from the decoded JWT claims (`req.user.sub`).

### 10. Suggested Fix
1. **Controller-Level Enforcement:** Do not allow regular non-admin players to override `user_id` in request queries. Always bind queries to `req.user.sub` and `req.user.tenantId`:
   ```typescript
   export async function getTransactions(req: AuthenticatedRequest, res: Response) {
     const tenantId = req.user.tenantId;
     const userId = req.user.role === 'ADMIN' && req.query.user_id 
       ? (req.query.user_id as string) 
       : req.user.sub;

     const transactions = await transactionRepo.findAll({
       where: {
         userId,
         tenantId, // Mandatory tenant isolation scope
       },
       limit: req.query.limit,
       offset: req.query.offset,
     });

     return res.json({ items: transactions });
   }
   ```
2. **Database Row-Level Security (RLS):** Enable PostgreSQL RLS on all ledger tables to ensure the database engine enforces tenant boundaries automatically:
   ```sql
   ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

   CREATE POLICY tenant_isolation_policy ON transactions
     FOR ALL
     USING (tenant_id = current_setting('app.current_tenant', true));
   ```
