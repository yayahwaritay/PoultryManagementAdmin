# Email notifications: frontend integration guide

The backend now sends transactional emails through **SendGrid**. This guide covers what the
**admin frontend** and the **customer frontend** need to change.

**Short version: neither frontend sends email or talks to SendGrid.** Emails go out automatically as
a side effect of API calls you already make. The customer frontend needs no changes. The admin
frontend needs two:

1. The "create admin" form must collect an **email address** (§1.1).
2. Login must handle **`mustChangePassword`**. New admins sign in with an emailed default password
   and must replace it before they can do anything else. The default password **expires 24 hours**
   after it's issued (§1.2).

| When | Triggered by | Who gets the email |
|---|---|---|
| A Super Admin creates an admin (seller) account | `POST /api/superadmin/admins` | The new admin: a welcome email with their username, **default password**, permissions and the password's expiry time |
| A Super Admin resets an admin's password | `POST /api/superadmin/admins/{id}/reset-password` | The admin: a new default password with a new 24-hour expiry |
| A customer places an order | `POST /api/orders` | Every active admin **with an email** who either **listed a product in the order** (the seller), **has the `ConfirmOrders` permission**, or **is a Super Admin**. Each address gets one email, even if it matches more than one of these |
| An admin confirms an order | `POST /api/admin/orders/{id}/confirm` | The customer: an "order confirmed" email with items, totals and the admin's note |
| An admin rejects an order | `POST /api/admin/orders/{id}/reject` | The customer: an "order rejected" email with items, totals and the admin's note |
| A Super Admin updates a customer's profile | `PUT /api/superadmin/customers/{id}` | The customer: an "account details updated" email listing each changed field (previous → new value). If the **email** changed, it goes to **both** the new and the old address. Not sent if nothing actually changed |

Emails are sent **in the background**, after the API has already responded. So:

- **An email failure never fails the API call.** If SendGrid is down or misconfigured, the order or
  admin is still created and you still get `201`/`200`. Failures are retried 3 times and then logged
  on the server.
- **Don't wait for an email before updating the UI.** Show your success state as soon as the API returns.
- A retried order request (same `idempotencyKey`) returns the original order and **does not**
  send the new-order email again.

---

## 1. Admin frontend

### 1.1 Create-admin form: add a required Email field (breaking change)

**`POST /api/superadmin/admins`** now **requires** `email`, and `password` is now **optional**:

```json
{
  "username": "seller.freetown",
  "email": "seller.freetown@example.com",
  "permissions": ["ManageProducts", "ConfirmOrders"]
}
```

- **`email`**: required, valid email format, max 200 chars. The default password is sent here.
- **`password`**: optional (min 6 chars). **Leave it out** and the server generates a strong
  12-character password. **Recommended: remove the password field from the form entirely.** The
  generated password goes straight to the admin's inbox, so the Super Admin never sees it.
- Whichever password is used becomes a **default password**: it is emailed to the admin, must be
  changed on first login, and **expires 24 hours after creation**.
- If `email` is missing or invalid, the API returns `400` with ASP.NET's validation-problem shape
  (**not** the usual `{ "message": "..." }`), so handle both:
  ```json
  {
    "title": "One or more validation errors occurred.",
    "status": 400,
    "errors": { "Email": ["The Email field is required."] }
  }
  ```
  Tip: map `errors.<Field>[0]` onto the matching form input.
- On `201 Created`, suggested toast: *"Admin created. Login details have been emailed to
  seller.freetown@example.com. They must sign in and change the password within 24 hours."*

### 1.2 Login: handle the default password (first login, and after a reset)

**`POST /api/auth/login`** can now respond in three ways. Handle all of them:

**a) `200 OK` with `mustChangePassword: false`**: a normal login, same as before.

**b) `200 OK` with `mustChangePassword: true`**: the admin signed in with an emailed default password.

