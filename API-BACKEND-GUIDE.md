# Building the API / backend for  POULTRY FARM

The frontend currently runs entirely on **mock data and `localStorage`** — every product, category,
user account, order, payment and receipt is fabricated client-side, and the app makes **zero network
calls** (this was a deliberate request; see the "no API calls, mock data only" instruction earlier in
this project). This document exists to undo that deliberately, precisely: it audits **every place in
the frontend that currently fakes something an API would normally do**, and tells you exactly what
backend endpoint each one needs.

A partial NestJS + Prisma backend already exists in `server/` from an earlier phase (Products,
Categories, Auth are fully built and were working before the frontend was disconnected from them).
This guide covers reconnecting those, and building the parts that were never built at all (Orders,
Payments, Receipts, Cart persistence, Admin).

> If you're doing this with an AI coding tool, you can hand it this file directly — it's written as a
> work order, not just a status report.

---

## 1. What's real vs. mock right now

| Layer | State |
|---|---|
| `server/` (NestJS + Prisma + Postgres) | **Partially real.** Products, Categories, Auth (signup/signin/me) are fully implemented, typecheck and build, but have never been run against a live database (no Postgres was available while building this) and are not currently called by anything. |
| Frontend | **100% mock.** No `HttpClient` is even provided (see `src/app/app.config.ts`). Every service listed below reads/writes `localStorage` or an in-memory array instead of calling `server/`. |

Nothing here is a design flaw to "fix" — the mock layer was built to mirror the real API's shape
closely (same method names, same return types) specifically so reconnecting it later would be
mechanical. That's what this guide walks through.

---

## 2. Every mock touchpoint, file by file

This is the exhaustive list — everywhere in `src/app/core/` that currently substitutes for an API
call. Each one is a real `@Injectable({ providedIn: 'root' })` service with the same public method
signatures a real HTTP-backed version would have, so swapping the internals is the only work required
on the frontend side.

### 2.1 `ProductsService` — `src/app/core/products/products.service.ts`
Reads from `src/app/core/mock-data/products.mock.ts` (29 hand-written products, ported from
`server/prisma/seed.ts`).

| Method | Needs |
|---|---|
| `list(query)` | `GET /api/products` — **already exists** (`server/src/products/products.controller.ts`), supports category/price filters, sort, cursor pagination |
| `findBySlug(slug)` | `GET /api/products/:slug` — **already exists**, includes related items |
| `findBatchByProductId(id)` | Not a real endpoint — this sync helper only exists so checkout can snapshot a product's batch/lot number (e.g. hatch date, feed mill batch, vaccination record) onto an order line from mock data. Delete it; once cart/order data comes from a real API, the batch number is already on the object. |

### 2.2 `CategoriesService` — `src/app/core/categories/categories.service.ts`
Reads from `src/app/core/mock-data/categories.mock.ts`.

| Method | Needs |
|---|---|
| `findTree()` | `GET /api/categories` — **already exists** (`server/src/categories/`) |

### 2.3 `AuthService` — `src/app/core/auth/auth.service.ts`
Validates against `src/app/core/mock-data/users.mock.ts` (one seeded account:
`yayah.waritay` / `Sal@2024`, **plain-text password**, stored in `localStorage` under
`mock-users`) and persists the "session" under `auth`.

| Method | Needs |
|---|---|
| `signUp(payload)` | `POST /api/auth/signup` — **already exists** (`server/src/auth/`), bcrypt-hashed, Zod-validated |
| `signIn(payload)` | `POST /api/auth/signin` — **already exists** |
| *(not currently called)* | `GET /api/auth/me` — **already exists**, but the frontend never calls it; session restore on page load just trusts whatever's in `localStorage` with no expiry/revocation check. Call this on app init and sign the user out if it 401s. |

**Frontend also needs back:** the `HttpClient` provider and an auth interceptor that attaches
`Authorization: Bearer <token>`. Both existed earlier in this project and were deliberately removed —
see §6.

### 2.4 `CartService` — `src/app/core/cart/cart.service.ts`
Pure `localStorage` (`cart`). No server-side equivalent has ever been built, even though the
Prisma schema already has `Cart`/`CartItem` models.

This one's a genuine design decision, not just a gap:
- **Option A (simplest):** leave the cart client-only, and only talk to the backend at checkout
  (`POST /api/orders`). Most of the value of a persistent cart is captured by `localStorage` alone.
- **Option B:** sync every add/remove/quantity-change to the backend (`GET /api/cart`,
  `POST /api/cart/items`, `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`) so a cart
  survives a device switch. No controller exists for this yet.

Either way: **`CartLine.maxQuantity` is a stale snapshot** taken when the item was added, and nothing
re-validates it. A real backend must re-check current stock when `POST /api/orders` is called — this
is the actual place overselling would be prevented, not the cart.

### 2.5 `OrderService` — `src/app/core/orders/order.service.ts`
Fully mock. Orders are objects pushed into a `localStorage` array (`orders`); order numbers
come from a client-side counter (`order-sequence`). **No backend endpoint exists for this at
all** — this is the biggest real gap.

