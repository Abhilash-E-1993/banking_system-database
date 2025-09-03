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

    // The users table does not have an `isAdmin` column, it has a `role` column.
    const sql = "SELECT role FROM users WHERE user_id = ?";
    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err); // Log the error for debugging
            return res.status(500).json({ message: "Internal Server Error" });
        }

        if (results.length > 0 && results[0].role === 'admin') {
            return next();
        } else {
            return res.status(403).json({ message: "Access denied, Admins only" });
        }
    });
}

/* ---------------- USER ROUTES ---------------- */

// User applies for insurance (with input validation)
router.post("/apply", isLoggedIn, (req, res) => {
    // These variable names must match the keys in the request body from curl/Postman
    const { insurance_type, premium, coverage_amount, duration_years } = req.body;
    const userId = req.session.userId;

    // Validate inputs
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

    // The SQL query must use the correct column names from the `insurance` table
    const sql = "INSERT INTO insurance (user_id, insurance_type, premium, coverage_amount, duration_years, status) VALUES (?, ?, ?, ?, ?, 'pending')";
    pool.query(sql, [userId, insurance_type, premium, coverage_amount, duration_years], (err, result) => {
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

    // The SQL query must select the correct columns
    const sql = "SELECT insurance_id, insurance_type, premium, coverage_amount, duration_years, status, created_at FROM insurance WHERE user_id = ?";
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
    // The SQL query must select the correct columns
    const sql = `
        SELECT insurance.insurance_id, users.name, insurance.insurance_type, insurance.premium, insurance.coverage_amount, insurance.status
        FROM insurance
        JOIN users ON insurance.user_id = users.user_id
        ORDER BY insurance.insurance_id DESC
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
    // The request body should use `insurance_id` to match the SQL schema's primary key name.
    // However, the `curl` command uses `insuranceId`. It's better to stick with a consistent naming convention.
    // For now, let's assume `req.body` key is `insuranceId` and SQL column is `insurance_id`.
    const { insuranceId, action } = req.body;

    if (!insuranceId || !["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    const sql = "UPDATE insurance SET status = ? WHERE insurance_id = ?";
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