
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { pool, initializeDatabase } = require("./database");
const createFeatureRouter = require("./features");

const app = express();
const PORT = process.env.PORT || 10000;
const scryptAsync = promisify(crypto.scrypt);

app.set("trust proxy", 1);

// PRODUCT PRICES
const PRODUCT_PRICES = {
  "Netflix": [35, 90, 170],
  "YouTube Premium": [20, 55, 100],
  "Spotify Premium": [18, 50, 95],
  "Canva": [25, 70, 135],
  "Canva Pro": [25, 70, 135],
  "ChatGPT": [45],
  "ChatGPT Plus": [45],
  "Microsoft 365": [30, 85, 160],
  "Disney+": [25, 70, 135],
  "Prime Video": [20, 55, 105],
  "Telegram Premium": [20, 55, 105],
  "Google One": [15, 40, 75]
};

const PACKAGE_NAMES = ["1 Month", "3 Months", "1 Year"];

const fulfillmentStatuses = [
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "CANCELLED"
];

function getExpectedAmount(product, packageName) {
  const prices = PRODUCT_PRICES[product];
  const index = PACKAGE_NAMES.indexOf(packageName);

  if (!prices || index === -1 || prices[index] === undefined) {
    return null;
  }

  return prices[index] * 100;
}

async function getExpectedPaymentAmount(metadata) {
  const baseAmount = getExpectedAmount(metadata.product, metadata.package);
  if (baseAmount === null) return null;

  let amount = baseAmount;
  const couponCode = String(metadata.couponCode || "").trim().toUpperCase();
  if (couponCode) {
    const discountPercent = Number(metadata.discountPercent);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 50) return null;
    const coupon = await pool.query(
      `SELECT discount_percent
       FROM store_coupons
       WHERE code = $1 AND active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR uses < max_uses)
       LIMIT 1`,
      [couponCode]
    );
    if (!coupon.rows.length || Number(coupon.rows[0].discount_percent) !== discountPercent) return null;
    amount -= Math.floor(baseAmount * discountPercent / 100);
  }

  const points = Number(metadata.loyaltyPoints || 0);
  const loyaltyReference = String(metadata.loyaltyReference || "");
  if (points === 0 && !loyaltyReference) return amount;
  if (!String(process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_test_")) return null;
  if (!Number.isInteger(points) || points < 100 || points % 100 !== 0 || !loyaltyReference) return null;

  const redemption = await pool.query(
    `SELECT points, discount_pesewas, status, expires_at
     FROM loyalty_redemptions WHERE reference = $1 LIMIT 1`,
    [loyaltyReference]
  );
  if (
    !redemption.rows.length ||
    !(redemption.rows[0].status === "PENDING" || redemption.rows[0].status === "REDEEMED") ||
    (redemption.rows[0].status === "PENDING" && new Date(redemption.rows[0].expires_at) <= new Date()) ||
    Number(redemption.rows[0].points) !== points ||
    Number(redemption.rows[0].discount_pesewas) !== points
  ) return null;

  amount -= points;
  return amount >= 100 ? amount : null;
}

// HTML ESCAPING
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// EMAIL VALIDATION
function validEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

// PASSWORD HASHING
async function hashCustomerPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyCustomerPassword(password, storedHash) {
  try {
    if (typeof storedHash !== "string") return false;

    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;

    const [salt, key] = parts;

    if (!salt || !/^[a-f0-9]{128}$/i.test(key)) return false;

    const derivedKey = await scryptAsync(password, salt, 64);
    const storedKey = Buffer.from(key, "hex");

    return crypto.timingSafeEqual(derivedKey, storedKey);
  } catch {
    return false;
  }
}

// OTP HASHING
function hashOTP(email, code) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(`${email}:${code}`)
    .digest("hex");
}

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function compareOTP(email, received, stored) {
  if (
    typeof received !== "string" ||
    typeof stored !== "string" ||
    !/^\d{6}$/.test(received) ||
    !/^[a-f0-9]{64}$/i.test(stored)
  ) {
    return false;
  }

  const receivedHash = Buffer.from(hashOTP(email, received), "hex");
  const storedHash = Buffer.from(stored, "hex");

  return (
    receivedHash.length === storedHash.length &&
    crypto.timingSafeEqual(receivedHash, storedHash)
  );
}

// EMAIL VERIFICATION EMAIL
async function sendEmailVerificationOTP(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Resend environment variables are missing.");
  }

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Verify Your BHADEX PLUGS Account",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:550px;margin:auto;padding:30px;color:#222;">
          <h2 style="color:#d71920;">BHADEX PLUGS</h2>
          <h3>Verify your email address</h3>
          <p>Thank you for creating a BHADEX PLUGS account.</p>
          <p>Your 6-digit verification code is:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#d71920;padding:15px 0;">
            ${code}
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this code, you can ignore this email.</p>
          <p><strong>DIGITAL ACCESS, ELEVATED</strong></p>
        </div>
      `
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// PASSWORD RESET EMAIL
async function sendEmailChangeOTP(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new Error("Resend email settings are missing.");
  await axios.post("https://api.resend.com/emails", {
    from: process.env.RESEND_FROM_EMAIL, to: [email], subject: "Confirm your new BHADEX PLUGS email address",
    html: `<div style="font-family:Arial,sans-serif;max-width:550px;margin:auto;padding:30px;color:#222;"><h2 style="color:#d71920;">BHADEX PLUGS</h2><h3>Confirm your new email address</h3><p>Your verification code is:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#d71920;padding:15px 0;">${code}</div><p>This code expires in 10 minutes. If you did not request this change, ignore this message.</p></div>`
  }, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" } });
}