```json
{
  "token": "eyJ...",
  "expiresAt": "2026-09-27T17:22:00Z",
  "adminId": "aa16a73b-bacb-4990-83fb-49bb2c2e66cd",
  "username": "seller.freetown",
  "isSuperAdmin": false,
  "permissions": ["ManageProducts"],
  "mustChangePassword": true,
  "defaultPasswordExpiresAt": "2026-09-28T09:22:34Z"
}
```

This `token` is **restricted**. It works **only** for `POST /api/auth/change-password`. Every other
admin endpoint returns **`403`** with it. So:

- **Don't save it as the session** and don't go to the dashboard. Keep it in memory only.
- Show a **"Set your password"** screen right away (new password + confirm), with a note such as
  *"Your temporary password expires on {defaultPasswordExpiresAt, local time}."*
- Keep the password the user just typed in memory, because you need it as `currentPassword`:

**`POST /api/auth/change-password`** (`Authorization: Bearer <restricted token>`)

```json
{ "currentPassword": "ky@3Ls8h?Eei", "newPassword": "MyOwnPass#2026" }
```

- `newPassword`: required, **min 8 chars**, must differ from the current password.
- `200 OK` returns a **full login response** (same shape as above, `mustChangePassword: false`) with a
  new, **full-access token**. Save *this* as the session and go to the dashboard. The user doesn't
  need to log in again.
- `400 { "message": "Current password is incorrect." }` or
  `400 { "message": "New password must be different from the current password." }`
- `400` validation problem if `newPassword` is shorter than 8 chars (`errors.NewPassword`).
- `403 { "code": "DefaultPasswordExpired", ... }` if the 24 hours ran out while the screen was open.
  Handle it as in (c).

**c) `403 Forbidden` with `code: "DefaultPasswordExpired"`**: correct password, but the default
password expired before the admin changed it.

```json
{ "message": "Your default password has expired. Ask a Super Admin to reset your password.", "code": "DefaultPasswordExpired" }
```

Show the `message` as-is and don't offer a retry. The only fix is a Super Admin reset (§1.3).
A **wrong** password still returns `401 "Invalid username or password."`, even if the account's default
password has expired, so an attacker can't learn an account's state.

Recommended frontend logic:

```js
const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
const body = await res.json().catch(() => ({}));

if (res.status === 403 && body.code === "DefaultPasswordExpired") return showError(body.message);
if (!res.ok) return showError(body.message || "Invalid username or password.");

if (body.mustChangePassword) {
  // Keep in memory only. This token can't do anything except change the password.
  return showSetPasswordScreen({ token: body.token, currentPassword: password, expiresAt: body.defaultPasswordExpiresAt });
}
saveSession(body);
goToDashboard();

// On the set-password screen:
const r = await fetch("/api/auth/change-password", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + pending.token },
  body: JSON.stringify({ currentPassword: pending.currentPassword, newPassword }),
});
if (r.ok) { saveSession(await r.json()); goToDashboard(); }
```

A working reference implementation is in **`wwwroot/admin/login.html`** (the built-in
transaction-monitoring login page).

