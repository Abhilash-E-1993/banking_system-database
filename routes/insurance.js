const express = require("express");
const router = express.Router();
const pool = require("../config/db");

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

    const sql = "SELECT isAdmin FROM users WHERE id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err); // Log the error for debugging
            return res.status(500).json({ message: "Internal Server Error" });
        }

        if (results.length > 0 && results[0].isAdmin) {
            return next();
        } else {
            return res.status(403).json({ message: "Access denied, Admins only" });
        }
    });
}

/* ---------------- USER ROUTES ---------------- */

// User applies for insurance (with input validation)
router.post("/apply", isLoggedIn, (req, res) => {
    const { type, premium, coverage } = req.body;
    const userId = req.session.userId;

    // Validate inputs
    if (!type || typeof type !== 'string') {
        return res.status(400).json({ message: "Invalid or missing 'type'" });
    }
    if (isNaN(premium) || premium <= 0) {
        return res.status(400).json({ message: "Invalid 'premium' amount" });
    }
    if (isNaN(coverage) || coverage <= 0) {
        return res.status(400).json({ message: "Invalid 'coverage' amount" });
    }

    const sql = "INSERT INTO insurance (user_id, type, premium, coverage, status) VALUES (?, ?, ?, ?, 'pending')";
    pool.query(sql, [userId, type, premium, coverage], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.status(201).json({ message: "Insurance application submitted", insuranceId: result.insertId });
    });
});

// User checks their insurance status
router.get("/status", isLoggedIn, (req, res) => {
    const userId = req.session.userId;

    const sql = "SELECT * FROM insurance WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.json(results);
    });
});

/* ---------------- ADMIN ROUTES ---------------- */

// View all insurance applications
router.get("/admin/all", isAdmin, (req, res) => {
    const sql = `
        SELECT insurance.id, users.username, insurance.type, insurance.premium, insurance.coverage, insurance.status
        FROM insurance
        JOIN users ON insurance.user_id = users.id
        ORDER BY insurance.id DESC
    `;
    pool.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        res.json(results);
    });
});

// Approve / Reject insurance
router.post("/admin/update", isAdmin, (req, res) => {
    const { insuranceId, action } = req.body;

    if (!insuranceId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    const sql = "UPDATE insurance SET status = ? WHERE id = ?";
    pool.query(sql, [action, insuranceId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal Server Error" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Insurance application not found" });
        }
        res.json({ message: `Insurance ${action}`, insuranceId });
    });
});

// Get insurance statistics
router.get("/admin/stats", isAdmin, (req, res) => {
    const sql = `
        SELECT status, COUNT(*) as count
        FROM insurance
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