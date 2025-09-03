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
async function isAdmin(req, res, next) {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
    }

    try {
        const sql = "SELECT role FROM users WHERE user_id = ?";
        const [results] = await pool.query(sql, [userId]);
        
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

/* ---------------- USER ROUTES ---------------- */

// User applies for insurance (with input validation)
router.post("/apply", isLoggedIn, async (req, res) => {
    const { insurance_type, premium, coverage_amount, duration_years } = req.body;
    const userId = req.session.userId;

    if (!insurance_type || typeof insurance_type !== 'string') {
        return res.status(400).json({ message: "Invalid or missing 'insurance_type'" });
    }
    if (isNaN(premium) || premium <= 0) {
        return res.status(400).json({ message: "Invalid 'premium' amount" });
    }
    if (isNaN(coverage_amount) || coverage_amount <= 0) {
        return res.status(400).json({ message: "Invalid 'coverage_amount' amount" });
    }
    if (isNaN(duration_years) || duration_years <= 0) {
        return res.status(400).json({ message: "Invalid 'duration_years' value" });
    }

    try {
        const sql = "INSERT INTO insurance (user_id, insurance_type, premium, coverage_amount, duration_years, status) VALUES (?, ?, ?, ?, ?, 'pending')";
        const [result] = await pool.query(sql, [userId, insurance_type, premium, coverage_amount, duration_years]);
        
        res.status(201).json({ message: "Insurance application submitted", insuranceId: result.insertId });
    } catch (err) {
        console.error("Database error in /apply:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// User checks their insurance status
router.get("/status", isLoggedIn, async (req, res) => {
    const userId = req.session.userId;

    try {
        const sql = "SELECT insurance_id, insurance_type, premium, coverage_amount, duration_years, status, created_at FROM insurance WHERE user_id = ?";
        const [results] = await pool.query(sql, [userId]);
        
        res.json(results);
    } catch (err) {
        console.error("Database error in /status:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

/* ---------------- ADMIN ROUTES ---------------- */

// View all insurance applications
router.get("/admin/all", isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT insurance.insurance_id, users.name, insurance.insurance_type, insurance.premium, insurance.coverage_amount, insurance.status
            FROM insurance
            JOIN users ON insurance.user_id = users.user_id
            ORDER BY insurance.insurance_id DESC
        `;
        const [results] = await pool.query(sql);
        
        res.json(results);
    } catch (err) {
        console.error("Database error in /admin/all:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// Approve / Reject insurance
router.post("/admin/update", isAdmin, async (req, res) => {
    const { insuranceId, action } = req.body;

    if (!insuranceId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    try {
        const sql = "UPDATE insurance SET status = ? WHERE insurance_id = ?";
        const [result] = await pool.query(sql, [action, insuranceId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Insurance application not found" });
        }
        res.json({ message: `Insurance ${action}`, insuranceId });
    } catch (err) {
        console.error("Database error in /admin/update:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// Get insurance statistics
router.get("/admin/stats", isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT status, COUNT(*) as count
            FROM insurance
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