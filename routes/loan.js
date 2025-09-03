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

// Middleware to check if admin is logged in
function isAdmin(req, res, next) {
    // You should also check the user's role from the database to be more secure
    // Let's assume you have a 'users' table with an 'isAdmin' column.
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
    }

    const sql = "SELECT isAdmin FROM users WHERE id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        if (results.length > 0 && results[0].isAdmin) {
            return next();
        } else {
            return res.status(403).json({ message: "Access denied, Admins only" });
        }
    });
}

// User applies for a loan
router.post("/apply", isLoggedIn, (req, res) => {
    const { amount, tenure } = req.body;
    const userId = req.session.userId;

    if (!amount || !tenure) {
        return res.status(400).json({ message: "Amount and tenure required" });
    }

    const sql = "INSERT INTO loans (user_id, amount, tenure, status) VALUES (?, ?, ?, 'pending')";
    pool.query(sql, [userId, amount, tenure], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Loan application submitted", loanId: result.insertId });
    });
});

// User checks their loan status
router.get("/status", isLoggedIn, (req, res) => {
    const userId = req.session.userId;

    const sql = "SELECT * FROM loans WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Admin: view all loan applications
router.get("/admin/all", isAdmin, (req, res) => {
    const sql = `
        SELECT loans.id, users.username, loans.amount, loans.tenure, loans.status
        FROM loans
        JOIN users ON loans.user_id = users.id
        ORDER BY loans.id DESC
    `;
    pool.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Admin: approve/reject a loan
router.post("/admin/update", isAdmin, (req, res) => {
    const { loanId, action } = req.body; // action = "approved" / "rejected"

    if (!loanId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    const sql = "UPDATE loans SET status = ? WHERE id = ?";
    pool.query(sql, [action, loanId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

module.exports = router;