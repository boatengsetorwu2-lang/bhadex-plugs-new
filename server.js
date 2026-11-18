
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

// Initialize payment securely.
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
        callback_url: `${BASE_URL.replace(/\/+$/, "")}/payment.html`,

        // Server-generated order information.
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

// Verify payment against the original server-generated order metadata.
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
      payment.metadata?.bhadex_package === expectedPackage &&
      Number.isInteger(packageIndex) &&
      packageIndex >= 0 &&
      packageIndex < packageNames.length;

    const validPayment =
      payment.status === "success" &&
      payment.currency === "GHS" &&
      payment.reference === reference &&
      validOrder &&
      Number(payment.amount) === Math.round(expectedPrice * 100);

    res.json({
      verified: Boolean(validPayment),
      status: payment.status,
      reference: payment.reference,
      currency: payment.currency,
      ...(validPayment
        ? {
            product,
            package: expectedPackage,
            amount: expectedPrice
          }
        : {})
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
                    