**Global guard:** if any admin API call returns `403` while the stored session has
`mustChangePassword: true` (which shouldn't happen if you follow the above), send the user back to the
set-password screen.

**Optional "Change password" page:** `POST /api/auth/change-password` also works for any normal,
signed-in admin, so you can add it to the profile menu. Replace the stored session with the response.

### 1.3 Admin list: password status and Reset password

Admin objects now include `mustChangePassword` and `defaultPasswordExpiresAt`. Show a status badge:

| `mustChangePassword` | `defaultPasswordExpiresAt` | Badge |
|---|---|---|
| `false` | `null` | *(none)*: the admin has set their own password |
| `true` | in the future | **Awaiting first login**: expires {time} |
| `true` | in the past | **Password expired**: reset required |

Add a **Reset password** action on each row (show it prominently when expired):

**`POST /api/superadmin/admins/{id}/reset-password`** (Super Admin JWT, no body)

- Generates a new default password, emails it to the admin, and starts a **new 24-hour window**.
  Any password the admin set earlier stops working immediately.
- `200 OK`: the updated admin object (`mustChangePassword: true`, new `defaultPasswordExpiresAt`).
  The password itself is **never** returned by the API. It only goes out by email.
- `400 { "message": "This admin has no email address..." }`: set an email first (§1.4).
- `404` if the id doesn't exist.
- Confirm before calling it, e.g. *"Reset password for seller.freetown? Their current password will
  stop working and a new temporary password will be emailed to them."* Then show a toast:
  *"A new temporary password has been emailed to seller.freetown@example.com."*

This is also how an admin who **forgot** their password gets back in.

### 1.4 Show and edit admin emails

Every admin object (from `GET /api/superadmin/admins`, and the create/update responses) now has an
`email` field. It can be `null` for older and seeded accounts:

```json
{
  "id": "ad020342-1ce4-4c12-81be-380d29daaec5",
  "username": "admin.products",
  "email": "products@example.com",
  "isSuperAdmin": false,
  "isActive": true,
  "permissions": ["ManageProducts"],
  "mustChangePassword": false,
  "defaultPasswordExpiresAt": null,
  "createdAt": "2026-08-13T23:14:30.53Z"
}
```

Recommended UI:

- Add an **Email** column to the admins table. Show a warning badge such as *"No email: won't receive
  order alerts"* when it is `null`.
- Add an **Edit email** action on each row, **including Super Admin rows**, that calls:

**`PUT /api/superadmin/admins/{id}/email`** (Super Admin JWT)

```json
{ "email": "new.address@example.com" }
```

Response `200 OK`: the updated admin object. `404` if the id doesn't exist, `400` (validation
problem) if the email is invalid. This endpoint is the **only** way to set an email on a Super Admin
account. The seeded Super Admins start with no email, so **set one for each Super Admin
after deploying**, or they won't receive new-order emails.

`PUT /api/superadmin/admins/{id}/permissions` also accepts an optional `email`. If present, it
replaces the email; if omitted, the email is left unchanged. That endpoint still rejects Super Admin
targets.

### 1.5 Confirm / reject order screen

The endpoints haven't changed, but the customer now **receives `adminNotes` in their email**:

```json
POST /api/admin/orders/{id}/confirm   { "adminNotes": "Ready for pickup Saturday 10am." }
POST /api/admin/orders/{id}/reject    { "adminNotes": "Sorry, broilers are sold out this week." }
```

Recommended UI:

- Label the notes field **"Message to customer (included in the email)"**, and make it clear that
  it isn't private.
- For **reject**, make the note required in your form (the API still allows it to be empty) so
  the customer is told why.
- After success, show *"Order confirmed. The customer has been notified by email."* If
  `customerEmail` on the order is `null` (legacy orders), show *"No customer email on file,
  so no email was sent"*.

### 1.6 New-order alerts

Nothing to build. Admins receive the email in their inbox. If `AdminPortalUrl` is configured on the
server (see §3), the email links straight to the admin portal. Make sure the orders page there
lists `Pending` orders first (`GET /api/admin/orders?status=Pending`).


### 1.7 Edit customer screen (Super Admin)

When a Super Admin saves changes with `PUT /api/superadmin/customers/{id}` (see
[BACKEND-README.md](BACKEND-README.md), "Super Admin — manage customers"), the customer is emailed
automatically. There is no extra API call or flag.

- The email lists only the fields whose value **actually changed**: `Full name`, `Email`, `Phone`,
  `Account status` (`Active` / `Deactivated`), each with its previous and new value. Sending the
  same values again, or an empty body, changes nothing and sends **no email**.
- **Email change:** the notice goes to the new address **and** the old one, so the account owner
  finds out even if the new address is wrong. It tells them to sign in with the new address and
  that their password hasn't changed.
- **Deactivation:** the email tells the customer they can no longer sign in or place orders.
  **Reactivation** tells them they can again.
- Recommended UI:
  - Under the Save button, add the hint *"The customer will be emailed a summary of any changes."*
  - After a `200`, show *"Customer updated. They've been notified by email."*
  - In the confirm dialog for changing the email, add *"A notice will also be sent to the old
    address."*
