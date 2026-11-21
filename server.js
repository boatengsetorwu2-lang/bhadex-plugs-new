
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const {
  pool,
  initializeDatabase
} = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

app.set("trust proxy", 1);

// ==================================================
// PRODUCTS
// ==================================================

const products = {
  "Netflix": [35, 90, 170, 320, 450],
  "YouTube Premium": [20, 55, 100, 190, 260],
  "Spotify Premium": [18, 50, 95, 180, 250],
  "Canva": [25, 70, 135, 250, 350],
  "ChatGPT": [45, 125, 240, 460, 620],
  "Microsoft 365": [30, 85, 160, 300, 420],
  "Disney+": [25, 70, 135, 250, 350],
  "Prime Video": [20, 55, 105, 200, 280],
  "Telegram Premium": [20, 55, 105, 200, 280],
  "Google One": [15, 40, 75, 140, 200]
};

const packageNames = [
  "Basic",
  "Standard",
  "Premium",
  "Advanced",
  "Ultimate"
];

const fulfillmentStatuses = [
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "CANCELLED"
];

// ==================================================
// SECURITY
// ==================================================

app.use(helmet({
  contentSecurityPolicy: false
}));

// ==================================================
// PAYSTACK WEBHOOK
// Must come before express.json()
// ==================================================

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];

      if (
        !PAYSTACK_SECRET_KEY ||
        typeof signature !== "string" ||
        !Buffer.isBuffer(req.body)
      ) {
        return res.sendStatus(401);
      }

      const expectedSignature = crypto
        .createHmac("sha512", PAYSTACK_SECRET_KEY)
        .update(req.body)
        .digest("hex");

      const received = Buffer.from(signature, "hex");
      const expected = Buffer.from(expectedSignature, "hex");

      if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
      ) {
        return res.sendStatus(401);
      }

      const event = JSON.parse(req.body.toString("utf8"));

      if (event.event !== "charge.success") {
        return res.sendStatus(200);
      }

      const reference = event.data?.reference;

      if (
        typeof reference !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(reference)
      ) {
        return res.sendStatus(400);
      }

      const verification = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
          },
          timeout: 15000
        }
      );

      const payment = verification.data?.data;

      if (
        !verification.data?.status ||
        !payment ||
        payment.status !== "success" ||
        payment.reference !== reference ||
        payment.currency !== "GHS"
      ) {
        return res.sendStatus(400);
      }

      const product = payment.metadata?.bhadex_product;

      const packageIndex = Number(
        payment.metadata?.bhadex_package_index
      );

      const expectedPackage = packageNames[packageIndex];
      const expectedPrice = products[product]?.[packageIndex];

      const validOrder =
        typeof expectedPrice === "number" &&
        Number.isInteger(packageIndex) &&
        packageIndex >= 0 &&
        packageIndex < packageNames.length &&
        payment.metadata?.bhadex_package === expectedPackage &&
        Number(payment.amount) === Math.round(expectedPrice * 100);

      if (!validOrder) {
        console.error("Webhook order mismatch:", reference);
        return res.sendStatus(400);
      }

      await pool.query(
        `INSERT INTO orders
          (reference, customer_email, product, package, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PAID')
         ON CONFLICT (reference) DO NOTHING`,
        [
          reference,
          payment.customer?.email || null,
          product,
          expectedPackage,
          expectedPrice,
          "GHS"
        ]
      );

      console.log("Paystack webhook recorded:", reference);

      return res.sendStatus(200);

    } catch (error) {
      console.error(
        "Webhook error:",
        error.response?.data || error.message
      );

      return res.sendStatus(500);
    }
  }
);

// ==================================================
// GENERAL MIDDLEWARE
// ==================================================

app.use(express.json({ limit: "10kb" }));

app.use(express.static(path.join(__dirname, "public")));

// ==================================================
// SESSION CONFIGURATION
// ==================================================

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  throw new Error("Admin security environment variables are missing.");
}

if (SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "admin_sessions",
      createTableIfMissing: true
    }),

    name: "bhadex_admin_session",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);

// ==================================================
// LOGIN RATE LIMITER
// ==================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try again later."
  }
});

// ==================================================
// ADMIN AUTHENTICATION
// ==================================================

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
  if (!req.session || req.session.isAdmin !== true) {
    return res.status(401).json({
      message: "Administrator login required."
    });
  }

  next();
}

