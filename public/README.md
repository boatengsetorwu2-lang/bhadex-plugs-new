# BHADEX PLUGS

Digital subscription marketplace built with Node.js, Express, PostgreSQL and Paystack.

## Deployment
- Start command: `npm start`
- Deploy the repository root.
- Existing environment variables remain required: `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, `BASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`.
- No new npm dependency is required for the feature additions.

## Feature additions in this package
- Database-backed product visibility and availability labels.
- Product search suggestions, recently viewed items, wishlist and reorder shortcut.
- Customer order timeline view.
- Customer reviews, with admin approval before public display.
- Customer support tickets and admin replies.
- Refund request submission and admin request-status management.
- Loyalty points: one point per GH₵1 for a paid order when an admin marks it delivered.
- Coupon creation and coupon application during Paystack checkout (1–50% discount).
- Announcement bar and newsletter subscriptions.
- Admin analytics, customer list, product availability controls, review moderation, support queue and refund request queue.
- Gift-card code generation for manual handling only; automatic checkout redemption is not enabled.
- Basic SEO metadata, favicon, robots.txt and sitemap.xml.

## Important operational notes
- Keep Paystack in Test Mode while testing.
- A refund request status update does not issue a refund. Actual refunds must be completed separately in the payment provider.
- Gift cards are generated as records/codes only and are not automatically redeemed at checkout.
- Referral codes are generated for customer accounts, but referral attribution and referral rewards are not enabled yet.
- Social links in the marketplace footer are generic placeholders; replace them with the official BHADEX PLUGS profile URLs before launch.
- Product management in this release controls visibility and availability. It does not edit prices or create new catalogue items.
- Order timeline entries are based on the order and current fulfilment timestamps available in the existing database.
- Review submissions are only accepted for the customer's own paid, delivered orders and require admin approval.
- Review policy text, refund conditions, delivery commitments and privacy/legal pages should be checked by a trusted adult or qualified professional before accepting real customer payments.

## Existing features retained
Customer registration and email verification, login, password reset/change, account dashboard, Paystack payment verification and webhook, order confirmation email, order tracking, and admin order fulfilment controls.
