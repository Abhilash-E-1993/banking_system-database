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
function isAdmin(req, res, next) {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
    }

    // The users table has a `role` column, not `isAdmin`
    const sql = "SELECT role FROM users WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }

        if (results.length > 0 && results[0].role === 'admin') {
            return next();
        } else {
            return res.status(403).json({ message: "Access denied, Admins only" });
        }
    });
}

// User applies for a loan
router.post("/apply", isLoggedIn, (req, res) => {
    // These variable names must match the keys from the request body
    const { loan_type, amount, interest_rate, duration_months } = req.body;
    const userId = req.session.userId;

    if (!loan_type || !amount || !interest_rate || !duration_months) {
        return res.status(400).json({ message: "All loan details are required" });
    }
       console.log("Starting database query...");
    // The SQL query must use the correct column names from the `loans` table
    const sql = "INSERT INTO loans (user_id, loan_type, amount, interest_rate, duration_months, status) VALUES (?, ?, ?, ?, ?, 'pending')";
    pool.query(sql, [userId, loan_type, amount, interest_rate, duration_months], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
         console.log("Database query successful, sending response...");
        res.json({ message: "Loan application submitted", loan_id: result.insertId });
         console.log("done");
    });
});

// User checks their loan status
router.get("/status", isLoggedIn, (req, res) => {
    const userId = req.session.userId;

    // The SQL query must select the correct columns
    const sql = "SELECT loan_id, loan_type, amount, interest_rate, duration_months, status, created_at FROM loans WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.json(results);
    });
});

// Admin: view all loan applications
router.get("/admin/all", isAdmin, (req, res) => {
    // The SQL query must select the correct columns and join on `user_id`
    const sql = `
        SELECT loans.loan_id, users.name, loans.loan_type, loans.amount, loans.duration_months, loans.status
        FROM loans
        JOIN users ON loans.user_id = users.user_id
        ORDER BY loans.loan_id DESC
    `;
    pool.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.json(results);
    });
});

// Admin: approve/reject a loan
router.post("/admin/update", isAdmin, (req, res) => {
    // The request body should use `loan_id` to match the SQL schema's primary key name.
    const { loanId, action } = req.body; // action = "approved" / "rejected"

    if (!loanId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    // The SQL query must update using `loan_id`
    const sql = "UPDATE loans SET status = ? WHERE loan_id = ?";
    pool.query(sql, [action, loanId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Loan application not found" });
        }
        res.json({ message: `Loan ${action}`, loanId });
    });
});

// Admin: get loan status stats
router.get("/admin/stats", isAdmin, (req, res) => {
    const sql = `
        SELECT status, COUNT(*) as count
        FROM loans
        GROUP BY status
    `;
    pool.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.json(results);
    });
});

module.exports = router;