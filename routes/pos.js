const express = require('express');
const router = express.Router();
const { run, get, all } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── File Upload ──────────────────────────────────────────────────────────────
const uploadDir = (process.env.NODE_ENV === 'production' || process.env.VERCEL)
  ? os.tmpdir()
  : path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

const uploadToCloudinary = async (filePath, folder) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder: `quickbill/${folder}` });
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (e) {
    return `/uploads/${path.basename(filePath)}`;
  }
};

const formatProduct = (p) => {
  if (!p) return null;
  return { ...p, _id: p._id || String(p.id), isFeatured: Boolean(p.isFeatured) };
};

const formatSettings = (s) => {
  if (!s) return {};
  return {
    ...s, _id: String(s.id),
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

// ─── Payment / Order Status Enums ────────────────────────────────────────────
const PAYMENT_STATUS = { PAID: 'PAID', COD: 'COD', PENDING: 'PENDING', PARTIALLY_PAID: 'PARTIALLY_PAID', CANCELLED: 'CANCELLED', REFUNDED: 'REFUNDED', UNPAID: 'UNPAID' };
const ORDER_STATUS   = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', PROCESSING: 'PROCESSING', READY: 'READY', SHIPPED: 'SHIPPED', DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED' };

// Map payment method → payment status for POS
const posPaymentStatus = (pm) => {
  if (!pm) return PAYMENT_STATUS.PAID;
  const upper = pm.toUpperCase();
  if (upper.includes('COD')) return PAYMENT_STATUS.COD;
  return PAYMENT_STATUS.PAID;
};

// ─── Sequential number generator ─────────────────────────────────────────────
const generateOrderNumber = async (businessId, prefix) => {
  const pref = prefix || 'QB';
  const countRow = await get(`SELECT COUNT(*) as cnt FROM online_orders WHERE businessId = ?`, [businessId]);
  const n = (countRow ? countRow.cnt : 0) + 1;
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${pref}-${yy}${mm}${dd}-${String(n).padStart(4, '0')}`;
};

const generateInvoiceNumber = async (businessId, prefix) => {
  const pref = (prefix || 'QB-').replace(/-$/, '');
  const countRow = await get(`SELECT COUNT(*) as cnt FROM sales WHERE businessId = ?`, [businessId]);
  const n = (countRow ? countRow.cnt : 0) + 1;
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${pref}-${yy}${mm}${dd}-${String(n).padStart(4, '0')}`;
};

// All POS routes require auth + active subscription
router.use(authenticate, checkSubscription);

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const products = await all(`SELECT * FROM products WHERE businessId = ? ORDER BY id DESC`, [req.businessId]);
    res.json(products.map(formatProduct));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured, costPrice } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Product name is required' });
    if (isNaN(price) || parseFloat(price) < 0) return res.status(400).json({ success: false, message: 'Price must be a non-negative number' });
    if (isNaN(stock) || parseInt(stock) < 0) return res.status(400).json({ success: false, message: 'Stock must be a non-negative number' });

    let imageUrl = '';
    if (req.file) imageUrl = await uploadToCloudinary(req.file.path, 'products');

    const isFeat = (isFeatured === 'true' || isFeatured === true) ? 1 : 0;
    const result = await run(
      `INSERT INTO products (name,price,image,size,color,stock,category,isFeatured,businessId,costPrice) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, parseFloat(price) || 0, imageUrl, size || '', color || '', parseInt(stock) || 0,
       category || 'General', isFeat, req.businessId, parseFloat(costPrice) || 0]
    );
    await run(`UPDATE products SET _id = ? WHERE id = ?`, [String(result.lastID), result.lastID]);
    const newProd = await get(`SELECT * FROM products WHERE id = ?`, [result.lastID]);
    res.json(formatProduct(newProd));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured, costPrice } = req.body;
    const isFeat = (isFeatured === 'true' || isFeatured === true) ? 1 : 0;

    const existing = await get(`SELECT id FROM products WHERE (id = ? OR _id = ?) AND businessId = ?`, [req.params.id, req.params.id, req.businessId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    let imageUrl = null;
    if (req.file) imageUrl = await uploadToCloudinary(req.file.path, 'products');

    if (imageUrl) {
      await run(
        `UPDATE products SET name=?,price=?,image=?,size=?,color=?,stock=?,category=?,isFeatured=?,costPrice=? WHERE id=? AND businessId=?`,
        [name, parseFloat(price) || 0, imageUrl, size || '', color || '', parseInt(stock) || 0,
         category || 'General', isFeat, parseFloat(costPrice) || 0, existing.id, req.businessId]
      );
    } else {
      await run(
        `UPDATE products SET name=?,price=?,size=?,color=?,stock=?,category=?,isFeatured=?,costPrice=? WHERE id=? AND businessId=?`,
        [name, parseFloat(price) || 0, size || '', color || '', parseInt(stock) || 0,
         category || 'General', isFeat, parseFloat(costPrice) || 0, existing.id, req.businessId]
      );
    }
    const updated = await get(`SELECT * FROM products WHERE id = ?`, [existing.id]);
    res.json(formatProduct(updated));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/products/:id', async (req, res) => {
  try {
    await run(`DELETE FROM products WHERE (id = ? OR _id = ?) AND businessId = ?`, [req.params.id, req.params.id, req.businessId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SALES ────────────────────────────────────────────────────────────────────
router.get('/sales/:id', async (req, res) => {
  try {
    const sale = await get(`SELECT * FROM sales WHERE (id = ? OR _id = ?) AND businessId = ?`, [req.params.id, req.params.id, req.businessId]);
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    sale.items = JSON.parse(sale.items || '[]');
    res.json(sale);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/sales', async (req, res) => {
  try {
    const { items, customerName, customerPhone, deliveryAddress, source, onlineOrderId,
            discount, paymentMethod, deliveryFee, customerNotes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty' });
    }

    const settingsRow = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    const prefix = settingsRow ? (settingsRow.invoicePrefix || 'QB') : 'QB';
    const invoiceNumber = await generateInvoiceNumber(req.businessId, prefix);

    // Server-side secure calculation
    let secureSubtotal = 0;
    let totalProfit = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({ success: false, message: `Invalid quantity for item: ${item.name || item.productId}` });
      }
      if (item.productId) {
        const product = await get(`SELECT costPrice, price, name, stock FROM products WHERE (id = ? OR _id = ?) AND businessId = ?`,
          [item.productId, item.productId, req.businessId]);
        if (product) {
          secureSubtotal += product.price * item.quantity;
          if (product.costPrice > 0) totalProfit += (product.price - product.costPrice) * item.quantity;
          validatedItems.push({ productId: item.productId, name: product.name || item.name, price: product.price, quantity: item.quantity, total: product.price * item.quantity });
        } else {
          // Non-product line item (e.g. delivery)
          secureSubtotal += (item.price || 0) * item.quantity;
          validatedItems.push({ ...item, total: (item.price || 0) * item.quantity });
        }
      } else {
        secureSubtotal += (item.price || 0) * item.quantity;
        validatedItems.push({ ...item, total: (item.price || 0) * item.quantity });
      }
    }

    const discountAmt = parseFloat(discount) || 0;
    const delFee = parseFloat(deliveryFee) || 0;
    const taxRate = settingsRow ? (parseFloat(settingsRow.tax) || 0) : 0;
    const taxAmt = Math.round(secureSubtotal * taxRate / 100 * 100) / 100;
    const finalAmount = Math.max(0, secureSubtotal + delFee + taxAmt - discountAmt);

    const pm = paymentMethod || 'Cash';
    const ps = posPaymentStatus(pm);
    const os = source === 'online' ? ORDER_STATUS.PENDING : ORDER_STATUS.DELIVERED;

    const dateStr = new Date().toISOString();
    const result = await run(
      `INSERT INTO sales (invoiceNumber,customerName,customerPhone,deliveryAddress,source,onlineOrderId,items,totalAmount,totalProfit,discount,date,businessId,paymentMethod,paymentStatus,orderStatus,deliveryFee,customerNotes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invoiceNumber, customerName || 'Walking Customer', customerPhone || '', deliveryAddress || '',
       source || 'pos', onlineOrderId || '', JSON.stringify(validatedItems), finalAmount, totalProfit,
       discountAmt, dateStr, req.businessId, pm, ps, os, delFee, customerNotes || '']
    );

    await run(`UPDATE sales SET _id = ? WHERE id = ?`, [String(result.lastID), result.lastID]);

    // Update stock
    for (const item of items) {
      if (item.productId) {
        await run(`UPDATE products SET stock = MAX(0, stock - ?) WHERE (id = ? OR _id = ?) AND businessId = ?`,
          [item.quantity, item.productId, item.productId, req.businessId]);
      }
    }

    const newSale = await get(`SELECT * FROM sales WHERE id = ?`, [result.lastID]);
    newSale.items = JSON.parse(newSale.items || '[]');
    res.json(newSale);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── REPORTS ──────────────────────────────────────────────────────────────────
