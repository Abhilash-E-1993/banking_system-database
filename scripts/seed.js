// scripts/seed.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'bankdb',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Admin user
    const adminName = 'Admin User';
    const adminEmail = 'admin@example.com';
    const adminPasswordPlain = 'dbmsproject'; // change after seeding
    const adminHash = await bcrypt.hash(adminPasswordPlain, 10);
    const [r1] = await conn.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [adminName, adminEmail, adminHash, 'admin']
    );
    const adminUserId = r1.insertId;
    const adminAccNum = 'AC' + uuidv4().slice(0,8).toUpperCase();
    await conn.query('INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, ?)', [adminUserId, adminAccNum, 1000.00]);

    // Sample customer
    const custName = 'Test Customer';
    const custEmail = 'customer@example.com';
    const custPasswordPlain = 'Cust@123';
    const custHash = await bcrypt.hash(custPasswordPlain, 10);
    const [r2] = await conn.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [custName, custEmail, custHash, 'customer']
    );
    const custUserId = r2.insertId;
    const custAccNum = 'AC' + uuidv4().slice(0,8).toUpperCase();
    const [accRes] = await conn.query('INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, ?)', [custUserId, custAccNum, 500.00]);
    const custAccountId = accRes.insertId;

    // Sample transactions for the customer
    await conn.query(
      'INSERT INTO transactions (account_id, `type`, amount, to_account, description) VALUES (?, "deposit", ?, ?, ?)',
      [custAccountId, 500.00, custAccNum, 'Initial seed deposit']
    );

    await conn.commit();
    console.log('Seed completed. Admin:', adminEmail, '/', adminPasswordPlain, 'Customer:', custEmail, '/', custPasswordPlain);
  } catch (err) {
    await conn.rollback().catch(()=>{});
    console.error('Seed failed:', err);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => console.error(err));
