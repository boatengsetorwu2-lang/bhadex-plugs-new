
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("BHADEX PLUGS database initialized.");
}

module.exports = {
  pool,
  initializeDatabase
};
