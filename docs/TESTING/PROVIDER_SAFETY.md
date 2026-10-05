PROVIDER SAFETY
Do not perform production calls to:
Cashfree
Shiprocket
Resend production
For local email tests, use the existing development/test Resend configuration.
Do not claim production email delivery.
Do not create fake provider responses.
============================================================
TESTING — BACKEND
Verify:
1. anonymous cannot provision Admin
2. CUSTOMER cannot provision Admin
3. ADMIN cannot provision Admin
4. SUPER_ADMIN can provision Admin
5. Admin account created correctly
6. password stored hashed
7. plaintext password never returned
8. plaintext password never logged
9. temporary password works
10. forced password change works
11. permanent password works
12. temporary password stops working
13. Admin forgot-password flow works
14. reset token expires
15. reset token is one-time
16. reset invalidates sessions
17. account enumeration is prevented
18. rate limiting works
19. Admin accesses own onboarding
20. Admin cannot access another Admin onboarding
21. required onboarding validation works
22. KYC works
23. addresses work
24. category selection rules work
25. onboarding submission works
26. PENDING_SUPER_ADMIN_APPROVAL works
27. pre-approval seller operations are blocked
28. Super Admin can review
29. Super Admin can correct permitted fields
30. sensitive corrections are audited
31. CHANGES_REQUIRED works
32. Admin resubmission works
33. APPROVE works
34. ACTIVE seller state works
35. category scope remains enforced
36. Admin isolation remains enforced
37. deletion/recovery regression remains correct
38. Super Admin authentication remains unchanged
============================================================
TESTING — FRONTEND
After backend verification:
Super Admin:
- login
- session persistence
- logout
- dashboard
- Admin list
- Admin creation
- Admin detail
- onboarding review
- approve
- changes required
- reject
- products
- payouts
- lifecycle
- reconciliation
- role/permission views where supported
- error states
- loading states
- empty states
Admin:
- login
- forced password change
- onboarding
- KYC
- addresses
- categories
- submission
- pending state
- changes required
- resubmission
- approval
- seller dashboard
- products
- inventory
- orders
- finance/payout views where supported
- logout
- forgot password
Verify responsive layouts:
1440
1280
1024
768
390
375
No horizontal overflow.
============================================================
CUSTOMER REGRESSION
After all work:
DO NOT redesign Customer.
Only verify that the existing Customer storefront still works.
Check:
- homepage
- category
- product
- image
- cart
- wishlist
- checkout-related UI
- existing authentication
- existing Google customer authentication if locally testable
Do not modify Customer unless an actual regression is proven.
============================================================
BUILD / STATIC EXPORT
The project uses Next.js static export.
Do not "fix" build failures by:
- hardcoding catalog data
- hardcoding routes
- bypassing API calls
- returning fake categories
- returning fake products
If static build fails because local API/catalog data is unavailable:
diagnose the actual dependency.
Do not hide the failure.
============================================================
VERIFICATION RULE
Every report must distinguish:
IMPLEMENTED
VERIFIED
BLOCKED
DEFERRED
NOT REQUIRED
Never say "verified" because code merely exists.
A feature is VERIFIED only if the relevant command/test/browser flow
actually passed.
============================================================
PRODUCTION SAFETY
At the end explicitly report:
Aiven touched:
YES / NO
Production DB touched:
YES / NO
Worker deployed:
YES / NO
Pages deployed:
YES / NO
Cashfree:
YES / NO
Shiprocket:
YES / NO
Production Resend:
YES / NO
Production secrets:
YES / NO
============================================================
SUPER ADMIN ACCOUNT SAFETY
At the end explicitly confirm:
Existing Super Admin preserved: YES
Email changed: NO
Password changed: NO
Role changed: NO
Authentication changed: NO
Never print the password.
============================================================


FINAL REPORT
Return exactly these sections:
1. STATUS
PASS / BLOCKED
2. FINAL BUSINESS WORKFLOW
Complete lifecycle diagram.
3. AUTHENTICATION WORKFLOW
Customer
Admin
Super Admin
4. ADMIN PROVISIONING
Existing implementation
Changes
API
Security
5. PASSWORD LIFECYCLE
Temporary password
Forced password change
Permanent password
Forgot password
Reset token
Session invalidation
6. EMAIL LIFECYCLE
Email creation
Email verification
Email change
Super Admin approval
7. SELLER ONBOARDING
All required steps.
8. APPROVAL LIFECYCLE
PENDING
CHANGES_REQUIRED
REJECTED
APPROVED
ACTIVE
9. BACKEND CONTRACTS
Existing APIs reused
Modified APIs
New APIs
Deprecated APIs
10. SUPER ADMIN UI
Pages implemented
Real APIs connected
Remaining gaps
11. ADMIN UI
Pages implemented
Real APIs connected
Remaining gaps
12. DOCUMENTATION
Exact files changed.
13. DATABASE
Migration:
YES / NO
Test database:
CHECKOUT_TEST_DATABASE_URL
14. TEST RESULTS
Backend TypeScript:
Focused tests:
Unit suite:
PostgreSQL suite:
Frontend TypeScript:
Frontend lint:
Frontend build:
Browser verification:
15. AUTHORIZATION
Anonymous:
CUSTOMER:
ADMIN:
SUPER_ADMIN:
16. PRODUCTION SAFETY
Aiven:
Production DB:
Worker:
Pages:
Cashfree:
Shiprocket:
Resend:
Production secrets:
17. SUPER ADMIN ACCOUNT
Preserved:
YES
Email changed:
NO
Password changed:
NO
Role changed:
NO
Authentication changed:
NO
18. REMAINING BLOCKERS
Only real blockers.
19. NEXT DEPENDENCY-SAFE TASK
Exactly ONE next task.
20. FINAL CLASSIFICATION
IMPLEMENTED
VERIFIED
BLOCKED
DEFERRED
NOT REQUIRED