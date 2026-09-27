# WebApplication1 backend

An ASP.NET Core (.NET 10) Web API backed by **PostgreSQL** (via EF Core / Npgsql), covering:

- Public product catalog + customer signup/login + order placement (login required to order)
- Admin product management (with photo upload)
- Admin order confirmation
- Super Admin management of other Admins and their feature permissions
- A transaction monitoring / reconciliation page

> Note on `API-BACKEND-GUIDE.md`: that file documents a NestJS + Prisma + Angular stack from an
> earlier/different project phase that isn't present in this repo (no `server/`, no Angular
> frontend). This backend was built fresh in ASP.NET Core per your explicit instructions (Web API,
> Postgres, Admin/Super Admin, image upload to disk, transaction monitoring page), reusing that
> guide's domain rules where they still apply (money as integer cents, server-side price/total
> recalculation, idempotency keys, atomic stock decrement, never-guessable order/receipt lookups).

## 1. Setup

1. **Postgres connection** lives in `appsettings.json` → `ConnectionStrings:DefaultConnection`
   (already pointed at the local `poultryman` database and verified working end-to-end —
   migration applied, Super Admin seeded, login/category/product/order flows all smoke-tested).
   Move real credentials to a user-secret or the `ConnectionStrings__DefaultConnection` env var
   before this goes anywhere beyond your machine.
2. **Set a real JWT signing key** in `Jwt:Key` for anything beyond local dev (32+ random chars).
3. Migrations apply automatically on app startup via `DbSeeder`; to run them explicitly instead:
   ```
   dotnet ef database update
   ```
4. **Run the API:**
   ```
   dotnet run
   ```
   On first startup it seeds the Super Admin (`SuperAdmin:Username` / `SuperAdmin:Password` in
   config, defaulting to **Yayah.waritay / Sal@2024** — the password is bcrypt-hashed before
   storage, never stored in plain text).
5. Swagger UI: `/swagger`. Transaction monitoring page: `/admin/login.html`.

## 1a. Sample/test data

On startup, **in the Development environment only**, `DbSeeder.SeedSampleDataAsync` populates the
database with test data (no-ops if any category already exists, so it only ever runs once):

- 4 categories (Live Birds, Poultry Feed, Eggs, Poultry Equipment & Supplies), 2 products each (8 total)
- 2 extra admins for testing permission boundaries, alongside the Super Admin:
  - `admin.products` / `Products@123` — `ManageProducts` only
  - `admin.orders` / `Orders@123` — `ConfirmOrders` only
- 5 customer accounts (all password `Customer@123`) matching the orders below, so you can log in
  and immediately see order history: `aminata.kamara@example.com`, `mohamed.sesay@example.com`,
  `fatmata.conteh@example.com`, `ibrahim.bangura@example.com`, `zainab.turay@example.com`
- 5 orders spanning every status/transaction combination the monitoring page can show: Pending
  (unpaid), Confirmed+Reconciled, Rejected+Failed, Pending+Cash, Confirmed+Success-but-unreconciled

`SeedSampleCustomersAsync` runs independently of the category-based guard above and always
backfills `Order.CustomerId` onto any pre-existing sample orders that predate customer accounts —
safe to call on every startup.

To reset and reseed, drop the `Customers`/`Categories`/`Products`/`Orders`/`OrderItems`/
`Transactions` rows (or the whole DB + re-migrate) and restart the app.

## 2. Auth & permissions

- **Admin/Super Admin:** `POST /api/auth/login` → JWT (role claim `SuperAdmin`/`Admin`, plus one
  `permission` claim per granted permission).
- **Customer:** `POST /api/customers/signup` / `POST /api/customers/login` → JWT (role claim
  `Customer`). Signup auto-logs-in (returns a token immediately, same as login).
- Two permissions an admin can independently hold: **`ManageProducts`**, **`ConfirmOrders`**.
- The Super Admin implicitly passes every permission check regardless of the `Permissions` column.
- Super Admin manages other admins via `api/superadmin/admins` (create, change permissions,
  deactivate) and customer accounts via `api/superadmin/customers` (view, edit details,
  activate/deactivate) — only the Super Admin can reach these routes.
