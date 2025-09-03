

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

// Middleware to check if admin is logged in
function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(403).json({ message: "Access denied, Admins only" });
}

/* ---------------- USER ROUTES ---------------- */

// User applies for insurance
router.post("/apply", isLoggedIn, (req, res) => {
    const { type, premium, coverage } = req.body;
    const userId = req.session.userId;

    if (!type || !premium || !coverage) {
        return res.status(400).json({ message: "Type, premium, and coverage are required" });
    }

    const sql = "INSERT INTO insurance (user_id, type, premium, coverage, status) VALUES (?, ?, ?, ?, 'pending')";
    pool.query(sql, [userId, type, premium, coverage], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Insurance application submitted", insuranceId: result.insertId });
    });
});

// User checks their insurance status
router.get("/status", isLoggedIn, (req, res) => {
    const userId = req.session.userId;

    const sql = "SELECT * FROM insurance WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Approve / Reject insurance
router.post("/admin/update", isAdmin, (req, res) => {
    const { insuranceId, action } = req.body; // action = "approved" / "rejected"

    if (!insuranceId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    const sql = "UPDATE insurance SET status = ? WHERE id = ?";
    pool.query(sql, [action, insuranceId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

module.exports = router;