app.post(
  "/api/admin/login",
  loginLimiter,
  async (req, res) => {
    try {
      const password = req.body?.password;

      if (
        typeof password !== "string" ||
        !safePasswordCompare(password, ADMIN_PASSWORD)
      ) {
        return res.status(401).json({
          message: "Incorrect administrator password."
        });
      }

      req.session.regenerate((error) => {
        if (error) {
          return res.status(500).json({
            message: "Unable to create administrator session."
          });
        }

        req.session.isAdmin = true;

        req.session.save((saveError) => {
          if (saveError) {
            return res.status(500).json({
              message: "Unable to save administrator session."
            });
          }

          res.json({
            success: true,
            message: "Administrator login successful."
          });
        });
      });

    } catch (error) {
      console.error("Admin login error:", error.message);

      res.status(500).json({
        message: "Login service unavailable."
      });
    }
  }
);

// ==================================================
// ADMIN LOGOUT
// ==================================================

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Unable to log out."
      });
    }

    res.clearCookie("bhadex_admin_session", {
      httpOnly: true,
      secure: "auto",
      sameSite: "strict"
    });

    res.json({
      success: true,
      message: "Logged out successfully."
    });
  });
});

// ==================================================
// ADMIN ORDER MANAGEMENT
// ==================================================

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "ALL").toUpperCase();
    const search = String(req.query.search || "").trim().slice(0, 100);

    if (
      status !== "ALL" &&
      !fulfillmentStatuses.includes(status)
    ) {
      return res.status(400).json({
        message: "Invalid delivery status."
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        reference,
        customer_email,
        product,
        package,
        amount,
        currency,
        status,
        fulfillment_status,
        delivered_at,
        fulfillment_updated_at,
        created_at,
        updated_at
       FROM orders
       WHERE
         ($1 = 'ALL' OR fulfillment_status = $1)
         AND (
           $2 = ''
           OR reference ILIKE '%' || $2 || '%'
           OR COALESCE(customer_email, '') ILIKE '%' || $2 || '%'
           OR product ILIKE '%' || $2 || '%'
         )
       ORDER BY created_at DESC
       LIMIT 200`,
      [status, search]
    );

    const statsResult = await pool.query(
      `SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (
          WHERE status = 'PAID'
        ) AS paid_orders,
        COALESCE(
          SUM(amount) FILTER (WHERE status = 'PAID'),
          0
        ) AS total_revenue,
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'PENDING'
        ) AS pending_orders,
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'PROCESSING'
        ) AS processing_orders,
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'DELIVERED'
        ) AS delivered_orders,
        COUNT(*) FILTER (
          WHERE fulfillment_status = 'CANCELLED'
        ) AS cancelled_orders
       FROM orders`
    );

    const stats = statsResult.rows[0];

    res.json({
      orders: result.rows,

      stats: {
        totalOrders: Number(stats.total_orders),
        paidOrders: Number(stats.paid_orders),
        totalRevenue: Number(stats.total_revenue),
        pendingOrders: Number(stats.pending_orders),
        processingOrders: Number(stats.processing_orders),
        deliveredOrders: Number(stats.delivered_orders),
        cancelledOrders: Number(stats.cancelled_orders)
      }
    });

  } catch (error) {
    console.error("Admin orders error:", error.message);

    res.status(500).json({
      message: "Unable to retrieve orders."
    });
  }
});

// ==================================================
// UPDATE ORDER DELIVERY STATUS
// ==================================================

app.patch(
  "/api/admin/orders/:reference/status",
  requireAdmin,
  async (req, res) => {
    try {
      const reference = req.params.reference;
      const newStatus = String(
        req.body?.fulfillmentStatus || ""
      ).toUpperCase();

      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(reference)) {
        return res.status(400).json({
          message: "Invalid order reference."
        });
      }

      if (!fulfillmentStatuses.includes(newStatus)) {
        return res.status(400).json({
          message: "Invalid delivery status."
        });
      }

      const result = await pool.query(
        `UPDATE orders
         SET
           fulfillment_status = $1,
           delivered_at = CASE
             WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, NOW())
             ELSE NULL
           END,
           fulfillment_updated_at = NOW(),
           updated_at = NOW()
         WHERE reference = $2
           AND status = 'PAID'
         RETURNING
           reference,
           product,
           package,
           status,
           fulfillment_status,
           delivered_at,
           fulfillment_updated_at`,
        [newStatus, reference]
      );

      if (result.rowCount === 0) {
        const existing = await pool.query(
          "SELECT reference, status FROM orders WHERE reference = $1",
          [reference]
        );

        if (existing.rowCount === 0) {
          return res.status(404).json({
            message: "Order not found."
          });
        }

        return res.status(400).json({
          message: "Only successfully paid orders can be processed."
        });
      }

      res.json({
        success: true,
        message: "Order delivery status updated.",
        order: result.rows[0]
      });

    } catch (error) {
      console.error("Order status update error:", error.message);

      res.status(500).json({
        message: "Unable to update order status."
      });
    }
  }
);

// ==================================================
// HOMEPAGE
// ==================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==================================================
// INITIALIZE PAYSTACK PAYMENT
// ==================================================

app.post("/api/payments/initialize", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY || !BASE_URL) {
      return res.status(503).json({
        message: "Payment service is not configured."
      });
    }

    const { email, product, packageIndex } = req.body;

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        message: "Please provide a valid email address."
      });
    }

    if (
      !products[product] ||
      !Number.isInteger(packageIndex) ||
      packageIndex < 0 ||
      packageIndex >= packageNames.length
    ) {
      return res.status(400).json({
        message: "Invalid product or package."
      });
    }

    const price = products[product][packageIndex];
    const packageName = packageNames[packageIndex];

    const baseUrl = new URL(BASE_URL);

    if (baseUrl.protocol !== "https:") {
      return res.status(500).json({
        message: "Invalid payment callback configuration."
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(price * 100),
        currency: "GHS",

        callback_url:
          `${BASE_URL.replace(/\/+$/, "")}/payment.html`,

        metadata: {
          bhadex_product: product,
          bhadex_package: packageName,
          bhadex_package_index: packageIndex
        }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    if (!response.data.status || !response.data.data) {
      return res.status(502).json({
        message: "Paystack could not initialize the payment."
      });
    }

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference
    });

  } catch (error) {
    console.error(
      "Payment initialization error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      message: "Unable to start payment. Please try again."
    });
  }
});

// ==================================================
// VERIFY PAYMENT AND SAVE ORDER
// ==================================================

app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(503).json({
        message: "Payment service is not configured."
      });
    }

    const reference = req.params.reference;

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(reference)) {
      return res.status(400).json({
        message: "Invalid payment reference."
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        },
        timeout: 15000
      }
    );

    const payment = response.data?.data;

    if (!response.data?.status || !payment) {
      return res.status(502).json({
        message: "Unable to retrieve payment details."
      });
    }

    const product = payment.metadata?.bhadex_product;

    const packageIndex = Number(
      payment.metadata?.bhadex_package_index
    );

    const expectedPackage = packageNames[packageIndex];
    const expectedPrice = products[product]?.[packageIndex];

    const validOrder =
      typeof expectedPrice === "number" &&
      Number.isInteger(packageIndex) &&
      packageIndex >= 0 &&
      packageIndex < packageNames.length &&
      payment.metadata?.bhadex_package === expectedPackage;

    const validPayment =
      payment.status === "success" &&
      payment.currency === "GHS" &&
      payment.reference === reference &&
      validOrder &&
      Number(payment.amount) === Math.round(expectedPrice * 100);

    if (!validPayment) {
      return res.json({
        verified: false,
        status: payment.status,
        reference: payment.reference,
        currency: payment.currency
      });
    }

    const customerEmail = payment.customer?.email || null;

    const saved = await pool.query(
      `INSERT INTO orders
        (reference, customer_email, product, package, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PAID')
       ON CONFLICT (reference) DO NOTHING
       RETURNING *`,
      [
        reference,
        customerEmail,
        product,
        expectedPackage,
        expectedPrice,
        "GHS"
      ]
    );

    let order = saved.rows[0];

    if (!order) {
      const existing = await pool.query(
        "SELECT * FROM orders WHERE reference = $1",
        [reference]
      );

      order = existing.rows[0];
    }

    if (!order) {
      throw new Error("Verified order could not be saved.");
    }

    res.json({
      verified: true,
      status: "success",
      reference: order.reference,
      product: order.product,
      package: order.package,
      amount: Number(order.amount),
      currency: order.currency,
      orderStatus: order.status
    });

  } catch (error) {
    console.error(
      "Payment verification error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      message: "Unable to verify payment."
    });
  }
});

// ==================================================
// START SERVER
// ==================================================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`BHADEX PLUGS server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Database startup error:", error.message);
    process.exit(1);
  }
}

startServer();
