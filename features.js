const express = require("express");

const axios = require("axios");

function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

async function sendSupportReplyEmail({ to, ticketReference, subject, reply, status }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Resend email settings are missing.");
  }
  await axios.post("https://api.resend.com/emails", {
    from: process.env.RESEND_FROM_EMAIL,
    to: [to],
    subject: "A reply has been added to your BHADEX PLUGS support ticket",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#222;">
        <h2 style="color:#d71920;">BHADEX PLUGS</h2>
        <h3>We have replied to your support ticket</h3>
        <p><strong>Ticket:</strong> ${escapeEmailHtml(ticketReference)}</p>
        <p><strong>Subject:</strong> ${escapeEmailHtml(subject)}</p>
        <p><strong>Status:</strong> ${escapeEmailHtml(status.replace(/_/g, " "))}</p>
        <p><strong>Our reply:</strong></p>
        <div style="white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px;">${escapeEmailHtml(reply)}</div>
        <p>Log in to your BHADEX PLUGS account to view your support ticket.</p>
      </div>
    `
  }, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
}

module.exports = function createFeatureRouter({ pool, requireCustomer, requireAdmin }) {
  const router = express.Router();

  const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  async function logAdminActivity(req, action, details) {
    try {
      await pool.query(
        "INSERT INTO admin_activity_log(actor, action, details) VALUES($1, $2, $3)",
        ["Admin", clean(action, 80), clean(details, 500)]
      );
    } catch (error) {
      console.error("Admin activity log error:", error.message);
    }
  }


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
      if (req.body?.consent !== true) return res.status(400).json({ error: "Please confirm that you want to receive email updates." });
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
  // Customer notification centre
  router.get("/customer/notifications", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      const result = await pool.query(
        `SELECT id, title, message, notification_type, reference, is_read, created_at
         FROM customer_notifications WHERE customer_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [customer.id]
      );
      const unread = result.rows.filter(item => !item.is_read).length;
      res.json({ notifications: result.rows, unread });
    } catch (error) {
      console.error("Customer notifications load error:", error.message);
      res.status(500).json({ error: "Unable to load notifications." });
    }
  });

  router.patch("/customer/notifications/read-all", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      await pool.query(
        "UPDATE customer_notifications SET is_read = TRUE WHERE customer_id = $1 AND is_read = FALSE",
        [customer.id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notifications read error:", error.message);
      res.status(500).json({ error: "Unable to update notifications." });
    }
  });

  router.patch("/customer/notifications/:id/read", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      const id = Number(req.params.id);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid notification." });
      const result = await pool.query(
        "UPDATE customer_notifications SET is_read = TRUE WHERE id = $1 AND customer_id = $2 RETURNING id",
        [id, customer.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Notification not found." });
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error.message);
      res.status(500).json({ error: "Unable to update notification." });
    }
  });

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
      if (!customer) return res.status(404).json({ error: "Customer account not found." });

      const [summary, history, reservations] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(points), 0)::int AS points,
                  COUNT(*) FILTER (WHERE points > 0 AND order_reference NOT LIKE 'REF-%')::int AS earned_orders
           FROM loyalty_ledger WHERE customer_id = $1`,
          [customer.id]
        ),
        pool.query(
          `SELECT order_reference, points, created_at
           FROM loyalty_ledger
           WHERE customer_id = $1
           ORDER BY created_at DESC
           LIMIT 50`,
          [customer.id]
        ),
        pool.query(
          `SELECT COALESCE(SUM(points), 0)::int AS reserved
           FROM loyalty_redemptions
           WHERE customer_id = $1 AND status = 'PENDING' AND expires_at > NOW()`,
          [customer.id]
        )
      ]);

      const totalPoints = Number(summary.rows[0].points || 0);
      const reservedPoints = Number(reservations.rows[0].reserved || 0);
      res.json({
        points: Math.max(0, totalPoints - reservedPoints),
        totalPoints,
        reservedPoints,
        earnedOrders: summary.rows[0].earned_orders,
        redemptionRate: 100,
        history: history.rows
      });
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
        if (updated.rows[0]?.referral_code) customer.referral_code = updated.rows[0].referral_code;
        else {
          const refreshed = await pool.query("SELECT referral_code FROM customers WHERE id=$1", [customer.id]);
          customer.referral_code = refreshed.rows[0]?.referral_code;
        }
      }
      const referrals = await pool.query(
        `SELECT r.id, r.status, r.points_awarded, r.created_at, r.rewarded_at,
                c.name AS referred_name
         FROM customer_referrals r
         JOIN customers c ON c.id = r.referred_customer_id
         WHERE r.referrer_customer_id = $1
         ORDER BY r.created_at DESC LIMIT 100`,
        [customer.id]
      );
      const total = referrals.rows.length;
      const rewarded = referrals.rows.filter(row => row.status === "REWARDED").length;
      res.json({
        referralCode: customer.referral_code,
        referralLink: "https://bhadex-plugs.onrender.com/register.html?ref=" + encodeURIComponent(customer.referral_code),
        totalReferrals: total,
        successfulReferrals: rewarded,
        pointsEarned: referrals.rows.reduce((sum, row) => sum + Number(row.points_awarded || 0), 0),
        rewardPoints: 100,
        referrals: referrals.rows
      });
    } catch (error) {
      console.error("Referral load error:", error.message);
      res.status(500).json({ error: "Unable to load your referral information." });
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

  router.get("/customer/reviews", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      const result = await pool.query(
        `SELECT o.reference, o.product, o.delivered_at
         FROM orders o
         LEFT JOIN product_reviews r ON r.order_reference = o.reference
         WHERE LOWER(o.customer_email) = LOWER($1)
           AND o.status = 'PAID'
           AND o.fulfillment_status = 'DELIVERED'
           AND r.id IS NULL
         ORDER BY o.delivered_at DESC NULLS LAST`,
        [customer.email]
      );
      res.json({ eligibleOrders: result.rows });
    } catch (error) {
      console.error("Customer review options error:", error.message);
      res.status(500).json({ error: "Unable to load eligible orders for reviews." });
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
      const inserted = await pool.query(
        `INSERT INTO product_reviews(customer_id, customer_email, order_reference, product, rating, review)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(order_reference) DO NOTHING
         RETURNING id`,
        [customer.id, customer.email, reference, order.rows[0].product, rating, review]
      );
      if (!inserted.rowCount) {
        return res.status(409).json({ error: "A review has already been submitted for this order." });
      }
      res.status(201).json({ success: true, message: "Your review has been submitted for approval." });
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
      const priority = clean(req.body?.priority, 10).toUpperCase() || "NORMAL";
      if (subject.length < 3 || message.length < 10) return res.status(400).json({ error: "Enter a subject and a message of at least 10 characters." });
      if (!["LOW", "NORMAL", "HIGH"].includes(priority)) return res.status(400).json({ error: "Choose a valid ticket priority." });
      const result = await pool.query(
        `INSERT INTO support_tickets(customer_id, customer_email, subject, message, order_reference, priority)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id, 'BHD-SUP-' || LPAD(id::text, 6, '0') AS ticket_reference,
                   status, priority, created_at`,
        [customer.id, customer.email, subject, message, reference || null, priority]
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
        `SELECT id, 'BHD-SUP-' || LPAD(id::text, 6, '0') AS ticket_reference,
                subject, message, order_reference, status, priority, admin_reply,
                created_at, updated_at
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

  // LIVE CUSTOMER SUPPORT CHAT
  router.get("/customer/chat", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      const conversation = await pool.query(
        `INSERT INTO live_chat_conversations(customer_id) VALUES($1)
         ON CONFLICT(customer_id) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [customer.id]
      );
      const conversationId = conversation.rows[0].id;
      await pool.query(
        "UPDATE live_chat_messages SET read_at = NOW() WHERE conversation_id = $1 AND sender = 'ADMIN' AND read_at IS NULL",
        [conversationId]
      );
      const messages = await pool.query(
        "SELECT id, sender, message, read_at, created_at FROM live_chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 300",
        [conversationId]
      );
      res.json({ conversationId, messages: messages.rows });
    } catch (error) {
      console.error("Customer live chat load error:", error.message);
      res.status(500).json({ error: "Unable to load live chat." });
    }
  });

  router.post("/customer/chat", requireCustomer, async (req, res) => {
    try {
      const customer = await customerEmail(req);
      if (!customer) return res.status(404).json({ error: "Customer account not found." });
      const message = clean(req.body?.message, 2000);
      if (!message) return res.status(400).json({ error: "Write a message before sending." });
      const conversation = await pool.query(
        `INSERT INTO live_chat_conversations(customer_id) VALUES($1)
         ON CONFLICT(customer_id) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [customer.id]
      );
      const conversationId = conversation.rows[0].id;
      const saved = await pool.query(
        "INSERT INTO live_chat_messages(conversation_id, sender, message) VALUES($1, 'CUSTOMER', $2) RETURNING id, sender, message, read_at, created_at",
        [conversationId, message]
      );
      await pool.query("UPDATE live_chat_conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
      res.status(201).json({ message: saved.rows[0] });
    } catch (error) {
      console.error("Customer live chat send error:", error.message);
      res.status(500).json({ error: "Unable to send your chat message." });
    }
  });

  router.get("/admin/chat/conversations", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT c.id, c.customer_id, cu.name AS customer_name, cu.email AS customer_email,
               c.updated_at,
               (SELECT COUNT(*)::int FROM live_chat_messages m
                WHERE m.conversation_id = c.id AND m.sender = 'CUSTOMER' AND m.read_at IS NULL) AS unread_count,
               (SELECT message FROM live_chat_messages m
                WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
        FROM live_chat_conversations c
        JOIN customers cu ON cu.id = c.customer_id
        ORDER BY c.updated_at DESC LIMIT 300
      `);
      res.json({ conversations: result.rows });
    } catch (error) {
      console.error("Admin chat list error:", error.message);
      res.status(500).json({ error: "Unable to load chat conversations." });
    }
  });

  router.get("/admin/chat/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid conversation." });
      const exists = await pool.query("SELECT id FROM live_chat_conversations WHERE id = $1", [id]);
      if (!exists.rows.length) return res.status(404).json({ error: "Conversation not found." });
      await pool.query(
        "UPDATE live_chat_messages SET read_at = NOW() WHERE conversation_id = $1 AND sender = 'CUSTOMER' AND read_at IS NULL",
        [id]
      );
      const messages = await pool.query(
        "SELECT id, sender, message, read_at, created_at FROM live_chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 300",
        [id]
      );
      res.json({ messages: messages.rows });
    } catch (error) {
      console.error("Admin chat history error:", error.message);
      res.status(500).json({ error: "Unable to load this conversation." });
    }
  });

  router.post("/admin/chat/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const message = clean(req.body?.message, 2000);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid conversation." });
      if (!message) return res.status(400).json({ error: "Write a reply before sending." });
      const saved = await pool.query(
        `INSERT INTO live_chat_messages(conversation_id, sender, message)
         SELECT id, 'ADMIN', $2 FROM live_chat_conversations WHERE id = $1
         RETURNING id, sender, message, read_at, created_at`,
        [id, message]
      );
      if (!saved.rows.length) return res.status(404).json({ error: "Conversation not found." });
      await pool.query("UPDATE live_chat_conversations SET updated_at = NOW() WHERE id = $1", [id]);
      res.status(201).json({ message: saved.rows[0] });
    } catch (error) {
      console.error("Admin chat reply error:", error.message);
      res.status(500).json({ error: "Unable to send your reply." });
    }
  });

  // Admin tools
  router.get("/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const [summary, daily, topProducts, fulfillment] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::int AS total_orders,
                 COUNT(*) FILTER (WHERE status='PAID')::int AS paid_orders,
                 COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0)::numeric(12,2) AS revenue,
                 COUNT(DISTINCT LOWER(customer_email))::int AS customers,
                 COUNT(*) FILTER (WHERE fulfillment_status='DELIVERED')::int AS delivered_orders
          FROM orders WHERE created_at >= NOW() - INTERVAL '29 days'
        `),
        pool.query(`
          SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
                 COUNT(*) FILTER (WHERE status='PAID')::int AS orders,
                 COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0)::numeric(12,2) AS revenue
          FROM orders WHERE created_at >= NOW() - INTERVAL '29 days'
          GROUP BY created_at::date ORDER BY created_at::date
        `),
        pool.query(`
          SELECT product, COUNT(*)::int AS orders,
                 COALESCE(SUM(amount),0)::numeric(12,2) AS revenue
          FROM orders WHERE status='PAID' AND created_at >= NOW() - INTERVAL '29 days'
          GROUP BY product ORDER BY orders DESC, revenue DESC LIMIT 5
        `),
        pool.query(`
          SELECT fulfillment_status AS status, COUNT(*)::int AS count
          FROM orders WHERE created_at >= NOW() - INTERVAL '29 days'
          GROUP BY fulfillment_status ORDER BY count DESC
        `)
      ]);
      res.json({ periodDays: 30, summary: summary.rows[0], daily: daily.rows,
        topProducts: topProducts.rows, fulfillment: fulfillment.rows });
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

  router.get("/admin/referrals", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.id, r.status, r.points_awarded, r.referral_code,
                r.created_at, r.rewarded_at, r.qualifying_order_reference,
                referrer.name AS referrer_name, referrer.email AS referrer_email,
                referred.name AS referred_name, referred.email AS referred_email
         FROM customer_referrals r
         JOIN customers referrer ON referrer.id = r.referrer_customer_id
         JOIN customers referred ON referred.id = r.referred_customer_id
         ORDER BY r.created_at DESC LIMIT 500`
      );
      res.json({ referrals: result.rows });
    } catch (error) {
      console.error("Admin referrals load error:", error.message);
      res.status(500).json({ error: "Unable to load referral records." });
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
      const result = await pool.query(`SELECT *, 'BHD-SUP-' || LPAD(id::text, 6, '0') AS ticket_reference
        FROM support_tickets ORDER BY created_at DESC LIMIT 300`);
      res.json({ tickets: result.rows });
    } catch (error) {
      console.error("Admin support error:", error.message);
      res.status(500).json({ error: "Unable to load support tickets." });
    }
  });

  router.patch("/admin/support/:id", requireAdmin, async (req, res) => {
    try {
      const status = clean(req.body?.status, 20).toUpperCase();
      const priority = clean(req.body?.priority, 10).toUpperCase() || "NORMAL";
      const reply = clean(req.body?.reply, 3000);
      if (!["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) return res.status(400).json({ error: "Invalid ticket status." });
      if (!["LOW", "NORMAL", "HIGH"].includes(priority)) return res.status(400).json({ error: "Invalid ticket priority." });
      const ticketId = Number(req.params.id);
      if (!Number.isSafeInteger(ticketId) || ticketId < 1) {
        return res.status(400).json({ error: "Invalid ticket reference." });
      }
      const existing = await pool.query(
        "SELECT id, customer_email, subject, admin_reply FROM support_tickets WHERE id=$1 LIMIT 1",
        [ticketId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: "Ticket not found." });

      const result = await pool.query(
        "UPDATE support_tickets SET status=$1, priority=$2, admin_reply=$3, updated_at=NOW() WHERE id=$4 RETURNING id",
        [status, priority, reply || null, ticketId]
      );

      let emailSent = false;
      let emailMessage = "";
      const previousReply = String(existing.rows[0].admin_reply || "").trim();
      const recipientEmail = String(existing.rows[0].customer_email || "").trim();

      if (!reply) {
        emailMessage = "No reply text was provided, so no email was attempted.";
      } else if (reply === previousReply) {
        emailMessage = "The reply is unchanged from the previously saved reply, so no new email was sent. Edit the reply slightly to retry.";
      } else if (!validEmail(recipientEmail)) {
        emailMessage = "The ticket's customer email address is missing or invalid.";
      } else {
        try {
          const emailResult = await sendSupportReplyEmail({
            to: recipientEmail,
            ticketReference: "BHD-SUP-" + String(ticketId).padStart(6, "0"),
            subject: existing.rows[0].subject,
            reply,
            status
          });
          emailSent = true;
          emailMessage = "Resend accepted the notification request. Check the recipient inbox and spam folder.";
          console.log("Support reply email accepted by Resend for ticket:", ticketId, emailResult?.data?.id || "ID unavailable");
        } catch (emailError) {
          const providerMessage = emailError.response?.data?.message || emailError.response?.data?.error || emailError.message || "Unknown email error";
          emailMessage = "Resend could not send the notification: " + String(providerMessage).slice(0, 500);
          console.error("Support reply email error:", emailError.response?.data || emailError.message);
        }
      }
      res.json({ success: true, emailSent, emailMessage });
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
      const result = await pool.query("SELECT id, email, created_at FROM newsletter_subscribers WHERE active=TRUE ORDER BY created_at DESC LIMIT 1000");
      res.json({ subscribers: result.rows });
    } catch (error) {
      console.error("Newsletter admin error:", error.message);
      res.status(500).json({ error: "Unable to load subscribers." });
    }
  });

  router.delete("/admin/newsletter/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid subscriber." });
      const result = await pool.query(
        "UPDATE newsletter_subscribers SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id",
        [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Subscriber not found." });
      res.json({ success: true, message: "Subscriber removed." });
    } catch (error) {
      console.error("Newsletter removal error:", error.message);
      res.status(500).json({ error: "Unable to remove subscriber." });
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
      await logAdminActivity(req, "Announcement created", message);
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
      await logAdminActivity(req, "Product updated", result.rows[0].name + " · " + availability + " · " + (active ? "Active" : "Hidden"));
      res.json({ product: result.rows[0] });
    } catch (error) {
      console.error("Product update error:", error.message);
      res.status(500).json({ error: "Unable to update product." });
    }
  });

  router.post("/coupons/validate", async (req, res) => {
    try {
      const code = clean(req.body?.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (!code) return res.status(400).json({ error: "Enter a coupon code." });
      const result = await pool.query(
        `SELECT discount_percent
         FROM store_coupons
         WHERE code = $1 AND active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR uses < max_uses)
         LIMIT 1`,
        [code]
      );
      if (!result.rows.length) {
        return res.status(400).json({ error: "This coupon is invalid, expired or has reached its usage limit." });
      }
      res.json({ valid: true, code, discountPercent: Number(result.rows[0].discount_percent) });
    } catch (error) {
      console.error("Coupon validation error:", error.message);
      res.status(500).json({ error: "Unable to validate coupon right now." });
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
      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
      if (!code || !Number.isInteger(discount) || discount < 1 || discount > 50 ||
          (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) ||
          (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()))) {
        return res.status(400).json({ error: "Enter a code, a discount from 1–50%, and valid optional limits." });
      }
      const result = await pool.query(
        "INSERT INTO store_coupons(code, discount_percent, max_uses, expires_at) VALUES($1,$2,$3,$4) RETURNING id, code, discount_percent, active, expires_at, max_uses, uses",
        [code, discount, maxUses, expiresAt]
      );
      await logAdminActivity(req, "Coupon created", code + " · " + discount + "%");
      res.status(201).json({ coupon: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: "That coupon code already exists." });
      console.error("Coupon create error:", error.message);
      res.status(500).json({ error: "Unable to create coupon." });
    }
  });

  router.patch("/admin/coupons/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.active !== "boolean") {
        return res.status(400).json({ error: "Invalid coupon update." });
      }
      const result = await pool.query(
        "UPDATE store_coupons SET active = $1 WHERE id = $2 RETURNING id, code, discount_percent, active, expires_at, max_uses, uses",
        [req.body.active, id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Coupon not found." });
      await logAdminActivity(req, "Coupon status changed", result.rows[0].code + " · " + (req.body.active ? "Active" : "Inactive"));
      res.json({ coupon: result.rows[0] });
    } catch (error) {
      console.error("Coupon update error:", error.message);
      res.status(500).json({ error: "Unable to update coupon." });
    }
  });


  // Admin announcement management
  router.get("/admin/announcements", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, message, link_url, active, created_at FROM store_announcements ORDER BY created_at DESC LIMIT 50"
      );
      res.json({ announcements: result.rows });
    } catch (error) {
      console.error("Announcement list error:", error.message);
      res.status(500).json({ error: "Unable to load announcements." });
    }
  });

  router.post("/admin/announcements", requireAdmin, async (req, res) => {
    try {
      const message = clean(req.body?.message, 240);
      const linkUrl = clean(req.body?.linkUrl, 500) || null;
      const active = req.body?.active !== false;
      if (!message) return res.status(400).json({ error: "Enter an announcement message." });
      if (linkUrl) {
        try {
          const parsed = new URL(linkUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
        } catch {
          return res.status(400).json({ error: "Enter a valid http or https link." });
        }
      }
      if (active) await pool.query("UPDATE store_announcements SET active = FALSE WHERE active = TRUE");
      const result = await pool.query(
        "INSERT INTO store_announcements(message, link_url, active) VALUES($1,$2,$3) RETURNING id, message, link_url, active, created_at",
        [message, linkUrl, active]
      );
      res.status(201).json({ announcement: result.rows[0] });
    } catch (error) {
      console.error("Announcement create error:", error.message);
      res.status(500).json({ error: "Unable to create announcement." });
    }
  });

  router.patch("/admin/announcements/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid announcement." });
      const current = await pool.query("SELECT id, message, link_url, active FROM store_announcements WHERE id = $1", [id]);
      if (!current.rows.length) return res.status(404).json({ error: "Announcement not found." });
      const old = current.rows[0];
      const message = req.body?.message === undefined ? old.message : clean(req.body.message, 240);
      const linkUrl = req.body?.linkUrl === undefined ? old.link_url : (clean(req.body.linkUrl, 500) || null);
      const active = typeof req.body?.active === "boolean" ? req.body.active : old.active;
      if (!message) return res.status(400).json({ error: "Enter an announcement message." });
      if (linkUrl) {
        try {
          const parsed = new URL(linkUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
        } catch {
          return res.status(400).json({ error: "Enter a valid http or https link." });
        }
      }
      if (active) await pool.query("UPDATE store_announcements SET active = FALSE WHERE active = TRUE AND id <> $1", [id]);
      const result = await pool.query(
        "UPDATE store_announcements SET message = $1, link_url = $2, active = $3 WHERE id = $4 RETURNING id, message, link_url, active, created_at",
        [message, linkUrl, active, id]
      );
      await logAdminActivity(req, "Announcement updated", message + " · " + (active ? "Published" : "Hidden"));
      res.json({ announcement: result.rows[0] });
    } catch (error) {
      console.error("Announcement update error:", error.message);
      res.status(500).json({ error: "Unable to update announcement." });
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

  // Gift cards are currently TEST-ONLY: inactive by default and not redeemable at checkout.
  router.post("/admin/gift-cards", requireAdmin, async (req, res) => {
    try {
      const value = Number(req.body?.value);
      if (![50, 100, 200].includes(value)) {
        return res.status(400).json({ error: "Choose a test gift card value of GH₵50, GH₵100 or GH₵200." });
      }
      const code = "BHD-TEST-" + cryptoRandomCode(12);
      const result = await pool.query(
        "INSERT INTO store_gift_cards(code, value, balance, active) VALUES($1,$2,$2,FALSE) RETURNING code, value, balance, active",
        [code, value]
      );
      res.status(201).json({ giftCard: result.rows[0], testOnly: true });
    } catch (error) {
      console.error("Gift card create error:", error.message);
      res.status(500).json({ error: "Unable to create test gift card." });
    }
  });

  // Admin activity history
  router.get("/admin/activity", requireAdmin, async (req, res) => {
    try {
      const search = clean(req.query.search, 100);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const result = await pool.query(
        `SELECT id, actor, action, details, created_at
         FROM admin_activity_log
         WHERE ($1 = '' OR action ILIKE $2 OR details ILIKE $2)
         ORDER BY created_at DESC
         LIMIT $3`,
        [search, "%" + search + "%", limit]
      );
      res.json({ activities: result.rows });
    } catch (error) {
      console.error("Admin activity load error:", error.message);
      res.status(500).json({ error: "Unable to load activity history." });
    }
  });


  // SUBSCRIPTION BUNDLES: informational offers only; checkout remains product-by-product.
  router.get("/bundles", async (req, res) => {
    res.json({ bundles: [
      { id:"creator", name:"Creator Bundle", products:["Canva Pro","ChatGPT Plus"], description:"Creative design and AI productivity tools.", note:"Each subscription is ordered separately." },
      { id:"entertainment", name:"Entertainment Bundle", products:["Netflix","Spotify Premium"], description:"Video streaming and music in one collection.", note:"Availability and package terms apply separately." },
      { id:"complete", name:"Digital Essentials", products:["YouTube Premium","Google One","Microsoft 365"], description:"Media, cloud storage and productivity essentials.", note:"Each subscription is ordered separately." }
    ]});
  });

  // CUSTOMER ORDER CANCELLATION REQUESTS. This never cancels or refunds a payment automatically.
  router.get("/customer/cancellations", requireCustomer, async (req,res) => {
    try {
      const c=await customerEmail(req);
      const result=await pool.query(`SELECT r.id,r.order_reference,r.reason,r.status,r.admin_note,r.created_at,r.updated_at
        FROM order_cancellation_requests r WHERE r.customer_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[c.id]);
      res.json({requests:result.rows});
    } catch(error){ console.error("Cancellation list error:",error.message); res.status(500).json({error:"Unable to load cancellation requests."}); }
  });
  router.post("/customer/cancellations", requireCustomer, async (req,res) => {
    try {
      const c=await customerEmail(req), reference=clean(req.body?.reference,100), reason=clean(req.body?.reason,1000);
      if(!reference || reason.length<10) return res.status(400).json({error:"Enter an order reference and a reason of at least 10 characters."});
      const order=await pool.query(`SELECT reference,fulfillment_status FROM orders
        WHERE reference=$1 AND status='PAID' AND LOWER(customer_email)=LOWER($2) LIMIT 1`,[reference,c.email]);
      if(!order.rows.length) return res.status(404).json({error:"We could not find a paid order matching your account."});
      if(order.rows[0].fulfillment_status==='DELIVERED' || order.rows[0].fulfillment_status==='CANCELLED')
        return res.status(400).json({error:"This order is no longer eligible for a cancellation request."});
      const saved=await pool.query(`INSERT INTO order_cancellation_requests(order_reference,customer_id,customer_email,reason)
        VALUES($1,$2,$3,$4) ON CONFLICT(order_reference) DO NOTHING RETURNING id,status`,[reference,c.id,c.email,reason]);
      if(!saved.rows.length) return res.status(409).json({error:"A cancellation request already exists for this order."});
      res.status(201).json({request:saved.rows[0],message:"Request submitted for review. Your order has not been cancelled."});
    } catch(error){console.error("Cancellation request error:",error.message);res.status(500).json({error:"Unable to submit your request."});}
  });

  // ADMIN CANCELLATION QUEUE
  router.get("/admin/cancellations", requireAdmin, async(req,res)=>{
    try{const r=await pool.query(`SELECT c.*,o.product,o.package,o.fulfillment_status
      FROM order_cancellation_requests c JOIN orders o ON o.reference=c.order_reference
      ORDER BY c.created_at DESC LIMIT 300`);res.json({requests:r.rows});}
    catch(error){console.error("Admin cancellation error:",error.message);res.status(500).json({error:"Unable to load requests."});}
  });
  router.patch("/admin/cancellations/:id", requireAdmin, async(req,res)=>{
    try{
      const status=clean(req.body?.status,20).toUpperCase(), note=clean(req.body?.note,1000), id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1||!["APPROVED","DECLINED"].includes(status)) return res.status(400).json({error:"Invalid request update."});
      const r=await pool.query(`UPDATE order_cancellation_requests SET status=$1,admin_note=$2,updated_at=NOW()
        WHERE id=$3 AND status='PENDING' RETURNING order_reference`,[status,note,id]);
      if(!r.rows.length)return res.status(404).json({error:"Pending request not found."});
      await logAdminActivity(req,"Cancellation request reviewed",r.rows[0].order_reference+" · "+status);
      res.json({success:true,message:"Request reviewed. Any actual order/refund decision must be handled separately."});
    }catch(error){console.error("Cancellation update error:",error.message);res.status(500).json({error:"Unable to update request."});}
  });

  // BACK-IN-STOCK ALERT SIGNUPS
  router.post("/stock-alerts", async(req,res)=>{
    try{
      const product=clean(req.body?.product,100),email=clean(req.body?.email,255).toLowerCase();
      if(!product||!validEmail(email))return res.status(400).json({error:"Enter a product and valid email address."});
      const known=await pool.query("SELECT name,availability FROM store_products WHERE name=$1 AND active=TRUE LIMIT 1",[product]);
      if(!known.rows.length)return res.status(404).json({error:"Product not found."});
      if(known.rows[0].availability!=="UNAVAILABLE")return res.status(400).json({error:"This product is currently listed as available."});
      await pool.query("INSERT INTO product_stock_subscribers(product_name,email) VALUES($1,$2) ON CONFLICT DO NOTHING",[product,email]);
      res.status(201).json({success:true,message:"We'll notify this email if availability changes. You can ask support to remove it."});
    }catch(error){console.error("Stock alert signup error:",error.message);res.status(500).json({error:"Unable to save your alert."});}
  });
  router.get("/admin/stock-alerts", requireAdmin, async(req,res)=>{
    try{const r=await pool.query("SELECT id,product_name,email,created_at FROM product_stock_subscribers ORDER BY created_at DESC LIMIT 500");res.json({alerts:r.rows});}
    catch(error){res.status(500).json({error:"Unable to load stock alerts."});}
  });

  // PRODUCT QUESTIONS: public submission, admin moderation and answers.
  router.get("/questions", async(req,res)=>{
    try{const product=clean(req.query.product,100);const r=await pool.query(`SELECT id,product_name,customer_name,question,answer,answered_at
      FROM product_questions WHERE status='ANSWERED' AND ($1='' OR product_name=$1)
      ORDER BY answered_at DESC LIMIT 100`,[product]);res.json({questions:r.rows});}
    catch(error){res.status(500).json({error:"Unable to load product questions."});}
  });
  router.post("/questions", async(req,res)=>{
    try{
      const product=clean(req.body?.product,100),name=clean(req.body?.name,100),email=clean(req.body?.email,255).toLowerCase(),question=clean(req.body?.question,1500);
      if(!product||name.length<2||!validEmail(email)||question.length<10)return res.status(400).json({error:"Enter your name, valid email and a question of at least 10 characters."});
      const exists=await pool.query("SELECT 1 FROM store_products WHERE name=$1 AND active=TRUE",[product]);if(!exists.rows.length)return res.status(404).json({error:"Product not found."});
      await pool.query("INSERT INTO product_questions(product_name,customer_name,customer_email,question) VALUES($1,$2,$3,$4)",[product,name,email,question]);
      res.status(201).json({success:true,message:"Question submitted for review. It will appear publicly only after an approved answer."});
    }catch(error){console.error("Question submit error:",error.message);res.status(500).json({error:"Unable to submit your question."});}
  });
  router.get("/admin/questions", requireAdmin, async(req,res)=>{
    try{const r=await pool.query("SELECT * FROM product_questions ORDER BY created_at DESC LIMIT 300");res.json({questions:r.rows});}
    catch(error){res.status(500).json({error:"Unable to load questions."});}
  });
  router.patch("/admin/questions/:id", requireAdmin, async(req,res)=>{
    try{
      const id=Number(req.params.id),status=clean(req.body?.status,20).toUpperCase(),answer=clean(req.body?.answer,2000);
      if(!Number.isSafeInteger(id)||id<1||!["ANSWERED","REJECTED"].includes(status)||(status==="ANSWERED"&&answer.length<3))return res.status(400).json({error:"Provide a valid answer or rejection."});
      const r=await pool.query("UPDATE product_questions SET status=$1,answer=$2,answered_at=CASE WHEN $1='ANSWERED' THEN NOW() ELSE NULL END WHERE id=$3 RETURNING product_name",[status,answer,id]);
      if(!r.rows.length)return res.status(404).json({error:"Question not found."});
      await logAdminActivity(req,"Product question moderated",r.rows[0].product_name+" · "+status);res.json({success:true});
    }catch(error){res.status(500).json({error:"Unable to update question."});}
  });

  // MAINTENANCE SWITCH
  router.get("/maintenance", async(req,res)=>{
    try{const r=await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='maintenance_mode'");res.json({maintenance:r.rows[0]?.setting_value==="true"});}
    catch(error){res.status(500).json({error:"Unable to read store status."});}
  });
  router.get("/admin/maintenance", requireAdmin, async(req,res)=>{
    try{const r=await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='maintenance_mode'");res.json({maintenance:r.rows[0]?.setting_value==="true"});}
    catch(error){res.status(500).json({error:"Unable to read maintenance status."});}
  });
  router.patch("/admin/maintenance", requireAdmin, async(req,res)=>{
    try{if(typeof req.body?.maintenance!=="boolean")return res.status(400).json({error:"Choose an on/off value."});
      await pool.query("UPDATE store_settings SET setting_value=$1,updated_at=NOW() WHERE setting_key='maintenance_mode'",[String(req.body.maintenance)]);
      await logAdminActivity(req,"Maintenance mode changed",req.body.maintenance?"Enabled":"Disabled");
      res.json({success:true,maintenance:req.body.maintenance});
    }catch(error){res.status(500).json({error:"Unable to update maintenance mode."});}
  });

  // ADMIN BULK FULFILMENT: status changes only; never marks a payment as paid.
  router.post("/admin/orders/bulk-status", requireAdmin, async(req,res)=>{
    const refs=Array.isArray(req.body?.references)?[...new Set(req.body.references.map(x=>clean(x,100)).filter(Boolean))].slice(0,50):[];
    const status=clean(req.body?.fulfillmentStatus,30).toUpperCase();
    if(!refs.length||!["PENDING","PROCESSING","DELIVERED","CANCELLED"].includes(status))return res.status(400).json({error:"Select up to 50 orders and a valid delivery status."});
    try{
      const result=await pool.query(`UPDATE orders SET fulfillment_status=$1,fulfillment_updated_at=NOW(),
        delivered_at=CASE WHEN $1='DELIVERED' THEN NOW() ELSE delivered_at END,updated_at=NOW()
        WHERE reference=ANY($2::text[]) AND status='PAID' RETURNING reference`,[status,refs]);
      await logAdminActivity(req,"Bulk order status update",result.rows.length+" orders · "+status);
      res.json({success:true,updated:result.rows.map(x=>x.reference),count:result.rowCount});
    }catch(error){console.error("Bulk order update error:",error.message);res.status(500).json({error:"Unable to update selected orders."});}
  });

  // CSV-ready reporting endpoint.
  router.get("/admin/reports", requireAdmin, async(req,res)=>{
    try{
      const from=clean(req.query.from,10),to=clean(req.query.to,10);
      const r=await pool.query(`SELECT reference,customer_email,product,package,amount,currency,status,fulfillment_status,created_at,delivered_at
        FROM orders WHERE ($1='' OR created_at::date >= $1::date) AND ($2='' OR created_at::date <= $2::date)
        ORDER BY created_at DESC LIMIT 5000`,[from,to]);
      res.json({orders:r.rows});
    }catch(error){res.status(500).json({error:"Unable to generate report."});}
  });

  // Admin security overview: active session count and recent audit events, without exposing session IDs.
  router.get("/admin/security", requireAdmin, async(req,res)=>{
    try{
      const [sessions,events]=await Promise.all([
        pool.query("SELECT COUNT(*)::int AS active_sessions FROM admin_sessions WHERE expire > NOW()"),
        pool.query("SELECT id,action,details,created_at FROM admin_activity_log ORDER BY created_at DESC LIMIT 50")
      ]);
      res.json({activeSessions:sessions.rows[0]?.active_sessions||0,events:events.rows});
    }catch(error){console.error("Security dashboard error:",error.message);res.status(500).json({error:"Security overview is temporarily unavailable."});}
  });

  return router;
};

function cryptoRandomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = require("crypto").randomBytes(length);
  return Array.from(bytes, byte => chars[byte % chars.length]).join("");
}