- Admin and customer identities are entirely separate — a customer JWT can never satisfy an admin
  policy (or vice versa); each checks the `Customer` vs `SuperAdmin`/`Admin` role claim.

## 3. Endpoints — quick reference

| Area | Route | Auth |
|---|---|---|
| Admin auth | `POST /api/auth/login` | none |
| Customer auth | `POST /api/customers/signup`, `POST /api/customers/login` | none |
| Customer profile | `GET /api/customers/me` | `Customer` |
| Public catalog | `GET /api/products` (`?categoryId=&search=&page=&pageSize=`, paginated), `GET /api/products/{id}` | none |
| Customer orders | `POST /api/orders`, `GET /api/orders` (own order history), `GET /api/orders/{orderNumber}` (own order only — 404s otherwise) | `Customer` — **placing/viewing an order always requires being signed in; there is no guest checkout** |
| Public categories | `GET /api/categories`, `GET /api/categories/{id}` | none |
| Admin categories | `GET/POST/PUT/DELETE /api/admin/categories[...]` | `ManageProducts` |
| Admin products | `GET/POST/PUT/DELETE /api/admin/products[...]` (POST/PUT are `multipart/form-data`, require a `CategoryId`, and support an `Image` file field) | `ManageProducts` |
| Admin orders | `GET /api/admin/orders`, `GET /api/admin/orders/{id}`, `POST /api/admin/orders/{id}/confirm`, `POST /api/admin/orders/{id}/reject` | `ConfirmOrders` |
| Admin transactions | `GET /api/admin/transactions`, `GET /api/admin/transactions/summary`, `POST /api/admin/transactions/{id}/reconcile` | `ConfirmOrders` |
| Super Admin | `GET/POST /api/superadmin/admins`, `PUT /api/superadmin/admins/{id}/permissions`, `PUT /api/superadmin/admins/{id}/email`, `POST /api/superadmin/admins/{id}/reset-password`, `DELETE /api/superadmin/admins/{id}` | `SuperAdmin` |
| Super Admin customers | `GET /api/superadmin/customers` (`?search=&isActive=`), `GET /api/superadmin/customers/{id}`, `PUT /api/superadmin/customers/{id}` | `SuperAdmin` |
| Customer checkout (Monime) | `POST /api/checkout/sessions` | `Customer` — see [CHECKOUT-CUSTOMER-README.md](CHECKOUT-CUSTOMER-README.md) |
| Super Admin checkout search | `GET /api/superadmin/checkout/sessions[...]`, `GET /api/superadmin/checkout/sessions/{id}`, `GET /api/superadmin/checkout/audit-logs[...]`, `GET /api/superadmin/checkout/audit-logs/{id}` | `SuperAdmin` — see [CHECKOUT-ADMIN-README.md](CHECKOUT-ADMIN-README.md) |

All error responses (400/401/403/404/409) are `{ "message": "..." }` unless noted otherwise.
Enums (`status`, `permissions`, etc.) serialize as their string name, not a number.

## 3b. Endpoint reference — payloads & sample responses

### Admin / Super Admin auth

**`POST /api/auth/login`** — no auth required.

Request:
```json
{ "username": "Yayah.waritay", "password": "Sal@2024" }
```
Response `200 OK`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-08-14T07:06:11.65Z",
  "adminId": "411a23bf-d698-460b-b2c0-d162ac154043",
  "username": "Yayah.waritay",
  "isSuperAdmin": true,
  "permissions": ["ManageProducts", "ConfirmOrders"],
  "mustChangePassword": false,
  "defaultPasswordExpiresAt": null
}
```
`401 Unauthorized` on bad credentials. `403 { "code": "DefaultPasswordExpired" }` if the admin's emailed default password expired before they changed it.
When `mustChangePassword` is `true`, the token only works for `POST /api/auth/change-password` (every other admin endpoint → `403`).

**`POST /api/auth/change-password`** — any admin JWT, including the restricted one.

Request: `{ "currentPassword": "...", "newPassword": "min 8 chars" }` → `200 OK` with a full login response (new full-access token). `400` on a wrong current password or reused password. See [EMAIL-NOTIFICATIONS-README.md](EMAIL-NOTIFICATIONS-README.md) §1.2.

---

### Customer auth

**`POST /api/customers/signup`** — no auth required.

Request:
```json
{
  "fullName": "Test Buyer",
  "email": "test.buyer@example.com",
  "phone": "+23276099999",
  "password": "Buyer@123"
}
```
Response `201 Created` (same shape as login — signup auto-logs-in):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-08-14T07:44:10.23Z",
  "customerId": "b00c558e-fa52-48aa-9c76-178d52a3a1c6",
  "fullName": "Test Buyer",
  "email": "test.buyer@example.com",
  "phone": "+23276099999"
}
```
`409 Conflict` — `{ "message": "'test.buyer@example.com' is already registered." }`

