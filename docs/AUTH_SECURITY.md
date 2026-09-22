# Authentication + Security Plan

## Authentication matrix

| Role | Login | Account creation | Main provider |
|---|---|---|---|
| Customer | Google OAuth | Customer self-service | Better Auth + Google |
| Admin | Email + password | Super Admin invitation/creation | Better Auth credential |
| Super Admin | Email + password | One controlled account | Better Auth credential |

## Customer Google OAuth

Use Better Auth social provider support.

Required secrets:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

The client ID may be public in OAuth configuration; the client secret is server-only.

Use exact OAuth redirect URIs for development and production.

## Admin / Super Admin passwords

Password path:

```text
password input
  ↓
Better Auth
  ↓
scrypt password hash
  ↓
account.password
```

Do not store:

```text
password = "Admin@123"
```

Do not encrypt passwords with AES for later decryption.

Why?

The application never needs the original password. It only needs to verify whether the entered password matches the stored hash.

Better Auth currently uses `scrypt` by default and allows custom hashing if needed. Keep the default unless there is a tested runtime compatibility reason to change it.

## Admin invitation flow

```text
Super Admin creates Admin
        ↓
Create credential account with controlled setup state
        ↓
Generate one-time setup/reset flow
        ↓
Resend invitation email
        ↓
Admin sets password
        ↓
Email verification if policy requires
        ↓
Admin login
```

Do not email permanent plaintext passwords.

## Super Admin

Before production, add:

- strong password requirements
- email verification
- session freshness checks for sensitive operations
- 2FA
- audit logging
- rate limiting
- suspicious-login monitoring

## Session rules

- Secure cookies in production.
- HttpOnly cookies.
- SameSite configured intentionally.
- Shorter session lifetime for privileged users than normal customer sessions where practical.
- Revoke sessions on password reset/change for Admin/Super Admin.
- Require recent authentication for sensitive actions.

## Sensitive actions requiring re-authentication/freshness

```text
Change password
Change email
Delete account
Approve payout
Change commission
Change gateway fee
Change roles/permissions
Enter Admin impersonation
Reset Super Admin security settings
```

## RBAC

Use permissions such as:

```text
products.view
products.create
products.update
products.delete
inventory.view
inventory.update
orders.view
orders.update
customers.view
customers.message
customers.manage
analytics.view
earnings.view
payouts.view
payouts.request
admin.manage
roles.manage
permissions.manage
admin.access
commission.manage
payment_gateway.manage
payouts.manage
refunds.manage
audit.view
settings.manage
```

Backend check example concept:

```text
session
 ↓
role resolution
 ↓
effective permissions
 ↓
resource ownership
 ↓
business rules
 ↓
allow/deny
```

## Impersonation

Never copy the Admin credentials into a Super Admin session.

Use a dedicated temporary access session record:

```text
admin_access_sessions

id
super_admin_user_id
admin_user_id
reason
started_at
expires_at
ended_at
access_mode
notification_sent_at
```

Audit each action:

```text
actor_user_id = Super Admin
target_user_id = Admin
access_mode = IMPERSONATION
```

## Secrets

Server-only:

```env
DATABASE_URL=
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_SECRET=
CASHFREE_CLIENT_SECRET=
PAYOUT_CLIENT_SECRET=
RESEND_API_KEY=
```

Never prefix these with `NEXT_PUBLIC_`.

## Security baseline

- Validate every request with Zod.
- Rate-limit login, password reset, contact and auth endpoints.
- Rate-limit sensitive admin endpoints.
- Add webhook idempotency.
- Verify Cashfree webhook authenticity according to Cashfree's current webhook verification method.
- Use least-privilege Cloudflare API tokens.
- Never log secrets.
- Do not log passwords, OAuth secrets, session tokens or full payment credentials.
- Sanitize file names/metadata.
- Validate R2 upload content type and size.
- Keep proof documents private unless explicitly intended otherwise.

## Sources

- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth users/accounts: https://better-auth.com/docs/concepts/users-accounts
- Better Auth Drizzle: https://better-auth.com/docs/adapters/drizzle
- Better Auth Hono/Cloudflare: https://better-auth.com/docs/integrations/hono
