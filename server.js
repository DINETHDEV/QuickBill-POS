const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// --- SQLite Database Setup ---
const dbDir = (process.env.VERCEL || process.env.NODE_ENV === 'production')
  ? os.tmpdir() 
  : __dirname;
const dbPath = path.join(dbDir, 'quickbill.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
  } else {
    console.log('✅ SQLite Database Connected at:', dbPath);
  }
});

// Promisified SQL helpers
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

let isDbInitialized = false;
let initPromise = null;

const initDB = async () => {
  if (isDbInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT,
        name TEXT,
        price REAL,
        image TEXT,
        size TEXT,
        color TEXT,
        stock INTEGER DEFAULT 0,
        isFeatured INTEGER DEFAULT 0,
        category TEXT
      )`);

      await run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT,
        invoiceNumber TEXT,
        customerName TEXT DEFAULT 'Walking Customer',
        customerPhone TEXT DEFAULT '',
        deliveryAddress TEXT DEFAULT '',
        source TEXT DEFAULT 'pos',
        onlineOrderId TEXT DEFAULT '',
        items TEXT,
        totalAmount REAL,
        totalProfit REAL,
        date TEXT
      )`);

      await run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shopName TEXT DEFAULT 'Wasana Supermarket & Retail',
        shopLogo TEXT DEFAULT '',
        shopPhone TEXT DEFAULT '011 234 5678',
        whatsappNumber TEXT DEFAULT '077 123 4567',
        shopAddress TEXT DEFAULT 'No. 120, Galle Road, Colombo 03, Sri Lanka',
        shopEmail TEXT DEFAULT 'info@wasanasuper.lk',
        showLogoOnInvoice INTEGER DEFAULT 1,
        showPhoneOnInvoice INTEGER DEFAULT 1,
        enableOnlineShop INTEGER DEFAULT 1,
        showProductImages INTEGER DEFAULT 1,
        showOutOfStock INTEGER DEFAULT 0,
        showWhatsappOrderBtn INTEGER DEFAULT 1,
        themeColor TEXT DEFAULT '#00a86b',
        bannerMessage TEXT DEFAULT 'දිවයින පුරා බෙදාහැරීම් (Islandwide Delivery) | Cash on Delivery Available',
        invoicePrefix TEXT DEFAULT 'QB-',
        currency TEXT DEFAULT 'Rs.',
        autoInvoiceNumber INTEGER DEFAULT 1,
        showAddressOnInvoice INTEGER DEFAULT 1,
        logo TEXT DEFAULT '',
        coverImage TEXT DEFAULT '',
        facebookUrl TEXT DEFAULT 'https://facebook.com',
        instagramUrl TEXT DEFAULT 'https://instagram.com',
        aboutText TEXT DEFAULT 'Welcome to Wasana Supermarket! We provide high quality products across Sri Lanka.',
        bankName TEXT DEFAULT 'Commercial Bank of Ceylon',
        accountName TEXT DEFAULT 'Wasana Supermarket (Pvt) Ltd',
        accountNumber TEXT DEFAULT '1000 458 921',
        bankBranch TEXT DEFAULT 'Kollupitiya Branch',
        bankNote TEXT DEFAULT 'Please upload your bank payment slip to confirm your order.'
      )`);

      await run(`CREATE TABLE IF NOT EXISTS online_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT,
        onlineOrderId TEXT,
        customerName TEXT DEFAULT '',
        deliveryAddress TEXT DEFAULT '',
        paymentMethod TEXT DEFAULT 'Cash on Delivery (COD)',
        paymentSlip TEXT DEFAULT '',
        items TEXT,
        totalAmount REAL,
        status TEXT DEFAULT 'pending',
        date TEXT
      )`);

      await run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        _id TEXT,
        name TEXT,
        rating INTEGER,
        comment TEXT,
        date TEXT
      )`);

      const existingSettings = await get(`SELECT * FROM settings LIMIT 1`);
      if (!existingSettings) {
        await run(`INSERT INTO settings (shopName) VALUES ('Wasana Supermarket & Retail')`);
      }

      isDbInitialized = true;
      console.log('✅ SQLite Tables Initialized Successfully');
    } catch (err) {
      console.error('❌ Error initializing SQLite tables:', err.message);
    }
  })();

  return initPromise;
};

