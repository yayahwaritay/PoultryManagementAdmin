# Checkout integration guide — Admin frontend (Super Admin only)

Endpoints for searching/inspecting stored Monime checkout-session responses and their audit trail.
Everything here is created by customers calling `POST /api/checkout/sessions`
(see `CHECKOUT-CUSTOMER-README.md`) — there's nothing to create from the admin side, only to look up.

## 1. Auth

**`SuperAdmin` role only** — the same admin JWT from `POST /api/auth/login`, but only when
`isSuperAdmin: true` on that login response. A regular admin (even one with every permission)
gets `403 Forbidden` here; this is not gated by the `ManageProducts`/`ConfirmOrders` permissions
used elsewhere.

```
Authorization: Bearer <super admin JWT>
```

## 2. Data model

Two tables back these endpoints:

- **`CheckoutSessions`** — one row per *successful* Monime response: the redirect URL, status,
  line items, amounts, timestamps, etc. This is "the checkout response stored in the table" the
  search endpoints below query.
- **`CheckoutAuditLogs`** — one row per *attempt* (success **or** failure) to call Monime: request
  payload, HTTP status, raw response, error message. This is the audit log — it exists even for
  calls that never produced a `CheckoutSessions` row (Monime rejected the request, or the call
  couldn't reach Monime at all).

A `CheckoutAuditLogs` row links to its `CheckoutSessions` row via `checkoutSessionId` when the
attempt succeeded.

## 3. Search stored checkout sessions

**`GET /api/superadmin/checkout/sessions`**

All query params optional and combine with AND:

| Param | Type | Matches |
|---|---|---|
| `status` | string | Exact match on Monime's status string (`pending`, `completed`, `expired`, `cancelled`, etc. — whatever Monime returns, stored verbatim). |
| `reference` | string | Exact match on your `reference` (e.g. order number). |
| `monimeSessionId` | string | Exact match on Monime's own session id (`scs-...`). |
| `customerId` | GUID | Sessions started by a specific customer. |
| `from`, `to` | ISO 8601 datetime | Filters on our `createdAt` (when the session was created in our DB, not Monime's `createTime`). |
| `search` | string | Partial match across `monimeSessionId`, `name`, `reference`, `orderNumber` — use this for a single free-text search box. |

Response `200 OK` — array, newest first:

```json
[
  {
    "id": "3f2a1c9e-...",
    "customerId": "b00c558e-fa52-48aa-9c76-178d52a3a1c6",
    "customerName": "Test Buyer",
    "customerEmail": "test.buyer@example.com",
    "monimeSessionId": "scs-k6Twsxm6iHp2JpAdRVZ76C44wu4",
    "status": "pending",
    "name": "Abu Conteh",
    "orderNumber": null,
    "reference": "JSC-2026-000123",
    "description": "Order JSC-2026-000123",
    "redirectUrl": "https://checkout.monime.io/scs-k6Twsxm6iHp2JpAdRVZ76C44wu4",
    "cancelUrl": null,
    "successUrl": null,
    "financialAccountId": "fac-QBoieXUxRqRBNNt6y3YVAqBrV",
    "lineItems": {
      "data": [
        {
          "type": "custom",
          "id": "lit-k6Twsxm6jBKprGevtJcyeeLsaRW",
          "name": "chair",
          "price": { "currency": "SLE", "value": 100 },
          "quantity": 1,
          "reference": "eJvOuTcxeE"
        }
      ]
    },
    "brandingOptions": null,
    "metadata": null,
    "monimeExpireTime": "2026-08-16T11:15:42.02Z",
    "monimeCreateTime": "2026-08-16T10:15:42.02Z",
    "idempotencyKey": "b4b0a6e1-2f3d-4a1e-9c3a-6a7e2c8f9d10",
    "createdAt": "2026-08-16T10:15:42.03Z"
  }
]
```

`lineItems`/`brandingOptions`/`metadata` are the raw JSON Monime returned, parsed for you (not
double-encoded strings) — render/inspect them as-is.

## 4. Get one stored checkout session

**`GET /api/superadmin/checkout/sessions/{id}`** — `{id}` is our internal `id` (not Monime's
`monimeSessionId`). Same object shape as above. `404` if not found.

## 5. Search the audit trail

**`GET /api/superadmin/checkout/audit-logs`**

| Param | Type | Matches |
|---|---|---|
| `success` | bool | `true` = attempts that produced a stored session; `false` = Monime-rejected or network failures. |
| `customerId` | GUID | Attempts by a specific customer. |
| `checkoutSessionId` | GUID | The attempt(s) that produced a specific stored session (normally exactly one). |
| `from`, `to` | ISO 8601 datetime | Filters on `createdAt`. |

Response `200 OK` — array, newest first:

```json
[
  {
    "id": "9a1e2f3c-...",
    "customerId": "b00c558e-fa52-48aa-9c76-178d52a3a1c6",
    "customerName": "Test Buyer",
    "checkoutSessionId": "3f2a1c9e-...",
    "monimeSessionId": "scs-k6Twsxm6iHp2JpAdRVZ76C44wu4",
    "action": "CreateCheckoutSession",
    "idempotencyKey": "b4b0a6e1-2f3d-4a1e-9c3a-6a7e2c8f9d10",
    "responseStatusCode": 200,
    "success": true,
    "errorMessage": null,
    "createdAt": "2026-08-16T10:15:42.03Z"
  }
]
```

This list view omits the raw request/response bodies to stay light — use the detail endpoint below
for those.

## 6. Get one audit-log row (with full payloads)

**`GET /api/superadmin/checkout/audit-logs/{id}`** — same fields as the list above, plus:

```json
{
  "...": "... all list fields ...",
  "requestPayload": { "name": "Abu Conteh", "lineItems": [ "..." ] },
  "responsePayload": { "success": true, "messages": [], "result": { "...": "the full Monime response" } }
}
```

Use this when troubleshooting a specific failed/disputed checkout — `responsePayload` is Monime's
exact response body (including its `messages` array on errors), and `requestPayload` is exactly
what this backend sent to Monime (after server-side header/idempotency-key injection, before
transport).

## 7. Error responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing/expired/invalid JWT. |
| `403 Forbidden` | Valid JWT, but not a Super Admin. |
| `404 Not Found` | `{id}` doesn't exist (single-item endpoints only). |
