const express = require("express");
const router = express.Router();
const pool = require('../config/db'); // your MySQL connection pool

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ message: "Please log in first" });
}

// Middleware to check if admin is logged in (Securely checks database)
async function isAdmin(req, res, next) {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
    }

    try {
        const [results] = await pool.query("SELECT role FROM users WHERE user_id = ?", [userId]);
        
        if (results.length > 0 && results[0].role === 'admin') {
            return next();
        } else {
            return res.status(403).json({ message: "Access denied, Admins only" });
        }
    } catch (err) {
        console.error("Database error in isAdmin:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

// User applies for a loan
router.post("/apply", isLoggedIn, async (req, res) => {
    const { loan_type, amount, interest_rate, duration_months } = req.body;
    const userId = req.session.userId;

    if (!loan_type || !amount || !interest_rate || !duration_months) {
        return res.status(400).json({ message: "All loan details are required" });
    }

    try {
        const sql = "INSERT INTO loans (user_id, loan_type, amount, interest_rate, duration_months, status) VALUES (?, ?, ?, ?, ?, 'pending')";
        const [result] = await pool.query(sql, [userId, loan_type, amount, interest_rate, duration_months]);
        
        res.status(201).json({ message: "Loan application submitted", loan_id: result.insertId });
    } catch (err) {
        console.error("Database error in /apply:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// User checks their loan status
router.get("/status", isLoggedIn, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const sql = "SELECT loan_id, loan_type, amount, interest_rate, duration_months, status, created_at FROM loans WHERE user_id = ?";
        const [results] = await pool.query(sql, [userId]);
        
        res.json(results);
    } catch (err) {
        console.error("Database error in /status:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// Admin: view all loan applications
router.get("/admin/all", isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT loans.loan_id, users.name, loans.loan_type, loans.amount, loans.duration_months, loans.status
            FROM loans
            JOIN users ON loans.user_id = users.user_id
            ORDER BY loans.loan_id DESC
        `;
        const [results] = await pool.query(sql);

        res.json(results);
    } catch (err) {
        console.error("Database error in /admin/all:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// Admin: approve/reject a loan (with a database transaction)
router.post("/admin/update", isAdmin, async (req, res) => {
    const { loanId, action } = req.body;

    if (!loanId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Get loan details and lock the row
        const [loanDetails] = await connection.query("SELECT * FROM loans WHERE loan_id = ? FOR UPDATE", [loanId]);
        if (loanDetails.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Loan application not found" });
        }
        const loan = loanDetails[0];

        // Prevent double processing
        if (loan.status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ message: `Loan is already ${loan.status}` });
        }

        // 2. Update loan status
        const [updateResult] = await connection.query("UPDATE loans SET status = ? WHERE loan_id = ?", [action, loanId]);
        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(500).json({ message: "Failed to update loan status" });
        }

        if (action === "approved") {
            const amount = loan.amount;
            const userId = loan.user_id;

            // 3. Get user's account ID and number
            const [accountDetails] = await connection.query("SELECT account_id, account_number FROM accounts WHERE user_id = ? FOR UPDATE", [userId]);
            if (accountDetails.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "User account not found" });
            }
            const account = accountDetails[0];

            // 4. Credit the user's account
            await connection.query("UPDATE accounts SET balance = balance + ? WHERE account_id = ?", [amount, account.account_id]);

            // 5. Record the loan transaction
           const transactionSql = "INSERT INTO transactions (account_id, from_account, to_account, amount, type) VALUES (?, ?, ?, ?, 'loan')";
          await connection.query(transactionSql, [account.account_id, 'Bank', account.account_number, amount]);
        }

        await connection.commit();
        res.json({ message: `Loan ${action}`, loanId });

    } catch (err) {
        await connection.rollback();
        console.error("Database error in /admin/update:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    } finally {
        connection.release();
    }
});

// Admin: get loan status stats
router.get("/admin/stats", isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT status, COUNT(*) as count
            FROM loans
            GROUP BY status
        `;
        const [results] = await pool.query(sql);
        
        res.json(results);
    } catch (err) {
        console.error("Database error in /admin/stats:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = router;