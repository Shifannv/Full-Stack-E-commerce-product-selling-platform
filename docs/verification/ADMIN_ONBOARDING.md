EXISTING INVITATION SYSTEM
There is already an Admin invitation/setup system.
Inspect it before changing anything.
Existing concepts include:
- invitation
- invitation token
- invitation expiry
- /admin/setup
- Admin activation
- password setup
- one-time token usage
- audit events
- Resend invitation email
DO NOT delete it blindly.
Determine:
1. Can the existing invitation system support the new workflow?
2. Can it be adapted?
3. Does it conflict with Super Admin explicitly creating
   email + temporary password?
4. Which parts should remain?
5. Which parts should be deprecated?
6. Is invitation still useful as a secure fallback/setup mechanism?
Prefer reuse.
Do not create two competing Admin provisioning systems.
============================================================
ADMIN ONBOARDING
After authentication, Admin must complete seller onboarding.
Use existing project requirements.
Inspect current source-of-truth documentation before changing fields.
Potential required areas include:
- legal/business name
- contact information
- business type
- KYC evidence
- shipping-origin address
- return address
- requested selling categories
- payout/bank information where required
Do not invent new business requirements.
Private KYC evidence must remain private.
Return address must remain private except where existing return workflow
legitimately exposes it.
============================================================
ADMIN APPROVAL
Before approval:
Admin MUST NOT operate as an approved seller.
Backend must enforce:
- no seller product publishing if approval is required
- no fulfillment if approval is required
- no seller operations requiring ACTIVE state
- no bypass through direct API requests
After Super Admin approval:
Admin becomes ACTIVE seller.
Existing rules remain authoritative:
- createdByAdminId
- product_admins
- active category assignment
- permission checks
- inventory authorization
- Admin isolation
Do not rely only on frontend UI visibility.

STATUS MODEL
Inspect the existing database/status model first.
Possible lifecycle:
ACCOUNT CREATED
    ↓
ONBOARDING
    ↓
PENDING_SUPER_ADMIN_APPROVAL
    ↓
CHANGES_REQUIRED
    ↓
PENDING_SUPER_ADMIN_APPROVAL
    ↓
APPROVED / ACTIVE
Existing states such as:
SUSPENDED
REJECTED
DELETED
ARCHIVED
must be reconciled with the existing schema.
Do NOT create duplicate status fields if the existing schema already represents
these concepts safely.
==============================================