**`POST /api/customers/login`** — no auth required.

Request:
```json
{ "email": "test.buyer@example.com", "password": "Buyer@123" }
```
Response `200 OK`: identical shape to signup's response above.
`401 Unauthorized` — `{ "message": "Invalid email or password." }`

**`GET /api/customers/me`** — requires `Customer` JWT (`Authorization: Bearer <token>`).

Response `200 OK`:
```json
{
  "id": "b00c558e-fa52-48aa-9c76-178d52a3a1c6",
  "fullName": "Test Buyer",
  "email": "test.buyer@example.com",
  "phone": "+23276099999",
  "createdAt": "2026-08-13T23:44:10.23Z"
}
```

---

### Public catalog

**`GET /api/products?categoryId=&search=&page=1&pageSize=20`** — no auth required. All query params optional.

Response `200 OK`:
```json
{
  "items": [
    {
      "id": "2ba6b749-7327-4bdc-b01f-d688efbd0c91",
      "name": "Table Eggs (Crate of 30)",
      "description": "Fresh, graded medium size",
      "categoryId": "16c2a33f-6db7-440d-8ee2-1408e1d02dc4",
      "categoryName": "Eggs",
      "priceCents": 45000,
      "quantityInStock": 96,
      "imagePath": "/uploads/products/9f1c2e3a-....jpg",
      "isActive": true,
      "createdAt": "2026-08-13T23:14:30.95Z",
      "updatedAt": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 8,
  "totalPages": 1
}
```

**`GET /api/products/{id}`** — no auth required. Response `200 OK`: a single item object as above, or `404`.

**`GET /api/categories`** — no auth required.

Response `200 OK`:
```json
[
  {
    "id": "16c2a33f-6db7-440d-8ee2-1408e1d02dc4",
    "name": "Eggs",
    "description": "Table eggs and fertile hatching eggs",
    "isActive": true,
    "productCount": 2,
    "createdAt": "2026-08-13T23:14:30.93Z",
    "updatedAt": null
  }
]
```

**`GET /api/categories/{id}`** — no auth required. Response `200 OK`: a single category object, or `404`.

---

### Customer orders (all require `Customer` JWT)

**`POST /api/orders`** — customer name/phone/email come from the signed-in account, not the body.

Request:
```json
{
  "deliveryAddress": "1 Test Lane, Freetown",
  "deliveryFeeCents": 20000,
  "items": [
    { "productId": "2ba6b749-7327-4bdc-b01f-d688efbd0c91", "quantity": 1 }
  ],
  "provider": "Cash",
  "idempotencyKey": "a1b2c3d4-checkout-attempt-1"
}
```
Response `201 Created`:
```json
{
  "id": "9c48f5e0-f816-467c-9f0e-5ddfe1718e84",
  "orderNumber": "JPF-2026-000006",
  "customerName": "Test Buyer",
  "customerPhone": "+23276099999",
  "customerEmail": "test.buyer@example.com",
  "deliveryAddress": "1 Test Lane, Freetown",
  "status": "Pending",
  "subtotalCents": 45000,
  "deliveryFeeCents": 20000,
  "totalCents": 65000,
  "createdAt": "2026-08-13T23:44:23.25Z",
  "confirmedAt": null,
  "confirmedByAdminUsername": null,
  "adminNotes": null,
  "items": [
    {
      "productId": "2ba6b749-7327-4bdc-b01f-d688efbd0c91",
      "productNameSnapshot": "Table Eggs (Crate of 30)",
      "unitPriceCentsSnapshot": 45000,
      "quantity": 1,
      "subtotalCents": 45000
    }
  ]
}
```
`409 Conflict` — `{ "message": "Not enough stock for 'Table Eggs (Crate of 30)'." }`
`400 Bad Request` — `{ "message": "Product '...' was not found or is inactive." }`

