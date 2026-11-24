# BHADEX PLUGS Upgrade Notes

This package adds a coordinated feature set to the uploaded project. It preserves the existing customer authentication, Paystack verification, email, order tracking and admin fulfilment code.

## Included and connected
- Customer wishlist and recently viewed products.
- Reorder shortcut that opens the same product and package in the marketplace.
- Customer order timeline based on stored order and fulfilment timestamps.
- Reviews for the customer's own paid and delivered orders; reviews remain private until admin approval.
- Customer support tickets, admin replies and ticket status updates.
- Refund request intake and admin review statuses. This does not itself send money back.
- Loyalty points: one point per GH₵1 when an admin marks an eligible customer order delivered.
- Coupon creation and discount application in Paystack checkout.
- Announcement bar, newsletter sign-up and subscriber list.
- Admin analytics, customer list, product visibility/availability controls, review moderation, support and refund queues.
- Search suggestions, availability labels, favicon, SEO metadata, robots.txt and sitemap.
- Basic styled email templates remain in the existing server.

## Not fully automated in this release
- Gift cards can be generated for manual handling, but automatic checkout redemption is not enabled.
- Referral codes are generated and shown to customers, but referral attribution and rewards are not enabled.
- Product management controls visibility and availability; it does not create products or change prices.
- Social media links are generic placeholders and must be replaced with the official business profile URLs.
- Timeline milestones are derived from the existing order timestamps; a full event-by-event audit log is not yet stored.
- Newsletter sign-up stores addresses; no bulk newsletter sending workflow is included.
- Refund request status is administrative only. Actual refunds must be completed separately in Paystack.

## Before deployment
1. Keep Paystack in Test Mode.
2. Upload the changed and new files to the GitHub repository, preserving the folder structure.
3. Wait for Render to deploy.
4. Check Render logs for `BHADEX PLUGS database initialized` and the server listening message.
5. Test registration/login, a normal test payment, a coupon test payment, order delivery status, customer rewards, wishlist, reviews, support tickets and admin pages.
6. Ask a trusted adult to review the business policies, privacy obligations and real-money operations before launch.
