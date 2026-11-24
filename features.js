const express = require("express");

module.exports = function createFeatureRouter({ pool, requireCustomer, requireAdmin }) {
  const router = express.Router();

  const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  async function customerEmail(req) {
    const result = await pool.query(
      "SELECT id, name, email, referral_code FROM customers WHERE id = $1 LIMIT 1",
      [req.session.customerId]
    );
    return result.rows[0] || null;
  }

  // Public catalogue, announcement and approved reviews
  router.get("/public", async (req, res) => {
    try {
      const [products, announcements] = await Promise.all([
        pool.query("SELECT * FROM store_products WHERE active = TRUE ORDER BY sort_order, name"),
        pool.query("SELECT id, message, link_url FROM store_announcements WHERE active = TRUE ORDER BY created_at DESC LIMIT 3")
      ]);
      res.json({ products: products.rows, announcements: announcements.rows });
    } catch (error) {
      console.error("Public features error:", error.message);
      res.status(500).json({ error: "Unable to load store information." });
    }
  });

  router.get("/reviews", async (req, res) => {
    try {
      const product = clean(req.query.product, 100);
      const values = [];
      let where = "WHERE status = 'APPROVED'";
      if (product) {
        values.push(product);
        where += " AND product = $1";
      }
      const result = await pool.query(
        `SELECT product, rating, review, created_at
         FROM product_reviews ${where}
         ORDER BY created_at DESC LIMIT 100`,
        values
      );
      res.json({ reviews: result.rows });
    } catch (error) {
      console.error("Public reviews error:", error.message);
      res.status(500).json({ error: "Unable to load reviews." });
    }
  });

  router.post("/newsletter", async (req, res) => {
    try {
      const email = clean(req.body?.email, 255).toLowerCase();
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      await pool.query(
        `INSERT INTO newsletter_subscribers(email)
         VALUES($1) ON CONFLICT(email) DO UPDATE SET active = TRUE`,
        [email]
      );
      res.json({ success: true, message: "You are subscribed to BHADEX PLUGS updates." });
    } catch (error) {
      console.error("Newsletter error:", error.message);
      res.status(500).json({ error: "Unable to subscribe right now." });
    }
  });

  // Customer features
  router.get("/customer/wishlist", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      const result = await pool.query(
        "SELECT product_name, created_at FROM customer_wishlist WHERE customer_id = $1 ORDER BY created_at DESC",
        [customer.id]
      );
      res.json({ wishlist: result.rows });
    } catch (error) {
      console.error("Wishlist load error:", error.message);
      res.status(500).json({ error: "Unable to load your wishlist." });
    }
  });

  router.post("/customer/wishlist", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const product = clean(req.body?.product, 100);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      if (!product) return res.status(400).json({ error: "Choose a product." });
      await pool.query(
        `INSERT INTO customer_wishlist(customer_id, product_name)
         VALUES($1, $2) ON CONFLICT(customer_id, product_name) DO NOTHING`,
        [customer.id, product]
      );
      res.json({ success: true, message: "Added to your wishlist." });
    } catch (error) {
      console.error("Wishlist add error:", error.message);
      res.status(500).json({ error: "Unable to update your wishlist." });
    }
  });

  router.delete("/customer/wishlist/:product", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const product = clean(req.params.product, 100);
      await pool.query(
        "DELETE FROM customer_wishlist WHERE customer_id = $1 AND product_name = $2",
        [customer.id, product]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Wishlist remove error:", error.message);
      res.status(500).json({ error: "Unable to remove this item." });
    }
  });

  router.post("/customer/recently-viewed", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const product = clean(req.body?.product, 100);
      if (!product) return res.status(400).json({ error: "Choose a product." });
      await pool.query(
        `INSERT INTO recently_viewed(customer_id, product_name, viewed_at)
         VALUES($1, $2, NOW())
         ON CONFLICT(customer_id, product_name) DO UPDATE SET viewed_at = NOW()`,
        [customer.id, product]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Recently viewed error:", error.message);
      res.status(500).json({ error: "Unable to save recently viewed item." });
    }
  });

  router.get("/customer/recently-viewed", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const result = await pool.query(
        `SELECT product_name, viewed_at FROM recently_viewed
         WHERE customer_id = $1 ORDER BY viewed_at DESC LIMIT 12`,
        [customer.id]
      );
      res.json({ items: result.rows });
    } catch (error) {
      console.error("Recently viewed load error:", error.message);
      res.status(500).json({ error: "Unable to load recently viewed items." });
    }
  });

  router.get("/customer/rewards", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const result = await pool.query(
        `SELECT COALESCE(SUM(points), 0)::int AS points,
                COUNT(*)::int AS earned_orders
         FROM loyalty_ledger WHERE customer_id = $1`,
        [customer.id]
      );
      res.json({ points: result.rows[0].points, earnedOrders: result.rows[0].earned_orders });
    } catch (error) {
      console.error("Rewards load error:", error.message);
      res.status(500).json({ error: "Unable to load rewards." });
    }
  });

  router.get("/customer/referral", requireCustomer, async (req, res) => {
    try {
      let customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      if (!customer.referral_code) {
        const code = "BHD" + cryptoRandomCode();
        const updated = await pool.query(
          "UPDATE customers SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code",
          [code, customer.id]
        );
        customer.referral_code = updated.rows[0]?.referral_code || code;
      }
      res.json({ referralCode: customer.referral_code });
    } catch (error) {
      console.error("Referral load error:", error.message);
      res.status(500).json({ error: "Unable to load your referral code." });
    }
  });

  router.get("/customer/order-timeline/:reference", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const reference = clean(req.params.reference, 100);
      const result = await pool.query(
        `SELECT reference, status, fulfillment_status, created_at, delivered_at,
                fulfillment_updated_at
         FROM orders WHERE reference = $1 AND LOWER(customer_email) = LOWER($2) LIMIT 1`,
        [reference, customer.email]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Order not found." });
      const order = result.rows[0];
      const events = [
        { label: "Order placed", status: "complete", date: order.created_at },
        { label: "Payment confirmed", status: order.status === "PAID" ? "complete" : "pending", date: order.created_at },
        { label: "Processing", status: ["PROCESSING", "DELIVERED"].includes(order.fulfillment_status) ? "complete" : "pending", date: order.fulfillment_updated_at },
        { label: "Delivered", status: order.fulfillment_status === "DELIVERED" ? "complete" : "pending", date: order.delivered_at }
      ];
      res.json({ events });
    } catch (error) {
      console.error("Order timeline error:", error.message);
      res.status(500).json({ error: "Unable to load order timeline." });
    }
  });

  router.post("/customer/reviews", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const reference = clean(req.body?.reference, 100);
      const rating = Number(req.body?.rating);
      const review = clean(req.body?.review, 1500);
      if (!reference || !Number.isInteger(rating) || rating < 1 || rating > 5 || review.length < 5) {
        return res.status(400).json({ error: "Enter an order reference, a 1–5 rating and a review." });
      }
      const order = await pool.query(
        `SELECT product FROM orders
         WHERE reference = $1 AND LOWER(customer_email) = LOWER($2)
           AND fulfillment_status = 'DELIVERED' AND status = 'PAID' LIMIT 1`,
        [reference, customer.email]
      );
      if (!order.rows.length) return res.status(400).json({ error: "Reviews are available after an order is delivered." });
      await pool.query(
        `INSERT INTO product_reviews(customer_id, customer_email, order_reference, product, rating, review)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(order_reference) DO NOTHING`,
        [customer.id, customer.email, reference, order.rows[0].product, rating, review]
      );
      res.json({ success: true, message: "Your review has been submitted for approval." });
    } catch (error) {
      console.error("Review submission error:", error.message);
      res.status(500).json({ error: "Unable to submit your review." });
    }
  });

  router.post("/customer/support", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const subject = clean(req.body?.subject, 120);
      const message = clean(req.body?.message, 3000);
      const reference = clean(req.body?.reference, 100);
      if (subject.length < 3 || message.length < 10) return res.status(400).json({ error: "Enter a subject and a message of at least 10 characters." });
      const result = await pool.query(
        `INSERT INTO support_tickets(customer_id, customer_email, subject, message, order_reference)
         VALUES($1,$2,$3,$4,$5) RETURNING id, status, created_at`,
        [customer.id, customer.email, subject, message, reference || null]
      );
      res.status(201).json({ success: true, ticket: result.rows[0] });
    } catch (error) {
      console.error("Support ticket error:", error.message);
      res.status(500).json({ error: "Unable to create your support ticket." });
    }
  });

  router.get("/customer/support", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const result = await pool.query(
        `SELECT id, subject, message, status, admin_reply, created_at, updated_at
         FROM support_tickets WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [customer.id]
      );
      res.json({ tickets: result.rows });
    } catch (error) {
      console.error("Support list error:", error.message);
      res.status(500).json({ error: "Unable to load support tickets." });
    }
  });

  router.post("/customer/refunds", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const reference = clean(req.body?.reference, 100);
      const reason = clean(req.body?.reason, 1500);
      if (!reference || reason.length < 5) return res.status(400).json({ error: "Enter the order reference and reason for your refund request." });
      const order = await pool.query(
        `SELECT reference FROM orders
         WHERE reference = $1 AND LOWER(customer_email) = LOWER($2) AND status = 'PAID' LIMIT 1`,
        [reference, customer.email]
      );
      if (!order.rows.length) return res.status(404).json({ error: "Paid order not found." });
      await pool.query(
        `INSERT INTO refund_requests(customer_id, customer_email, order_reference, reason)
         VALUES($1,$2,$3,$4) ON CONFLICT(order_reference) DO NOTHING`,
        [customer.id, customer.email, reference, reason]
      );
      res.json({ success: true, message: "Your refund request has been submitted for review." });
    } catch (error) {
      console.error("Refund request error:", error.message);
      res.status(500).json({ error: "Unable to submit your refund request." });
    }
  });

  // Admin tools
  router.get("/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status='PAID')::int AS paid_orders,
          COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0) AS revenue,
          COUNT(DISTINCT LOWER(customer_email))::int AS customers,
          COUNT(*) FILTER (WHERE fulfillment_status='DELIVERED')::int AS delivered_orders
        FROM orders
      `);
      const daily = await pool.query(`
        SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS orders,
               COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0) AS revenue
        FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY created_at::date ORDER BY created_at::date
      `);
      res.json({ summary: result.rows[0], daily: daily.rows });
    } catch (error) {
      console.error("Analytics error:", error.message);
      res.status(500).json({ error: "Unable to load analytics." });
    }
  });

  router.get("/admin/customers", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT c.id, c.name, c.email, c.email_verified, c.created_at,
               COUNT(o.id)::int AS order_count,
               COALESCE(SUM(o.amount) FILTER (WHERE o.status='PAID'),0) AS total_paid
        FROM customers c LEFT JOIN orders o ON LOWER(o.customer_email)=LOWER(c.email)
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500
      `);
      res.json({ customers: result.rows });
    } catch (error) {
      console.error("Customer management error:", error.message);
      res.status(500).json({ error: "Unable to load customers." });
    }
  });

  router.get("/admin/reviews", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM product_reviews ORDER BY created_at DESC LIMIT 300");
      res.json({ reviews: result.rows });
    } catch (error) {
      console.error("Admin reviews error:", error.message);
      res.status(500).json({ error: "Unable to load reviews." });
    }
  });

  router.patch("/admin/reviews/:id", requireAdmin, async (req, res) => {
    try {
      const status = clean(req.body?.status, 20).toUpperCase();
      if (!["APPROVED", "REJECTED"].includes(status)) return res.status(400).json({ error: "Invalid review status." });
      const result = await pool.query("UPDATE product_reviews SET status=$1 WHERE id=$2 RETURNING id", [status, Number(req.params.id)]);
      if (!result.rows.length) return res.status(404).json({ error: "Review not found." });
      res.json({ success: true });
    } catch (error) {
      console.error("Review moderation error:", error.message);
      res.status(500).json({ error: "Unable to update review." });
    }
  });

  router.get("/admin/support", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 300");
      res.json({ tickets: result.rows });
    } catch (error) {
      console.error("Admin support error:", error.message);
      res.status(500).json({ error: "Unable to load support tickets." });
    }
  });

  router.patch("/admin/support/:id", requireAdmin, async (req, res) => {
    try {
      const status = clean(req.body?.status, 20).toUpperCase();
      const reply = clean(req.body?.reply, 3000);
      if (!["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) return res.status(400).json({ error: "Invalid ticket status." });
      const result = await pool.query(
        "UPDATE support_tickets SET status=$1, admin_reply=$2, updated_at=NOW() WHERE id=$3 RETURNING id",
        [status, reply || null, Number(req.params.id)]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Ticket not found." });
      res.json({ success: true });
    } catch (error) {
      console.error("Support update error:", error.message);
      res.status(500).json({ error: "Unable to update ticket." });
    }
  });

  router.get("/admin/refunds", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM refund_requests ORDER BY created_at DESC LIMIT 300");
      res.json({ requests: result.rows });
    } catch (error) {
      console.error("Admin refunds error:", error.message);
      res.status(500).json({ error: "Unable to load refund requests." });
    }
  });

  router.patch("/admin/refunds/:id", requireAdmin, async (req, res) => {
    try {
      const status = clean(req.body?.status, 20).toUpperCase();
      if (!["UNDER_REVIEW", "APPROVED", "DECLINED", "COMPLETED"].includes(status)) return res.status(400).json({ error: "Invalid refund status." });
      const result = await pool.query(
        "UPDATE refund_requests SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id",
        [status, Number(req.params.id)]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Refund request not found." });
      res.json({ success: true, message: "Request status updated. Any actual payment refund must be completed separately in the payment provider." });
    } catch (error) {
      console.error("Refund update error:", error.message);
      res.status(500).json({ error: "Unable to update refund request." });
    }
  });

  router.get("/admin/newsletter", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT email, created_at FROM newsletter_subscribers WHERE active=TRUE ORDER BY created_at DESC LIMIT 1000");
      res.json({ subscribers: result.rows });
    } catch (error) {
      console.error("Newsletter admin error:", error.message);
      res.status(500).json({ error: "Unable to load subscribers." });
    }
  });

  router.get("/admin/announcements", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM store_announcements ORDER BY created_at DESC LIMIT 100");
      res.json({ announcements: result.rows });
    } catch (error) {
      console.error("Announcements admin error:", error.message);
      res.status(500).json({ error: "Unable to load announcements." });
    }
  });

  router.post("/admin/announcements", requireAdmin, async (req, res) => {
    try {
      const message = clean(req.body?.message, 300);
      const linkUrl = clean(req.body?.linkUrl, 500);
      if (message.length < 3) return res.status(400).json({ error: "Enter an announcement." });
      const result = await pool.query(
        "INSERT INTO store_announcements(message, link_url) VALUES($1,$2) RETURNING *",
        [message, linkUrl || null]
      );
      res.status(201).json({ announcement: result.rows[0] });
    } catch (error) {
      console.error("Announcement create error:", error.message);
      res.status(500).json({ error: "Unable to create announcement." });
    }
  });

  router.get("/admin/products", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM store_products ORDER BY sort_order, name");
      res.json({ products: result.rows });
    } catch (error) {
      console.error("Product admin error:", error.message);
      res.status(500).json({ error: "Unable to load products." });
    }
  });

  router.patch("/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const active = req.body?.active === true;
      const availability = clean(req.body?.availability, 30).toUpperCase();
      if (!["AVAILABLE", "LIMITED", "UNAVAILABLE"].includes(availability)) return res.status(400).json({ error: "Invalid availability." });
      const result = await pool.query(
        "UPDATE store_products SET active=$1, availability=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
        [active, availability, id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Product not found." });
      res.json({ product: result.rows[0] });
    } catch (error) {
      console.error("Product update error:", error.message);
      res.status(500).json({ error: "Unable to update product." });
    }
  });

  router.get("/admin/coupons", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT id, code, discount_percent, active, expires_at, max_uses, uses FROM store_coupons ORDER BY created_at DESC LIMIT 200");
      res.json({ coupons: result.rows });
    } catch (error) {
      console.error("Coupon list error:", error.message);
      res.status(500).json({ error: "Unable to load coupons." });
    }
  });

  router.post("/admin/coupons", requireAdmin, async (req, res) => {
    try {
      const code = clean(req.body?.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      const discount = Number(req.body?.discountPercent);
      const maxUses = req.body?.maxUses == null || req.body.maxUses === "" ? null : Number(req.body.maxUses);
      if (!code || !Number.isInteger(discount) || discount < 1 || discount > 50 || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))) {
        return res.status(400).json({ error: "Enter a code, a discount from 1–50%, and a valid optional use limit." });
      }
      const result = await pool.query(
        "INSERT INTO store_coupons(code, discount_percent, max_uses) VALUES($1,$2,$3) RETURNING id, code, discount_percent, active, max_uses, uses",
        [code, discount, maxUses]
      );
      res.status(201).json({ coupon: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: "That coupon code already exists." });
      console.error("Coupon create error:", error.message);
      res.status(500).json({ error: "Unable to create coupon." });
    }
  });

  router.get("/admin/gift-cards", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT id, code, value, balance, active, created_at FROM store_gift_cards ORDER BY created_at DESC LIMIT 200");
      res.json({ giftCards: result.rows });
    } catch (error) {
      console.error("Gift card list error:", error.message);
      res.status(500).json({ error: "Unable to load gift cards." });
    }
  });

  router.post("/admin/gift-cards", requireAdmin, async (req, res) => {
    try {
      const value = Number(req.body?.value);
      if (!Number.isFinite(value) || value < 1 || value > 5000) return res.status(400).json({ error: "Gift card value must be between GH₵1 and GH₵5,000." });
      const code = "BHD-" + cryptoRandomCode(12);
      const result = await pool.query(
        "INSERT INTO store_gift_cards(code, value, balance) VALUES($1,$2,$2) RETURNING code, value, balance, active",
        [code, value]
      );
      res.status(201).json({ giftCard: result.rows[0] });
    } catch (error) {
      console.error("Gift card create error:", error.message);
      res.status(500).json({ error: "Unable to create gift card." });
    }
  });

  return router;
};

function cryptoRandomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = require("crypto").randomBytes(length);
  return Array.from(bytes, byte => chars[byte % chars.length]).join("");
}