**`GET /api/orders`** — the signed-in customer's own orders, newest first. Response `200 OK`: an array of order objects (same shape as above).

**`GET /api/orders/{orderNumber}`** — response `200 OK`: a single order object as above. `404` if it doesn't exist *or* belongs to a different customer (ownership is never revealed either way).

---

### Admin categories (require `ManageProducts`)

**`GET /api/admin/categories`** / **`GET /api/admin/categories/{id}`** — same response shape as the public category endpoints, but includes inactive categories too.

**`POST /api/admin/categories`**

Request:
```json
{ "name": "Poultry Feed", "description": "Starter, grower and layer feed" }
```
Response `201 Created`: a category object (see public shape above). `409 Conflict` if the name is taken.

**`PUT /api/admin/categories/{id}`**

Request:
```json
{ "name": "Poultry Feed", "description": "Updated description", "isActive": true }
```
Response `200 OK`: the updated category object.

**`DELETE /api/admin/categories/{id}`** — no body. `204 No Content` on success.
`409 Conflict` — `{ "message": "This category still has active products linked to it. Reassign or deactivate those products first." }`

---

### Admin products (require `ManageProducts`)

**`GET /api/admin/products`** / **`GET /api/admin/products/{id}`** — same response shape as the public product endpoints (`GetById` returns a bare object, not the paged list), but includes inactive products too.

**`POST /api/admin/products`** — `multipart/form-data`, **not** JSON:

| Field | Type | Notes |
|---|---|---|
| `Name` | text | required |
| `Description` | text | optional |
| `CategoryId` | text (GUID) | required, must reference an existing category |
| `PriceCents` | text (long) | required, whole cents |
| `QuantityInStock` | text (int) | required |
| `Image` | file | optional — jpg/jpeg/png/webp/gif, ≤5 MB |

Example (`curl`):
```
curl -X POST /api/admin/products \
  -H "Authorization: Bearer <admin token>" \
  -F "Name=Broiler Chicken (Live)" -F "Description=8-week-old broiler, dressed weight ~2kg" \
  -F "CategoryId=d9c286d4-fade-49a7-99a1-b09fc33e9d97" \
  -F "PriceCents=85000" -F "QuantityInStock=40" \
  -F "Image=@broiler.jpg"
```
Response `201 Created`:
```json
{
  "id": "73d9fd89-c96a-4104-989e-eb772141ad96",
  "name": "Broiler Chicken (Live)",
  "description": "8-week-old broiler, dressed weight ~2kg",
  "categoryId": "d9c286d4-fade-49a7-99a1-b09fc33e9d97",
  "categoryName": "Live Birds",
  "priceCents": 85000,
  "quantityInStock": 40,
  "imagePath": "/uploads/products/6f2a1c9e-....jpg",
  "isActive": true,
  "createdAt": "2026-08-13T23:06:21.22Z",
  "updatedAt": null
}
```
`400 Bad Request` — bad/missing category, or an image that fails validation (type/size).

**`PUT /api/admin/products/{id}`** — same `multipart/form-data` fields as create, plus `IsActive` (bool); `Image` is optional (only send it to replace the existing photo — the old file is deleted). Response `200 OK`: the updated product object.

**`DELETE /api/admin/products/{id}`** — no body. Soft-deletes (`isActive: false`). `204 No Content`.

---

### Admin orders (require `ConfirmOrders`)

**`GET /api/admin/orders?status=Pending`** — `status` optional (`Pending`/`Confirmed`/`Rejected`/`Completed`/`Cancelled`). Response `200 OK`: array of order objects (same shape as customer order responses).

**`GET /api/admin/orders/{id}`** — response `200 OK`: a single order object, or `404`.

