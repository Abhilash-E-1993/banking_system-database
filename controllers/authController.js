// controllers/authController.js
const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db'); // assumes db.js at project root exports mysql2/promise pool

// Helper: standardized error response for validation
function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array().map(e => ({ field: e.param, msg: e.msg })) });
  }
  return null;
}

// REGISTER: create user + default account in a DB transaction
exports.register = async (req, res) => {
  // validation
  const validationErr = sendValidationErrors(req, res);
  if (validationErr) return validationErr;

  const { name, email, password } = req.body;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // check existing email
    const [existing] = await conn.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Email already registered' });
    }

    // hash password
    const hashed = await bcrypt.hash(password, 10);

    // insert user
    const [userInsert] = await conn.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, 'customer']
    );
    const userId = userInsert.insertId;

    // create default account
    const accountNumber = 'AC' + uuidv4().slice(0,8).toUpperCase(); // e.g. AC1A2B3C4
    const [accInsert] = await conn.query(
      'INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, ?)',
      [userId, accountNumber, 0.00]
    );
    const accountId = accInsert.insertId;

    await conn.commit();

    // set session
    req.session.userId = userId;
    req.session.role = 'customer';

    return res.status(201).json({
      success: true,
      user: { user_id: userId, name, email, role: 'customer' },
      account: { account_id: accountId, account_number: accountNumber, balance: "0.00" }
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch(e){/* ignore rollback err */ }
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration' });
  } finally {
    if (conn) conn.release();
  }
};

// LOGIN: verify credentials and set session
exports.login = async (req, res) => {
  const validationErr = sendValidationErrors(req, res);
  if (validationErr) return validationErr;

  const { email, password } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query('SELECT user_id, name, email, password, role FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // fetch user's account (first one)
    const [accRows] = await conn.query('SELECT account_id, account_number, balance FROM accounts WHERE user_id = ? ORDER BY account_id LIMIT 1', [user.user_id]);
    const account = accRows.length ? accRows[0] : null;

    // set session
    req.session.userId = user.user_id;
    req.session.role = user.role;

    return res.json({
      success: true,
      user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
      account
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  } finally {
    if (conn) conn.release();
  }
};

// LOGOUT
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    // also clear cookie on client side (set cookie to expire)
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
};

// controllers/authController.js  (add near top with other exports)
exports.me = async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ user: null });
    }

    const conn = await pool.getConnection();
    try {
      // fetch user
      const [users] = await conn.query('SELECT user_id, name, email, role, created_at FROM users WHERE user_id = ? LIMIT 1', [req.session.userId]);
      if (!users.length) {
        return res.json({ user: null });
      }
      const user = users[0];

      // fetch first account for convenience (dashboard)
      const [accRows] = await conn.query('SELECT account_id, account_number, balance FROM accounts WHERE user_id = ? ORDER BY account_id LIMIT 1', [user.user_id]);
      const account = accRows.length ? accRows[0] : null;

      return res.json({ user, account });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Me endpoint error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

