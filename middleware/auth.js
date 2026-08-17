const jwt = require('jsonwebtoken');
const { get } = require('../utils/db');

// ─── Business JWT Auth ────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-change-in-production');
    if (decoded.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied — use business login' });
    }
    req.businessId = decoded.businessId;
    req.business = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }
};

// ─── Super Admin JWT Auth ─────────────────────────────────────────────────────
const authenticateSuperAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Super Admin authentication required' });
  }
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-change-in-production');
    if (!decoded.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Super Admin access required' });
    }
    req.superAdmin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired Super Admin session.' });
  }
};

module.exports = { authenticate, authenticateSuperAdmin };