async function sendPasswordResetOTP(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Resend environment variables are missing.");
  }

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Your BHADEX PLUGS Password Reset Code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:550px;margin:auto;padding:30px;color:#222;">
          <h2 style="color:#d71920;">BHADEX PLUGS</h2>
          <h3>Password reset request</h3>
          <p>Use this code to reset your account password:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#d71920;padding:15px 0;">
            ${code}
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>You have a maximum of 5 incorrect attempts.</p>
          <p>If you did not request this, you can ignore this email.</p>
          <p><strong>DIGITAL ACCESS, ELEVATED</strong></p>
        </div>
      `
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ORDER CONFIRMATION EMAIL
async function sendOrderConfirmationEmail(order) {
  const trackingUrl =
    `${process.env.BASE_URL.replace(/\/+$/, "")}/track.html`;

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: process.env.RESEND_FROM_EMAIL,
      to: [order.email],
      subject: "Your BHADEX PLUGS Order Confirmation",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:25px;color:#222;">
          <h2 style="color:#d71920;">BHADEX PLUGS</h2>
          <h3>Payment confirmed!</h3>
          <p>Thank you for shopping with BHADEX PLUGS.</p>
          <p>Your payment has been confirmed successfully.</p>
          <p><strong>Order Reference:</strong> ${escapeHtml(order.reference)}</p>
          <p><strong>Product:</strong> ${escapeHtml(order.product)}</p>
          <p><strong>Package:</strong> ${escapeHtml(order.packageName)}</p>
          <p><strong>Amount:</strong> GH₵${Number(order.amount).toFixed(2)}</p>
          <p>
            <a href="${escapeHtml(trackingUrl)}"
              style="background:#d71920;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;">
              Track Your Order
            </a>
          </p>
          <p>Thank you for choosing BHADEX PLUGS.</p>
          <p><strong>DIGITAL ACCESS, ELEVATED</strong></p>
        </div>
      `
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
}


 
// ORDER STATUS UPDATE EMAIL
async function sendOrderStatusEmail(order) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Resend email settings are missing.");
  }

  const baseUrl = String(process.env.BASE_URL || "https://bhadex-plugs.onrender.com").replace(/\/+$/, "");
  const trackingUrl = baseUrl + "/track.html";
  const statusLabels = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
  };
  const label = statusLabels[order.fulfillment_status] || order.fulfillment_status;

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: process.env.RESEND_FROM_EMAIL,
      to: [order.customer_email],
      subject: "BHADEX PLUGS Order Update: " + label,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:25px;color:#222;">
          <h2 style="color:#d71920;">BHADEX PLUGS</h2>
          <h3>Your order status has changed</h3>
          <p>Hello,</p>
          <p>The status of your order has been updated.</p>
          <p><strong>Order Reference:</strong> ${escapeHtml(order.reference)}</p>
          <p><strong>Product:</strong> ${escapeHtml(order.product)}</p>
          <p><strong>Package:</strong> ${escapeHtml(order.package_name)}</p>
          <p><strong>Order Status:</strong> ${escapeHtml(label)}</p>
          <p>
            <a href="${escapeHtml(trackingUrl)}"
              style="background:#d71920;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;">
              Track Your Order
            </a>
          </p>
          <p>Thank you for choosing BHADEX PLUGS.</p>
          <p><strong>DIGITAL ACCESS, ELEVATED</strong></p>
        </div>
      `
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );
}

// SAVE PAID ORDER AND SEND EMAIL ONCE
async function savePaidOrder(payment, metadata) {
  const reference = payment.reference;
  const email = payment.customer?.email || null;
  const product = metadata.product;
  const packageName = metadata.package;
  const amount = payment.amount / 100;

  const discountAmount = Number(metadata.discountAmountPesewas || 0) / 100;
  const couponCode = metadata.couponCode
    ? String(metadata.couponCode).trim().toUpperCase()
    : null;

  const insertedOrder = await pool.query(
    `INSERT INTO orders (
      reference, customer_email, product, package, amount,
      currency, status, fulfillment_status, coupon_code, discount_amount
    )
    VALUES ($1, $2, $3, $4, $5, 'GHS', 'PAID', 'PENDING', $6, $7)
    ON CONFLICT (reference) DO NOTHING`,
    [reference, email, product, packageName, amount, couponCode, discountAmount]
  );

  if (insertedOrder.rowCount > 0 && couponCode) {
    await pool.query(
      "UPDATE store_coupons SET uses = uses + 1 WHERE code = $1",
      [couponCode]
    );
  }

  await pool.query(
    `UPDATE abandoned_checkouts
     SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW()),
         updated_at = NOW()
     WHERE checkout_reference = $1`,
    [reference]
  );

  if (!email) {
    await pool.query(
      `UPDATE orders
       SET confirmation_email_status = 'SKIPPED'
       WHERE reference = $1
       AND confirmation_email_status = 'PENDING'`,
      [reference]
    );
    return;
  }

  const claim = await pool.query(
    `UPDATE orders
     SET confirmation_email_status = 'SENDING'
     WHERE reference = $1
     AND confirmation_email_status IN ('PENDING', 'FAILED')
     RETURNING reference`,
    [reference]
  );

  if (claim.rows.length === 0) return;

  try {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      throw new Error("Resend environment variables are missing.");
    }

    await sendOrderConfirmationEmail({
      reference, email, product, packageName, amount
    });

    await pool.query(
      `UPDATE orders
       SET confirmation_email_status = 'SENT',
           confirmation_email_sent_at = NOW()
       WHERE reference = $1`,
      [reference]
    );

    console.log("Order confirmation email sent:", reference);
  } catch (error) {
    await pool.query(
      `UPDATE orders
       SET confirmation_email_status = 'FAILED'
       WHERE reference = $1`,
      [reference]
    );

    console.error(
      "Confirmation email error:",
      error.response?.data || error.message
    );
  }
}

// RATE LIMITS
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const customerRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const customerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const customerVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const customerResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

// PAYSTACK WEBHOOK
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];
      const secret = process.env.PAYSTACK_SECRET_KEY;

      if (!secret || !signature || !Buffer.isBuffer(req.body)) {
        return res.sendStatus(401);
      }

      const expectedSignature = crypto
        .createHmac("sha512", secret)
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

      const event = JSON.parse(req.body.toString());

      if (event.event !== "charge.success") {
        return res.sendStatus(200);
      }

      const reference = event.data?.reference;
      if (!reference) return res.sendStatus(400);

      const verification = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${secret}`
          }
        }
      );

      const payment = verification.data.data;
      const metadata = payment.metadata || {};

      const expectedAmount = await getExpectedPaymentAmount(metadata);

      if (
        payment.status !== "success" ||
        payment.currency !== "GHS" ||
        payment.amount !== event.data.amount ||
        expectedAmount === null ||
        payment.amount !== expectedAmount
      ) {
        return res.sendStatus(400);
      }

      await savePaidOrder(payment, metadata);
      return res.sendStatus(200);
    } catch (error) {
      console.error(
        "Paystack webhook error:",
        error.response?.data || error.message
      );
      return res.sendStatus(500);
    }
  }
);

// GENERAL MIDDLEWARE
app.use(express.json({ limit: "2mb" }));

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // HTML should revalidate on each visit; static assets can be cached for an hour.
    if (path.extname(filePath).toLowerCase() === ".html") {
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));

// ENVIRONMENT CHECKS
if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  throw new Error("ADMIN_PASSWORD and SESSION_SECRET must be configured.");
}

if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters.");
}

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error("PAYSTACK_SECRET_KEY must be configured.");
}

if (!process.env.BASE_URL) {
  throw new Error("BASE_URL must be configured.");
}

// SESSIONS
app.use(session({
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
    secure: "auto",
    sameSite: "strict",
    maxAge: 4 * 60 * 60 * 1000
  }
}));

// ADMIN PASSWORD COMPARISON
function safePasswordCompare(input, correct) {
  const inputHash = crypto.createHash("sha256").update(input).digest();
  const correctHash = crypto.createHash("sha256").update(correct).digest();
  return crypto.timingSafeEqual(inputHash, correctHash);
}

// ADMIN PROTECTION
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: "Please log in again." });
  }
  next();
}

// CUSTOMER PROTECTION
function requireCustomer(req, res, next) {
  if (!req.session || !req.session.customerId) {
    return res.status(401).json({
      error: "Please log in to your customer account."
    });
  }
  next();
}

// ADDITIONAL CUSTOMER, STORE AND ADMIN FEATURES
app.use("/api/features", createFeatureRouter({
  pool,
  requireCustomer,
  requireAdmin
}));

// CREATE CUSTOMER SESSION
function createCustomerSession(req, res, customer) {
  req.session.regenerate(error => {
    if (error) {
      console.error("Customer session error:", error.message);
      return res.status(500).json({
        error: "Unable to create your account session."
      });
    }

    req.session.customerId = customer.id;

    req.session.save(saveError => {
      if (saveError) {
        return res.status(500).json({
          error: "Unable to save your account session."
        });
      }

      return res.json({
        success: true,
        message: "Email verified successfully.",
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email
        }
      });
    });
  });
}

