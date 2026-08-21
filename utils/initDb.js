const { run, get, all } = require('./db');
const bcrypt = require('bcryptjs');

let isInitialized = false;
let initPromise = null;

const safeAlter = async (sql) => {
  try { await run(sql); } catch (e) { /* column already exists */ }
};

const initDb = async () => {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // ─── Core tenant table ───────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        businessName TEXT NOT NULL,
        ownerName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        passwordHash TEXT NOT NULL,
        currency TEXT DEFAULT 'Rs.',
        status TEXT DEFAULT 'active',
        createdAt TEXT NOT NULL,
        lastLoginAt TEXT DEFAULT ''
      )`);

      // ─── Packages ────────────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        durationDays INTEGER NOT NULL DEFAULT 30,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'LKR',
        description TEXT DEFAULT '',
        features TEXT DEFAULT '[]',
        maxProducts INTEGER DEFAULT 500,
        maxUsers INTEGER DEFAULT 3,
        maxInvoicesPerMonth INTEGER DEFAULT 1000,
        hasOnlineShop INTEGER DEFAULT 1,
        hasReports INTEGER DEFAULT 1,
        hasWhatsapp INTEGER DEFAULT 1,
        hasInventory INTEGER DEFAULT 1,
        hasFeaturedProducts INTEGER DEFAULT 1,
        hasCustomBranding INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        isPopular INTEGER DEFAULT 0,
        sortOrder INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      )`);

      // ─── Subscriptions ───────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER NOT NULL,
        packageId INTEGER DEFAULT 0,
        status TEXT DEFAULT 'trial',
        startDate TEXT NOT NULL,
        expiryDate TEXT NOT NULL,
        isTrial INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL
      )`);

      // ─── Payments ────────────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER NOT NULL,
        packageId INTEGER DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'LKR',
        method TEXT DEFAULT 'cash',
        reference TEXT DEFAULT '',
        paymentDate TEXT NOT NULL,
        subscriptionStart TEXT DEFAULT '',
        subscriptionExpiry TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'paid',
        createdAt TEXT NOT NULL
      )`);

      // ─── Audit Logs ──────────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        adminId TEXT DEFAULT 'super_admin',
        targetBusinessId INTEGER DEFAULT 0,
        targetBusinessName TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        createdAt TEXT NOT NULL
      )`);

      // ─── SaaS Settings ───────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS saas_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saasName TEXT DEFAULT 'QuickBill POS',
        logo TEXT DEFAULT '',
        defaultCurrency TEXT DEFAULT 'LKR',
        trialEnabled INTEGER DEFAULT 1,
        trialDays INTEGER DEFAULT 7,
        defaultPackageId INTEGER DEFAULT 0,
        supportWhatsapp TEXT DEFAULT '',
        supportEmail TEXT DEFAULT '',
        maintenanceMode INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL
      )`);

      // ─── Super Admins ────────────────────────────────────────────────
      await run(`CREATE TABLE IF NOT EXISTS super_admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        name TEXT DEFAULT 'Super Admin',
        createdAt TEXT NOT NULL
      )`);

      // ─── Existing tables: add businessId column (safe) ───────────────
      await safeAlter(`ALTER TABLE products ADD COLUMN businessId INTEGER DEFAULT 0`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN businessId INTEGER DEFAULT 0`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN businessId INTEGER DEFAULT 0`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN businessId INTEGER DEFAULT 0`);
      await safeAlter(`ALTER TABLE reviews ADD COLUMN businessId INTEGER DEFAULT 0`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN customerPhone TEXT DEFAULT ''`);

      // ─── Existing tables: add missing fields (safe) ──────────────────
      await safeAlter(`ALTER TABLE products ADD COLUMN costPrice REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN discount REAL DEFAULT 0`);

      // ─── SaaS POS Upgrades (Payment & Fulfillment) ───────────────────
      await safeAlter(`ALTER TABLE sales ADD COLUMN paymentMethod TEXT DEFAULT 'Cash'`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN paymentStatus TEXT DEFAULT 'PAID'`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN orderStatus TEXT DEFAULT 'DELIVERED'`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN paymentReceivedAt TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN paymentReceivedBy TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN deliveryFee REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN delivery_cost REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE sales ADD COLUMN customerNotes TEXT DEFAULT ''`);

      await safeAlter(`ALTER TABLE online_orders ADD COLUMN paymentStatus TEXT DEFAULT 'UNPAID'`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN orderStatus TEXT DEFAULT 'PENDING'`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN deliveryFee REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN delivery_cost REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN customerNotes TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN deliveryCity TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN orderNumber TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN invoiceNumber TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN customerPhone TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN paymentReceivedAt TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE online_orders ADD COLUMN paymentReceivedBy TEXT DEFAULT ''`);

      await safeAlter(`ALTER TABLE settings ADD COLUMN invoiceFooter TEXT DEFAULT ''`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN tax REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN defaultDeliveryFee REAL DEFAULT 0`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN invoiceAccentColor TEXT DEFAULT '#22c55e'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN shopWebsite TEXT DEFAULT ''`);

      // ─── Shop styling & customization upgrades ───────────────────────
      await safeAlter(`ALTER TABLE settings ADD COLUMN shopStyle TEXT DEFAULT 'General'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN primaryColor TEXT DEFAULT '#00a86b'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN secondaryColor TEXT DEFAULT '#059669'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN buttonStyle TEXT DEFAULT 'rounded'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN productCardStyle TEXT DEFAULT 'grid'`);
      await safeAlter(`ALTER TABLE settings ADD COLUMN fontTheme TEXT DEFAULT 'Outfit'`);

      // ─── Advanced Product attributes & variants upgrades ─────────────
      await safeAlter(`ALTER TABLE products ADD COLUMN productType TEXT DEFAULT 'General'`);
      await safeAlter(`ALTER TABLE products ADD COLUMN attributes TEXT DEFAULT '{}'`);
      await safeAlter(`ALTER TABLE products ADD COLUMN hasVariants INTEGER DEFAULT 0`);

      // Ensure product_variants table exists
      await run(`CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT,
        productId TEXT NOT NULL,
        businessId INTEGER DEFAULT 0,
        sku TEXT,
        barcode TEXT,
        price REAL,
        stock INTEGER DEFAULT 0,
        image TEXT,
        attributes TEXT
      )`);

      // ─── Migration: normalize payment_status to PAID / UNPAID ──────────────────
      // Existing rows may carry legacy values (COD, PENDING, PARTIALLY_PAID, etc.).
      // COD means "not yet paid" → store as UNPAID; the UI renders it as UNPAID (COD).
      // Existing PAID invoices continue working unchanged.
      await run(`UPDATE sales SET paymentStatus = 'UNPAID' WHERE paymentStatus IN ('COD','PENDING')`);
      await run(`UPDATE sales SET paymentStatus = 'PAID' WHERE paymentStatus IS NULL OR paymentStatus = '' OR paymentStatus NOT IN ('PAID','UNPAID')`);
      await run(`UPDATE online_orders SET paymentStatus = 'UNPAID' WHERE paymentStatus IN ('COD','PENDING')`);
      await run(`UPDATE online_orders SET paymentStatus = 'PAID' WHERE paymentStatus = 'PAID'`);
      await run(`UPDATE online_orders SET paymentStatus = 'UNPAID' WHERE paymentStatus IS NULL OR paymentStatus = '' OR paymentStatus NOT IN ('PAID','UNPAID','CANCELLED','REFUNDED')`);

      // ─── Ensure products/sales tables exist (original schema) ────────
      await run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT, name TEXT, price REAL, image TEXT,
        size TEXT, color TEXT, stock INTEGER DEFAULT 0,
        isFeatured INTEGER DEFAULT 0, category TEXT,
        businessId INTEGER DEFAULT 0, costPrice REAL DEFAULT 0
      )`);

      await run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT, invoiceNumber TEXT,
        customerName TEXT DEFAULT 'Walking Customer',
        customerPhone TEXT DEFAULT '', deliveryAddress TEXT DEFAULT '',
        source TEXT DEFAULT 'pos', onlineOrderId TEXT DEFAULT '',
        items TEXT, totalAmount REAL, totalProfit REAL,
        discount REAL DEFAULT 0, date TEXT,
        businessId INTEGER DEFAULT 0
      )`);

      await run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shopName TEXT DEFAULT 'My Shop',
        shopLogo TEXT DEFAULT '', shopPhone TEXT DEFAULT '',
        whatsappNumber TEXT DEFAULT '', shopAddress TEXT DEFAULT '',
        shopEmail TEXT DEFAULT '', shopWebsite TEXT DEFAULT '',
        showLogoOnInvoice INTEGER DEFAULT 1,
        showPhoneOnInvoice INTEGER DEFAULT 1, enableOnlineShop INTEGER DEFAULT 1,
        showProductImages INTEGER DEFAULT 1, showOutOfStock INTEGER DEFAULT 0,
        showWhatsappOrderBtn INTEGER DEFAULT 1, themeColor TEXT DEFAULT '#00a86b',
        bannerMessage TEXT DEFAULT '', invoicePrefix TEXT DEFAULT 'QB-',
        currency TEXT DEFAULT 'Rs.', autoInvoiceNumber INTEGER DEFAULT 1,
        showAddressOnInvoice INTEGER DEFAULT 1, logo TEXT DEFAULT '',
        coverImage TEXT DEFAULT '', facebookUrl TEXT DEFAULT '',
        instagramUrl TEXT DEFAULT '', aboutText TEXT DEFAULT '',
        bankName TEXT DEFAULT '', accountName TEXT DEFAULT '',
        accountNumber TEXT DEFAULT '', bankBranch TEXT DEFAULT '',
        bankNote TEXT DEFAULT '', invoiceFooter TEXT DEFAULT '',
        tax REAL DEFAULT 0, defaultDeliveryFee REAL DEFAULT 0,
        invoiceAccentColor TEXT DEFAULT '#22c55e', businessId INTEGER DEFAULT 0
      )`);

      await run(`CREATE TABLE IF NOT EXISTS online_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT, onlineOrderId TEXT, orderNumber TEXT DEFAULT '',
        invoiceNumber TEXT DEFAULT '', customerName TEXT DEFAULT '',
        customerPhone TEXT DEFAULT '', deliveryAddress TEXT DEFAULT '',
        deliveryCity TEXT DEFAULT '', customerNotes TEXT DEFAULT '',
        paymentMethod TEXT DEFAULT 'Cash on Delivery (COD)',
        paymentStatus TEXT DEFAULT 'UNPAID', orderStatus TEXT DEFAULT 'PENDING',
        paymentReceivedAt TEXT DEFAULT '', paymentReceivedBy TEXT DEFAULT '',
        paymentSlip TEXT DEFAULT '', items TEXT, totalAmount REAL,
        deliveryFee REAL DEFAULT 0, status TEXT DEFAULT 'pending', date TEXT,
        businessId INTEGER DEFAULT 0
      )`);

      await run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT, name TEXT, rating INTEGER, comment TEXT, date TEXT,
        businessId INTEGER DEFAULT 0
      )`);

      // ─── Seed: Default packages ──────────────────────────────────────
      const pkgCount = await get(`SELECT COUNT(*) as cnt FROM packages`);
      if (!pkgCount || pkgCount.cnt === 0) {
        const now = new Date().toISOString();
        const defaultFeatures = JSON.stringify(['Unlimited Billing', 'Product Management', 'Sales Reports', 'WhatsApp Sharing', 'Online Shop', 'Invoice Generation']);
        await run(`INSERT INTO packages (name,durationDays,price,currency,description,features,maxProducts,maxUsers,maxInvoicesPerMonth,hasOnlineShop,hasReports,hasWhatsapp,hasInventory,hasFeaturedProducts,hasCustomBranding,isActive,isPopular,sortOrder,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ['Monthly', 30, 1500, 'LKR', 'Perfect for getting started', defaultFeatures, 200, 2, 500, 1, 1, 1, 1, 1, 0, 1, 0, 1, now]);
        await run(`INSERT INTO packages (name,durationDays,price,currency,description,features,maxProducts,maxUsers,maxInvoicesPerMonth,hasOnlineShop,hasReports,hasWhatsapp,hasInventory,hasFeaturedProducts,hasCustomBranding,isActive,isPopular,sortOrder,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ['3 Months', 90, 4000, 'LKR', 'Save more with quarterly plan', defaultFeatures, 500, 3, 1500, 1, 1, 1, 1, 1, 1, 1, 1, 2, now]);
        await run(`INSERT INTO packages (name,durationDays,price,currency,description,features,maxProducts,maxUsers,maxInvoicesPerMonth,hasOnlineShop,hasReports,hasWhatsapp,hasInventory,hasFeaturedProducts,hasCustomBranding,isActive,isPopular,sortOrder,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ['Yearly', 365, 12000, 'LKR', 'Best value — save 33%', defaultFeatures, 2000, 5, 9999, 1, 1, 1, 1, 1, 1, 1, 0, 3, now]);
        console.log('✅ Default packages seeded');
      }

      // ─── Seed: SaaS settings ─────────────────────────────────────────
      const saasCount = await get(`SELECT COUNT(*) as cnt FROM saas_settings`);
      if (!saasCount || saasCount.cnt === 0) {
        await run(`INSERT INTO saas_settings (saasName,trialEnabled,trialDays,updatedAt) VALUES ('QuickBill POS',1,7,?)`,
          [new Date().toISOString()]);
        console.log('✅ SaaS settings seeded');
      }

      // ─── Seed: Super Admin ───────────────────────────────────────────
      const saEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@quickbill.lk';
      const saPass = process.env.SUPER_ADMIN_PASSWORD || 'QuickBill@2026!';
      const existing = await get(`SELECT id FROM super_admins WHERE email = ?`, [saEmail]);
      if (!existing) {
        const hash = await bcrypt.hash(saPass, 12);
        await run(`INSERT INTO super_admins (email,passwordHash,name,createdAt) VALUES (?,?,?,?)`,
          [saEmail, hash, 'Super Admin', new Date().toISOString()]);
        console.log(`✅ Super Admin created: ${saEmail}`);
      }

      isInitialized = true;
      console.log('✅ Database initialized successfully');
    } catch (err) {
      console.error('❌ Database initialization error:', err.message);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};

module.exports = { initDb };
