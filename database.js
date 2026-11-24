
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
        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(30),
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
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


  // BHADEX PLUGS feature upgrades
  await pool.query(`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS referral_code VARCHAR(30) UNIQUE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      category VARCHAR(50) NOT NULL,
      logo TEXT,
      description TEXT NOT NULL DEFAULT '',
      benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
      prices JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      availability VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_wishlist (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, product_name)
    );

    CREATE TABLE IF NOT EXISTS recently_viewed (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_name VARCHAR(100) NOT NULL,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, product_name)
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
      customer_email VARCHAR(255) NOT NULL,
      order_reference VARCHAR(100) UNIQUE NOT NULL,
      product VARCHAR(100) NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      review TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
      customer_email VARCHAR(255) NOT NULL,
      subject VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      order_reference VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
      admin_reply TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE support_tickets
      ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL';
    CREATE INDEX IF NOT EXISTS support_tickets_customer_created_idx
      ON support_tickets(customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS refund_requests (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
      customer_email VARCHAR(255) NOT NULL,
      order_reference VARCHAR(100) UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'UNDER_REVIEW',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      order_reference VARCHAR(100) UNIQUE NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_coupons (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(30) UNIQUE NOT NULL,
      discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 50),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_gift_cards (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(40) UNIQUE NOT NULL,
      value NUMERIC(12,2) NOT NULL,
      balance NUMERIC(12,2) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_announcements (
      id BIGSERIAL PRIMARY KEY,
      message VARCHAR(300) NOT NULL,
      link_url TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const seedProducts = [
    ["Netflix","Entertainment","https://cdn.simpleicons.org/netflix/E50914","Enjoy movies, TV shows and award-winning Netflix Originals.",["Access to movies and TV series","Netflix Original productions","Downloads where supported","Streaming quality based on your plan"],[35,90,170]],
    ["YouTube Premium","Entertainment","https://cdn.simpleicons.org/youtube/FF0000","Enjoy YouTube with fewer interruptions and extra playback features.",["Ad-free YouTube viewing","Background play","Offline downloads","YouTube Music Premium benefits"],[20,55,100]],
    ["Spotify Premium","Entertainment","https://cdn.simpleicons.org/spotify/1DB954","Enjoy your favourite music with Premium listening features.",["Ad-free music listening","Offline listening","On-demand song selection","Higher audio quality options"],[18,50,95]],
    ["Canva Pro","Productivity","https://www.google.com/s2/favicons?domain=canva.com&sz=128","Create professional designs with Canva's premium creative tools.",["Premium templates","Background remover","Premium photos and graphics","Design resizing tools","AI design features"],[25,70,135]],
    ["ChatGPT Plus","Productivity","https://www.google.com/s2/favicons?domain=openai.com&sz=128","Get access to additional ChatGPT capabilities and higher usage limits.",["Access to advanced AI capabilities","Higher usage limits","Image generation","Document and file analysis","Advanced research tools"],[45]],
    ["Microsoft 365","Productivity","https://www.google.com/s2/favicons?domain=microsoft.com&sz=128","Work smarter with Microsoft's productivity applications.",["Word, Excel and PowerPoint features","OneDrive cloud storage","File syncing","Collaboration tools"],[30,85,160]],
    ["Disney+","Entertainment","https://www.google.com/s2/favicons?domain=disneyplus.com&sz=128","Stream entertainment from Disney and its popular brands.",["Disney movies and series","Marvel entertainment","Star Wars content","Pixar movies","Downloads where supported"],[25,70,135]],
    ["Prime Video","Entertainment","https://www.google.com/s2/favicons?domain=primevideo.com&sz=128","Explore movies, television shows and Amazon Originals.",["Movies and TV shows","Amazon Original productions","Supported high-quality streaming","Downloads where supported"],[20,55,105]],
    ["Telegram Premium","Social","https://cdn.simpleicons.org/telegram/26A5E4","Unlock additional features for your Telegram experience.",["Faster downloads","Increased upload limits","Premium stickers and reactions","Premium profile badge","Voice-to-text features","Additional chat features"],[20,55,105]],
    ["Google One","Cloud","https://cdn.simpleicons.org/googleone/4285F4","Get additional cloud storage for your Google account.",["More Google storage","Store photos and videos","Additional Gmail storage","Device backups","Eligible family sharing"],[15,40,75]]
  ];
  for (let i = 0; i < seedProducts.length; i++) {
    const p = seedProducts[i];
    await pool.query(
      `INSERT INTO store_products(name,category,logo,description,benefits,prices,sort_order)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
       ON CONFLICT(name) DO NOTHING`,
      [p[0],p[1],p[2],p[3],JSON.stringify(p[4]),JSON.stringify(p[5]),i]
    );
  }

  console.log("BHADEX PLUGS database initialized.");
}

module.exports = {
  pool,
  initializeDatabase
};