// CUSTOMER REGISTRATION
app.post(
  "/api/customer/register",
  customerRegisterLimiter,
  async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;
      const referralCode = String(req.body?.referralCode || "").trim().toUpperCase();
      let referringCustomer = null;
      if (referralCode) {
        const referralOwner = await pool.query(
          "SELECT id, email FROM customers WHERE UPPER(referral_code) = $1 LIMIT 1",
          [referralCode]
        );
        if (!referralOwner.rows.length) {
          return res.status(400).json({ error: "That referral code is not valid." });
        }
        if (String(referralOwner.rows[0].email).toLowerCase() === email) {
          return res.status(400).json({ error: "You cannot use your own referral code." });
        }
        referringCustomer = referralOwner.rows[0];
      }

      if (
        name.length < 2 ||
        name.length > 100 ||
        !validEmail(email) ||
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 128
      ) {
        return res.status(400).json({
          error: "Enter a valid name, email and password of at least 10 characters."
        });
      }

      const existing = await pool.query(
        `SELECT id, email_verified
         FROM customers
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: existing.rows[0].email_verified
            ? "An account with this email already exists. Please log in."
            : "An account with this email is awaiting verification. Please use the resend code option."
        });
      }

      const passwordHash = await hashCustomerPassword(password);
      const code = generateOTP();
      const otpHash = hashOTP(email, code);

      const result = await pool.query(
        `INSERT INTO customers (
          name, email, password_hash, email_verified,
          email_otp_hash, email_otp_expires_at,
          email_otp_attempts, email_otp_last_sent_at
        )
        VALUES ($1, $2, $3, FALSE, $4, NOW() + INTERVAL '10 minutes', 0, NOW())
        RETURNING id, name, email`,
        [name, email, passwordHash, otpHash]
      );
      if (referringCustomer) {
        await pool.query(
          `INSERT INTO customer_referrals
             (referrer_customer_id, referred_customer_id, referral_code)
           VALUES ($1, $2, $3)
           ON CONFLICT (referred_customer_id) DO NOTHING`,
          [referringCustomer.id, result.rows[0].id, referralCode]
        );
      }

      try {
        await sendEmailVerificationOTP(email, code);
      } catch (emailError) {
        await pool.query(
          `DELETE FROM customers
           WHERE id = $1 AND email_verified = FALSE`,
          [result.rows[0].id]
        );

        console.error(
          "Verification email error:",
          emailError.response?.data || emailError.message
        );

        return res.status(503).json({
          error: "We could not send your verification email. Please try registering again later."
        });
      }

      return res.status(201).json({
        success: true,
        message: "A verification code has been sent to your email.",
        email
      });
    } catch (error) {
      console.error("Customer registration error:", error.message);
      return res.status(500).json({
        error: "Unable to create your account."
      });
    }
  }
);

// VERIFY CUSTOMER EMAIL
app.post(
  "/api/customer/verify-email",
  customerVerificationLimiter,
  async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const code = String(req.body?.code || "").trim();

      if (!validEmail(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({
          error: "Enter a valid email and 6-digit verification code."
        });
      }

      const result = await pool.query(
        `SELECT id, name, email, email_otp_hash,
                email_otp_expires_at, email_otp_attempts,
                email_verified
         FROM customers
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "Invalid or expired verification code."
        });
      }

      const customer = result.rows[0];

      if (customer.email_verified) {
        return res.status(400).json({
          error: "This email is already verified. Please log in."
        });
      }

      if (
        !customer.email_otp_hash ||
        !customer.email_otp_expires_at ||
        new Date(customer.email_otp_expires_at) <= new Date()
      ) {
        return res.status(400).json({
          error: "Your code has expired. Please request a new one."
        });
      }

      if (customer.email_otp_attempts >= 5) {
        return res.status(429).json({
          error: "Too many incorrect attempts. Please request a new code."
        });
      }

      if (!compareOTP(email, code, customer.email_otp_hash)) {
        await pool.query(
          `UPDATE customers
           SET email_otp_attempts = email_otp_attempts + 1
           WHERE id = $1`,
          [customer.id]
        );

        return res.status(400).json({
          error: "Incorrect verification code."
        });
      }

      const update = await pool.query(
        `UPDATE customers
         SET email_verified = TRUE,
             email_otp_hash = NULL,
             email_otp_expires_at = NULL,
             email_otp_attempts = 0
         WHERE id = $1 AND email_verified = FALSE
         RETURNING id, name, email`,
        [customer.id]
      );

      if (update.rows.length === 0) {
        return res.status(400).json({
          error: "Unable to verify this account. Please try logging in."
        });
      }

      return createCustomerSession(req, res, update.rows[0]);
    } catch (error) {
      console.error("Email verification error:", error.message);
      return res.status(500).json({
        error: "Unable to verify your email right now."
      });
    }
  }
);

// RESEND EMAIL VERIFICATION CODE
app.post(
  "/api/customer/resend-otp",
  customerResendLimiter,
  async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();

      if (!validEmail(email)) {
        return res.status(400).json({
          error: "Enter a valid email address."
        });
      }

      const result = await pool.query(
        `SELECT id, email_verified, email_otp_last_sent_at
         FROM customers
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );

      if (
        result.rows.length === 0 ||
        result.rows[0].email_verified
      ) {
        return res.json({
          success: true,
          message: "If this account needs verification, a new code will be sent."
        });
      }

      const customer = result.rows[0];

      if (
        customer.email_otp_last_sent_at &&
        Date.now() - new Date(customer.email_otp_last_sent_at).getTime() < 60000
      ) {
        return res.status(429).json({
          error: "Please wait 60 seconds before requesting another code."
        });
      }

      const code = generateOTP();
      const otpHash = hashOTP(email, code);

      // Send first so a failed email does not invalidate the previous code.
      await sendEmailVerificationOTP(email, code);

      await pool.query(
        `UPDATE customers
         SET email_otp_hash = $1,
             email_otp_expires_at = NOW() + INTERVAL '10 minutes',
             email_otp_attempts = 0,
             email_otp_last_sent_at = NOW()
         WHERE id = $2 AND email_verified = FALSE`,
        [otpHash, customer.id]
      );

      return res.json({
        success: true,
        message: "A new verification code has been sent."
      });
    } catch (error) {
      console.error(
        "Resend OTP error:",
        error.response?.data || error.message
      );
      return res.status(503).json({
        error: "Unable to send a new code. Please try again later."
      });
    }
  }
);

// CUSTOMER LOGIN
app.post(
  "/api/customer/login",
  customerLoginLimiter,
  async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;

      if (
        !validEmail(email) ||
        typeof password !== "string" ||
        password.length > 128
      ) {
        return res.status(400).json({
          error: "Enter your email and password."
        });
      }

      const result = await pool.query(
        `SELECT id, name, email, password_hash, email_verified
         FROM customers
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );

      if (
        result.rows.length === 0 ||
        !(await verifyCustomerPassword(
          password,
          result.rows[0].password_hash
        ))
      ) {
        return res.status(401).json({
          error: "Incorrect email or password."
        });
      }

      const customer = result.rows[0];

      if (!customer.email_verified) {
        return res.status(403).json({
          error: "Please verify your email before logging in.",
          verificationRequired: true
        });
      }

      return createCustomerSession(req, res, customer);
    } catch (error) {
      console.error("Customer login error:", error.message);
      return res.status(500).json({
        error: "Unable to log in right now."
      });
    }
  }
);