| Method | Needs |
|---|---|
| `createOrder(input)` | `POST /api/orders` — does not exist yet. Must be a single DB transaction: validate stock → decrement `Product.quantity` → create `Order` + `OrderItem` rows (snapshotted, per the schema's existing design) → create `StockMovement` rows → if paid, create/link the `Payment` row. See §4. |
| `getByOrderNumber(orderNumber)` | `GET /api/orders/:orderNumber` — does not exist yet. Needs an authorization check: order owner (via JWT), or order number + phone match for guests — **never a bare public lookup**. |
| *(client-side counter)* | Order number generation (`JPF-{year}-{sequence}`) **must move server-side** — a `localStorage` counter collides the moment two browsers or two tabs create an order at the same time. Use a DB sequence or an atomic increment inside the transaction. |
| *(nothing currently enforces this)* | The brief's 48-hour reservation hold (`reservedUntil` is written but nothing ever expires it). Needs a scheduled job (e.g. `@nestjs/schedule`) that releases stock and cancels orders past their hold window. |

### 2.6 `PaymentService` — `src/app/core/payments/payment.service.ts`
Fully mock. `charge(provider, phone, amountCents)` just waits ~3 seconds (`rxjs timer()`) and
succeeds — except a phone number ending in `0000`, which is hardcoded to always fail so the
failure/retry UI path is testable.

| What it fakes | Needs |
|---|---|
| The whole mobile money charge/approve cycle | `POST /api/payments` (create payment intent, provider-agnostic — see the `PaymentProvider` interface already specified in `AI-BUILD-PROMPT.md` §7) + either polling `GET /api/payments/:id/status` or a webhook receiver `POST /api/payments/webhook/:provider`. None of this exists server-side yet. |
| The `mock`/forced-failure-number trick | This convenience should live in the **backend's** mock payment driver (`PAYMENT_DRIVER=mock` is already in `server/.env.example`), not in frontend code — delete the frontend's hardcoded `0000` check once a real driver exists. |
| Provider list: Orange Money, Afrimoney, **QMoney** | ⚠️ **Schema gap:** `server/prisma/schema.prisma`'s `PaymentProvider` enum only has `ORANGE_MONEY`, `AFRIMONEY`, `MANUAL` — **`QMONEY` was added to the frontend after the schema was written and needs to be added to the enum** (and a provider adapter) before this can go live. |
| Idempotency | The `Payment` model already has a unique `idempotencyKey` column — the mock doesn't use one. A real `POST /api/payments` must require an idempotency key from the client so a double-tap/retry can't double-charge. |
| Amount trust | The mock trusts whatever `amountCents` the frontend passes. **The real endpoint must recompute the order total server-side and ignore/verify against the client-supplied amount** — this is a non-negotiable from the brief, not a nice-to-have. |

### 2.7 Receipts — `src/app/shared/receipt-card/`, `src/app/pages/order-confirmation/`
`ReceiptCardComponent` renders straight from the mock `Order` object in the browser. There is no PDF.
The "Print / Save as PDF" button is `window.print()` — a real stand-in for now, not the real feature.

| What's missing | Needs |
|---|---|
| Actual PDF generation | Server-side, per the brief: `@react-pdf/renderer` was the original React-stack choice; **PDFKit** was the Angular-stack substitute decided on earlier (see root `README.md`'s stack-mapping table) — neither is implemented. Generate on order-creation/payment-success, store the file (filesystem in dev, object storage in prod — `RECEIPTS_STORAGE_DRIVER` is already in `.env.example`), and persist a `Receipt` row (the Prisma model already exists). |
| Serving it | `GET /api/receipts/:receiptNumber` — must **never be a guessable public URL**; same authorization rule as order lookup (owner, or order number + phone for guests). |
| The watermark | `ReceiptWatermarkComponent` (rotated, low-opacity mark) is done and matches the brief's spec (§8) — the PDF version needs to reproduce the same look using vector drawing (PDFKit supports this directly: translate/rotate/opacity on the raw canvas), not a rasterized image. |

### 2.8 Delivery fees — `src/app/core/mock-data/delivery-fees.mock.ts`
A static `area → feeCents` table baked into the JS bundle (10 Freetown areas plus an "Other" catch-all). The brief's
admin Settings page (§9) wants this configurable by staff, which means it shouldn't be hardcoded in
the frontend at all.

| Needs |
|---|
| `GET /api/delivery-fees` (or fold into a broader `GET /api/settings`) so the list can change without a redeploy. |
| The checkout flow currently trusts the client-computed fee — like payment amounts, **the real `POST /api/orders` must recompute the delivery fee server-side** from the submitted area, not accept whatever number the browser sent. |

### 2.9 Everything that does *not* need an API
Worth stating explicitly so you don't spend time on these: `ThemeService`, `DeviceTierService`, and
the 3D-effects override are all genuinely client-only preferences (light/dark mode, WebGL capability
tier) with no server dimension. Leave them exactly as they are.

---

## 3. What already exists in `server/` and just needs reconnecting

```
server/src/
  products/    ✅ done — list + detail, filters, sort, cursor pagination
  categories/  ✅ done — category tree
  auth/        ✅ done — signup, signin, me (JWT + bcryptjs, Zod-validated)
  prisma/      ✅ schema covers every model needed (see §1) — never migrated against a live DB
  health/      ✅ GET /api/health
```

None of this has been run against a real Postgres database — no Postgres or Docker was available
while it was built. Treat the first real `prisma migrate dev` + `prisma db seed` + a walk through
signup → browse → sign in as the actual first test of this code, not something already verified.

---

## 4. What's missing and needs to be built

In rough order of how load-bearing they are:

1. **`POST /api/orders`** (and `GET /api/orders/:orderNumber`) — the core gap. Must, per the brief's
   non-negotiables:
   - Recalculate the order total server-side (items × current price + delivery fee) — never trust a
     client-supplied total.
   - Wrap stock validation + decrement + `Order`/`OrderItem`/`StockMovement` creation in **one DB
     transaction**, so two concurrent orders for the last unit of stock (last bag of feed, last bird
     in a batch, last crate of eggs) can't both succeed. Prisma's `$transaction` with a
     `SELECT ... FOR UPDATE`-equivalent (or an optimistic
     `updateMany` with a `WHERE quantity >= :qty` guard) is the standard pattern here.
   - Generate the order number inside that same transaction.
2. **Payments module** — `PaymentProvider` interface, `mock` driver first (the brief is explicit that
   *"every feature must be fully testable end-to-end with `PAYMENT_DRIVER=mock`"*), then real Orange
   Money / Monime / pawaPay adapters behind the `PAYMENT_DRIVER` env flag already scaffolded in
   `.env.example`. Add `QMONEY` to the schema enum first (§2.6).
3. **Receipts module** — PDFKit generation + storage + the authorized-download endpoint.
4. **Reservation-expiry job** — scheduled task releasing stock for orders whose `reservedUntil` has
   passed.
5. **Cart persistence** — optional (§2.4); decide Option A or B before building it.
6. **Delivery-fees / settings endpoint** — small, but needed so checkout stops trusting the frontend's
   hardcoded table.
7. **Admin endpoints** (§9 of the brief) — not audited here in detail since nothing in the current
   frontend calls them yet; there is no admin UI built at all.

---

## 5. Non-negotiables (carried forward from the brief — don't relitigate these)

- **Money is always an integer number of cents**, both in the mock data and the Prisma schema
  already — keep it that way through every new endpoint. Never introduce a float.
- **No payment/provider secret ever reaches the client.** Everything in `server/.env.example` under
  the payments section stays server-side.
- **Idempotency keys** on every payment-creation call.
- **Recalculate money server-side** — order totals and delivery fees included — never trust what the
  client sends.
- **Webhook endpoints** (once real providers are wired in) must verify the signature, be idempotent
  by event ID, and return `200` fast while processing async.
- **Receipt/order URLs are never guessable** — always gate behind owner-JWT or order-number+phone.

---

## 6. Reconnecting the frontend once an endpoint is ready

The frontend was deliberately stripped of `HttpClient` (see `src/app/app.config.ts`'s comment). To
bring any piece back online:

1. Re-add the provider in `src/app/app.config.ts`:
   ```ts
   import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
   import { authInterceptor } from './core/auth/auth.interceptor'; // recreate this — see below

   providers: [
     provideRouter(routes),
     provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
   ]
   ```
2. Recreate `src/app/core/auth/auth.interceptor.ts` (deleted when the API calls were removed) —
   attach `Authorization: Bearer <token>` from `AuthService.token()` to any request under `/api`.
   The dev proxy is still configured (`proxy.conf.json`, wired into `angular.json`'s `serve` target)
   so relative `/api/...` calls just work against `server/` on `:3333` in development.
3. In the specific service (e.g. `ProductsService`), replace the mock-array logic with an
   `HttpClient` call, **keeping the same method name and return type** — every consuming component
   already expects `Observable<ProductListResult>` etc., so nothing above the service layer should
   need to change. `server/src/products/products.controller.ts` already defines the exact response
   shape (`ProductListResult`/`ProductDetail`) to call — match the request to that, not the other way
   round. (Note: nothing in this repo is committed to git yet beyond the original scaffold, so there's
   no prior HTTP-backed version to diff against — you're writing this from scratch, just against an
   API that already exists.)
4. Delete the corresponding file(s) in `src/app/core/mock-data/` once nothing references them.
5. Rebuild (`ng build`) and grep the output for stray `/api` strings the other direction — i.e. once
   you *want* API calls, confirm they're actually present:
   `grep -rl "/api" dist/POULTRYFARM/browser/*.js`

Do this service-by-service rather than all at once — `ProductsService`/`CategoriesService`/
`AuthService` can go first since the backend already exists for them; `OrderService`/`PaymentService`
have to wait for §4's new endpoints to exist first.
