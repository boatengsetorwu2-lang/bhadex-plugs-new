
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL;

// Prices are checked on the server, not trusted from the browser.
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

// Start a Paystack transaction.
app.post("/api/payments/initialize", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(503).json({
        message: "Payment service is not configured yet."
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
      packageIndex > 4
    ) {
      return res.status(400).json({
        message: "Invalid product or package."
      });
    }

    const price = products[product][packageIndex];

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(price * 100),
        currency: "GHS",
        callback_url: `${BASE_URL}/payment.html`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
      product,
      package: packageNames[packageIndex],
      amount: price
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

// Verify a transaction with Paystack.
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

    const payment = response.data.data;

    res.json({
      verified:
        payment.status === "success" &&
        payment.currency === "GHS",
      status: payment.status,
      reference: payment.reference,
      amount: payment.amount / 100,
      currency: payment.currency
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

app.listen(PORT, () => {
  console.log(`BHADEX PLUGS server running on port ${PORT}`);
});