// FORGOT PASSWORD - REQUEST RESET CODE
app.post(
  "/api/customer/forgot-password",
  passwordResetLimiter,
  async (req, res) => {
    const genericMessage =
      "If a verified account exists for that email, a password reset code will be sent.";

    try {
      const email = String(req.body?.email || "").trim().toLowerCase();

      if (!validEmail(email)) {
        return res.status(400).json({
          error: "Enter a valid email address."
        });
      }

      const result = await pool.query(
        `SELECT id, email_verified, password_reset_last_sent_at
         FROM customers
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email]
      );

      if (
        result.rows.length === 0 ||
        !result.rows[0].email_verified
      ) {
        return res.json({
          success: true,
          message: genericMessage
        });
      }

      const customer = result.rows[0];

      if (
        customer.password_reset_last_sent_at &&
        Date.now() - new Date(customer.password_reset_last_sent_at).getTime() < 60000
      ) {
        return res.json({
          success: true,
          message: genericMessage
        });
      }

      const code = generateOTP();
      const otpHash = hashOTP(email, code);

      // Send the code before replacing the stored one.
      await sendPasswordResetOTP(email, code);

      await pool.query(
        `UPDATE customers
         SET password_reset_otp_hash = $1,
             password_reset_otp_expires_at = NOW() + INTERVAL '10 minutes',
             password_reset_otp_attempts = 0,
             password_reset_last_sent_at = NOW()
         WHERE id = $2 AND email_verified = TRUE`,
        [otpHash, customer.id]
      );

      return res.json({
        success: true,
        message: genericMessage
      });
    } catch (error) {
      console.error(
        "Forgot password error:",
        error.response?.data || error.message
      );

      return res.status(503).json({
        error: "We could not send a reset code right now. Please try again later."
      });
    }
  }
);

// RESET PASSWORD - VERIFY CODE AND SAVE NEW PASSWORD
app.post(
  "/api/customer/reset-password",
  passwordResetLimiter,
  async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const code = String(req.body?.code || "").trim();
      const newPassword = req.body?.newPassword;

      if (
        !validEmail(email) ||
        !/^\d{6}$/.test(code) ||
        typeof newPassword !== "string" ||
        newPassword.length < 10 ||
        newPassword.length > 128
      ) {
        return res.status(400).json({
          error: "Enter a valid email, 6-digit code and password of at least 10 characters."
        });
      }

      const result = await pool.query(
        `SELECT id, email, password_reset_otp_hash,
                password_reset_otp_expires_at,
                password_reset_otp_attempts
         FROM customers
         WHERE LOWER(email) = $1
           AND email_verified = TRUE
         LIMIT 1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "Invalid or expired reset code. Request a new code and try again."
        });
      }

      const customer = result.rows[0];

      if (
        !customer.password_reset_otp_hash ||
        !customer.password_reset_otp_expires_at ||
        new Date(customer.password_reset_otp_expires_at) <= new Date()
      ) {
        return res.status(400).json({
          error: "Invalid or expired reset code. Request a new code and try again."
        });
      }

      if (customer.password_reset_otp_attempts >= 5) {
        return res.status(429).json({
          error: "Too many incorrect attempts. Request a new reset code."
        });
      }

      if (!compareOTP(email, code, customer.password_reset_otp_hash)) {
        await pool.query(
          `UPDATE customers
           SET password_reset_otp_attempts = password_reset_otp_attempts + 1
           WHERE id = $1`,
          [customer.id]
        );

        return res.status(400).json({
          error: "Incorrect reset code."
        });
      }

      const passwordHash = await hashCustomerPassword(newPassword);

      const update = await pool.query(
        `UPDATE customers
         SET password_hash = $1,
             password_reset_otp_hash = NULL,
             password_reset_otp_expires_at = NULL,
             password_reset_otp_attempts = 0,
             password_reset_last_sent_at = NULL,
             updated_at = NOW()
         WHERE id = $2
           AND password_reset_otp_hash = $3
         RETURNING id`,
        [passwordHash, customer.id, customer.password_reset_otp_hash]
      );

      if (update.rows.length === 0) {
        return res.status(400).json({
          error: "This reset code is no longer valid. Request a new code."
        });
      }

      return res.json({
        success: true,
        message: "Your password has been reset. You can now log in."
      });
    } catch (error) {
      console.error("Password reset error:", error.message);
      return res.status(500).json({
        error: "Unable to reset your password right now."
      });
    }
  }
);

// CHANGE PASSWORD - LOGGED-IN CUSTOMER
app.post(
  "/api/customer/change-password",
  requireCustomer,
  passwordChangeLimiter,
  async (req, res) => {
    try {
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;

      if (
        typeof currentPassword !== "string" ||
        currentPassword.length > 128 ||
        typeof newPassword !== "string" ||
        newPassword.length < 10 ||
        newPassword.length > 128
      ) {
        return res.status(400).json({
          error: "Enter your current password and a new password of at least 10 characters."
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          error: "Your new password must be different from your current password."
        });
      }

      const result = await pool.query(
        `SELECT id, password_hash
         FROM customers
         WHERE id = $1
         LIMIT 1`,
        [req.session.customerId]
      );

      if (
        result.rows.length === 0 ||
        !(await verifyCustomerPassword(
          currentPassword,
          result.rows[0].password_hash
        ))
      ) {
        return res.status(400).json({
          error: "Your current password is incorrect."
        });
      }

      const newHash = await hashCustomerPassword(newPassword);

      await pool.query(
        `UPDATE customers
         SET password_hash = $1,
             password_reset_otp_hash = NULL,
             password_reset_otp_expires_at = NULL,
             password_reset_otp_attempts = 0,
             updated_at = NOW()
         WHERE id = $2`,
        [newHash, req.session.customerId]
      );

      return res.json({
        success: true,
        message: "Your password has been changed successfully."
      });
    } catch (error) {
      console.error("Change password error:", error.message);
      return res.status(500).json({
        error: "Unable to change your password right now."
      });
    }
  }
);

// UPDATE CUSTOMER PROFILE
app.patch(
  "/api/customer/profile",
  requireCustomer,
  async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const profileImage = req.body?.profileImage;
      const hasProfileImage = Object.prototype.hasOwnProperty.call(req.body || {}, "profileImage");
      if (profileImage !== undefined && profileImage !== null &&
          (typeof profileImage !== "string" || profileImage.length > 1400000 ||
           !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(profileImage))) {
        return res.status(400).json({ error: "Choose a valid JPG, PNG or WEBP image smaller than 1 MB." });
      }

      if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
          error: "Your name must be between 2 and 100 characters."
        });
      }

      const result = await pool.query(
        `UPDATE customers
         SET name = $1,
             profile_image = CASE WHEN $2::boolean THEN $3::text ELSE profile_image END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, email, created_at, profile_image`,
        [name, hasProfileImage, profileImage ?? null, req.session.customerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Customer account not found."
        });
      }

      return res.json({
        success: true,
        message: "Your profile has been updated.",
        customer: result.rows[0]
      });
    } catch (error) {
      console.error("Profile update error:", error.message);
      return res.status(500).json({
        error: "Unable to update your profile."
      });
    }
  }
);


