
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");
const { pool, initializeDatabase } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Initialize Paystack payment
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

// Verify payment and save successful orders in PostgreSQL
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

// Display total number of recorded orders
app.get("/api/orders/count", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) AS total FROM orders"
    );

    res.json({
      totalOrders: Number(result.rows[0].total)
    });

  } catch (error) {
    console.error("Order count error:", error.message);

    res.status(500).json({
      message: "Unable to retrieve order count."
    });
  }
});

// Start only after the database is ready
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `BHADEX PLUGS server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Database startup error:", error.message);
    process.exit(1);
  }
}

startServer();
