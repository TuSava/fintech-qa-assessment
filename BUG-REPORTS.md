Bug Report 1: Double crediting on concurrent deposits
Bug ID: BUG-FIN-001
Title: Concurrent duplicate PSP deposit webhooks cause double crediting to player wallet due to missing distributed lock
Environment: Staging 
Severity: Critical 
Priority: 

 Preconditions
1. Player user_alpha_49102 exists in tenant_alpha with initial wallet balance 0.00 EUR (0 integer cents).
2. PSP webhook endpoint /api/v1/callbacks/psp/deposit is active and reachable.
3. System has 4 horizontally scaled application instances behind load balancer.

 Steps to Reproduce
1. Prepare a valid PSP deposit webhook payload for amount 5000 cents (50.00 EUR).
2. Compute valid HMAC-SHA256 signature.
3. Using an automated script (or Playwright Promise.all()), dispatch two identical HTTP POST requests simultaneously (< 2ms arrival difference across instances 1 and 3):

curl -X POST https://api-staging.fintech-platform.internal/v1/callbacks/psp/deposit \
  -H "Content-Type: application/json" -H "X-Tenant-ID: tenant_alpha" \
  -H "X-PSP-Signature: 3a9f07..." -d @payload.json &
curl -X POST https://api-staging.fintech-platform.internal/v1/callbacks/psp/deposit \
  -H "Content-Type: application/json" -H "X-Tenant-ID: tenant_alpha" \
  -H "X-PSP-Signature: 3a9f07..." -d @payload.json &
wait

4. Check HTTP response codes and response bodies for both requests.
5. Сheck player wallet balance via GET /api/v1/wallet/balance.
6. Inspect transactions and ledger_entries tables in database.

 Test Data
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

 Expected Result
Deposit is credited once. Final player balance is 50.00 EUR with a single transaction record.

 Actual Result
Both concurrent requests succeed and deposit is credited twice. Final player balance is 100.00 EUR.


Bug Report 2: Webhook Replay Attack Without Nonce / Timestamp Expiry Credits Balance Multiple Times

Bug ID: BUG-SEC-002
Title: Legitimate signed PSP deposit callback can be captured and replayed indefinitely after hours/days without expiration
Environment: Staging 
Severity: Critical 
Priority: 

  Preconditions
1. A legitimate user completed a real 100.00 EUR deposit via PSP.
2. The PSP sent a valid signed webhook callback with timestamp: 1772820000 (4 hours ago).
3. Attacker intercepted or re-transmitted the raw HTTP request payload and headers.

  Steps to Reproduce
1. Capture legitimate deposit callback sent by PSP at 14:00:
Header: X-PSP-Signature: 8b6a1e...
Body: Contains timestamp: 1772820000, amount: 10000, user_id: "usr_attacker".
2. Wait 4 hours (current time: 18:00, timestamp: 1772834400).
3. Modify the psp_reference_id query parameter or use endpoint without reference deduping, or re-transmit the exact same HTTP request to POST /api/v1/callbacks/psp/deposit.
4. Inspect HTTP response code and wallet balance.

 Test Data
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

 Expected Result
Expired callback is rejected with HTTP 400 or 401. Player balance remains unchanged.

 Actual Result
Expired callback is accepted with HTTP 200 OK and wallet is credited again.

Bug Report 3: Cross-Tenant Data Leakage & Unauthorized Balance Exposure in Transaction Ledger API
Bug ID: BUG-TEN-003
Title: User authenticated in Tenant Alpha can query and view transaction records belonging to Tenant Beta users
Environment: Staging 
Build Version: 
Severity: High 
Priority: 

 Preconditions
1. User A is registered in tenant_alpha with user_id_alpha: "usr_aaaa-1111".
2. User B is registered in tenant_beta with user_id_beta: "usr_bbbb-2222".
3. User B has completed transactions in tenant_beta (Deposit 100.00 USD).
4. User A is authenticated and possesses a valid JWT token issued by tenant_alpha.

 Steps to Reproduce
1. Log in as User A (tenant_alpha) to acquire Bearer token_alpha.
2. Send GET /api/v1/transactions?user_id=usr_bbbb-2222 with headers:
Authorization: Bearer token_alpha
X-Tenant-ID: tenant_alpha
3. Inspect HTTP response status code and JSON payload.

 Test Data
GET /api/v1/transactions?user_id=usr_bbbb-2222 HTTP/1.1
Host: api-staging.fintech-platform.internal
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfYWFhYS0xMTExIiwidGVuYW50X2lkIjoidGVuYW50X2FscGhhIn0...
X-Tenant-ID: tenant_alpha

 Expected Result
Request is rejected with HTTP 403 Forbidden or 404 Not Found. Cross-tenant user transactions are not exposed.

 Actual Result
Server returns HTTP 200 OK and exposes transaction history of another tenant's user.
