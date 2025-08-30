

// middlewares/auth.js
exports.requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// For endpoints where we want to *not* reject unauthenticated requests but still be able to reuse
exports.requireAuthIfAny = (req, res, next) => {
  // no-op: just call next — controller will inspect req.session
  return next();
};

exports.requireAdmin = (req, res, next) => {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
};