**`POST /api/admin/orders/{id}/confirm`**

Request:
```json
{ "adminNotes": "Confirmed by phone with customer" }
```
Response `200 OK`: the order object with `"status": "Confirmed"`, `confirmedAt`/`confirmedByAdminUsername` populated.
`409 Conflict` — `{ "message": "Order is already 'Confirmed' and cannot be confirmed." }`

**`POST /api/admin/orders/{id}/reject`** — also releases reserved stock back to inventory.

Request:
```json
{ "adminNotes": "Item damaged in warehouse" }
```
Response `200 OK`: the order object with `"status": "Rejected"`.

---

### Admin transactions (require `ConfirmOrders`)

**`GET /api/admin/transactions?status=&provider=&from=&to=`** — all query params optional (`status`: `Pending`/`Success`/`Failed`/`Reconciled`; `from`/`to`: ISO 8601 dates).

Response `200 OK`:
```json
[
  {
    "id": "3a1f9c2e-...",
    "orderId": "9c48f5e0-f816-467c-9f0e-5ddfe1718e84",
    "orderNumber": "JPF-2026-000006",
    "reference": "JPF-2026-000006",
    "provider": "Cash",
    "amountCents": 45000,
    "status": "Pending",
    "createdAt": "2026-08-13T23:44:23.25Z",
    "reconciledAt": null,
    "reconciledByAdminUsername": null,
    "notes": null
  }
]
```

**`GET /api/admin/transactions/summary?from=&to=`**

Response `200 OK`:
```json
{
  "totalCount": 5,
  "totalAmountCents": 998000,
  "countByStatus": { "Pending": 2, "Reconciled": 1, "Failed": 1, "Success": 1 },
  "amountByStatus": { "Pending": 630000, "Reconciled": 108000, "Failed": 140000, "Success": 120000 },
  "countByProvider": { "OrangeMoney": 2, "Afrimoney": 1, "QMoney": 1, "Cash": 1 },
  "amountByProvider": { "OrangeMoney": 590000, "Afrimoney": 108000, "QMoney": 140000, "Cash": 160000 }
}
```

**`POST /api/admin/transactions/{id}/reconcile`**

Request:
```json
{ "status": "Reconciled", "notes": "Matched against OrangeMoney statement dated 2026-08-13" }
```
Response `200 OK`: the transaction object with `status`/`notes`/`reconciledAt`/`reconciledByAdminUsername` updated.

---

### Super Admin — manage admins (require `SuperAdmin`)

**`GET /api/superadmin/admins`**

Response `200 OK`:
```json
[
  {
    "id": "ad020342-1ce4-4c12-81be-380d29daaec5",
    "username": "admin.products",
    "email": "products@example.com",
    "isSuperAdmin": false,
    "isActive": true,
    "permissions": ["ManageProducts"],
    "createdAt": "2026-08-13T23:14:30.53Z"
  }
]
```

**`POST /api/superadmin/admins`**

Request:
```json
{
  "username": "admin.orders2",
  "email": "orders2@example.com",
  "permissions": ["ConfirmOrders"]
}
```
Response `201 Created`: an admin object as above. `409 Conflict` if the username is taken; `400 Bad Request` on an unknown permission name or a missing/invalid `email`. `password` is optional (generated if omitted). Either way it becomes a **default password**: it is emailed to the admin, must be changed on first login via `POST /api/auth/change-password`, and expires after 24 hours. See [EMAIL-NOTIFICATIONS-README.md](EMAIL-NOTIFICATIONS-README.md) §1.1–1.3.

**`PUT /api/superadmin/admins/{id}/permissions`**

Request:
```json
{ "permissions": ["ManageProducts", "ConfirmOrders"], "isActive": true, "email": "optional@example.com" }
```
Response `200 OK`: the updated admin object. `400 Bad Request` if targeting the Super Admin.

**`PUT /api/superadmin/admins/{id}/email`** — `{ "email": "a@example.com" }`. Works on any admin, including Super Admins. `200 OK` with the updated admin object.