// REQUEST CUSTOMER EMAIL CHANGE
app.post("/api/customer/email-change/request", requireCustomer, passwordChangeLimiter, async (req, res) => {
  try {
    const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
    const password = req.body?.password;
    if (!validEmail(newEmail) || typeof password !== "string" || password.length > 128) {
      return res.status(400).json({ error: "Enter a valid new email address and your current password." });
    }
    const current = await pool.query("SELECT email, password_hash FROM customers WHERE id=$1 LIMIT 1", [req.session.customerId]);
    if (!current.rows.length) return res.status(404).json({ error: "Customer account not found." });
    if (!(await verifyCustomerPassword(password, current.rows[0].password_hash))) {
      return res.status(400).json({ error: "Your current password is incorrect." });
    }
    if (newEmail === current.rows[0].email.toLowerCase()) return res.status(400).json({ error: "That is already your account email." });
    const used = await pool.query("SELECT id FROM customers WHERE LOWER(email)=LOWER($1) AND id<>$2 LIMIT 1", [newEmail, req.session.customerId]);
    if (used.rows.length) return res.status(409).json({ error: "That email address is already linked to another account." });
    const existing = await pool.query("SELECT last_sent_at FROM customer_email_changes WHERE customer_id=$1", [req.session.customerId]);
    if (existing.rows.length && Date.now() - new Date(existing.rows[0].last_sent_at).getTime() < 60000) {
      return res.status(429).json({ error: "Please wait 60 seconds before requesting another code." });
    }
    const code = generateOTP();
    await pool.query(
      `INSERT INTO customer_email_changes(customer_id,new_email,code_hash,attempts,last_sent_at,expires_at)
       VALUES($1,$2,$3,0,NOW(),NOW()+INTERVAL '10 minutes')
       ON CONFLICT(customer_id) DO UPDATE SET new_email=EXCLUDED.new_email,code_hash=EXCLUDED.code_hash,attempts=0,last_sent_at=NOW(),expires_at=NOW()+INTERVAL '10 minutes'`,
      [req.session.customerId, newEmail, hashOTP(newEmail, code)]
    );
    await sendEmailChangeOTP(newEmail, code);
    return res.json({ success: true, message: "A verification code has been sent to your new email address." });
  } catch (error) {
    console.error("Email change request error:", error.response?.data || error.message);
    return res.status(500).json({ error: "Unable to send the verification code right now." });
  }
});

// CONFIRM CUSTOMER EMAIL CHANGE
app.post("/api/customer/email-change/confirm", requireCustomer, async (req, res) => {
  const client = await pool.connect();
  try {
    const code = String(req.body?.code || "");
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit verification code." });
    await client.query("BEGIN");
    const pending = await client.query("SELECT new_email,code_hash,attempts,expires_at FROM customer_email_changes WHERE customer_id=$1 FOR UPDATE", [req.session.customerId]);
    if (!pending.rows.length || new Date(pending.rows[0].expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Your code has expired. Request a new one." });
    }
    const item = pending.rows[0];
    if (Number(item.attempts) >= 5) {
      await client.query("ROLLBACK");
      return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
    }
    if (!compareOTP(item.new_email, code, item.code_hash)) {
      await client.query("UPDATE customer_email_changes SET attempts=attempts+1 WHERE customer_id=$1", [req.session.customerId]);
      await client.query("COMMIT");
      return res.status(400).json({ error: "That verification code is incorrect." });
    }
    const collision = await client.query("SELECT id FROM customers WHERE LOWER(email)=LOWER($1) AND id<>$2 LIMIT 1", [item.new_email, req.session.customerId]);
    if (collision.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "That email address is already linked to another account." });
    }
    const oldEmail = await client.query("SELECT email FROM customers WHERE id=$1 FOR UPDATE", [req.session.customerId]);
    const previousEmail = oldEmail.rows[0]?.email;
    await client.query("UPDATE customers SET email=$1,email_verified=TRUE,updated_at=NOW() WHERE id=$2", [item.new_email, req.session.customerId]);
    if (previousEmail) await client.query("UPDATE orders SET customer_email=$1 WHERE LOWER(customer_email)=LOWER($2)", [item.new_email, previousEmail]);
    await client.query("DELETE FROM customer_email_changes WHERE customer_id=$1", [req.session.customerId]);
    await client.query("COMMIT");
    return res.json({ success: true, email: item.new_email, message: "Your account email has been updated." });
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("Email change confirmation error:", error.message);
    return res.status(500).json({ error: "Unable to update your email address." });
  } finally { client.release(); }
});

// GET CUSTOMER ACCOUNT DETAILS
app.get("/api/customer/me", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at, profile_image
       FROM customers
       WHERE id = $1
       LIMIT 1`,
      [req.session.customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Customer account not found."
      });
    }

    const customer = result.rows[0];

    return res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        createdAt: customer.created_at,
        profileImage: customer.profile_image || null
      }
    });
  } catch (error) {
    console.error("Customer account error:", error.message);
    return res.status(500).json({
      error: "Unable to load your account."
    });
  }
});

// CUSTOMER'S OWN ORDERS
app.get("/api/customer/orders", requireCustomer, async (req, res) => {
  try {
    const customerResult = await pool.query(
      `SELECT email FROM customers WHERE id = $1 LIMIT 1`,
      [req.session.customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        error: "Customer account not found."
      });
    }

    const email = customerResult.rows[0].email.toLowerCase();

    const result = await pool.query(
      `SELECT
        reference, product, package, amount, currency, status,
        fulfillment_status, created_at, delivered_at
       FROM orders
       WHERE LOWER(customer_email) = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [email]
    );

    return res.json({ orders: result.rows });
  } catch (error) {
    console.error("Customer orders error:", error.message);
    return res.status(500).json({
      error: "Unable to load your orders."
    });
  }
});

// CUSTOMER VIEW ONE OF THEIR OWN ORDERS
app.get(
  "/api/customer/orders/:reference",
  requireCustomer,
  async (req, res) => {
    try {
      const reference = String(req.params.reference || "").trim();

      if (!reference || reference.length > 100) {
        return res.status(400).json({
          error: "Invalid order reference."
        });
      }

      const customerResult = await pool.query(
        `SELECT email FROM customers WHERE id = $1 LIMIT 1`,
        [req.session.customerId]
      );

      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          error: "Customer account not found."
        });
      }

      const email = customerResult.rows[0].email.toLowerCase();

      const result = await pool.query(
        `SELECT
          reference, product, package, amount, currency, status,
          fulfillment_status, created_at, delivered_at
         FROM orders
         WHERE reference = $1
           AND LOWER(customer_email) = $2
         LIMIT 1`,
        [reference, email]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Order not found."
        });
      }

      return res.json({ order: result.rows[0] });
    } catch (error) {
      console.error("Customer order detail error:", error.message);
      return res.status(500).json({
        error: "Unable to load this order."
      });
    }
  }
);

// CUSTOMER LOGOUT
app.post("/api/customer/logout", requireCustomer, (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({
        error: "Unable to log out."
      });
    }

    res.clearCookie("connect.sid");
    return res.json({
      success: true,
      message: "You have logged out."
    });
  });
});

// ADMIN LOGIN
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

    req.session.regenerate(error => {
      if (error) {
        console.error("Session error:", error.message);
        return res.status(500).json({
          error: "Unable to create session."
        });
      }

      req.session.isAdmin = true;

      req.session.save(saveError => {
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

// ADMIN LOGOUT
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({
        error: "Unable to log out."
      });
    }

    res.clearCookie("connect.sid");
    return res.json({ success: true });
  });
});

