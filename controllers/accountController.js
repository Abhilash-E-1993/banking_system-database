
// controllers/accountController.js
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');


// Create a new account for the logged-in user
exports.createAccountForUser = async (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  let conn;
  try {
    conn = await pool.getConnection();
    // create unique account number
    const accountNumber = 'AC' + uuidv4().slice(0,8).toUpperCase();

    const [r] = await conn.query(
      'INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, ?)',
      [userId, accountNumber, 0.00]
    );

    return res.status(201).json({
      success: true,
      account: { account_id: r.insertId, account_number: accountNumber, balance: "0.00" }
    });
  } catch (err) {
    console.error('Create account error:', err);
    // handle duplicate account_number rare collision (retry could be implemented)
    return res.status(500).json({ error: 'Failed to create account' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * Helper: parse and validate amount string/number to a positive decimal with 2 places.
 * We do strict checks: must parse to finite number > 0. Returns a Number (two-decimal precision).
 */
function parseAmount(val) {
  // Accept numeric or string input
  if (val === undefined || val === null) throw new Error('Amount is required');
  // Remove commas, trim
  const s = String(val).replace(/,/g, '').trim();
  // Reject empty
  if (s === '') throw new Error('Invalid amount');

  // Use Number() and check finiteness
  const n = Number(s);
  if (!isFinite(n)) throw new Error('Invalid amount');

  // Ensure > 0
  if (n <= 0) throw new Error('Amount must be greater than zero');

  // Round to 2 decimals safely: multiply then round then divide
  // Use integer math to avoid floating point surprises
  const cents = Math.round(n * 100); // integer cents
  return cents / 100; // returns Number like 12.34
}

/**
 * DEPOSIT
 * - Locks the target account row using SELECT ... FOR UPDATE
 * - Updates balance and inserts a transaction row
 */
exports.deposit = async (req, res) => {
  const accountId = req.params.accountId;
  let amount;
  try {
    amount = parseAmount(req.body.amount);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Lock the row for this account
    const [rows] = await conn.query(
      'SELECT account_id, balance, account_number, user_id FROM accounts WHERE account_id = ? FOR UPDATE',
      [accountId]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Account not found' });
    }

    const acct = rows[0];

    // Optional: ensure the logged-in user either owns the account or is admin
    if (req.session.role !== 'admin' && req.session.userId !== acct.user_id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Forbidden: cannot deposit to this account' });
    }

    // Compute new balance using integer cents
    const currentCents = Math.round(Number(acct.balance) * 100);
    const addCents = Math.round(amount * 100);
    const newCents = currentCents + addCents;
    const newBalance = (newCents / 100).toFixed(2);

    // Update balance
    await conn.query('UPDATE accounts SET balance = ? WHERE account_id = ?', [newBalance, accountId]);

    // Insert transaction (to_account is the recipient)
    await conn.query(
      'INSERT INTO transactions (account_id, `type`, amount, to_account, description) VALUES (?, "deposit", ?, ?, ?)',
      [accountId, amount, acct.account_number, 'Deposit']
    );

    await conn.commit();
    return res.json({ success: true, account_id: acct.account_id, balance: newBalance });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('Deposit error:', err);
    return res.status(500).json({ error: 'Deposit failed' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * WITHDRAW
 * - Locks the account row, checks sufficient funds, updates balance, inserts transaction
 */
exports.withdraw = async (req, res) => {
  const accountId = req.params.accountId;
  let amount;
  try {
    amount = parseAmount(req.body.amount);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT account_id, balance, account_number, user_id FROM accounts WHERE account_id = ? FOR UPDATE',
      [accountId]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Account not found' });
    }

    const acct = rows[0];

    // Ensure ownership or admin
    if (req.session.role !== 'admin' && req.session.userId !== acct.user_id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Forbidden: cannot withdraw from this account' });
    }

    const currentCents = Math.round(Number(acct.balance) * 100);
    const withdrawCents = Math.round(amount * 100);

    if (currentCents < withdrawCents) {
      await conn.rollback();
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const newCents = currentCents - withdrawCents;
    const newBalance = (newCents / 100).toFixed(2);

    await conn.query('UPDATE accounts SET balance = ? WHERE account_id = ?', [newBalance, accountId]);

    await conn.query(
      'INSERT INTO transactions (account_id, `type`, amount, from_account, description) VALUES (?, "withdraw", ?, ?, ?)',
      [accountId, amount, acct.account_number, 'Withdraw']
    );

    await conn.commit();
    return res.json({ success: true, account_id: acct.account_id, balance: newBalance });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('Withdraw error:', err);
    return res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * TRANSFER
 * - Locks both accounts using a consistent order (by account_id) to avoid deadlocks
 * - Checks ownership (must own source or be admin), sufficient funds, updates both balances
 * - Writes two transaction rows (transfer out and transfer in)
 */
exports.transfer = async (req, res) => {
  const fromId = Number(req.params.fromAccountId);
  const toId = Number(req.params.toAccountId);

  // basic validation
  if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
    return res.status(400).json({ error: 'Invalid account ids' });
  }
  if (fromId === toId) return res.status(400).json({ error: 'Cannot transfer to same account' });

  let amount;
  try {
    amount = parseAmount(req.body.amount);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Lock accounts in consistent order: smaller id first
    const first = Math.min(fromId, toId);
    const second = Math.max(fromId, toId);

    const [rows] = await conn.query(
      'SELECT account_id, user_id, balance, account_number FROM accounts WHERE account_id IN (?, ?) FOR UPDATE',
      [first, second]
    );

    if (rows.length < 2) {
      await conn.rollback();
      return res.status(404).json({ error: 'One or both accounts not found' });
    }

    const fromRow = rows.find(r => Number(r.account_id) === fromId);
    const toRow = rows.find(r => Number(r.account_id) === toId);

    if (!fromRow || !toRow) {
      await conn.rollback();
      return res.status(404).json({ error: 'Account not found' });
    }

    // Authorization: only admin or owner of 'from' account can initiate transfer
    if (req.session.role !== 'admin' && req.session.userId !== fromRow.user_id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Forbidden: cannot transfer from this account' });
    }

    const fromCents = Math.round(Number(fromRow.balance) * 100);
    const transferCents = Math.round(amount * 100);

    if (fromCents < transferCents) {
      await conn.rollback();
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const toCents = Math.round(Number(toRow.balance) * 100);

    const newFromCents = fromCents - transferCents;
    const newToCents = toCents + transferCents;

    const newFromBal = (newFromCents / 100).toFixed(2);
    const newToBal   = (newToCents / 100).toFixed(2);

    // Update balances
    await conn.query('UPDATE accounts SET balance = ? WHERE account_id = ?', [newFromBal, fromId]);
    await conn.query('UPDATE accounts SET balance = ? WHERE account_id = ?', [newToBal, toId]);

    // Insert transaction rows: one for out, one for in
    await conn.query(
      'INSERT INTO transactions (account_id, `type`, amount, from_account, to_account, description) VALUES (?, "transfer", ?, ?, ?, ?)',
      [fromId, amount, fromRow.account_number, toRow.account_number, 'Transfer out']
    );

    await conn.query(
      'INSERT INTO transactions (account_id, `type`, amount, from_account, to_account, description) VALUES (?, "transfer", ?, ?, ?, ?)',
      [toId, amount, fromRow.account_number, toRow.account_number, 'Transfer in']
    );

    await conn.commit();
    return res.json({
      success: true,
      from: { account_id: fromId, balance: newFromBal },
      to:   { account_id: toId, balance: newToBal }
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('Transfer error:', err);
    return res.status(500).json({ error: 'Transfer failed' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET HISTORY
 */
exports.getHistory = async (req, res) => {
  const accountId = req.params.accountId;
  let conn;
  try {
    conn = await pool.getConnection();

    // Check ownership or admin
    const [accRows] = await conn.query('SELECT user_id FROM accounts WHERE account_id = ?', [accountId]);
    if (!accRows.length) return res.status(404).json({ error: 'Account not found' });
    const accountOwnerId = accRows[0].user_id;
    if (req.session.role !== 'admin' && req.session.userId !== accountOwnerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await conn.query(
      'SELECT transaction_id, `type`, amount, created_at, from_account, to_account, description FROM transactions WHERE account_id = ? ORDER BY created_at DESC',
      [accountId]
    );

    return res.json({ transactions: rows });
  } catch (err) {
    console.error('GetHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch history' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET BALANCE
 */
exports.getBalance = async (req, res) => {
  const accountId = req.params.accountId;
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query('SELECT account_id, balance, user_id FROM accounts WHERE account_id = ?', [accountId]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });

    const acct = rows[0];
    if (req.session.role !== 'admin' && req.session.userId !== acct.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({ account_id: acct.account_id, balance: Number(acct.balance).toFixed(2) });
  } catch (err) {
    console.error('GetBalance error:', err);
    return res.status(500).json({ error: 'Failed to fetch balance' });
  } finally {
    if (conn) conn.release();
  }
};