**`POST /api/superadmin/admins/{id}/reset-password`** — no body. Emails the admin a new generated default password (24-hour expiry, must be changed on login). `200 OK` with the updated admin object; `400` if the admin has no email.

**`DELETE /api/superadmin/admins/{id}`** — no body. Deactivates (soft-delete). `204 No Content`. `400 Bad Request` if targeting the Super Admin.

---

### Super Admin — manage customers (require `SuperAdmin`)

Use these for a "Customers" page in the admin frontend: a searchable table (list endpoint), a
detail view with order history (detail endpoint), and an edit form / active toggle (update endpoint).
Only show this page to users whose JWT role is `SuperAdmin`; any other admin gets `403 Forbidden`.

**`GET /api/superadmin/customers`**

Query params (all optional, combine with AND):

| Param | Type | Meaning |
|---|---|---|
| `search` | string | Case-insensitive partial match on full name, email **or** phone. |
| `isActive` | bool | `true` = active accounts only, `false` = deactivated only. Omit for all. |

Sorted newest first. Not paginated — the whole matching list is returned.

Response `200 OK`:
```json
[
  {
    "id": "5b1f2c3e-9a41-4d8e-b0a2-7f6c1d2e3a4b",
    "fullName": "Aminata Kamara",
    "email": "aminata@example.com",
    "phone": "+23276123456",
    "isActive": true,
    "createdAt": "2026-08-14T10:02:11.41Z",
    "orderCount": 3,
    "totalSpentCents": 1250000
  }
]
```
- `orderCount` counts **every** order the customer has placed (any status).
- `totalSpentCents` sums order totals **excluding `Rejected` and `Cancelled` orders**. Like every
  money field in this API it is in minor units (cents) — divide by 100 for display.

**`GET /api/superadmin/customers/{id}`**

Response `200 OK`: the same fields as a list row, plus the customer's full order history (newest first):
```json
{
  "id": "5b1f2c3e-9a41-4d8e-b0a2-7f6c1d2e3a4b",
  "fullName": "Aminata Kamara",
  "email": "aminata@example.com",
  "phone": "+23276123456",
  "isActive": true,
  "createdAt": "2026-08-14T10:02:11.41Z",
  "orderCount": 3,
  "totalSpentCents": 1250000,
  "orders": [
    {
      "id": "c7d8e9f0-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      "orderNumber": "JPF-2026-000123",
      "status": "Confirmed",
      "totalCents": 450000,
      "createdAt": "2026-09-20T14:31:05.12Z"
    }
  ]
}
```
`404 Not Found` if the id doesn't exist. `orders[].status` is one of `Pending`, `Confirmed`,
`Rejected`, `Completed`, `Cancelled`. For full order details (line items, delivery address,
transactions), link through to `GET /api/admin/orders/{id}` using `orders[].id`.

**`PUT /api/superadmin/customers/{id}`**