// PRODUCT INVENTORY MANAGEMENT
app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT product_name, is_available, stock_quantity, low_stock_threshold
       FROM product_inventory ORDER BY product_name ASC`
    );
    const products = result.rows.map(row => ({
      name: row.product_name,
      isAvailable: row.is_available,
      stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
      lowStockThreshold: Number(row.low_stock_threshold),
      stockStatus: row.stock_quantity === null
        ? "NOT_TRACKED"
        : Number(row.stock_quantity) === 0
          ? "OUT_OF_STOCK"
          : Number(row.stock_quantity) <= Number(row.low_stock_threshold)
            ? "LOW_STOCK" : "IN_STOCK"
    }));
    return res.json({
      products,
      lowStock: products.filter(product =>
        product.stockStatus === "LOW_STOCK" || product.stockStatus === "OUT_OF_STOCK"
      )
    });
  } catch (error) {
    console.error("Inventory load error:", error.message);
    return res.status(500).json({ error: "Unable to load product inventory." });
  }
});

app.patch("/api/admin/inventory/:productName", requireAdmin, async (req, res) => {
  try {
    const productName = String(req.params.productName || "");
    if (!Object.prototype.hasOwnProperty.call(PRODUCT_PRICES, productName)) {
      return res.status(400).json({ error: "Invalid product." });
    }

    const hasAvailability = Object.prototype.hasOwnProperty.call(req.body || {}, "isAvailable");
    const hasStock = Object.prototype.hasOwnProperty.call(req.body || {}, "stockQuantity") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "lowStockThreshold");
    if (!hasAvailability && !hasStock) {
      return res.status(400).json({ error: "No inventory changes were provided." });
    }
    if (hasAvailability && typeof req.body.isAvailable !== "boolean") {
      return res.status(400).json({ error: "Invalid availability value." });
    }

    let stockQuantity = null;
    let lowStockThreshold = 5;
    if (hasStock) {
      const rawQuantity = req.body.stockQuantity;
      const rawThreshold = req.body.lowStockThreshold;
      stockQuantity = rawQuantity === null || rawQuantity === "" || rawQuantity === undefined
        ? null : Number(rawQuantity);
      lowStockThreshold = rawThreshold === "" || rawThreshold === undefined
        ? 5 : Number(rawThreshold);
      if ((stockQuantity !== null && (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0)) ||
          !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
        return res.status(400).json({ error: "Enter a whole-number stock quantity and a zero-or-higher alert threshold." });
      }
    }

    const availability = hasAvailability ? req.body.isAvailable : null;
    const result = await pool.query(
      `UPDATE product_inventory
       SET is_available = COALESCE($1::boolean, is_available),
           stock_quantity = CASE WHEN $2::boolean THEN $3::integer ELSE stock_quantity END,
           low_stock_threshold = CASE WHEN $2::boolean THEN $4::integer ELSE low_stock_threshold END,
           updated_at = NOW()
       WHERE product_name = $5
       RETURNING product_name, is_available, stock_quantity, low_stock_threshold`,
      [availability, hasStock, stockQuantity, lowStockThreshold, productName]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Inventory product not found." });
    const row = result.rows[0];
    return res.json({
      success: true,
      product: {
        name: row.product_name,
        isAvailable: row.is_available,
        stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity),
        lowStockThreshold: Number(row.low_stock_threshold)
      }
    });
  } catch (error) {
    console.error("Inventory update error:", error.message);
    return res.status(500).json({ error: "Unable to update product inventory." });
  }
});

app.get("/api/products/availability", async (req, res) => {
  try {
    const result = await pool.query("SELECT product_name, is_available FROM product_inventory");
    const availability = {};
    result.rows.forEach(row => { availability[row.product_name] = row.is_available; });
    return res.json({ availability });
  } catch (error) {
    console.error("Public inventory error:", error.message);
    return res.status(500).json({ error: "Product availability is temporarily unavailable." });
  }
});

// PUBLIC ORDER TRACKING
app.post("/api/orders/track", trackingLimiter, async (req, res) => {
  try {
    const reference = String(req.body?.reference || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!reference || reference.length > 100 || !validEmail(email)) {
      return res.status(400).json({
        error: "Enter a valid order reference and email address."
      });
    }

    const result = await pool.query(
      `SELECT
        reference, product, package, amount, currency, status,
        fulfillment_status, created_at, delivered_at
       FROM orders
       WHERE reference = $1
       AND LOWER(customer_email) = $2
       LIMIT 1`,
      [reference, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Order not found. Check your reference and purchase email."
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

// ADMIN ORDER LIST AND STATISTICS
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
        COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) AS "totalRevenue",
        COUNT(*) FILTER (WHERE fulfillment_status = 'PENDING')::int AS "pendingOrders",
        COUNT(*) FILTER (WHERE fulfillment_status = 'PROCESSING')::int AS "processingOrders",
        COUNT(*) FILTER (WHERE fulfillment_status = 'DELIVERED')::int AS "deliveredOrders",
        COUNT(*) FILTER (WHERE fulfillment_status = 'CANCELLED')::int AS "cancelledOrders"
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

// ADMIN ABANDONED CHECKOUTS
app.get("/api/admin/abandoned-checkouts", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE abandoned_checkouts
       SET status = 'ABANDONED', updated_at = NOW()
       WHERE status = 'PENDING'
         AND created_at <= NOW() - INTERVAL '30 minutes'`
    );

    const result = await pool.query(
      `SELECT id, checkout_reference, customer_email, product,
              package_name, amount, status, created_at, completed_at
       FROM abandoned_checkouts
       ORDER BY created_at DESC
       LIMIT 500`
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'ABANDONED')::int AS abandoned,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
       FROM abandoned_checkouts`
    );

    return res.json({ checkouts: result.rows, stats: stats.rows[0] });
  } catch (error) {
    console.error("Abandoned checkout load error:", error.message);
    return res.status(500).json({ error: "Unable to load abandoned checkouts." });
  }
});

// ADMIN DELIVERY STATUS UPDATE
app.patch(
  "/api/admin/orders/:reference/status",
  requireAdmin,
  async (req, res) => {
    try {
      const reference = String(req.params.reference || "").trim();
      const fulfillmentStatus = String(
        req.body?.fulfillmentStatus || ""
      ).toUpperCase();

      if (
        !reference ||
        reference.length > 100 ||
        !fulfillmentStatuses.includes(fulfillmentStatus)
      ) {
        return res.status(400).json({
          error: "Invalid order reference or delivery status."
        });
      }

      const previousOrder = await pool.query(
        `SELECT reference, customer_email, product, package AS package_name,
                fulfillment_status
         FROM orders
         WHERE reference = $1 AND status = 'PAID'
         LIMIT 1`,
        [reference]
      );

      if (previousOrder.rows.length === 0) {
        return res.status(404).json({
          error: "Paid order not found."
        });
      }

      const oldStatus = previousOrder.rows[0].fulfillment_status;
      const result = await pool.query(
        `UPDATE orders
         SET
           fulfillment_status = $1::varchar,
           delivered_at = CASE
             WHEN $2::text = 'DELIVERED'
             THEN COALESCE(delivered_at, NOW())
             ELSE delivered_at
           END,
           fulfillment_updated_at = NOW(),
           updated_at = NOW()
         WHERE reference = $3
           AND status = 'PAID'
         RETURNING reference, fulfillment_status, delivered_at`,
        [fulfillmentStatus, fulfillmentStatus, reference]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Paid order not found."
        });
      }

      if (oldStatus !== fulfillmentStatus) {
        try {
          const customer = await pool.query(
            "SELECT id FROM customers WHERE LOWER(email) = LOWER($1) LIMIT 1",
            [previousOrder.rows[0].customer_email]
          );
          if (customer.rows.length) {
            const labels = {
              PENDING: "Pending",
              PROCESSING: "Processing",
              DELIVERED: "Delivered",
              CANCELLED: "Cancelled"
            };
            const nextLabel = labels[fulfillmentStatus] || fulfillmentStatus;
            await pool.query(
              `INSERT INTO customer_notifications
                 (customer_id, title, message, notification_type, reference)
               VALUES($1, $2, $3, 'ORDER_UPDATE', $4)`,
              [
                customer.rows[0].id,
                "Order status updated",
                previousOrder.rows[0].product + " (" + previousOrder.rows[0].package_name + ") is now " + nextLabel + ".",
                reference
              ]
            );
          }
        } catch (notificationError) {
          console.error("Customer notification creation error:", notificationError.message);
        }
      }

      if (oldStatus !== fulfillmentStatus) {
        try {
          await pool.query(
            "INSERT INTO admin_activity_log(actor, action, details) VALUES($1, $2, $3)",
            ["Admin", "Order delivery status changed", reference + " · " + oldStatus + " → " + fulfillmentStatus]
          );
        } catch (logError) {
          console.error("Admin activity log error:", logError.message);
        }
      }

      let statusEmailSent = false;
      let statusEmailMessage = "The order status was unchanged, so no email was sent.";
      if (oldStatus !== fulfillmentStatus) {
        try {
          await sendOrderStatusEmail({
            ...previousOrder.rows[0],
            fulfillment_status: fulfillmentStatus
          });
          statusEmailSent = true;
          statusEmailMessage = "Resend accepted the order status notification.";
        } catch (emailError) {
          const providerMessage =
            emailError.response?.data?.message ||
            emailError.response?.data?.error ||
            emailError.message ||
            "Unknown email error";
          statusEmailMessage = "Order status email was not sent: " + String(providerMessage).slice(0, 400);
          console.error("Order status email error:", emailError.response?.data || emailError.message);
        }
      }

      if (fulfillmentStatus === "DELIVERED") {
        const paidOrder = await pool.query(
          `SELECT o.reference, o.amount, c.id AS customer_id
           FROM orders o
           JOIN customers c ON LOWER(c.email) = LOWER(o.customer_email)
           WHERE o.reference = $1
           LIMIT 1`,
          [reference]
        );

        if (paidOrder.rows.length) {
          const row = paidOrder.rows[0];
          const points = Math.max(1, Math.floor(Number(row.amount)));
          await pool.query(
            `INSERT INTO loyalty_ledger(customer_id, order_reference, points)
             VALUES($1, $2, $3)
             ON CONFLICT(order_reference) DO NOTHING`,
            [row.customer_id, row.reference, points]
          );

          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const referral = await client.query(
              `SELECT id, referrer_customer_id, referred_customer_id
               FROM customer_referrals
               WHERE referred_customer_id = $1 AND status = 'PENDING'
               FOR UPDATE`,
              [row.customer_id]
            );
            if (referral.rows.length) {
              const referralRow = referral.rows[0];
              const bonusPoints = 100;
              await client.query(
                `INSERT INTO loyalty_ledger(customer_id, order_reference, points)
                 VALUES($1, $2, $3), ($4, $5, $3)
                 ON CONFLICT(order_reference) DO NOTHING`,
                [
                  referralRow.referrer_customer_id,
                  "REF-" + referralRow.id + "-INVITER",
                  bonusPoints,
                  referralRow.referred_customer_id,
                  "REF-" + referralRow.id + "-NEW"
                ]
              );
              await client.query(
                `UPDATE customer_referrals
                 SET status = 'REWARDED', points_awarded = $1,
                     qualifying_order_reference = $2, rewarded_at = NOW()
                 WHERE id = $3 AND status = 'PENDING'`,
                [bonusPoints, row.reference, referralRow.id]
              );
            }
            await client.query("COMMIT");
          } catch (referralError) {
            await client.query("ROLLBACK");
            console.error("Referral reward error:", referralError.message);
          } finally {
            client.release();
          }
        }
      }

      return res.json({
        success: true,
        order: result.rows[0],
        statusEmailSent,
        statusEmailMessage
      });
    } catch (error) {
      console.error("Delivery update error:", error.message);
      return res.status(500).json({
        error: "Unable to update delivery status."
      });
    }
  }
);

// PAYSTACK PAYMENT INITIALIZATION
app.post(
  "/api/payments/initialize",
  paymentLimiter,
  async (req, res) => {
    let loyaltyReference = null;
    try {
      const { email, product, packageIndex } = req.body || {};
      const couponCode = String(req.body?.couponCode || "").trim().toUpperCase();
      const loyaltyPoints = Number(req.body?.loyaltyPoints || 0);

      if (
        !validEmail(typeof email === "string" ? email.trim() : "") ||
        typeof product !== "string" ||
        !Object.prototype.hasOwnProperty.call(PRODUCT_PRICES, product) ||
        !Number.isInteger(packageIndex) ||
        packageIndex < 0 ||
        packageIndex >= (PRODUCT_PRICES[product]?.length || 0) ||
        !Number.isInteger(loyaltyPoints) ||
        loyaltyPoints < 0 ||
        (loyaltyPoints > 0 && (loyaltyPoints < 100 || loyaltyPoints % 100 !== 0))
      ) {
        return res.status(400).json({ error: "Invalid payment details or points amount." });
      }

      const stockResult = await pool.query(
        "SELECT is_available FROM product_inventory WHERE product_name = $1 LIMIT 1",
        [product]
      );
      if (stockResult.rows.length && stockResult.rows[0].is_available === false) {
        return res.status(409).json({ error: "This subscription is currently out of stock. Please check back later." });
      }

      const amount = PRODUCT_PRICES[product][packageIndex];
      const packageName = PACKAGE_NAMES[packageIndex];
      const baseAmountPesewas = amount * 100;
      let finalAmountPesewas = baseAmountPesewas;
      let discountPercent = 0;

      if (couponCode) {
        const couponResult = await pool.query(
          `SELECT discount_percent, expires_at, max_uses, uses
           FROM store_coupons
           WHERE code = $1 AND active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (max_uses IS NULL OR uses < max_uses)
           LIMIT 1`,
          [couponCode]
        );
        if (!couponResult.rows.length) {
          return res.status(400).json({ error: "This coupon is invalid, expired or has reached its usage limit." });
        }
        discountPercent = Number(couponResult.rows[0].discount_percent);
        finalAmountPesewas -= Math.floor(baseAmountPesewas * discountPercent / 100);
      }

      let customerId = null;
      if (loyaltyPoints > 0) {
        if (!String(process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_test_")) {
          return res.status(403).json({ error: "Points redemption is currently available in test mode only." });
        }
        if (!req.session?.customerId) {
          return res.status(401).json({ error: "Log in to your customer account to redeem points." });
        }
        const customerResult = await pool.query(
          "SELECT id, email FROM customers WHERE id = $1 AND email_verified = TRUE LIMIT 1",
          [req.session.customerId]
        );
        if (!customerResult.rows.length ||
            customerResult.rows[0].email.toLowerCase() !== email.trim().toLowerCase()) {
          return res.status(403).json({ error: "Use the email address connected to your logged-in account to redeem points." });
        }
        customerId = customerResult.rows[0].id;
        const discountPesewas = loyaltyPoints;
        if (discountPesewas > finalAmountPesewas - 100) {
          return res.status(400).json({ error: "Points must leave at least GH₵1.00 to pay." });
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
          await client.query(
            `UPDATE loyalty_redemptions SET status = 'RELEASED'
             WHERE customer_id = $1 AND status = 'PENDING' AND expires_at <= NOW()`,
            [customerId]
          );
          const balanceResult = await client.query(
            "SELECT COALESCE(SUM(points), 0)::int AS balance FROM loyalty_ledger WHERE customer_id = $1",
            [customerId]
          );
          const reservedResult = await client.query(
            `SELECT COALESCE(SUM(points), 0)::int AS reserved
             FROM loyalty_redemptions
             WHERE customer_id = $1 AND status = 'PENDING' AND expires_at > NOW()`,
            [customerId]
          );
          const available = Number(balanceResult.rows[0].balance) - Number(reservedResult.rows[0].reserved);
          if (available < loyaltyPoints) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "You do not have enough available points." });
          }
          loyaltyReference = crypto.randomUUID();
          await client.query(
            `INSERT INTO loyalty_redemptions
             (reference, customer_id, points, discount_pesewas, status, expires_at)
             VALUES ($1, $2, $3, $4, 'PENDING', NOW() + INTERVAL '24 hours')`,
            [loyaltyReference, customerId, loyaltyPoints, discountPesewas]
          );
          await client.query("COMMIT");
        } catch (reserveError) {
          await client.query("ROLLBACK");
          throw reserveError;
        } finally {
          client.release();
        }
        finalAmountPesewas -= loyaltyPoints;
      }

      const discountAmountPesewas = baseAmountPesewas - finalAmountPesewas;
      const baseUrl = process.env.BASE_URL.replace(/\/+$/, "");
      const initializePayload = {
        email: email.trim().toLowerCase(),
        amount: finalAmountPesewas,
        currency: "GHS",
        callback_url: `${baseUrl}/payment.html`,
        metadata: {
          product,
          package: packageName,
          couponCode: couponCode || null,
          discountPercent,
          discountAmountPesewas,
          loyaltyPoints,
          loyaltyReference
        }
      };
      if (loyaltyReference) initializePayload.reference = loyaltyReference;

      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        initializePayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      const checkout = response.data?.data;
      if (checkout?.reference) {
        await pool.query(
          `INSERT INTO abandoned_checkouts
             (checkout_reference, customer_email, product, package_name, amount, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')
           ON CONFLICT (checkout_reference) DO NOTHING`,
          [
            checkout.reference,
            email.trim().toLowerCase(),
            product,
            packageName,
            finalAmountPesewas / 100
          ]
        );
      }
      return res.json(checkout);
    } catch (error) {
      if (loyaltyReference) {
        await pool.query(
          "UPDATE loyalty_redemptions SET status = 'RELEASED' WHERE reference = $1 AND status = 'PENDING'",
          [loyaltyReference]
        ).catch(() => {});
      }
      console.error("Payment initialization error:", error.response?.data || error.message);
      return res.status(500).json({ error: "Unable to initialize payment." });
    }
  }
);

// PAYSTACK PAYMENT VERIFICATION
app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    const reference = String(req.params.reference || "").trim();
    if (!reference || reference.length > 100) {
      return res.status(400).json({ error: "Invalid payment reference." });
    }
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const payment = response.data.data;
    const metadata = payment.metadata || {};
    const expectedAmount = await getExpectedPaymentAmount(metadata);
    if (
      payment.status !== "success" ||
      payment.currency !== "GHS" ||
      expectedAmount === null ||
      payment.amount !== expectedAmount ||
      (metadata.loyaltyReference && metadata.loyaltyReference !== reference)
    ) {
      return res.status(400).json({ error: "Payment has not been confirmed." });
    }

    if (metadata.loyaltyReference) {
      const redemption = await pool.query(
        `SELECT r.customer_id, c.email
         FROM loyalty_redemptions r
         JOIN customers c ON c.id = r.customer_id
         WHERE r.reference = $1
           AND r.status IN ('PENDING','REDEEMED')
           AND (r.status = 'REDEEMED' OR r.expires_at > NOW())
         LIMIT 1`,
        [metadata.loyaltyReference]
      );
      if (!redemption.rows.length ||
          redemption.rows[0].email.toLowerCase() !== String(payment.customer?.email || '').toLowerCase()) {
        return res.status(400).json({ error: 'This points redemption is no longer valid for this payment email.' });
      }
    }

    await savePaidOrder(payment, metadata);

    if (metadata.loyaltyReference) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const redeemed = await client.query(
          `UPDATE loyalty_redemptions SET status = 'REDEEMED', redeemed_at = NOW()
           WHERE reference = $1 AND status = 'PENDING' AND expires_at > NOW()
           RETURNING customer_id, points`,
          [metadata.loyaltyReference]
        );
        if (redeemed.rows.length) {
          await client.query(
            `INSERT INTO loyalty_ledger(customer_id, order_reference, points)
             VALUES($1, $2, $3) ON CONFLICT(order_reference) DO NOTHING`,
            [redeemed.rows[0].customer_id, `REDEEM-${metadata.loyaltyReference}`, -Number(redeemed.rows[0].points)]
          );
        } else {
          const existing = await client.query(
            "SELECT status FROM loyalty_redemptions WHERE reference = $1 LIMIT 1",
            [metadata.loyaltyReference]
          );
          if (existing.rows[0]?.status !== "REDEEMED") {
            throw new Error("Points redemption could not be finalized.");
          }
        }
        await client.query("COMMIT");
      } catch (redeemError) {
        await client.query("ROLLBACK");
        throw redeemError;
      } finally {
        client.release();
      }
    }

    return res.json({ success: true, reference: payment.reference, status: payment.status });
  } catch (error) {
    console.error("Payment verification error:", error.response?.data || error.message);
    return res.status(500).json({ error: "Unable to verify payment." });
  }
});

// START SERVER
async function startServer() {
  try {
    await initializeDatabase();

    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_image TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS customer_email_changes (customer_id BIGINT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE, new_email VARCHAR(255) NOT NULL, code_hash VARCHAR(64) NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      reference VARCHAR(100) PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      points INTEGER NOT NULL CHECK (points >= 100 AND points % 100 = 0),
      discount_pesewas INTEGER NOT NULL CHECK (discount_pesewas = points),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REDEEMED','RELEASED')),
      expires_at TIMESTAMPTZ NOT NULL,
      redeemed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS loyalty_redemptions_customer_status_idx
      ON loyalty_redemptions(customer_id, status, expires_at);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_inventory (
        product_name TEXT PRIMARY KEY,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
        low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE product_inventory
        ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
        ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;
    `);
    for (const productName of Object.keys(PRODUCT_PRICES)) {
      await pool.query(
        `INSERT INTO product_inventory (product_name, is_available)
         VALUES ($1, TRUE)
         ON CONFLICT (product_name) DO NOTHING`,
        [productName]
      );
    }

    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS confirmation_email_status
          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS confirmation_email_sent_at
          TIMESTAMPTZ;
    `);

    app.listen(PORT, () => {
      console.log(`BHADEX PLUGS server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

startServer();
