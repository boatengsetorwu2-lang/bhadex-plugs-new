
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { pool, initializeDatabase } = require("./database");

const app = express();
const PORT = process.env.PORT || 10000;

app.set("trust proxy", 1);

const fulfillmentStatuses = [
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "CANCELLED"
];

// Paystack webhook must receive the original request body.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];

      const expectedSignature = crypto
        .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "")
        .update(req.body)
        .digest("hex");

      if (
        !signature ||
        !crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        )
      ) {
        return res.sendStatus(401);
      }

      const event = JSON.parse(req.body.toString());

      if (event.event !== "charge.success") {
        return res.sendStatus(200);
      }

      const reference = event.data.reference;

      const verification = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      const payment = verification.data.data;

      if (
        payment.status !== "success" ||
        payment.currency !== "GHS" ||
        payment.amount !== event.data.amount
      ) {
        return res.sendStatus(400);
      }

      const metadata = payment.metadata || {};
      const product = metadata.product;
      const packageName = metadata.package;

      if (!product || !packageName) {
        return res.sendStatus(400);
      }

      await pool.query(
        `INSERT INTO orders (
          reference,
          customer_email,
          product,
          package,
          amount,
          currency,
          status,
          fulfillment_status
        )
        VALUES ($1, $2, $3, $4, $5, 'GHS', 'PAID', 'PENDING')
        ON CONFLICT (reference) DO NOTHING`,
        [
          reference,
          payment.customer?.email || null,
          product,
          packageName,
          payment.amount / 100
        ]
      );

      return res.sendStatus(200);

    } catch (error) {
      console.error("Paystack webhook error:", error.message);
      return res.sendStatus(500);
    }
  }
);

app.use(express.json({ limit: "10kb" }));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.static(path.join(__dirname, "public")));

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  throw new Error("ADMIN_PASSWORD and SESSION_SECRET must be configured.");
}

if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters.");
}

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "admin_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 4 * 60 * 60 * 1000
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

function safePasswordCompare(input, correct) {
  const inputHash = crypto
    .createHash("sha256")
    .update(input)
    .digest();

  const correctHash = crypto
    .createHash("sha256")
    .update(correct)
    .digest();

  return crypto.timingSafeEqual(inputHash, correctHash);
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({
      error: "Please log in again."
    });
  }

  next();
}

// Admin login
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    const password = req.body?.password;

    if (
      typeof password !== "string" ||
      !safePasswordCompare(password, process.env.ADMIN_PASSWORD)
    ) {
      return res.status(401).json({
        error: "Incorrect admin password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session error:", error.message);
        return res.status(500).json({
          error: "Unable to create session."
        });
      }

      req.session.isAdmin = true;

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            error: "Unable to save session."
          });
        }

        return res.json({
          success: true,
          message: "Login successful."
        });
      });
    });

  } catch (error) {
    console.error("Admin login error:", error.message);
    return res.status(500).json({
      error: "Login failed."
    });
  }
});

// Admin logout
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.json({ success: true });
  });
});

// Customer order tracking
app.get("/api/orders/track/:reference", async (req, res) => {
  try {
    const reference = String(req.params.reference || "").trim();

    if (!reference || reference.length > 100) {
      return res.status(400).json({
        error: "Please enter a valid order reference."
      });
    }

    const result = await pool.query(
      `SELECT
        reference,
        product,
        package,
        amount,
        currency,
        status,
        fulfillment_status,
        created_at,
        delivered_at
       FROM orders
       WHERE reference = $1
       LIMIT 1`,
      [reference]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Order not found. Please check your reference."
      });
    }

    const order = result.rows[0];

    return res.json({
      order: {
        reference: order.reference,
        product: order.product,
        package: order.package,
        amount: Number(order.amount),
        currency: order.currency,
        paymentStatus: order.status,
        deliveryStatus: order.fulfillment_status,
        orderDate: order.created_at,
        deliveredAt: order.delivered_at
      }
    });

  } catch (error) {
    console.error("Order tracking error:", error.message);

    return res.status(500).json({
      error: "Unable to check this order right now."
    });
  }
});

