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
   (already pointed at the local `jolive_store` database and verified working end-to-end —
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

- 4 categories (Furniture, Electronics, Home & Kitchen, Fashion), 2 products each (8 total)
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
  deactivate) — only the Super Admin can reach these routes.
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
| Super Admin | `GET/POST /api/superadmin/admins`, `PUT /api/superadmin/admins/{id}/permissions`, `DELETE /api/superadmin/admins/{id}` | `SuperAdmin` |

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
  "permissions": ["ManageProducts", "ConfirmOrders"]
}
```
`401 Unauthorized` on bad credentials.

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
      "name": "Men's Leather Wallet",
      "description": "Genuine leather, bifold",
      "categoryId": "16c2a33f-6db7-440d-8ee2-1408e1d02dc4",
      "categoryName": "Fashion",
      "priceCents": 25000,
      "quantityInStock": 38,
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
    "name": "Fashion",
    "description": "Bags, wallets and accessories",
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
  "orderNumber": "JSC-2026-000006",
  "customerName": "Test Buyer",
  "customerPhone": "+23276099999",
  "customerEmail": "test.buyer@example.com",
  "deliveryAddress": "1 Test Lane, Freetown",
  "status": "Pending",
  "subtotalCents": 25000,
  "deliveryFeeCents": 20000,
  "totalCents": 45000,
  "createdAt": "2026-08-13T23:44:23.25Z",
  "confirmedAt": null,
  "confirmedByAdminUsername": null,
  "adminNotes": null,
  "items": [
    {
      "productId": "2ba6b749-7327-4bdc-b01f-d688efbd0c91",
      "productNameSnapshot": "Men's Leather Wallet",
      "unitPriceCentsSnapshot": 25000,
      "quantity": 1,
      "subtotalCents": 25000
    }
  ]
}
```
`409 Conflict` — `{ "message": "Not enough stock for 'Men's Leather Wallet'." }`
`400 Bad Request` — `{ "message": "Product '...' was not found or is inactive." }`

**`GET /api/orders`** — the signed-in customer's own orders, newest first. Response `200 OK`: an array of order objects (same shape as above).

**`GET /api/orders/{orderNumber}`** — response `200 OK`: a single order object as above. `404` if it doesn't exist *or* belongs to a different customer (ownership is never revealed either way).

---

### Admin categories (require `ManageProducts`)

**`GET /api/admin/categories`** / **`GET /api/admin/categories/{id}`** — same response shape as the public category endpoints, but includes inactive categories too.

**`POST /api/admin/categories`**

Request:
```json
{ "name": "Furniture", "description": "Household and office furniture" }
```
Response `201 Created`: a category object (see public shape above). `409 Conflict` if the name is taken.

**`PUT /api/admin/categories/{id}`**

Request:
```json
{ "name": "Furniture", "description": "Updated description", "isActive": true }
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
  -F "Name=Wooden Chair" -F "Description=Sturdy oak chair" \
  -F "CategoryId=d9c286d4-fade-49a7-99a1-b09fc33e9d97" \
  -F "PriceCents=150000" -F "QuantityInStock=10" \
  -F "Image=@chair.jpg"
```
Response `201 Created`:
```json
{
  "id": "73d9fd89-c96a-4104-989e-eb772141ad96",
  "name": "Wooden Chair",
  "description": "Sturdy oak chair",
  "categoryId": "d9c286d4-fade-49a7-99a1-b09fc33e9d97",
  "categoryName": "Furniture",
  "priceCents": 150000,
  "quantityInStock": 10,
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
    "orderNumber": "JSC-2026-000006",
    "reference": "JSC-2026-000006",
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
  "password": "Orders@456",
  "permissions": ["ConfirmOrders"]
}
```
Response `201 Created`: an admin object as above. `409 Conflict` if the username is taken; `400 Bad Request` on an unknown permission name.

**`PUT /api/superadmin/admins/{id}/permissions`**

Request:
```json
{ "permissions": ["ManageProducts", "ConfirmOrders"], "isActive": true }
```
Response `200 OK`: the updated admin object. `400 Bad Request` if targeting the Super Admin.

**`DELETE /api/superadmin/admins/{id}`** — no body. Deactivates (soft-delete). `204 No Content`. `400 Bad Request` if targeting the Super Admin.

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
- Order numbers (`JSC-{year}-{seq}`) come from a real Postgres sequence (`OrderNumberSeq`), not an
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

## 7. Known simplifications (not in scope of what was asked, flagging for later)

- No email verification or password-reset flow on customer accounts — signup is immediate,
  passwords can only be changed by an admin touching the DB directly today.
- Delivery fee is accepted from the client as-is rather than recomputed from a configurable
  area→fee table (no delivery-fee/settings management was requested).
- No real payment-provider integration (Orange Money/Afrimoney/QMoney adapters) — `Provider` is
  just a free-text label on the transaction row today; reconciliation is manual via the page above.
