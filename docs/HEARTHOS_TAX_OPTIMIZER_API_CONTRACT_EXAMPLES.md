# HearthOS Tax Optimizer — API Contract Examples

Base: `/api/v1/tax-optimizer`
Auth: Clerk session required; all routes org-scoped.

## 1) Get tax overview
### Request
`GET /api/v1/tax-optimizer/overview?period=2026-Q1`

### Response 200
```json
{
  "period": "2026-Q1",
  "readinessScore": 82,
  "openObligations": 3,
  "upcomingDue": [
    {"id":"obl_1","type":"sales_tax","jurisdiction":"TX","dueDate":"2026-04-20","estimatedAmountCents":184500}
  ],
  "alerts": [
    {"code":"MISSING_PAYROLL_SYNC","severity":"warning","message":"Payroll feed has not synced in 9 days."}
  ]
}
```

## 2) Create/update tax profile
### Request
`PUT /api/v1/tax-optimizer/profile`
```json
{
  "entityType": "llc",
  "federalEin": "12-3456789",
  "defaultAutomationMode": "assisted",
  "stateAccountRefs": {
    "TX": {"salesTaxAccountId":"TX-123"}
  }
}
```

### Response 200
```json
{"success": true, "profileId": "txp_123"}
```

## 3) List obligations
### Request
`GET /api/v1/tax-optimizer/obligations?status=ready_for_review&limit=50`

### Response 200
```json
{
  "items": [
    {
      "id":"obl_1",
      "type":"sales_tax",
      "jurisdiction":"TX",
      "period":"2026-Q1",
      "dueDate":"2026-04-20",
      "status":"ready_for_review",
      "estimatedAmountCents":184500,
      "finalAmountCents":null
    }
  ],
  "nextCursor": null
}
```

## 4) Approve obligation for submission
### Request
`POST /api/v1/tax-optimizer/obligations/obl_1/approve`
```json
{"note":"Reviewed by owner"}
```

### Response 200
```json
{"success":true,"status":"approved"}
```

## 5) Queue submission/payment
### Request
`POST /api/v1/tax-optimizer/obligations/obl_1/submit`
```json
{
  "mode": "assisted",
  "paymentInstructionId": "payinst_44",
  "idempotencyKey": "7b8f0a2f-4e5f-43a9-b671-7c5a5d8f3331"
}
```

### Response 202
```json
{"queued":true,"queueId":"q_9001","status":"submitted"}
```

## 6) Filing run details
### Request
`GET /api/v1/tax-optimizer/filings/fr_777`

### Response 200
```json
{
  "id":"fr_777",
  "obligationId":"obl_1",
  "status":"accepted",
  "provider":"state_portal",
  "externalRef":"TX-SUB-2026-0012",
  "submittedAt":"2026-04-18T16:05:00Z",
  "acceptedAt":"2026-04-18T16:09:00Z"
}
```

## 7) AI CPA assistant
### Request
`POST /api/v1/tax-optimizer/ai-cpa/ask`
```json
{
  "question": "Can I deduct mileage and fuel for service trucks in Texas?",
  "context": {"period":"2026-Q1","orgId":"org_1"}
}
```

### Response 200
```json
{
  "answer": "You can generally deduct business mileage or actual vehicle expenses, but not both for the same vehicle/year.",
  "confidence": "medium",
  "citations": [
    {"title":"IRS Pub 463","url":"https://www.irs.gov/publications/p463"}
  ],
  "requiresHumanReview": true,
  "disclaimer": "AI guidance is informational and not legal/tax advice."
}
```

## 8) W2 batch lifecycle
### Create batch
`POST /api/v1/tax-optimizer/w2/batches`
```json
{"year": 2026}
```
Response:
```json
{"batchId":"w2b_1","status":"draft"}
```

### Approve batch
`POST /api/v1/tax-optimizer/w2/batches/w2b_1/approve`
```json
{"approvalNote":"Controller approved"}
```

### File batch
`POST /api/v1/tax-optimizer/w2/batches/w2b_1/file`
```json
{"idempotencyKey":"2ac3eb91-c4b3-4e3a-8a10-bf5e772dd28d"}
```

## 9) Errors
### 400 Validation
```json
{"error":"VALIDATION_ERROR","message":"entityType is required"}
```
### 403 RBAC
```json
{"error":"FORBIDDEN","message":"Owner/Admin role required"}
```
### 409 State conflict
```json
{"error":"STATE_CONFLICT","message":"Obligation must be approved before submission"}
```

## 10) Audit expectations
All mutating endpoints must emit `tax_audit_events` with:
- actor user id
- org id
- entity type/id
- before/after snapshot
- request metadata (ip/ua)
- timestamp