// Admin order list and statistics
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "").toUpperCase();
    const search = String(req.query.search || "").trim().slice(0, 100);

    const conditions = [];
    const values = [];

    if (status && fulfillmentStatuses.includes(status)) {
      values.push(status);
      conditions.push(`fulfillment_status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      const index = values.length;

      conditions.push(
        `(reference ILIKE $${index}
          OR customer_email ILIKE $${index}
          OR product ILIKE $${index})`
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const ordersResult = await pool.query(
      `SELECT *
       FROM orders
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      values
    );

    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalOrders",
        COUNT(*) FILTER (WHERE status = 'PAID')::int AS "paidOrders",
        COALESCE(
          SUM(amount) FILTER (WHERE status = 'PAID'), 0
        ) AS "totalRevenue",
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'PENDING'
        )::int AS "pendingOrders",
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'PROCESSING'
        )::int AS "processingOrders",
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'DELIVERED'
        )::int AS "deliveredOrders",
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'CANCELLED'
        )::int AS "cancelledOrders"
      FROM orders
    `);

    return res.json({
      orders: ordersResult.rows,
      stats: statsResult.rows[0]
    });

  } catch (error) {
    console.error("Admin orders error:", error.message);
    return res.status(500).json({
      error: "Unable to load orders."
    });
  }
});

// Admin delivery status update
app.patch(
  "/api/admin/orders/:reference/status",
  requireAdmin,
  async (req, res) => {
    try {
      const reference = String(req.params.reference || "").trim();
      const fulfillmentStatus = String(
        req.body?.fulfillmentStatus || ""
      ).toUpperCase();

      if (!reference || reference.length > 100) {
        return res.status(400).json({
          error: "Invalid order reference."
        });
      }

      if (!fulfillmentStatuses.includes(fulfillmentStatus)) {
        return res.status(400).json({
          error: "Invalid delivery status."
        });
      }

      const result = await pool.query(
        `UPDATE orders
         SET
           fulfillment_status = $1,
           delivered_at = CASE
             WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, NOW())
             ELSE delivered_at
           END,
           fulfillment_updated_at = NOW(),
           updated_at = NOW()
         WHERE reference = $2
           AND status = 'PAID'
         RETURNING reference, fulfillment_status, delivered_at`,
        [fulfillmentStatus, reference]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Paid order not found."
        });
      }

      return res.json({
        success: true,
        order: result.rows[0]
      });

    } catch (error) {
      console.error("Delivery update error:", error.message);
      return res.status(500).json({
        error: "Unable to update delivery status."
      });
    }
  }
);

// Initialize Paystack payment
app.post("/api/payments/initialize", async (req, res) => {
  try {
    const { email, amount, product, package: packageName } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.includes("@") ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof product !== "string" ||
      typeof packageName !== "string"
    ) {
      return res.status(400).json({
        error: "Invalid payment details."
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amount * 100),
        currency: "GHS",
        callback_url: `${process.env.BASE_URL}/payment.html`,
        metadata: {
          product,
          package: packageName
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json(response.data.data);

  } catch (error) {
    console.error(
      "Payment initialization error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      error: "Unable to initialize payment."
    });
  }
});

// Verify Paystack payment
app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    const reference = String(req.params.reference || "");

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const payment = response.data.data;

    if (
      payment.status !== "success" ||
      payment.currency !== "GHS"
    ) {
      return res.status(400).json({
        error: "Payment has not been confirmed."
      });
    }

    const metadata = payment.metadata || {};

    if (!metadata.product || !metadata.package) {
      return res.status(400).json({
        error: "Payment details are incomplete."
      });
    }

    await pool.query(
      `INSERT INTO orders (
        reference,
        customer_email,
        product,
        package,
        amount,
        currency,
        status,
        fulfillment_status
      )
      VALUES ($1, $2, $3, $4, $5, 'GHS', 'PAID', 'PENDING')
      ON CONFLICT (reference) DO NOTHING`,
      [
        payment.reference,
        payment.customer?.email || null,
        metadata.product,
        metadata.package,
        payment.amount / 100
      ]
    );

    return res.json({
      success: true,
      reference: payment.reference,
      status: payment.status
    });

  } catch (error) {
    console.error("Payment verification error:", error.message);

    return res.status(500).json({
      error: "Unable to verify payment."
    });
  }
});

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`BHADEX PLUGS server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

startServer();
