# Authentication and Security

## 1. One authentication system

Use **Better Auth for every role**.

```text
Better Auth
├── Customer: Google OAuth
├── Admin: Email + password
└── Super Admin: Email + password
```

Google is only a provider.

## 2. Customer Google login

Customer flow:

```text
Customer
↓
Sign in with Google
↓
Google OAuth
↓
Better Auth callback
↓
User/session
↓
Customer role/profile
```

Do not make Google OAuth the Admin/Super Admin login method.

## 3. Admin/Super Admin password login

```text
Email
+
Password
↓
Better Auth
↓
Password hash comparison
↓
Session
```

Passwords are hashed using the authentication library's secure password-storage implementation.

Never:

- store plaintext passwords
- log passwords
- email passwords in plain text
- reversibly encrypt passwords
- build a custom password hashing system unless there is a documented security requirement

For Admin onboarding, send a setup link or reset/setup flow rather than emailing the permanent password.

## 4. Super Admin protection

Super Admin is the highest-value role.

Required controls:

- secure password requirements
- session expiration/rotation strategy
- brute-force/rate limiting
- audit logs
- protected admin routes
- explicit role check
- no public registration
- no password sharing

Add MFA later if required, without redesigning the identity model.

## 5. RBAC

Permission examples:

```text
admin.manage
roles.manage
permissions.manage
customers.view
customers.message
products.view
products.create
products.update
inventory.update
orders.view
orders.update
payouts.view
payouts.request
payouts.process
settings.manage
impersonation.start
```

## 6. Impersonation

Super Admin must not become the Admin user's identity.

Store the real actor separately from the target Admin.

```text
actor_user_id
acting_on_behalf_of_user_id
admin_access_session_id
reason
started_at
ended_at
```

## 7. Secrets

Secrets are server-side only:

```text
DATABASE_URL
BETTER_AUTH_SECRET
GOOGLE_CLIENT_SECRET
R2 access credentials, if S3 presigning is used
RESEND_API_KEY
CASHFREE_CLIENT_SECRET
PAYOUT_CLIENT_SECRET
```

Only public identifiers may be exposed to the browser.

## 8. Cookies / sessions

Use secure, HTTP-only session cookies for authenticated server interactions where applicable.

Do not store privileged session secrets in localStorage.

## 9. Validation

Use Zod at API boundaries.

Validate:

- IDs
- slugs
- amounts
- quantities
- email addresses
- permissions
- upload metadata
- payout requests

Authorization happens after identity is established and before protected business operations.


## 10. Client storage

`localStorage` is not an authentication database.

Allowed:

- guest cart before login
- recently viewed IDs
- non-sensitive UI preferences

Not allowed:

- passwords
- Better Auth session tokens
- OAuth client secrets
- Cashfree secrets
- payout secrets
- private order/payment records as the authority

After login, merge guest cart into the server cart. The authenticated server/database state is authoritative.


## 11. Cross-subdomain deployment

Production target may use:

```text
www.example.com → Cloudflare Pages
api.example.com → Cloudflare Worker
```

Keep the frontend and API under the same parent domain. Configure Better Auth trusted origins/cross-subdomain cookie handling for the actual production domains.

Do not move session tokens to localStorage to work around cross-subdomain cookies.

Test:

- Chrome login/session
- Safari login/session
- refresh after login
- logout on another page/tab
- Google OAuth callback
- Admin/Super Admin email/password login
