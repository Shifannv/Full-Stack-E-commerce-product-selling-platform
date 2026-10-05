ADMIN UI
Only after the Super Admin UI and backend workflow are verified,
implement the Admin UI.
Admin flow:
LOGIN
 ↓
FORCED PASSWORD CHANGE if temporary credential
 ↓
SELLER ONBOARDING
 ↓
PROFILE
 ↓
KYC
 ↓
SHIPPING ORIGIN
 ↓
RETURN ADDRESS
 ↓
REQUESTED CATEGORIES
 ↓
PAYOUT/BANK INFORMATION where required
 ↓
SUBMIT
 ↓
PENDING APPROVAL
 ↓
WAIT / CHANGES REQUIRED
 ↓
RESUBMIT
 ↓
APPROVED
 ↓
ACTIVE SELLER DASHBOARD
After ACTIVE:
- products
- product variants
- inventory
- orders
- reviews
- earnings
- payouts
- relevant notifications
- account/profile
Admin must only see their own permitted seller data.
Admin A must not access Admin B's:
- products
- inventory
- orders
- finance
- KYC
- addresses
- onboarding
- private records
Backend authorization is authoritative.
============================================================
ADMIN PRODUCT WORKFLOW
After ACTIVE approval:
Admin can create/manage products only where:
- permission allows
- category assignment allows
- ownership allows
- product_admins relationship allows
- inventory rules allow
Keep:
createdByAdminId
product_admins
category assignment
RBAC permissions
inventory authorization
Do not duplicate these rules in frontend.
==============================================