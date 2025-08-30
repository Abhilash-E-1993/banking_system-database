// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { register, login, logout,me } = require('../controllers/authController');
const { requireAuthIfAny } = require('../middlewares/auth');

// Validation chains
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be 6+ chars')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

// routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/logout', logout);
// routes/auth.js (after the login/logout/register routes)
router.get('/me', requireAuthIfAny, me); // we'll add requireAuthIfAny middleware below


module.exports = router;
