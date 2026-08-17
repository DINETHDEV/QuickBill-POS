const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { run, get, all } = require('../utils/db');
const { authenticateSuperAdmin } = require('../middleware/auth');

const JWT_SECRET = () => process.env.JWT_SECRET || 'fallback-secret-change-in-production';

// ─── Super Admin Login ────────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { email, password } = req.body;
    const admin = await get(`SELECT * FROM super_admins WHERE email = ?`, [email.toLowerCase().trim()]);
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    await run(`INSERT INTO audit_logs (action,adminId,metadata,createdAt) VALUES (?,?,?,?)`,
      ['SUPER_ADMIN_LOGIN', String(admin.id), JSON.stringify({ email }), new Date().toISOString()]);

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, name: admin.name, isSuperAdmin: true },
      JWT_SECRET(), { expiresIn: '12h' }
    );
    res.json({ success: true, token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// All routes below require Super Admin auth
router.use(authenticateSuperAdmin);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [totalBiz, activeSubs, trialSubs, expiredSubs, suspendedSubs, expiringSoon] = await Promise.all([
      get(`SELECT COUNT(*) as cnt FROM businesses`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'active'`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'trial'`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'expired'`),
      get(`SELECT COUNT(*) as cnt FROM businesses WHERE status = 'suspended'`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status IN ('active','trial','expiring_soon') AND expiryDate <= ? AND expiryDate > ?`, [sevenDaysAhead, now])
    ]);

    const totalRevenue = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status = 'paid'`);
    const monthRevenue = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status = 'paid' AND createdAt >= ?`, [monthStart]);
    const pendingRevenue = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status = 'pending'`);

    const recentBiz = await all(`SELECT b.id,b.businessName,b.ownerName,b.email,b.status,b.createdAt,
      s.status as subStatus, s.expiryDate, s.isTrial, p.name as packageName
      FROM businesses b
      LEFT JOIN subscriptions s ON s.businessId = b.id
      LEFT JOIN packages p ON s.packageId = p.id
      ORDER BY b.createdAt DESC LIMIT 8`);

    const recentPayments = await all(`SELECT p.*,b.businessName FROM payments p LEFT JOIN businesses b ON p.businessId = b.id ORDER BY p.createdAt DESC LIMIT 8`);

    // Monthly revenue chart (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const row = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' AND createdAt >= ? AND createdAt <= ?`, [mStart, mEnd]);
      monthlyRevenue.push({
        month: d.toLocaleString('default', { month: 'short' }),
        total: row?.total || 0
      });
    }

    res.json({
      success: true,
      stats: {
        totalBusinesses: totalBiz?.cnt || 0,
        activeSubscriptions: activeSubs?.cnt || 0,
        trialSubscriptions: trialSubs?.cnt || 0,
        expiredSubscriptions: expiredSubs?.cnt || 0,
        suspendedBusinesses: suspendedSubs?.cnt || 0,
        expiringSoon: expiringSoon?.cnt || 0,
        totalRevenue: totalRevenue?.total || 0,
        monthlyRevenue: monthRevenue?.total || 0,
        pendingRevenue: pendingRevenue?.total || 0
      },
      recentRegistrations: recentBiz.map(b => ({ ...b, isTrial: Boolean(b.isTrial) })),
      recentPayments,
      monthlyChart: monthlyRevenue
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Stats (lightweight summary for dashboard cards) ─────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalBiz, activeSubs, trialSubs] = await Promise.all([
      get(`SELECT COUNT(*) as cnt FROM businesses`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'active'`),
      get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'trial'`)
    ]);
    const totalRevenue = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status = 'paid'`);

    res.json({
      totalBusinesses: totalBiz?.cnt || 0,
      activeSubscriptions: (activeSubs?.cnt || 0) + (trialSubs?.cnt || 0),
      totalRevenue: totalRevenue?.total || 0
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Businesses ───────────────────────────────────────────────────────────────
router.get('/businesses', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [], params = [];
    if (search) {
      whereClauses.push(`(b.businessName LIKE ? OR b.email LIKE ? OR b.ownerName LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) { whereClauses.push(`s.status = ?`); params.push(status); }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const total = await get(
      `SELECT COUNT(*) as cnt FROM businesses b LEFT JOIN subscriptions s ON s.businessId = b.id AND s.id = (SELECT MAX(id) FROM subscriptions WHERE businessId = b.id) ${where}`,
      params
    );
    const businesses = await all(
      `SELECT b.id,b.slug,b.businessName,b.ownerName,b.email,b.phone,b.currency,b.status,b.createdAt,b.lastLoginAt,
       s.status as subStatus, s.expiryDate, s.isTrial, s.startDate, p.name as packageName, p.id as packageId
       FROM businesses b
       LEFT JOIN subscriptions s ON s.businessId = b.id AND s.id = (SELECT MAX(id) FROM subscriptions WHERE businessId = b.id)
       LEFT JOIN packages p ON s.packageId = p.id
       ${where}
       ORDER BY b.createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const now = new Date();
    const enriched = businesses.map(b => {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      const daysRemaining = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : 0;
      return { ...b, daysRemaining, isTrial: Boolean(b.isTrial) };
    });

    res.json({ success: true, businesses: enriched, total: total?.cnt || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/businesses/:id', async (req, res) => {
  try {
    const b = await get(
      `SELECT b.*,s.status as subStatus,s.expiryDate,s.startDate,s.isTrial,p.name as packageName,p.id as packageId
       FROM businesses b
       LEFT JOIN subscriptions s ON s.businessId = b.id AND s.id = (SELECT MAX(id) FROM subscriptions WHERE businessId = b.id)
       LEFT JOIN packages p ON s.packageId = p.id
       WHERE b.id = ?`, [req.params.id]
    );
    if (!b) return res.status(404).json({ success: false, message: 'Business not found' });

    const [salesStats, productStats, payments] = await Promise.all([
      get(`SELECT COUNT(*) as total, COALESCE(SUM(totalAmount),0) as revenue FROM sales WHERE businessId = ?`, [b.id]),
      get(`SELECT COUNT(*) as total FROM products WHERE businessId = ?`, [b.id]),
      all(`SELECT p.*,pk.name as packageName FROM payments p LEFT JOIN packages pk ON p.packageId = pk.id WHERE p.businessId = ? ORDER BY p.createdAt DESC LIMIT 10`, [b.id])
    ]);

    const todaySales = await get(`SELECT COALESCE(SUM(totalAmount),0) as total FROM sales WHERE businessId = ? AND date >= ?`,
      [b.id, new Date().toISOString().split('T')[0]]);

    const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
    const daysRemaining = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))) : 0;

    res.json({
      success: true,
      business: { ...b, daysRemaining, isTrial: Boolean(b.isTrial) },
      stats: { ...salesStats, ...productStats, todaySales: todaySales?.total || 0 },
      payments
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/businesses/:id', async (req, res) => {
  try {
    const { businessName, ownerName, email, phone, address, currency } = req.body;
    await run(`UPDATE businesses SET businessName=?,ownerName=?,email=?,phone=?,address=?,currency=? WHERE id=?`,
      [businessName, ownerName, email, phone || '', address || '', currency || 'Rs.', req.params.id]);
    await logAudit('BUSINESS_UPDATED', req.superAdmin.adminId, req.params.id, { fields: Object.keys(req.body) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/businesses/:id/suspend', async (req, res) => {
  try {
    const biz = await get(`SELECT businessName FROM businesses WHERE id = ?`, [req.params.id]);
    await run(`UPDATE businesses SET status='suspended' WHERE id=?`, [req.params.id]);
    await run(`UPDATE subscriptions SET status='suspended' WHERE businessId=?`, [req.params.id]);
    await logAudit('BUSINESS_SUSPENDED', req.superAdmin.adminId, req.params.id, { businessName: biz?.businessName });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/businesses/:id/activate', async (req, res) => {
  try {
    const biz = await get(`SELECT businessName FROM businesses WHERE id = ?`, [req.params.id]);
    await run(`UPDATE businesses SET status='active' WHERE id=?`, [req.params.id]);
    const sub = await get(`SELECT * FROM subscriptions WHERE businessId=? ORDER BY id DESC LIMIT 1`, [req.params.id]);
    if (sub) {
      const newStatus = new Date(sub.expiryDate) > new Date() ? 'active' : 'expired';
      await run(`UPDATE subscriptions SET status=? WHERE id=?`, [newStatus, sub.id]);
    }
    await logAudit('BUSINESS_ACTIVATED', req.superAdmin.adminId, req.params.id, { businessName: biz?.businessName });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Unified status toggle used by the super-admin frontend
router.post('/businesses/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use active or suspended.' });
    }
    const biz = await get(`SELECT businessName FROM businesses WHERE id = ?`, [req.params.id]);
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found' });
    await run(`UPDATE businesses SET status=? WHERE id=?`, [status, req.params.id]);
    if (status === 'suspended') {
      await run(`UPDATE subscriptions SET status='suspended' WHERE businessId=?`, [req.params.id]);
    } else {
      const sub = await get(`SELECT * FROM subscriptions WHERE businessId=? ORDER BY id DESC LIMIT 1`, [req.params.id]);
      if (sub) {
        const newStatus = new Date(sub.expiryDate) > new Date() ? 'active' : 'expired';
        await run(`UPDATE subscriptions SET status=? WHERE id=?`, [newStatus, sub.id]);
      }
    }
    const action = status === 'suspended' ? 'BUSINESS_SUSPENDED' : 'BUSINESS_ACTIVATED';
    await logAudit(action, req.superAdmin.adminId, req.params.id, { businessName: biz.businessName });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Grant or renew a subscription for a business
router.post('/businesses/:id/subscriptions', async (req, res) => {
  try {
    const { packageId, reference } = req.body;
    if (!packageId) return res.status(400).json({ success: false, message: 'packageId is required' });

    const biz = await get(`SELECT * FROM businesses WHERE id = ?`, [req.params.id]);
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found' });

    const pkg = await get(`SELECT * FROM packages WHERE id = ?`, [packageId]);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

    const now = new Date();
    const startDate = now.toISOString();
    const expiryDate = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000).toISOString();

    // Expire any current active subscriptions
    await run(`UPDATE subscriptions SET status='expired' WHERE businessId=? AND status IN ('active','trial','expiring_soon')`, [req.params.id]);

    const result = await run(
      `INSERT INTO subscriptions (businessId,packageId,status,startDate,expiryDate,isTrial,createdAt) VALUES (?,?,?,?,?,?,?)`,
      [req.params.id, packageId, 'active', startDate, expiryDate, 0, now.toISOString()]
    );

    // Record payment
    await run(
      `INSERT INTO payments (businessId,packageId,amount,currency,method,reference,paymentDate,subscriptionStart,subscriptionExpiry,notes,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.params.id, packageId, pkg.price, 'LKR', 'manual', reference || '', now.toISOString(),
       startDate, expiryDate, reference || 'Manual grant by super admin', 'paid', now.toISOString()]
    );

    await run(`UPDATE businesses SET status='active' WHERE id=?`, [req.params.id]);

    await logAudit('SUBSCRIPTION_GRANTED', req.superAdmin.adminId, req.params.id, {
      businessName: biz.businessName, packageName: pkg.name, expiryDate, reference: reference || ''
    });

    res.json({ success: true, message: `Subscription granted until ${new Date(expiryDate).toLocaleDateString()}` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/businesses/:id', async (req, res) => {
  try {
    const biz = await get(`SELECT businessName FROM businesses WHERE id = ?`, [req.params.id]);
    await run(`DELETE FROM businesses WHERE id=?`, [req.params.id]);
    await run(`DELETE FROM subscriptions WHERE businessId=?`, [req.params.id]);
    await run(`DELETE FROM products WHERE businessId=?`, [req.params.id]);
    await run(`DELETE FROM sales WHERE businessId=?`, [req.params.id]);
    await run(`DELETE FROM settings WHERE businessId=?`, [req.params.id]);
    await logAudit('BUSINESS_DELETED', req.superAdmin.adminId, req.params.id, { businessName: biz?.businessName });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/businesses/:id/reset-password', [
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    await run(`UPDATE businesses SET passwordHash=? WHERE id=?`, [hash, req.params.id]);
    await logAudit('PASSWORD_RESET', req.superAdmin.adminId, req.params.id, {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Packages ─────────────────────────────────────────────────────────────────
router.get('/packages', async (req, res) => {
  try {
    const packages = await all(`SELECT * FROM packages ORDER BY sortOrder, price`);
    res.json({ success: true, packages: packages.map(formatPackage) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/packages', async (req, res) => {
  try {
    const { name, durationDays, price, currency, description, features, maxProducts, maxUsers,
      maxInvoicesPerMonth, hasOnlineShop, hasReports, hasWhatsapp, hasInventory,
      hasFeaturedProducts, hasCustomBranding, isActive, isPopular, sortOrder } = req.body;

    if (!name || !durationDays || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name, duration, and price are required' });
    }
    const result = await run(
      `INSERT INTO packages (name,durationDays,price,currency,description,features,maxProducts,maxUsers,maxInvoicesPerMonth,hasOnlineShop,hasReports,hasWhatsapp,hasInventory,hasFeaturedProducts,hasCustomBranding,isActive,isPopular,sortOrder,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, durationDays, price, currency || 'LKR', description || '', JSON.stringify(features || []),
       maxProducts || 200, maxUsers || 2, maxInvoicesPerMonth || 500,
       hasOnlineShop ? 1 : 0, hasReports ? 1 : 0, hasWhatsapp ? 1 : 0, hasInventory ? 1 : 0,
       hasFeaturedProducts ? 1 : 0, hasCustomBranding ? 1 : 0, isActive !== false ? 1 : 0,
       isPopular ? 1 : 0, sortOrder || 0, new Date().toISOString()]
    );
    await logAudit('PACKAGE_CREATED', req.superAdmin.adminId, 0, { name, price });
    const pkg = await get(`SELECT * FROM packages WHERE id = ?`, [result.lastID]);
    res.json({ success: true, package: formatPackage(pkg) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/packages/:id', async (req, res) => {
  try {
    const { name, durationDays, price, currency, description, features, maxProducts, maxUsers,
      maxInvoicesPerMonth, hasOnlineShop, hasReports, hasWhatsapp, hasInventory,
      hasFeaturedProducts, hasCustomBranding, isActive, isPopular, sortOrder } = req.body;

    await run(
      `UPDATE packages SET name=?,durationDays=?,price=?,currency=?,description=?,features=?,maxProducts=?,maxUsers=?,maxInvoicesPerMonth=?,hasOnlineShop=?,hasReports=?,hasWhatsapp=?,hasInventory=?,hasFeaturedProducts=?,hasCustomBranding=?,isActive=?,isPopular=?,sortOrder=? WHERE id=?`,
      [name, durationDays, price, currency || 'LKR', description || '', JSON.stringify(features || []),
       maxProducts || 200, maxUsers || 2, maxInvoicesPerMonth || 500,
       hasOnlineShop ? 1 : 0, hasReports ? 1 : 0, hasWhatsapp ? 1 : 0, hasInventory ? 1 : 0,
       hasFeaturedProducts ? 1 : 0, hasCustomBranding ? 1 : 0, isActive !== false ? 1 : 0,
       isPopular ? 1 : 0, sortOrder || 0, req.params.id]
    );
    await logAudit('PACKAGE_UPDATED', req.superAdmin.adminId, 0, { id: req.params.id, name });
    const pkg = await get(`SELECT * FROM packages WHERE id = ?`, [req.params.id]);
    res.json({ success: true, package: formatPackage(pkg) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/packages/:id', async (req, res) => {
  try {
    const inUse = await get(`SELECT COUNT(*) as cnt FROM subscriptions WHERE packageId = ?`, [req.params.id]);
    if (inUse?.cnt > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete: ${inUse.cnt} active subscription(s) use this package. Disable it instead.` });
    }
    await run(`DELETE FROM packages WHERE id=?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Subscriptions ────────────────────────────────────────────────────────────
router.get('/subscriptions', async (req, res) => {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '', params = [];
    if (status) { where = `WHERE s.status = ?`; params.push(status); }

    const total = await get(`SELECT COUNT(*) as cnt FROM subscriptions s ${where}`, params);
    const subs = await all(
      `SELECT s.*,b.businessName,b.email,p.name as packageName FROM subscriptions s
       JOIN businesses b ON s.businessId = b.id
       LEFT JOIN packages p ON s.packageId = p.id
       ${where} ORDER BY s.createdAt DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const now = new Date();
    res.json({
      success: true,
      subscriptions: subs.map(s => {
        const expiry = new Date(s.expiryDate);
        return { ...s, daysRemaining: Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))), isTrial: Boolean(s.isTrial) };
      }),
      total: total?.cnt || 0
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/subscriptions/:id/extend', async (req, res) => {
  try {
    const { days } = req.body;
    if (!days || days <= 0) return res.status(400).json({ success: false, message: 'Days must be positive' });
    const sub = await get(`SELECT * FROM subscriptions WHERE id = ?`, [req.params.id]);
    if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });

    const currentExpiry = new Date(sub.expiryDate);
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    baseDate.setDate(baseDate.getDate() + parseInt(days));

    await run(`UPDATE subscriptions SET expiryDate=?,status='active',isTrial=0 WHERE id=?`,
      [baseDate.toISOString(), req.params.id]);
    await run(`UPDATE businesses SET status='active' WHERE id=?`, [sub.businessId]);
    await logAudit('SUBSCRIPTION_EXTENDED', req.superAdmin.adminId, sub.businessId, { days, newExpiry: baseDate.toISOString() });
    res.json({ success: true, newExpiry: baseDate.toISOString() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/subscriptions/:id/change', async (req, res) => {
  try {
    const { packageId } = req.body;
    const pkg = await get(`SELECT * FROM packages WHERE id = ?`, [packageId]);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    await run(`UPDATE subscriptions SET packageId=? WHERE id=?`, [packageId, req.params.id]);
    await logAudit('SUBSCRIPTION_CHANGED', req.superAdmin.adminId, 0, { packageId, packageName: pkg.name });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Payments ─────────────────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const { search, status, method, from, to, businessId, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const wheres = [], params = [];

    if (search) { wheres.push(`b.businessName LIKE ?`); params.push(`%${search}%`); }
    if (status) { wheres.push(`p.status = ?`); params.push(status); }
    if (method) { wheres.push(`p.method = ?`); params.push(method); }
    if (businessId) { wheres.push(`p.businessId = ?`); params.push(businessId); }
    if (from) { wheres.push(`p.paymentDate >= ?`); params.push(from); }
    if (to) { wheres.push(`p.paymentDate <= ?`); params.push(to + ' 23:59:59'); }

    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const [total, payments, summary] = await Promise.all([
      get(`SELECT COUNT(*) as cnt FROM payments p LEFT JOIN businesses b ON p.businessId = b.id ${where}`, params),
      all(`SELECT p.*,b.businessName,pk.name as packageName FROM payments p
           LEFT JOIN businesses b ON p.businessId = b.id
           LEFT JOIN packages pk ON p.packageId = pk.id
           ${where} ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]),
      get(`SELECT COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as collected,
           COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) as pending
           FROM payments p LEFT JOIN businesses b ON p.businessId = b.id ${where}`, params)
    ]);

    res.json({ success: true, payments, total: total?.cnt || 0, summary });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/payments', async (req, res) => {
  try {
    const { businessId, packageId, amount, currency, method, reference, paymentDate, subscriptionStart, subscriptionExpiry, notes, status } = req.body;
    if (!businessId || !amount) return res.status(400).json({ success: false, message: 'Business and amount are required' });

    const result = await run(
      `INSERT INTO payments (businessId,packageId,amount,currency,method,reference,paymentDate,subscriptionStart,subscriptionExpiry,notes,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [businessId, packageId || 0, parseFloat(amount), currency || 'LKR', method || 'cash', reference || '',
       paymentDate || new Date().toISOString().split('T')[0], subscriptionStart || '', subscriptionExpiry || '',
       notes || '', status || 'paid', new Date().toISOString()]
    );

    // If paid and has subscription dates, extend/activate subscription
    if (status === 'paid' && subscriptionExpiry) {
      const sub = await get(`SELECT id,expiryDate FROM subscriptions WHERE businessId=? ORDER BY id DESC LIMIT 1`, [businessId]);
      if (sub) {
        const currentExpiry = new Date(sub.expiryDate);
        const newExpiry = new Date(subscriptionExpiry);
        // Smart extension: if current expiry is in the future, extend from there
        const finalExpiry = currentExpiry > new Date() && currentExpiry > newExpiry ? currentExpiry : newExpiry;
        await run(`UPDATE subscriptions SET status='active',expiryDate=?,isTrial=0,packageId=? WHERE id=?`,
          [finalExpiry.toISOString(), packageId || sub.packageId, sub.id]);
        await run(`UPDATE businesses SET status='active' WHERE id=?`, [businessId]);
      } else if (packageId) {
        const pkg = await get(`SELECT durationDays FROM packages WHERE id=?`, [packageId]);
        const start = new Date(subscriptionStart || new Date());
        const expiry = new Date(subscriptionExpiry);
        await run(`INSERT INTO subscriptions (businessId,packageId,status,startDate,expiryDate,isTrial,createdAt) VALUES (?,?,?,?,?,?,?)`,
          [businessId, packageId, 'active', start.toISOString(), expiry.toISOString(), 0, new Date().toISOString()]);
        await run(`UPDATE businesses SET status='active' WHERE id=?`, [businessId]);
      }
    }

    const biz = await get(`SELECT businessName FROM businesses WHERE id=?`, [businessId]);
    await logAudit('PAYMENT_RECORDED', req.superAdmin.adminId, businessId, { amount, status, businessName: biz?.businessName });
    res.json({ success: true, id: result.lastID });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/payments/:id', async (req, res) => {
  try {
    const { amount, currency, method, reference, paymentDate, subscriptionStart, subscriptionExpiry, notes, status } = req.body;
    await run(
      `UPDATE payments SET amount=?,currency=?,method=?,reference=?,paymentDate=?,subscriptionStart=?,subscriptionExpiry=?,notes=?,status=? WHERE id=?`,
      [parseFloat(amount), currency || 'LKR', method || 'cash', reference || '',
       paymentDate || '', subscriptionStart || '', subscriptionExpiry || '', notes || '', status || 'paid', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const { action, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const wheres = [], params = [];
    if (action) { wheres.push(`action = ?`); params.push(action); }
    if (from) { wheres.push(`createdAt >= ?`); params.push(from); }
    if (to) { wheres.push(`createdAt <= ?`); params.push(to + 'T23:59:59'); }
    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const [total, logs] = await Promise.all([
      get(`SELECT COUNT(*) as cnt FROM audit_logs ${where}`, params),
      all(`SELECT * FROM audit_logs ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset])
    ]);
    res.json({ success: true, logs, total: total?.cnt || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── SaaS Settings ────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const settings = await get(`SELECT * FROM saas_settings LIMIT 1`);
    const packages = await all(`SELECT id,name FROM packages WHERE isActive=1`);
    res.json({ success: true, settings, packages });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/settings', async (req, res) => {
  try {
    const { saasName, logo, defaultCurrency, trialEnabled, trialDays, defaultPackageId, supportWhatsapp, supportEmail, maintenanceMode } = req.body;
    const existing = await get(`SELECT id FROM saas_settings LIMIT 1`);
    if (existing) {
      await run(`UPDATE saas_settings SET saasName=?,logo=?,defaultCurrency=?,trialEnabled=?,trialDays=?,defaultPackageId=?,supportWhatsapp=?,supportEmail=?,maintenanceMode=?,updatedAt=? WHERE id=?`,
        [saasName, logo || '', defaultCurrency || 'LKR', trialEnabled ? 1 : 0, trialDays || 7,
         defaultPackageId || 0, supportWhatsapp || '', supportEmail || '', maintenanceMode ? 1 : 0,
         new Date().toISOString(), existing.id]);
    } else {
      await run(`INSERT INTO saas_settings (saasName,logo,defaultCurrency,trialEnabled,trialDays,defaultPackageId,supportWhatsapp,supportEmail,maintenanceMode,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [saasName, logo || '', defaultCurrency || 'LKR', trialEnabled ? 1 : 0, trialDays || 7,
         defaultPackageId || 0, supportWhatsapp || '', supportEmail || '', maintenanceMode ? 1 : 0, new Date().toISOString()]);
    }
    await logAudit('SAAS_SETTINGS_UPDATED', req.superAdmin.adminId, 0, {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Revenue Report ───────────────────────────────────────────────────────────
router.get('/revenue', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const mStart = `${year}-${String(m).padStart(2,'0')}-01`;
      const mEnd = `${year}-${String(m).padStart(2,'0')}-31`;
      const row = await get(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt FROM payments WHERE status='paid' AND paymentDate BETWEEN ? AND ?`, [mStart, mEnd]);
      monthly.push({ month: m, total: row?.total || 0, count: row?.cnt || 0 });
    }
    const yearTotal = await get(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' AND paymentDate LIKE ?`, [`${year}%`]);
    res.json({ success: true, monthly, yearTotal: yearTotal?.total || 0, year });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const logAudit = (action, adminId, targetBusinessId, metadata) =>
  run(`INSERT INTO audit_logs (action,adminId,targetBusinessId,metadata,createdAt) VALUES (?,?,?,?,?)`,
    [action, String(adminId), targetBusinessId || 0, JSON.stringify(metadata || {}), new Date().toISOString()]);

const formatPackage = (p) => ({
  ...p,
  features: JSON.parse(p.features || '[]'),
  hasOnlineShop: Boolean(p.hasOnlineShop), hasReports: Boolean(p.hasReports),
  hasWhatsapp: Boolean(p.hasWhatsapp), hasInventory: Boolean(p.hasInventory),
  hasFeaturedProducts: Boolean(p.hasFeaturedProducts), hasCustomBranding: Boolean(p.hasCustomBranding),
  isActive: Boolean(p.isActive), isPopular: Boolean(p.isPopular)
});

module.exports = router;
