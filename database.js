
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
  // Create orders table
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

  // Safely add missing order columns
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS fulfillment_status
        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fulfillment_updated_at
        TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  // Ensure existing orders have a delivery status
  await pool.query(`
    UPDATE orders
    SET fulfillment_status = 'PENDING'
    WHERE fulfillment_status IS NULL
       OR fulfillment_status = '';
  `);

  // Create customers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Prevent duplicate customer emails, including different letter cases
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique
    ON customers (LOWER(email));
  `);

  // Improve customer order lookup
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
