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

// Admin: approve/reject a loan
router.post("/admin/update", isAdmin, async (req, res) => {
    const { loanId, action } = req.body;

    if (!loanId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    try {
        const sql = "UPDATE loans SET status = ? WHERE loan_id = ?";
        const [result] = await pool.query(sql, [action, loanId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Loan application not found" });
        }
        res.json({ message: `Loan ${action}`, loanId });
    } catch (err) {
        console.error("Database error in /admin/update:", err);
        return res.status(500).json({ message: "Internal Server Error" });
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