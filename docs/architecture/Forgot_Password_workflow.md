ADMIN FORGOT PASSWORD
ADMIN MUST have a Forgot Password workflow.
Required conceptual flow:
Admin
 ↓
Forgot Password
 ↓
Enter registered email
 ↓
Backend creates short-lived, one-time reset token
 ↓
Resend email
 ↓
Admin opens reset link
 ↓
Admin creates new password
 ↓
Old password stops working
 ↓
Existing sessions are invalidated
 ↓
Admin can log in with new password
Security requirements:
- short-lived token
- one-time use
- hashed token storage where appropriate
- no plaintext reset token persistence
- rate limiting
- no account enumeration
- generic forgot-password response
- session invalidation after successful reset
- audit event where appropriate
- no password logging
- no password in API responses
Use the existing Resend integration.
Do NOT create another email provider.
If production Resend configuration is unavailable, verify locally using
the project's existing development/test configuration.
Do not claim production email delivery.
============================================================
CUSTOMER FORGOT PASSWORD
Customer Forgot Password is also allowed/required according to the
confirmed product direction.
Use the same secure password-reset architecture where appropriate.
Do not duplicate reset-token infrastructure unnecessarily.
Customer password recovery must not expose whether an email exists.
Customer UI may contain Forgot Password.
============================================================
SUPER ADMIN FORGOT PASSWORD
DO NOT add a public Forgot Password UI for SUPER_ADMIN.
DO NOT add a public Super Admin password-reset email workflow.
Super Admin recovery remains an administrative/local controlled reset
procedure.
The existing local reset command must remain protected by the local DB
guard.
Never implement a workflow that can reveal the old password.
Password reset means:
old password cannot be retrieved
        ↓
new password is established
        ↓
old password stops working
============================================================
ADMIN EMAIL CHANGE
Do NOT treat Admin email changes as an ordinary profile edit.
Email is the login identity.
If Admin email change is required by the project:
Admin requests email change
        ↓
new email verification
        ↓
Super Admin review/approval
        ↓
email changed
        ↓
existing sessions invalidated where required
        ↓
audit event
The Super Admin approves the email change.
The Super Admin NEVER sees the Admin password.
Keep email change separate from password reset.
Do not automatically implement email change if the current project
requirements do not require it.
First reconcile requirements.
============================================================