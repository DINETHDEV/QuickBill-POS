const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const { initDb } = require('./utils/initDb');
const authRoutes = require('./routes/auth');
const posRoutes = require('./routes/pos');
const superAdminRoutes = require('./routes/superAdmin');
const shopRoutes = require('./routes/shop');

// ─── Cloudinary Config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts in HTML pages
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.APP_URL || '*',
  credentials: true
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests. Please slow down.' }
});

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ─── DB Init Middleware (Vercel serverless warm-up) ───────────────────────────
app.use('/api', async (req, res, next) => {
  try { await initDb(); next(); }
  catch (err) {
    console.error('DB init failed:', err.message);
    res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api', apiLimiter, posRoutes);

// ─── Legacy Login Route (backwards compatibility) ─────────────────────────────
// Old /api/login — return clear message directing to new endpoint
app.post('/api/login', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint has been updated. Please use /api/auth/login'
  });
});

// ─── Shop Slug Route ──────────────────────────────────────────────────────────
// Serves shop.html and injects SEO meta tags for the business
app.get('/shop/:slug', async (req, res) => {
  try {
    await initDb();
    const { get } = require('./utils/db');
    const biz = await get(`SELECT b.businessName, s.shopLogo, s.coverImage, s.aboutText, s.themeColor FROM businesses b LEFT JOIN settings s ON s.businessId = b.id WHERE b.slug = ?`, [req.params.slug]);

    if (!biz) {
      return res.redirect('/shop.html?error=not_found');
    }

    const shopHtml = require('fs').readFileSync(path.join(__dirname, 'public', 'shop.html'), 'utf8');
    const name = biz.businessName || 'QuickBill Shop';
    const desc = biz.aboutText || `Shop online at ${name}`;
    const image = biz.shopLogo || biz.coverImage || '';

    const injected = shopHtml
      .replace('<title>Online Shop - QuickBill POS</title>',
        `<title>${name} — Online Shop</title>
        <meta name="description" content="${desc.substring(0, 160)}">
        <meta property="og:title" content="${name}">
        <meta property="og:description" content="${desc.substring(0, 160)}">
        ${image ? `<meta property="og:image" content="${image}">` : ''}
        <meta property="og:type" content="website">
        <meta name="robots" content="index, follow">`)
      .replace('</head>',
        `<script>window.__SHOP_SLUG = "${req.params.slug}";</script>\n</head>`);

    res.send(injected);
  } catch (err) {
    res.redirect('/shop.html');
  }
});

// ─── Super Admin HTML Routes ──────────────────────────────────────────────────
app.get('/super-admin', (req, res) => {
  res.redirect('/super-admin/login.html');
});

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
  }
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('Server Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
    ...(isDev && { error: err.message, stack: err.stack })
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `API endpoint not found: ${req.method} ${req.path}` });
  }
  // Serve index.html for any non-API route (SPA fallback)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
// Always listen when running as a long-lived process (Railway, local dev, etc.)
// Only skip the listen() call on Vercel (serverless — Vercel invokes the exported app directly)
if (!process.env.VERCEL) {
  const startServer = async () => {
    try {
      console.log(`QuickBill POS server starting on port ${PORT}...`);
      await initDb();
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 QuickBill POS running on port ${PORT}`);
        console.log(`🌐 http://0.0.0.0:${PORT}`);
        console.log(`📊 Super Admin: http://0.0.0.0:${PORT}/super-admin/login.html`);
        console.log(`✅ Database initialized`);
      });
    } catch (err) {
      console.error('❌ Startup error:', err.message);
      // Don't exit — let the process stay alive so Railway shows the real error in logs
    }
  };
  startServer();
}

module.exports = app;