- Only send fields the admin actually edited. Everything else stays untouched, and the email stays short.

---

## 2. Customer frontend

No API changes, so nothing will break. The emails use the email address from the customer's account,
which is copied onto the order when it's placed.

Recommended UI tweaks:

- **Signup form:** the email is now used for order updates. Add a hint under the email field:
  *"We'll email you when your order is confirmed."*
- **Order placed screen** (after `POST /api/orders` returns `201`, status `Pending`):
  *"Order JPF-2026-000123 received! We'll email you at aminata@example.com once the seller confirms it."*
- **My orders** (`GET /api/orders`, `GET /api/orders/{orderNumber}`): show `status`
  (`Pending` / `Confirmed` / `Rejected` / …) and, when present, `adminNotes` as
  *"Message from seller"*. This is the same text the customer got by email.
- If `CustomerPortalUrl` is configured on the server (see §3), the confirm/reject email includes a
  **"View your orders"** link to it. Point that URL at your "My orders" page, and make sure the page
  sends the user to login first when they aren't signed in.

---

## 3. Backend configuration (for whoever deploys)

The configuration lives in the `SendGrid` section of `appsettings.json`:

```json
"SendGrid": {
  "ApiKey": "",
  "FromEmail": "yayah.waritay@njala.edu.sl",
  "FromName": "Poultry Management",
  "BaseApiUrl": "https://api.sendgrid.com/v3/mail/send",
  "AdminPortalUrl": "",
  "CustomerPortalUrl": "",
  "CurrencyCode": "SLE"
},
"AdminAccounts": {
  "DefaultPasswordLifetimeHours": 24
}
```

- `AdminAccounts:DefaultPasswordLifetimeHours` (env var `AdminAccounts__DefaultPasswordLifetimeHours`)
  sets how long an emailed default password works. The default is 24.

- **`ApiKey`** is set directly in `appsettings.json` and `appsettings.Development.json`. To use a different
  key on Render without editing the file, set the `SendGrid__ApiKey` environment variable, which
  overrides the file. If SendGrid revokes the committed key (see the troubleshooting table), create a
  new one and paste it into both files.
- If `ApiKey` is blank, the API still works, but emails are skipped and a warning is logged.
- `FromEmail` must be a **verified sender** (Single Sender Verification or an authenticated domain)
  in the SendGrid dashboard. If it isn't, SendGrid returns 403 and nothing is delivered.
- `AdminPortalUrl` / `CustomerPortalUrl` are optional links placed in the emails, e.g.
  `https://<api-host>/admin/login.html` and `https://<shop-host>/orders`. Environment-variable form:
  `SendGrid__AdminPortalUrl`, `SendGrid__CustomerPortalUrl`.
- The `AddAdminEmail` and `AddAdminDefaultPassword` migrations add `Email`, `MustChangePassword` and
  `DefaultPasswordExpiresAt` to `AdminUsers`. They are applied automatically on startup. **Existing
  admins are not affected**: they keep their current password and are never asked to change it.

### Troubleshooting

| Symptom | Check |
|---|---|
| New admin never got their password | Email failed (see rows below), or it went to spam. Fix the problem, then use **Reset password** to send a new one |
| Admin gets `403` on everything after login | They're using the restricted token. The frontend must call `change-password` first (§1.2) |
| No emails at all | Server logs: look for `SendGrid is not configured` (key missing) or `SendGrid returned 401` (key invalid or revoked). SendGrid automatically revokes keys it finds in public GitHub repos, so check the key's status in the SendGrid dashboard |
| `SendGrid returned 403` | `FromEmail` isn't a verified sender in SendGrid |
| An admin never gets order alerts | Their `email` is `null`, they're inactive, or they have neither `ConfirmOrders` nor any product in that order |
| Customer didn't get confirm/reject email | The order's `customerEmail` is `null`, or check the spam folder |
| Customer didn't get an "account details updated" email | The `PUT` didn't change any value (same values or empty body), so no email was sent. Otherwise check the spam folder |
