const { get, run } = require('../utils/db');

const checkSubscription = async (req, res, next) => {
  try {
    const sub = await get(
      `SELECT s.*, p.name as packageName, p.hasOnlineShop, p.hasReports, p.hasWhatsapp, p.hasInventory
       FROM subscriptions s
       LEFT JOIN packages p ON s.packageId = p.id
       WHERE s.businessId = ?
       ORDER BY s.id DESC LIMIT 1`,
      [req.businessId]
    );

    if (!sub) {
      return res.status(402).json({
        success: false,
        code: 'NO_SUBSCRIPTION',
        message: 'No subscription found. Please contact support.'
      });
    }

    const now = new Date();
    const expiry = new Date(sub.expiryDate);
    const msRemaining = expiry - now;
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    // Auto-update expired status
    if (sub.status === 'active' || sub.status === 'trial' || sub.status === 'expiring_soon') {
      if (msRemaining <= 0) {
        await run(`UPDATE subscriptions SET status = 'expired' WHERE id = ?`, [sub.id]);
        return res.status(402).json({
          success: false,
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'Your subscription has expired. Please renew to continue.',
          daysRemaining: 0
        });
      }
      // Mark as expiring soon (within 7 days)
      if (daysRemaining <= 7 && sub.status !== 'expiring_soon') {
        await run(`UPDATE subscriptions SET status = 'expiring_soon' WHERE id = ?`, [sub.id]);
        sub.status = 'expiring_soon';
      }
    }

    if (sub.status === 'expired') {
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your subscription has expired. Please renew to continue.',
        daysRemaining: Math.max(0, daysRemaining)
      });
    }

    if (sub.status === 'suspended') {
      return res.status(402).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (sub.status === 'cancelled') {
      return res.status(402).json({
        success: false,
        code: 'ACCOUNT_CANCELLED',
        message: 'Your account has been cancelled.'
      });
    }

    req.subscription = { ...sub, daysRemaining };
    next();
  } catch (err) {
    console.error('Subscription check error:', err.message);
    next(err);
  }
};

module.exports = { checkSubscription };
