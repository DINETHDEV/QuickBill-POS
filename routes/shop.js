const express = require('express');
const router = express.Router();
const { run, get, all } = require('../utils/db');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
const os = require('os');

const uploadDir = (process.env.NODE_ENV === 'production' || process.env.VERCEL)
  ? os.tmpdir()
  : path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|gif|webp/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  }
});

const uploadToCloudinary = async (filePath, folder) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder: `quickbill/${folder}` });
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (e) { return `/uploads/${path.basename(filePath)}`; }
};

const getBizBySlug = async (slug) => {
  return await get(`SELECT * FROM businesses WHERE slug = ?`, [slug]);
};

// Generate human-readable order number  QB-260818-0001
const generateOrderNumber = async (businessId, prefix) => {
  const pref = (prefix || 'QB').replace(/-$/, '');
  const countRow = await get(`SELECT COUNT(*) as cnt FROM online_orders WHERE businessId = ?`, [businessId]);
  const n = (countRow ? countRow.cnt : 0) + 1;
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${pref}-${yy}${mm}${dd}-${String(n).padStart(4, '0')}`;
};

// ─── GET /api/shop/:slug/info ─────────────────────────────────────────────────
router.get('/:slug/info', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });

    const settings = await get(`SELECT * FROM settings WHERE businessId = ? LIMIT 1`, [biz.id]);
    if (!settings || settings.enableOnlineShop === 0) {
      return res.json({ success: false, message: 'This shop is currently offline.' });
    }

    res.json({
      success: true,
      shop: {
        slug: biz.slug,
        businessName: biz.businessName,
        currency: biz.currency,
        ...settings,
        showLogoOnInvoice: Boolean(settings?.showLogoOnInvoice),
        enableOnlineShop: Boolean(settings?.enableOnlineShop),
        showProductImages: Boolean(settings?.showProductImages),
        showOutOfStock: Boolean(settings?.showOutOfStock),
        showWhatsappOrderBtn: Boolean(settings?.showWhatsappOrderBtn),
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET /api/shop/:slug/products ─────────────────────────────────────────────
router.get('/:slug/products', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });

    const settings = await get(`SELECT showOutOfStock FROM settings WHERE businessId=? LIMIT 1`, [biz.id]);
    const showOutOfStock = settings ? Boolean(settings.showOutOfStock) : false;

    let sql = `SELECT * FROM products WHERE businessId=?`;
    const params = [biz.id];
    if (!showOutOfStock) { sql += ` AND stock > 0`; }
    sql += ` ORDER BY isFeatured DESC, id DESC`;

    const products = await all(sql, params);
    const result = [];
    for (const p of products) {
      let variants = [];
      if (p.hasVariants) {
        variants = await all(`SELECT * FROM product_variants WHERE productId = ? AND businessId = ?`, [p._id || String(p.id), biz.id]);
      }
      result.push({
        ...p,
        _id: p._id || String(p.id),
        isFeatured: Boolean(p.isFeatured),
        hasVariants: Boolean(p.hasVariants),
        productType: p.productType || 'General',
        attributes: JSON.parse(p.attributes || '{}'),
        variants: variants.map(v => ({
          ...v,
          _id: v._id || String(v.id),
          attributes: JSON.parse(v.attributes || '{}')
        }))
      });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── POST /api/shop/:slug/orders ──────────────────────────────────────────────
router.post('/:slug/orders', upload.single('paymentSlip'), async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });

    const settings = await get(`SELECT * FROM settings WHERE businessId=? LIMIT 1`, [biz.id]);

    const { customerName, customerPhone, deliveryAddress, deliveryCity, customerNotes, paymentMethod, paymentStatus, items, delivery_cost } = req.body;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : (items || []);

    // Validation
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!deliveryAddress || !deliveryAddress.trim()) {
      return res.status(400).json({ success: false, message: 'Delivery address is required' });
    }
    if (!parsedItems.length) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }

    let slipUrl = '';
    if (req.file) slipUrl = await uploadToCloudinary(req.file.path, 'slips');

    // Server-side secure price calculation
    let secureSubtotal = 0;
    const validatedItems = [];

    for (const item of parsedItems) {
      if (!item.quantity || item.quantity < 1) continue;
      if (item.productId) {
        const product = await get(`SELECT price, stock, name, hasVariants FROM products WHERE (id=? OR _id=?) AND businessId=?`,
          [item.productId, item.productId, biz.id]);
        if (product) {
          let price = product.price;
          let displayName = product.name || item.name;

          if (item.variantId) {
            const variant = await get(`SELECT price, stock FROM product_variants WHERE (id=? OR _id=?) AND productId=? AND businessId=?`,
              [item.variantId, item.variantId, item.productId, biz.id]);
            if (variant) {
              if (variant.stock <= 0) {
                return res.status(400).json({ success: false, message: `Option for product "${product.name}" is out of stock` });
              }
              price = variant.price !== null && variant.price !== undefined ? variant.price : product.price;
              // Deduct stock from variant
              await run(`UPDATE product_variants SET stock = MAX(0, stock - ?) WHERE (id=? OR _id=?) AND productId=? AND businessId=?`,
                [item.quantity, item.variantId, item.variantId, item.productId, biz.id]);
            } else {
              return res.status(400).json({ success: false, message: `Product option not found` });
            }
          } else {
            if (product.stock <= 0) {
              return res.status(400).json({ success: false, message: `Product "${product.name}" is out of stock` });
            }
            // Deduct stock from product
            await run(`UPDATE products SET stock = MAX(0, stock - ?) WHERE (id=? OR _id=?) AND businessId=?`,
              [item.quantity, item.productId, item.productId, biz.id]);
          }

          secureSubtotal += price * item.quantity;
          validatedItems.push({
            productId: item.productId,
            variantId: item.variantId || '',
            variantLabel: item.variantLabel || '',
            name: displayName,
            price: price,
            quantity: item.quantity,
            total: price * item.quantity
          });
        } else {
          return res.status(400).json({ success: false, message: `Product not found` });
        }
      } else {
        secureSubtotal += (item.price || 0) * item.quantity;
        validatedItems.push({ ...item, total: (item.price || 0) * item.quantity });
      }
    }

    if (!validatedItems.length) {
      return res.status(400).json({ success: false, message: 'No valid items in order' });
    }

    // Use explicit delivery_cost if provided (admin override), otherwise use settings default
    const delFee = (delivery_cost !== undefined && delivery_cost !== null && delivery_cost !== '')
      ? Math.max(0, parseFloat(delivery_cost) || 0)
      : parseFloat(settings?.defaultDeliveryFee || 0);
    const secureTotal = secureSubtotal + delFee;

    const pm = paymentMethod || 'Cash on Delivery (COD)';
    const isCOD = pm.toUpperCase().includes('COD') || pm.toUpperCase().includes('CASH ON DELIVERY');
    // Allow the online store to explicitly declare the payment status.
    // COD orders default to COD; paid-up-front orders are PAID.
    const paymentStatusRaw = String(paymentStatus || '').toUpperCase();
    
    let resolvedPaymentStatus = 'PAID';
    if (paymentStatusRaw === 'PAID') resolvedPaymentStatus = 'PAID';
    else if (paymentStatusRaw === 'UNPAID' || paymentStatusRaw === 'COD') resolvedPaymentStatus = 'COD';
    else resolvedPaymentStatus = isCOD ? 'COD' : 'PAID';
    const orderStatus = 'PENDING';

    // Generate human-readable order number
    const prefix = settings ? (settings.invoicePrefix || 'QB') : 'QB';
    const orderNumber = await generateOrderNumber(biz.id, prefix);

    const dateStr = new Date().toISOString();
    const result = await run(
      `INSERT INTO online_orders (orderNumber,customerName,customerPhone,deliveryAddress,deliveryCity,customerNotes,paymentMethod,paymentStatus,orderStatus,paymentSlip,items,totalAmount,deliveryFee,delivery_cost,status,date,businessId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNumber, customerName.trim(), customerPhone.trim(), deliveryAddress.trim(),
       deliveryCity || '', customerNotes || '', pm, resolvedPaymentStatus, orderStatus,
       slipUrl, JSON.stringify(validatedItems), secureTotal, delFee, delFee, 'pending', dateStr, biz.id]
    );
    await run(`UPDATE online_orders SET _id=? WHERE id=?`, [String(result.lastID), result.lastID]);

    const newOrder = await get(`SELECT * FROM online_orders WHERE id=?`, [result.lastID]);
    newOrder.items = JSON.parse(newOrder.items || '[]');

    res.json({
      success: true,
      order: newOrder,
      orderNumber: orderNumber,
      paymentStatus: resolvedPaymentStatus,
      orderStatus: orderStatus,
      totalAmount: secureTotal,
      currency: biz.currency || settings?.currency || 'Rs.',
      shopName: settings?.shopName || biz.businessName,
      message: 'Order placed successfully'
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/shop/:slug/categories ──────────────────────────────────────────
router.get('/:slug/categories', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });
    const rows = await all(
      `SELECT DISTINCT category FROM products WHERE businessId=? AND category IS NOT NULL AND category != '' AND stock > 0 ORDER BY category`,
      [biz.id]
    );
    res.json(rows.map(r => r.category));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET /api/shop/:slug/orders/:orderNumber ───────────────────────────────────
router.get('/:slug/orders/:orderNumber', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });

    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required to track an order' });

    const order = await get(
      `SELECT * FROM online_orders WHERE orderNumber=? AND businessId=?`,
      [req.params.orderNumber, biz.id]
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found. Please check the order number.' });

    // Validate phone matches (last 9 digits to handle country code variations)
    const cleanInputPhone  = phone.replace(/\D/g, '').slice(-9);
    const cleanOrderPhone  = (order.customerPhone || '').replace(/\D/g, '').slice(-9);
    if (cleanInputPhone !== cleanOrderPhone) {
      return res.status(403).json({ success: false, message: 'Phone number does not match this order.' });
    }

    // Return safe public fields only — no internal IDs
    res.json({
      success: true,
      order: {
        orderNumber:   order.orderNumber,
        customerName:  order.customerName,
        deliveryAddress: order.deliveryAddress,
        deliveryCity:  order.deliveryCity,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus:   order.orderStatus,
        totalAmount:   order.totalAmount,
        deliveryFee:   order.deliveryFee,
        delivery_cost: order.delivery_cost || order.deliveryFee || 0,
        date:          order.date,
        items:         JSON.parse(order.items || '[]').map(i => ({
          name: i.name, quantity: i.quantity, price: i.price, total: i.total
        }))
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET /api/shop/:slug/reviews ──────────────────────────────────────────────
router.get('/:slug/reviews', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });
    const reviews = await all(`SELECT id,name,rating,comment,date FROM reviews WHERE businessId=? ORDER BY id DESC LIMIT 10`, [biz.id]);
    res.json(reviews);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── POST /api/shop/:slug/reviews ─────────────────────────────────────────────
router.post('/:slug/reviews', async (req, res) => {
  try {
    const biz = await getBizBySlug(req.params.slug);
    if (!biz) return res.status(404).json({ success: false, message: 'Shop not found' });
    const { name, rating, comment } = req.body;
    if (!name || !rating) return res.status(400).json({ success: false, message: 'Name and rating are required' });
    const result = await run(`INSERT INTO reviews (name,rating,comment,date,businessId) VALUES (?,?,?,?,?)`,
      [name, Math.min(5, Math.max(1, parseInt(rating))), comment || '', new Date().toISOString(), biz.id]);
    const rev = await get(`SELECT * FROM reviews WHERE id=?`, [result.lastID]);
    res.json(rev);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
