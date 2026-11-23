
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      reference VARCHAR(100) UNIQUE NOT NULL,
      customer_email VARCHAR(255),
      product VARCHAR(100) NOT NULL,
      package VARCHAR(50) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
      status VARCHAR(30) NOT NULL DEFAULT 'PAID',
      fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      delivered_at TIMESTAMPTZ,
      fulfillment_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS fulfillment_status
        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fulfillment_updated_at
        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS confirmation_email_status
        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS confirmation_email_sent_at
        TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE orders
    SET fulfillment_status = 'PENDING'
    WHERE fulfillment_status IS NULL
       OR fulfillment_status = '';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT TRUE,
      email_otp_hash TEXT,
      email_otp_expires_at TIMESTAMPTZ,
      email_otp_attempts INTEGER NOT NULL DEFAULT 0,
      email_otp_last_sent_at TIMESTAMPTZ,
      password_reset_otp_hash TEXT,
      password_reset_otp_expires_at TIMESTAMPTZ,
      password_reset_otp_attempts INTEGER NOT NULL DEFAULT 0,
      password_reset_last_sent_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS email_verified
        BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS email_otp_hash TEXT,
      ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS email_otp_attempts
        INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS email_otp_last_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS password_reset_otp_hash TEXT,
      ADD COLUMN IF NOT EXISTS password_reset_otp_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS password_reset_otp_attempts
        INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS password_reset_last_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at
        TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique
    ON customers (LOWER(email));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS orders_customer_email_lower_idx
    ON orders (LOWER(customer_email));
  `);

  console.log("BHADEX PLUGS database initialized.");
}

module.exports = {
  pool,
  initializeDatabase
};
