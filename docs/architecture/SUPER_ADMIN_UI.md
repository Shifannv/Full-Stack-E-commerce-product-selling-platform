SUPER ADMIN UI
After backend contracts and authentication workflow are verified,
complete the existing Super Admin UI.
DO NOT create fake data.
DO NOT create fake Admin accounts.
DO NOT hardcode:
- Admin names
- Admin emails
- product records
- finance values
- payout values
- lifecycle requests
- dashboard metrics
Every operational value must come from real backend APIs.
Super Admin UI should include:
1. Dashboard
2. Admins
3. Admin creation/provisioning
4. Admin detail
5. Onboarding review
6. KYC review
7. Category scope
8. Roles/permissions where actually supported
9. Products
10. Payouts
11. Lifecycle requests
12. Reconciliation
13. Workflows/tasks
Admin creation flow:
Create Admin
 ↓
email
 ↓
temporary password
 ↓
confirm creation
 ↓
backend API
 ↓
Admin created
 ↓
show only appropriate creation result
 ↓
never expose stored password later
Do not add a "view password later" feature.
Super Admin UI must not display the Admin's permanent password.
============================================================
SUPER ADMIN VISUAL DESIGN
Preserve the existing premium Ownline design direction.
Super Admin should remain an operator/admin interface.
Use the existing dark sidebar treatment.
Maintain:
- responsive layout
- clear hierarchy
- accessible controls
- loading states
- empty states
- error states
- confirmation dialogs
- success/error feedback
- no unnecessary visual redesign of Customer storefront
Do not replace the existing design system with a completely unrelated UI.