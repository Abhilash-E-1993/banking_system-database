// middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// small helper to produce JSON-friendly messages
function makeLimiter(opts) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: opts.message || 'Too many requests, try again later' });
    }
  });
}

// Auth: protect register/login endpoints (6 requests per minute)
exports.authLimiter = makeLimiter({ windowMs: 60 * 1000, max: 6, message: 'Too many auth attempts, try again later' });

// Money operations: protect deposit/withdraw/transfer (60 reqs per 60 minutes)
exports.moneyLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 60, message: 'Too many requests — slow down' });