Every field is optional — send only what changed. Omitted, `null` or blank fields are left untouched
(so a field can't be cleared to empty).

| Field | Type | Rules |
|---|---|---|
| `fullName` | string | 2–200 chars. |
| `email` | string | Valid email, max 200 chars. Trimmed and lowercased server-side; must not belong to another customer. |
| `phone` | string | Max 30 chars. |
| `isActive` | bool | `false` deactivates the account; `true` reactivates it. |

Request (e.g. correcting a phone number and deactivating the account):
```json
{ "phone": "+23276000000", "isActive": false }
```
Response `200 OK`: the updated customer, same shape as `GET /api/superadmin/customers/{id}` —
use it to refresh the view without a second request.

**Email notification:** if at least one value actually changed, the customer is emailed a summary of
the changes (previous → new value) in the background. On an email change, both the new and the old
address get the email. Nothing is sent when no value changed. See
[EMAIL-NOTIFICATIONS-README.md](EMAIL-NOTIFICATIONS-README.md) §1.7.

Errors:
- `400 Bad Request` — validation failed (e.g. invalid email, name too short). This is the standard
  ASP.NET validation shape, **not** `{ "message" }`:
  `{ "title": "...", "status": 400, "errors": { "Email": ["The Email field is not a valid e-mail address."] } }`
  — map `errors` keys to form fields.
- `404 Not Found` — no customer with that id.
- `409 Conflict` — `{ "message": "'x@example.com' is already registered to another customer." }`

Behaviour to surface in the UI:
- **Deactivating** stops the customer logging in (login returns `401 Invalid email or password`).
  A customer who is already signed in keeps their session until their current JWT expires — it
  isn't revoked immediately. Worth saying in the confirm dialog.
- **Changing the email** changes the customer's login email; tell them to use the new address.
- **Past orders keep their original details.** Orders snapshot the customer's name/phone/email at
  order time, so editing a profile does not rewrite existing orders.
- There is no delete and no password reset for customers — use `isActive: false` instead of deleting.

## 4. Product images

Uploaded via `multipart/form-data` (`Image` field) on `POST`/`PUT /api/admin/products`. Files are
saved under `wwwroot/uploads/products/<guid>.<ext>` (jpg/jpeg/png/webp/gif, 5 MB max by default —
see `FileStorage` in `appsettings.json`); only the resulting relative path (e.g.
`/uploads/products/<guid>.jpg`) is stored in the `Products.ImagePath` column and served back via
static files.

## 5. Orders, money & concurrency

- `POST /api/orders` requires a customer JWT — customer name/phone/email are taken from the
  signed-in account, never trusted from the request body.
- Order totals are recomputed server-side from **current** product prices — it never trusts a
  client-sent amount. All money is an integer count of cents.
- Stock is decremented with a guarded, atomic `UPDATE ... WHERE QuantityInStock >= :qty` inside a
  DB transaction, so two concurrent orders for the last unit of stock can't both succeed.
- Order numbers (`JPF-{year}-{seq}`) come from a real Postgres sequence (`OrderNumberSeq`), not an
  in-memory/localStorage counter, so they can't collide across concurrent requests.
- `IdempotencyKey` on order creation makes a retried/double-submitted request return the original
  order instead of creating a duplicate.
- Rejecting a pending order releases its reserved stock back to inventory.

## 6. Transaction monitoring / reconciliation page

Static pages under `wwwroot/admin/` (no build step, plain HTML/JS):

- `login.html` — signs in against `/api/auth/login`, stores the JWT in `localStorage`.
- `transactions.html` — lists transactions with status/provider/date filters, summary stat tiles
  (counts + totals by status and provider), and lets an admin mark a transaction
  **Reconciled**/**Failed** after checking it against a provider statement.

Reachable by any admin with the `ConfirmOrders` permission, or the Super Admin.

## 7. Monime hosted checkout

`POST /api/checkout/sessions` creates a Monime hosted checkout session (redirect-to-pay, card/bank/
mobile-money/wallet) and stores the response. Monime's `Authorization`/`Monime-Space-Id`/
`Monime-Version` headers are fixed server-side config (`Monime` section in `appsettings*.json` —
**move `Monime:AuthorizationToken` to a real secret store before production**); the `Idempotency-Key`
header is a fresh server-generated UUID per request, never client-supplied. Every attempt (success,
Monime-rejected, or network failure) is written to `CheckoutAuditLogs`; a successful response is also
persisted to `CheckoutSessions`. Full integration contracts:

- [CHECKOUT-CUSTOMER-README.md](CHECKOUT-CUSTOMER-README.md) — for the customer-facing frontend calling `POST /api/checkout/sessions`.
- [CHECKOUT-ADMIN-README.md](CHECKOUT-ADMIN-README.md) — for the Admin frontend searching stored checkout sessions/audit logs (`SuperAdmin`-only).

This is separate from the existing `Transaction`/`api/admin/transactions` reconciliation flow above,
which remains the manual cash/statement-matching path.

## 8. Known simplifications (not in scope of what was asked, flagging for later)

- No email verification or password-reset flow on customer accounts — signup is immediate,
  passwords can only be changed by an admin touching the DB directly today.
- Delivery fee is accepted from the client as-is rather than recomputed from a configurable
  area→fee table (no delivery-fee/settings management was requested).
- No real payment-provider integration (Orange Money/Afrimoney/QMoney adapters) — `Provider` is
  just a free-text label on the transaction row today; reconciliation is manual via the page above.
