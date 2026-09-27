# Customer password reset: frontend integration guide

When a customer forgets their password, a **Super Admin** can email them a new **temporary password**.
The customer signs in with it and must choose a new password straight away. This guide covers
what the **admin frontend** and the **customer frontend** need to build.

**Why "reset" and not "resend"?** Passwords are stored as one-way hashes. Nobody can read the
original, including the server, so it can't be sent back. The Super Admin issues a new one instead.

## How it works

1. The customer contacts the shop ("I forgot my password").
2. A Super Admin clicks **Reset password** on the customer's page, which calls
   `POST /api/superadmin/customers/{id}/reset-password`.
3. The server generates a 12-character temporary password and **emails it to the customer**. Their
   old password **stops working immediately**.
4. The customer signs in with the temporary password (`POST /api/customers/login`). The response
   has `mustChangePassword: true` and a **restricted token** that can only call change-password.
5. The customer picks a new password (`POST /api/customers/change-password`) and gets a normal
   full-access token back.

The temporary password **expires 24 hours** after it's issued. After that, login with it returns
`403` with `code: "TemporaryPasswordExpired"`, and a Super Admin has to reset it again.

| Endpoint | Auth | Who calls it |
|---|---|---|
| `POST /api/superadmin/customers/{id}/reset-password` | `SuperAdmin` | Admin frontend |
| `POST /api/customers/login` (existing, new fields/error) | none | Customer frontend |
| `POST /api/customers/change-password` (**new**) | any customer token, including the restricted one | Customer frontend |

All error bodies are `{ "message": "..." }` unless noted. Validation failures (`400`) use the
standard ASP.NET shape: `{ "title": "...", "status": 400, "errors": { "NewPassword": ["..."] } }`.

---

## 1. Admin frontend (Super Admin)

### 1.1 Reset password button

On the customer detail page (and optionally as a row action in the customer list), add a
**Reset password** button.

**`POST /api/superadmin/customers/{id}/reset-password`** (no request body)

Response `200 OK`: the updated customer, the same shape as `GET /api/superadmin/customers/{id}`:
```json
{
  "id": "5b1f2c3e-9a41-4d8e-b0a2-7f6c1d2e3a4b",
  "fullName": "Aminata Kamara",
  "email": "aminata@example.com",
  "phone": "+23276123456",
  "isActive": true,
  "mustChangePassword": true,
  "temporaryPasswordExpiresAt": "2026-09-28T14:05:00Z",
  "createdAt": "2026-08-14T10:02:11.41Z",
  "orderCount": 3,
  "totalSpentCents": 1250000,
  "orders": [ ... ]
}
```

| Status | Meaning | What to show |
|---|---|---|
| `200` | Password reset, email queued | *"A temporary password has been emailed to aminata@example.com. It expires in 24 hours."* |
| `400` | Customer is deactivated: `{ "message": "This customer's account is deactivated. Reactivate it before resetting the password." }` | Show the message. Offer to reactivate first (`PUT /api/superadmin/customers/{id}` with `{ "isActive": true }`) |
| `404` | No such customer | *"Customer not found."* |
| `403` | Signed-in admin isn't a Super Admin | Hide the button for non-Super Admins |

Recommended UI:

- **Confirm first:** *"Reset Aminata Kamara's password? Their current password will stop working
  right away and a temporary password will be emailed to aminata@example.com."*
- **Check the email first.** The temporary password goes to the email on file. If the customer's
  email address is wrong, fix it with `PUT /api/superadmin/customers/{id}` **before** resetting.
  The customer also gets an "account details updated" email about that change.
- **The temporary password is never returned to the frontend.** It goes only to the customer's inbox.
  If they didn't receive it, ask them to check spam, then reset again. Each reset issues a new
  password and invalidates the previous one.
- The email is sent in the background. A `200` means the reset is saved and the email is queued,
  not necessarily delivered yet.

### 1.2 Password status in the customer list and detail view

`GET /api/superadmin/customers` and `GET /api/superadmin/customers/{id}` now include two new fields:

| `mustChangePassword` | `temporaryPasswordExpiresAt` | Badge |
|---|---|---|
| `false` | `null` | *(none)*: the customer uses their own password |
| `true` | in the future | **Temporary password sent**: expires {time} |
| `true` | in the past | **Temporary password expired**: reset again |

Timestamps are UTC (ISO 8601), so convert them to local time for display.

---

## 2. Customer frontend

### 2.1 Login: handle `mustChangePassword`

`POST /api/customers/login` is unchanged for normal logins. The response has two new fields:

```json
{
  "token": "eyJhbGciOi...",
  "expiresAt": "2026-09-27T16:05:00Z",
  "customerId": "5b1f2c3e-9a41-4d8e-b0a2-7f6c1d2e3a4b",
  "fullName": "Aminata Kamara",
  "email": "aminata@example.com",
  "phone": "+23276123456",
  "mustChangePassword": true,
  "temporaryPasswordExpiresAt": "2026-09-28T14:05:00Z"
}
```

After a successful login:

- **`mustChangePassword: false`**: carry on as today.
- **`mustChangePassword: true`**: the token is **restricted**. It works **only** for
  `POST /api/customers/change-password`. Every other customer endpoint (`/api/customers/me`,
  `/api/orders`, `/api/checkout/sessions`, …) returns **`403`**. Send the user straight to a
  **"Choose a new password"** screen and don't let them browse to account or order pages until
  they've finished it. Keep the restricted token only for that call.

New error case on login:

| Status | Body | What to show |
|---|---|---|
| `403` | `{ "message": "Your temporary password has expired. Please contact us to have a new one sent to you.", "code": "TemporaryPasswordExpired" }` | Show the message plus your contact details. Check `code`, not the message text |
| `401` | `{ "message": "Invalid email or password." }` | Unchanged. This is also what the **old** password returns after a reset |

### 2.2 Choose a new password screen

**`POST /api/customers/change-password`**, header `Authorization: Bearer <token from login>`

Request:
```json
{ "currentPassword": "Hk7#mP2qRx9a", "newPassword": "my-new-password" }
```

- `currentPassword`: the temporary password from the email (or their current password, for a voluntary change).
- `newPassword`: at least **6** characters (same rule as signup), and different from `currentPassword`.

Response `200 OK`: a **full** login response (same shape as 2.1) with `mustChangePassword: false`
and `temporaryPasswordExpiresAt: null`. **Replace the stored token with this new one.** The
restricted token can't be upgraded, so keep using the new one from here on. Then send the user to
where they were going (home, cart or checkout).

| Status | Body | What to show |
|---|---|---|
| `400` | `{ "message": "Current password is incorrect." }` | Show it next to the current/temporary password field |
| `400` | `{ "message": "New password must be different from the current password." }` | Show it next to the new password field |
| `400` | Validation shape, `errors.NewPassword` (e.g. too short) | Map `errors` keys to fields |
| `403` | `{ "message": "...", "code": "TemporaryPasswordExpired" }` | The 24 hours ran out while they were on this screen. Same handling as on login |
| `401` | *(empty)* | Token missing or expired. Send them back to login |

Recommended UI: the page title *"Choose a new password"*, a short line *"You signed in with a
temporary password. Please set your own to continue."*, three fields (**Temporary password**,
**New password**, **Confirm new password**; the confirm check is client-side only), and one
**Save and continue** button.

### 2.3 Change password from the account page (optional)

The same endpoint also works for a signed-in customer on a normal token, so you can add a
**Change password** form to the account/profile page. Label the first field **Current password**
there. The response is a fresh full token, so replace the stored token with it.

### 2.4 "Forgot password?" link

Customers **can't** reset their own password (there's no self-service email link yet), so a
Super Admin has to do it. Under the login form, add **"Forgot password?"** that shows something like:
*"Contact us on +232 XX XXX XXX or shop@example.com and we'll email you a temporary password."*

---

## 3. Email the customer receives

**Subject:** "Your {shop name} password has been reset". It contains:

- their sign-in email and the **temporary password**
- that they'll be asked to choose a new password right after signing in, and that the old password no longer works
- the expiry time (UTC), in red
- a **"Sign in to your account"** link, if `SendGrid:CustomerPortalUrl` is configured on the server.
  Point that URL at your **login page**
- *"If you did not ask for your password to be reset, please contact us right away."*

See [EMAIL-NOTIFICATIONS-README.md](EMAIL-NOTIFICATIONS-README.md) §3 for SendGrid configuration
and troubleshooting.

---

## 4. Things to know

- **The expiry window** is the `AdminAccounts:DefaultPasswordLifetimeHours` setting (default 24).
  It's shared with admin default passwords.
- **Existing sessions aren't signed out.** A reset changes the password, but any customer token
  issued before the reset keeps working until it expires on its own (JWTs can't be revoked
  server-side). If you suspect someone else has access to the account, **deactivate** the account
  (`isActive: false`) as well. Note that deactivation also blocks the customer until you reactivate.
- **Deactivated customers can't be reset** (`400`). Reactivate them first.
- **Deploying:** this adds two columns to the `Customers` table (`MustChangePassword`,
  `TemporaryPasswordExpiresAt`) through the `AddCustomerTemporaryPassword` migration. It's applied
  automatically on startup, and existing customers are unaffected (`false` / `null`).