initDB();

// Middleware to ensure database is ready on Vercel Serverless Function invocations
app.use('/api', async (req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('API Middleware DB Init Error:', err);
    next();
  }
});

// Helper to format product output object with boolean transforms
const formatProduct = (p) => {
  if (!p) return null;
  return {
    ...p,
    _id: p._id || String(p.id),
    isFeatured: Boolean(p.isFeatured)
  };
};

const formatSettings = (s) => {
  if (!s) return {};
  return {
    ...s,
    _id: String(s.id),
    showLogoOnInvoice: Boolean(s.showLogoOnInvoice),
    showPhoneOnInvoice: Boolean(s.showPhoneOnInvoice),
    enableOnlineShop: Boolean(s.enableOnlineShop),
    showProductImages: Boolean(s.showProductImages),
    showOutOfStock: Boolean(s.showOutOfStock),
    showWhatsappOrderBtn: Boolean(s.showWhatsappOrderBtn),
    autoInvoiceNumber: Boolean(s.autoInvoiceNumber),
    showAddressOnInvoice: Boolean(s.showAddressOnInvoice)
  };
};

// --- File Upload Setup ---
const uploadDir = process.env.NODE_ENV === 'production' || process.env.VERCEL 
  ? os.tmpdir() 
  : path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API Routes ---