router.get('/reports/summary', async (req, res) => {
  try {
    const sales = await all(`SELECT * FROM sales WHERE source != 'online' AND businessId = ?`, [req.businessId]);
    const totalSales = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    const products = await all(`SELECT * FROM products WHERE businessId = ?`, [req.businessId]);
    const lowStock = products.filter(p => p.stock < 10 && p.stock >= 0);
    const bestSelling = products.slice(0, 3).map(formatProduct);
    res.json({ totalSales, totalProfit, lowStockCount: lowStock.length, totalItems: products.length, bestSelling });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/reports/daily', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sales = await all(`SELECT * FROM sales WHERE source != 'online' AND businessId = ? AND date >= ?`,
      [req.businessId, startOfDay.toISOString()]);
    res.json(sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/reports/all', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT * FROM sales WHERE source != 'online' AND businessId = ?`;
    const params = [req.businessId];
    if (from) { sql += ` AND date >= ?`; params.push(new Date(from).toISOString()); }
    if (to) { sql += ` AND date <= ?`; params.push(new Date(to + 'T23:59:59').toISOString()); }
    sql += ` ORDER BY date DESC`;
    const sales = await all(sql, params);
    res.json(sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    let settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    if (!settings) {
      await run(`INSERT INTO settings (shopName,businessId) VALUES (?,?)`, ['My Shop', req.businessId]);
      settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    }
    res.json(formatSettings(settings));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/settings', async (req, res) => {
  try {
    let settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    if (!settings) {
      await run(`INSERT INTO settings (shopName,businessId) VALUES (?,?)`, ['My Shop', req.businessId]);
      settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    }

    const allowed = ['shopName','shopLogo','shopPhone','whatsappNumber','shopAddress','shopEmail','shopWebsite',
      'showLogoOnInvoice','showPhoneOnInvoice','enableOnlineShop','showProductImages',
      'showOutOfStock','showWhatsappOrderBtn','themeColor','bannerMessage','invoicePrefix',
      'currency','autoInvoiceNumber','showAddressOnInvoice','logo','coverImage',
      'facebookUrl','instagramUrl','aboutText','bankName','accountName','accountNumber',
      'bankBranch','bankNote','invoiceFooter','tax','defaultDeliveryFee','invoiceAccentColor'];

    const updates = [], values = [];
    for (const key of allowed) {
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
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── ASSET UPLOAD ─────────────────────────────────────────────────────────────
router.post('/upload-asset', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const imageUrl = await uploadToCloudinary(req.file.path, 'assets');
    res.json({ url: imageUrl });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── ONLINE ORDERS ────────────────────────────────────────────────────────────
router.get('/online-orders', async (req, res) => {
  try {
    const { paymentStatus, orderStatus } = req.query;
    let sql = `SELECT * FROM online_orders WHERE businessId = ?`;
    const params = [req.businessId];
    if (paymentStatus && paymentStatus !== 'ALL') { sql += ` AND paymentStatus = ?`; params.push(paymentStatus); }
    if (orderStatus  && orderStatus  !== 'ALL') { sql += ` AND orderStatus = ?`;  params.push(orderStatus); }
    sql += ` ORDER BY id DESC`;
    const orders = await all(sql, params);
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items || '[]') })));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single order
router.get('/online-orders/:id', async (req, res) => {
  try {
    const order = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.items = JSON.parse(order.items || '[]');
    res.json(order);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Update order status
router.patch('/online-orders/:id/status', async (req, res) => {
  try {
    const { orderStatus } = req.body;
    if (!Object.values(ORDER_STATUS).includes(orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }
    // Don't allow status change on cancelled+refunded
    const existing = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });
    if (existing.paymentStatus === 'REFUNDED' && orderStatus !== 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot change status of a refunded order' });
    }

    await run(`UPDATE online_orders SET orderStatus = ?, status = ? WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [orderStatus, orderStatus.toLowerCase(), req.params.id, req.params.id, req.businessId]);

    const updated = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (updated) updated.items = JSON.parse(updated.items || '[]');
    res.json(updated);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Mark order as paid (COD confirmation)
router.patch('/online-orders/:id/mark-paid', async (req, res) => {
  try {
    const existing = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });

    // Business rules: cannot mark paid if already refunded or cancelled
    if (existing.paymentStatus === 'REFUNDED') {
      return res.status(400).json({ success: false, message: 'Cannot mark a refunded order as paid' });
    }
    if (existing.paymentStatus === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot mark a cancelled order as paid' });
    }
    if (existing.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Order is already marked as paid' });
    }

    const dateStr = new Date().toISOString();
    const businessInfo = await get(`SELECT businessName FROM businesses WHERE id = ?`, [req.businessId]);
    const receivedBy = businessInfo ? businessInfo.businessName : 'Admin';

    await run(`UPDATE online_orders SET paymentStatus = 'PAID', paymentReceivedAt = ?, paymentReceivedBy = ? WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [dateStr, receivedBy, req.params.id, req.params.id, req.businessId]);

    await run(`INSERT INTO audit_logs (action, targetBusinessId, metadata, createdAt) VALUES (?,?,?,?)`,
      ['ONLINE_ORDER_MARKED_PAID', req.businessId,
       JSON.stringify({ orderId: req.params.id, orderNumber: existing.orderNumber, customerName: existing.customerName }),
       dateStr]);

    const updated = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (updated) updated.items = JSON.parse(updated.items || '[]');
    res.json(updated);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Cancel order
router.patch('/online-orders/:id/cancel', async (req, res) => {
  try {
    const existing = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });
    if (existing.orderStatus === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a delivered order' });
    }

    const dateStr = new Date().toISOString();
    await run(`UPDATE online_orders SET orderStatus = 'CANCELLED', status = 'cancelled', paymentStatus = CASE WHEN paymentStatus='PAID' THEN 'REFUNDED' ELSE 'CANCELLED' END WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);

    await run(`INSERT INTO audit_logs (action, targetBusinessId, metadata, createdAt) VALUES (?,?,?,?)`,
      ['ONLINE_ORDER_CANCELLED', req.businessId,
       JSON.stringify({ orderId: req.params.id, orderNumber: existing.orderNumber }),
       dateStr]);

    const updated = await get(`SELECT * FROM online_orders WHERE (id = ? OR _id = ?) AND businessId = ?`,
      [req.params.id, req.params.id, req.businessId]);
    if (updated) updated.items = JSON.parse(updated.items || '[]');
    res.json(updated);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await all(`SELECT * FROM reviews WHERE businessId = ? ORDER BY id DESC LIMIT 10`, [req.businessId]);
    res.json(reviews);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SUBSCRIPTION STATUS ──────────────────────────────────────────────────────
router.get('/subscription/status', async (req, res) => {
  try {
    const sub = await get(
      `SELECT s.*, p.name as packageName, p.price as packagePrice FROM subscriptions s LEFT JOIN packages p ON s.packageId = p.id WHERE s.businessId = ? ORDER BY s.id DESC LIMIT 1`,
      [req.businessId]
    );
    if (!sub) return res.json({ success: true, status: 'none', daysRemaining: 0 });
    const expiry = new Date(sub.expiryDate);
    const daysRemaining = Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)));
    res.json({ success: true, ...sub, daysRemaining, isTrial: Boolean(sub.isTrial) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SYSTEM ───────────────────────────────────────────────────────────────────
router.get('/system/backup', async (req, res) => {
  try {
    const products = await all(`SELECT * FROM products WHERE businessId = ?`, [req.businessId]);
    const sales = await all(`SELECT * FROM sales WHERE businessId = ?`, [req.businessId]);
    const settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    res.json({
      products: products.map(formatProduct),
      sales: sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') })),
      settings: formatSettings(settings)
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/system/restore', async (req, res) => {
  try {
    const { products, sales, settings } = req.body;

    if (products && products.length) {
      await run(`DELETE FROM products WHERE businessId = ?`, [req.businessId]);
      for (const p of products) {
        const r = await run(
          `INSERT INTO products (name,price,image,size,color,stock,category,isFeatured,businessId,costPrice) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [p.name, p.price, p.image||'', p.size||'', p.color||'', p.stock||0, p.category||'General', p.isFeatured?1:0, req.businessId, p.costPrice||0]
        );
        await run(`UPDATE products SET _id = ? WHERE id = ?`, [p._id || String(r.lastID), r.lastID]);
      }
    }

    if (sales && sales.length) {
      await run(`DELETE FROM sales WHERE businessId = ?`, [req.businessId]);
      for (const s of sales) {
        await run(
          `INSERT INTO sales (invoiceNumber,customerName,customerPhone,items,totalAmount,discount,businessId,date) VALUES (?,?,?,?,?,?,?,?)`,
          [s.invoiceNumber, s.customerName||'', s.customerPhone||'',
           typeof s.items==='string'?s.items:JSON.stringify(s.items),
           s.totalAmount, s.discount||0, req.businessId, s.date]
        );
      }
    }

    if (settings) {
      const existing = await get(`SELECT id FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
      if (existing) {
        await run(
          `UPDATE settings SET shopName=?,shopPhone=?,whatsappNumber=?,shopAddress=?,shopEmail=?,currency=?,enableOnlineShop=?,themeColor=?,bannerMessage=?,aboutText=?,facebookUrl=?,instagramUrl=? WHERE id=?`,
          [settings.shopName||'', settings.shopPhone||'', settings.whatsappNumber||'', settings.shopAddress||'',
           settings.shopEmail||'', settings.currency||'Rs.', settings.enableOnlineShop===false?0:1,
           settings.themeColor||'#00a86b', settings.bannerMessage||'', settings.aboutText||'',
           settings.facebookUrl||'', settings.instagramUrl||'', existing.id]
        );
      }
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/system/products', async (req, res) => {
  try {
    await run(`DELETE FROM products WHERE businessId = ?`, [req.businessId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/system/reset', async (req, res) => {
  try {
    await run(`DELETE FROM products WHERE businessId = ?`, [req.businessId]);
    await run(`DELETE FROM sales WHERE businessId = ?`, [req.businessId]);
    await run(`DELETE FROM settings WHERE businessId = ?`, [req.businessId]);
    await run(`INSERT INTO settings (shopName,businessId) VALUES (?,?)`, ['My Shop', req.businessId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/system/seed-srilanka', async (req, res) => {
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
    await run(`DELETE FROM products WHERE businessId = ?`, [req.businessId]);
    for (const p of slProducts) {
      const r = await run(
        `INSERT INTO products (name,price,image,size,color,stock,category,isFeatured,businessId) VALUES (?,?,?,?,?,?,?,?,?)`,
        [p.name, p.price, p.image, '', '', p.stock, p.category, p.isFeatured, req.businessId]
      );
      await run(`UPDATE products SET _id = ? WHERE id = ?`, [String(r.lastID), r.lastID]);
    }
    const settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [req.businessId]);
    if (settings) {
      await run(`UPDATE settings SET shopName=?,shopPhone=?,whatsappNumber=?,shopAddress=?,currency=?,bannerMessage=?,themeColor=? WHERE id=?`,
        ['Wasana Supermarket & Retail','011 234 5678','077 123 4567','No. 120, Galle Road, Colombo 03, Sri Lanka','Rs.',
         'දිවයින පුරා බෙදාහැරීම් (Islandwide Delivery) | Cash on Delivery Available','#00a86b', settings.id]);
    }
    res.json({ success: true, count: slProducts.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
module.exports.upload = upload;
