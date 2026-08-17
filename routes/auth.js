const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { run, get, all } = require('../utils/db');
const { authenticate } = require('../middleware/auth');

const JWT_SECRET = () => process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// Helper: slugify business name
const makeSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);

// Helper: ensure unique slug
const uniqueSlug = async (base) => {
  let slug = base;
  let i = 1;
  while (true) {
    const existing = await get(`SELECT id FROM businesses WHERE slug = ?`, [slug]);
    if (!existing) return slug;
    slug = `${base}-${i++}`;
  }
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', [
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('ownerName').trim().notEmpty().withMessage('Owner name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('currency').trim().notEmpty().withMessage('Currency is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { businessName, ownerName, email, phone, password, address, currency } = req.body;

    // Check duplicate email
    const existing = await get(`SELECT id FROM businesses WHERE email = ?`, [email]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = await uniqueSlug(makeSlug(businessName));
    const now = new Date().toISOString();

    const result = await run(
      `INSERT INTO businesses (slug,businessName,ownerName,email,phone,address,passwordHash,currency,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [slug, businessName, ownerName, email, phone || '', address || '', passwordHash, currency || 'Rs.', 'active', now]
    );
    const businessId = result.lastID;

    // Get SaaS settings for trial configuration
    const saasSettings = await get(`SELECT * FROM saas_settings LIMIT 1`);
    const trialEnabled = saasSettings ? Boolean(saasSettings.trialEnabled) : true;
    const trialDays = saasSettings ? (saasSettings.trialDays || 7) : 7;

    // Create trial subscription
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (trialEnabled ? trialDays : 0));

    await run(
      `INSERT INTO subscriptions (businessId,packageId,status,startDate,expiryDate,isTrial,createdAt) VALUES (?,?,?,?,?,?,?)`,
      [businessId, saasSettings?.defaultPackageId || 0, trialEnabled ? 'trial' : 'active',
       startDate.toISOString(), expiryDate.toISOString(), trialEnabled ? 1 : 0, now]
    );

    // Create default settings for this business
    await run(
      `INSERT INTO settings (shopName,currency,businessId) VALUES (?,?,?)`,
      [businessName, currency || 'Rs.', businessId]
    );

    // Audit log
    await run(
      `INSERT INTO audit_logs (action,adminId,targetBusinessId,targetBusinessName,metadata,createdAt) VALUES (?,?,?,?,?,?)`,
      ['BUSINESS_REGISTERED', 'self', businessId, businessName, JSON.stringify({ email, slug }), now]
    );

    // Generate JWT
    const token = jwt.sign(
      { businessId, email, businessName, slug, currency: currency || 'Rs.' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      message: trialEnabled
        ? `Welcome! Your ${trialDays}-day free trial has started.`
        : 'Account created successfully.',
      token,
      business: { id: businessId, businessName, email, slug, currency: currency || 'Rs.' },
      subscription: {
        status: trialEnabled ? 'trial' : 'active',
        daysRemaining: trialEnabled ? trialDays : 365,
        isTrial: trialEnabled
      }
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', [
  body('email').trim().notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { email, password } = req.body;
    const business = await get(`SELECT * FROM businesses WHERE email = ?`, [email.toLowerCase().trim()]);
    if (!business) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, business.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (business.status === 'suspended') {
      return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended. Please contact support.' });
    }

    // Update last login
    await run(`UPDATE businesses SET lastLoginAt = ? WHERE id = ?`, [new Date().toISOString(), business.id]);

    // Get subscription
    const sub = await get(
      `SELECT s.*, p.name as packageName FROM subscriptions s LEFT JOIN packages p ON s.packageId = p.id WHERE s.businessId = ? ORDER BY s.id DESC LIMIT 1`,
      [business.id]
    );

    let subStatus = sub ? sub.status : 'none';
    let daysRemaining = 0;
    if (sub) {
      const now = new Date();
      const expiry = new Date(sub.expiryDate);
      daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      if (expiry < now && (sub.status === 'active' || sub.status === 'trial' || sub.status === 'expiring_soon')) {
        await run(`UPDATE subscriptions SET status = 'expired' WHERE id = ?`, [sub.id]);
        subStatus = 'expired';
        daysRemaining = 0;
      }
    }

    const token = jwt.sign(
      { businessId: business.id, email: business.email, businessName: business.businessName, slug: business.slug, currency: business.currency },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      token,
      business: {
        id: business.id,
        businessName: business.businessName,
        ownerName: business.ownerName,
        email: business.email,
        slug: business.slug,
        currency: business.currency,
        status: business.status
      },
      subscription: {
        status: subStatus,
        daysRemaining,
        isTrial: sub ? Boolean(sub.isTrial) : false,
        packageName: sub?.packageName || null,
        expiryDate: sub?.expiryDate || null
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const business = await get(`SELECT id,slug,businessName,ownerName,email,phone,address,currency,status,createdAt,lastLoginAt FROM businesses WHERE id = ?`, [req.businessId]);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

    const sub = await get(
      `SELECT s.*, p.name as packageName FROM subscriptions s LEFT JOIN packages p ON s.packageId = p.id WHERE s.businessId = ? ORDER BY s.id DESC LIMIT 1`,
      [req.businessId]
    );

    let daysRemaining = 0;
    if (sub) {
      const expiry = new Date(sub.expiryDate);
      daysRemaining = Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)));
    }

    const saasSettings = await get(`SELECT supportWhatsapp, supportEmail, saasName FROM saas_settings LIMIT 1`);

    res.json({
      success: true,
      business,
      subscription: sub ? { ...sub, daysRemaining, isTrial: Boolean(sub.isTrial) } : null,
      support: saasSettings || {}
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load account info.' });
  }
});

// ─── GET /api/auth/packages ───────────────────────────────────────────────────
router.get('/packages', async (req, res) => {
  try {
    const packages = await all(`SELECT * FROM packages WHERE isActive = 1 ORDER BY sortOrder, price`);
    res.json({ success: true, packages: packages.map(p => ({
      ...p,
      features: JSON.parse(p.features || '[]'),
      hasOnlineShop: Boolean(p.hasOnlineShop),
      hasReports: Boolean(p.hasReports),
      hasWhatsapp: Boolean(p.hasWhatsapp),
      hasInventory: Boolean(p.hasInventory),
      hasFeaturedProducts: Boolean(p.hasFeaturedProducts),
      hasCustomBranding: Boolean(p.hasCustomBranding),
      isPopular: Boolean(p.isPopular)
    }))});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load packages.' });
  }
});

module.exports = router;