// 1. Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin123' && password === 'admin123') {
    res.json({ success: true, message: 'Logged in successfully' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 2. Products
app.get('/api/products', async (req, res) => {
  try {
    const products = await all(`SELECT * FROM products ORDER BY id DESC`);
    res.json(products.map(formatProduct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured } = req.body;
    let imageUrl = '';
    
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'quickbill/products' });
        imageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        imageUrl = `/uploads/${req.file.filename}`;
      }
    }
    
    const isFeat = (isFeatured === 'true' || isFeatured === true) ? 1 : 0;
    const result = await run(
      `INSERT INTO products (name, price, image, size, color, stock, category, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, parseFloat(price) || 0, imageUrl, size || '', color || '', parseInt(stock) || 0, category || 'General', isFeat]
    );

    const insertedId = String(result.lastID);
    await run(`UPDATE products SET _id = ? WHERE id = ?`, [insertedId, result.lastID]);

    const newProd = await get(`SELECT * FROM products WHERE id = ?`, [result.lastID]);
    res.json(formatProduct(newProd));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured } = req.body;
    const isFeat = (isFeatured === 'true' || isFeatured === true) ? 1 : 0;

    let imageUrl = null;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'quickbill/products' });
        imageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        imageUrl = `/uploads/${req.file.filename}`;
      }
    }

    if (imageUrl) {
      await run(
        `UPDATE products SET name = ?, price = ?, image = ?, size = ?, color = ?, stock = ?, category = ?, isFeatured = ? WHERE id = ? OR _id = ?`,
        [name, parseFloat(price) || 0, imageUrl, size || '', color || '', parseInt(stock) || 0, category || 'General', isFeat, req.params.id, req.params.id]
      );
    } else {
      await run(
        `UPDATE products SET name = ?, price = ?, size = ?, color = ?, stock = ?, category = ?, isFeatured = ? WHERE id = ? OR _id = ?`,
        [name, parseFloat(price) || 0, size || '', color || '', parseInt(stock) || 0, category || 'General', isFeat, req.params.id, req.params.id]
      );
    }

    const updated = await get(`SELECT * FROM products WHERE id = ? OR _id = ?`, [req.params.id, req.params.id]);
    res.json(formatProduct(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await run(`DELETE FROM products WHERE id = ? OR _id = ?`, [req.params.id, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Billing & Sales
app.get('/api/sales/:id', async (req, res) => {
  try {
    const sale = await get(`SELECT * FROM sales WHERE id = ? OR _id = ?`, [req.params.id, req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sales', async (req, res) => {
  try {
    const { items, totalAmount, customerName, customerPhone, deliveryAddress, source, onlineOrderId } = req.body;
    
    const settingsRow = await get(`SELECT * FROM settings LIMIT 1`);
    const prefix = settingsRow ? (settingsRow.invoicePrefix || 'QB-') : 'QB-';
    
    const countRow = await get(`SELECT COUNT(*) as cnt FROM sales WHERE source != 'online'`);
    const count = countRow ? countRow.cnt : 0;
    const invoiceNumber = `${prefix}${String(count + 1).padStart(5, '0')}`;
    
    const totalProfit = totalAmount * 0.3;
    const dateStr = new Date().toISOString();

    const result = await run(
      `INSERT INTO sales (invoiceNumber, customerName, customerPhone, deliveryAddress, source, onlineOrderId, items, totalAmount, totalProfit, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        customerName || 'Walking Customer',
        customerPhone || '',
        deliveryAddress || '',
        source || 'pos',
        onlineOrderId || '',
        JSON.stringify(items || []),
        parseFloat(totalAmount) || 0,
        totalProfit,
        dateStr
      ]
    );

    const insertedId = String(result.lastID);
    await run(`UPDATE sales SET _id = ? WHERE id = ?`, [insertedId, result.lastID]);

    // Update stock levels
    for (const item of (items || [])) {
      if (item.productId) {
        await run(`UPDATE products SET stock = stock - ? WHERE id = ? OR _id = ?`, [item.quantity, item.productId, item.productId]);
      }
    }

    const newSale = await get(`SELECT * FROM sales WHERE id = ?`, [result.lastID]);
    newSale.items = JSON.parse(newSale.items || '[]');
    res.json(newSale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/summary', async (req, res) => {
  try {
    const sales = await all(`SELECT * FROM sales WHERE source != 'online'`);
    const totalSales = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    
    const products = await all(`SELECT * FROM products`);
    const lowStock = products.filter(p => p.stock < 10);
    const bestSelling = products.slice(0, 3).map(formatProduct);

    res.json({
      totalSales,
      totalProfit,
      lowStockCount: lowStock.length,
      totalItems: products.length,
      bestSelling
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/daily', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sales = await all(`SELECT * FROM sales WHERE source != 'online' AND date >= ?`, [startOfDay.toISOString()]);
    res.json(sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Settings
app.get('/api/settings', async (req, res) => {
  try {
    let settings = await get(`SELECT * FROM settings LIMIT 1`);
    if (!settings) {
      await run(`INSERT INTO settings (shopName) VALUES ('Wasana Supermarket & Retail')`);
      settings = await get(`SELECT * FROM settings LIMIT 1`);
    }
    res.json(formatSettings(settings));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    let settings = await get(`SELECT * FROM settings LIMIT 1`);
    if (!settings) {
      await run(`INSERT INTO settings (shopName) VALUES ('Wasana Supermarket & Retail')`);
      settings = await get(`SELECT * FROM settings LIMIT 1`);
    }

    const allowedKeys = [
      'shopName', 'shopLogo', 'shopPhone', 'whatsappNumber', 'shopAddress', 'shopEmail',
      'showLogoOnInvoice', 'showPhoneOnInvoice', 'enableOnlineShop', 'showProductImages',
      'showOutOfStock', 'showWhatsappOrderBtn', 'themeColor', 'bannerMessage', 'invoicePrefix',
      'currency', 'autoInvoiceNumber', 'showAddressOnInvoice', 'logo', 'coverImage',
      'facebookUrl', 'instagramUrl', 'aboutText', 'bankName', 'accountName', 'accountNumber',
      'bankBranch', 'bankNote'
    ];

    const updates = [];
    const values = [];

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        let val = req.body[key];
        if (typeof val === 'boolean') val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (updates.length > 0) {
      values.push(settings.id);
      await run(`UPDATE settings SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const updated = await get(`SELECT * FROM settings WHERE id = ?`, [settings.id]);
    res.json(formatSettings(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. System Management
app.get('/api/system/backup', async (req, res) => {
  try {
    const products = await all(`SELECT * FROM products`);
    const sales = await all(`SELECT * FROM sales`);
    const settings = await get(`SELECT * FROM settings LIMIT 1`);
    res.json({ 
      products: products.map(formatProduct), 
      sales: sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })), 
      settings: formatSettings(settings) 
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/restore', async (req, res) => {
  try {
    const { products, sales, settings } = req.body;
    if (products) {
      await run(`DELETE FROM products`);
      for (const p of products) {
        const isFeat = p.isFeatured ? 1 : 0;
        const resP = await run(
          `INSERT INTO products (name, price, image, size, color, stock, category, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.name, p.price, p.image || '', p.size || '', p.color || '', p.stock || 0, p.category || '', isFeat]
        );
        await run(`UPDATE products SET _id = ? WHERE id = ?`, [p._id || String(resP.lastID), resP.lastID]);
      }
    }
    if (sales) {
      await run(`DELETE FROM sales`);
      for (const s of sales) {
        const resS = await run(
          `INSERT INTO sales (invoiceNumber, customerName, customerPhone, deliveryAddress, source, onlineOrderId, items, totalAmount, totalProfit, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.invoiceNumber, s.customerName, s.customerPhone, s.deliveryAddress, s.source || 'pos', s.onlineOrderId || '', JSON.stringify(s.items || []), s.totalAmount, s.totalProfit || 0, s.date]
        );
        await run(`UPDATE sales SET _id = ? WHERE id = ?`, [s._id || String(resS.lastID), resS.lastID]);
      }
    }
    if (settings) {
      await run(`DELETE FROM settings`);
      await run(
        `INSERT INTO settings (shopName, shopPhone, whatsappNumber, shopAddress, currency, themeColor, bannerMessage) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [settings.shopName, settings.shopPhone, settings.whatsappNumber, settings.shopAddress, settings.currency || 'Rs.', settings.themeColor || '#00a86b', settings.bannerMessage || '']
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/system/products', async (req, res) => {
  try {
    await run(`DELETE FROM products`);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/system/reset', async (req, res) => {
  try {
    await run(`DELETE FROM products`);
    await run(`DELETE FROM sales`);
    await run(`DELETE FROM settings`);
    await run(`INSERT INTO settings (shopName) VALUES ('Wasana Supermarket & Retail')`);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed Sri Lanka Products Route
app.post('/api/system/seed-srilanka', async (req, res) => {
  try {
    const slProducts = [
      { name: "Dilmah Premium Ceylon Tea 100g", price: 450, stock: 50, category: "Groceries & Tea", isFeatured: 1, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500" },
      { name: "Munchee Super Cream Cracker 125g", price: 190, stock: 100, category: "Biscuits & Bakery", isFeatured: 1, image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500" },
      { name: "Maliban Chocolate Biscuits 100g", price: 160, stock: 80, category: "Biscuits & Bakery", isFeatured: 0, image: "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=500" },
      { name: "Keells Chicken Sausages 500g", price: 980, stock: 40, category: "Frozen & Meat", isFeatured: 1, image: "https://images.unsplash.com/photo-1528825871115-3581a5387919?w=500" },
      { name: "MD Mixed Fruit Jam 300g", price: 520, stock: 35, category: "Groceries & Spreads", isFeatured: 0, image: "https://images.unsplash.com/photo-1598153346810-860daafc16c4?w=500" },
      { name: "Kothmale Pasteurized Fresh Milk 1L", price: 480, stock: 30, category: "Dairy & Beverages", isFeatured: 1, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500" },
      { name: "Samaposha Nutritional Cereal 200g", price: 210, stock: 75, category: "Breakfast & Health", isFeatured: 1, image: "https://images.unsplash.com/photo-1517456793572-1d8efd6dc135?w=500" },
      { name: "Anchor Full Cream Milk Powder 400g", price: 1050, stock: 45, category: "Dairy & Beverages", isFeatured: 1, image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500" },
      { name: "Sri Lanka Suwandel Traditional Rice 1kg", price: 340, stock: 60, category: "Rice & Grains", isFeatured: 0, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500" }
    ];

    await run(`DELETE FROM products`);
    const inserted = [];

    for (const p of slProducts) {
      const resP = await run(
        `INSERT INTO products (name, price, image, size, color, stock, category, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.price, p.image, '', '', p.stock, p.category, p.isFeatured]
      );
      await run(`UPDATE products SET _id = ? WHERE id = ?`, [String(resP.lastID), resP.lastID]);
      inserted.push({ ...p, id: resP.lastID, _id: String(resP.lastID) });
    }
    
    await run(`UPDATE settings SET shopName = ?, shopPhone = ?, whatsappNumber = ?, shopAddress = ?, currency = ?, bannerMessage = ?, themeColor = ? WHERE id = 1`, [
      'Wasana Supermarket & Retail',
      '011 234 5678',
      '077 123 4567',
      'No. 120, Galle Road, Colombo 03, Sri Lanka',
      'Rs.',
      'දිවයින පුරා බෙදාහැරීම් (Islandwide Delivery) | Cash on Delivery Available',
      '#00a86b'
    ]);

    res.json({ success: true, count: inserted.length, products: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Route for Shop Assets
app.post('/api/upload-asset', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  try {
    let imageUrl = '';
    try {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'quickbill/assets' });
      imageUrl = result.secure_url;
      fs.unlinkSync(req.file.path);
    } catch(e) {
      imageUrl = `/uploads/${req.file.filename}`;
    }
    res.json({ url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Online Orders
app.post('/api/online-orders', upload.single('paymentSlip'), async (req, res) => {
  try {
    const { onlineOrderId, customerName, deliveryAddress, paymentMethod, totalAmount, items } = req.body;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    let slipUrl = '';
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'quickbill/slips' });
        slipUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch(e) {
        slipUrl = `/uploads/${req.file.filename}`;
      }
    }

    // Deduct stock
    for (const item of (parsedItems || [])) {
      if (item.productId) {
        await run(`UPDATE products SET stock = stock - ? WHERE id = ? OR _id = ?`, [item.quantity, item.productId, item.productId]);
      }
    }

    const dateStr = new Date().toISOString();
    const result = await run(
      `INSERT INTO online_orders (onlineOrderId, customerName, deliveryAddress, paymentMethod, paymentSlip, items, totalAmount, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [onlineOrderId, customerName, deliveryAddress, paymentMethod, slipUrl, JSON.stringify(parsedItems || []), parseFloat(totalAmount) || 0, 'pending', dateStr]
    );

    const insertedId = String(result.lastID);
    await run(`UPDATE online_orders SET _id = ? WHERE id = ?`, [insertedId, result.lastID]);

    const newOrder = await get(`SELECT * FROM online_orders WHERE id = ?`, [result.lastID]);
    newOrder.items = JSON.parse(newOrder.items || '[]');
    res.json(newOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/online-orders', async (req, res) => {
  try {
    const orders = await all(`SELECT * FROM online_orders ORDER BY id DESC`);
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items || '[]') })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/online-orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await run(`UPDATE online_orders SET status = ? WHERE id = ? OR _id = ?`, [status, req.params.id, req.params.id]);
    const updated = await get(`SELECT * FROM online_orders WHERE id = ? OR _id = ?`, [req.params.id, req.params.id]);
    if (updated) updated.items = JSON.parse(updated.items || '[]');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await all(`SELECT * FROM reviews ORDER BY id DESC LIMIT 5`);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    const dateStr = new Date().toISOString();
    const result = await run(
      `INSERT INTO reviews (name, rating, comment, date) VALUES (?, ?, ?, ?)`,
      [name, parseInt(rating) || 5, comment, dateStr]
    );
    const newRev = await get(`SELECT * FROM reviews WHERE id = ?`, [result.lastID]);
    res.json(newRev);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 QuickBill POS Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
