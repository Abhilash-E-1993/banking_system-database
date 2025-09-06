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
    const { insurance_type, premium, coverage_amount, duration_years, age, smoker } = req.body;
    const userId = req.session.userId;

    if (!insurance_type || !['life', 'health', 'vehicle'].includes(insurance_type)) {
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
    if (isNaN(age) || age < 18 || age > 100) {
        return res.status(400).json({ message: "Invalid 'age' value" });
    }
    if (typeof smoker !== 'boolean') {
        return res.status(400).json({ message: "Invalid 'smoker' value. Must be a boolean." });
    }

    try {
        const sql = "INSERT INTO insurance (user_id, insurance_type, premium, coverage_amount, duration_years, age, smoker, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')";
        const [result] = await pool.query(sql, [userId, insurance_type, premium, coverage_amount, duration_years, age, smoker]);
        
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
            ORDER BY insurance.created_at DESC
        `;
        const [results] = await pool.query(sql);
        
        res.json(results);
    } catch (err) {
        console.error("Database error in /admin/all:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// Approve / Reject insurance with transaction
router.post("/admin/update", isAdmin, async (req, res) => {
    const { insuranceId, action } = req.body;

    if (!insuranceId || !["activate", "reject"].includes(action)) {
        return res.status(400).json({ message: "Invalid request: 'action' must be 'activate' or 'reject'" });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [insuranceDetails] = await connection.query("SELECT * FROM insurance WHERE insurance_id = ? FOR UPDATE", [insuranceId]);
        if (insuranceDetails.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Insurance application not found" });
        }
        const insurance = insuranceDetails[0];

        if (insurance.status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ message: `Insurance is already ${insurance.status}` });
        }

        let newStatus = '';
        if (action === "activate") {
            newStatus = 'active';
            const premium = parseFloat(insurance.premium);
            const userId = insurance.user_id;

            const [accountDetails] = await connection.query("SELECT account_id, account_number, balance FROM accounts WHERE user_id = ? FOR UPDATE", [userId]);
            if (accountDetails.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "User account not found" });
            }
            const account = accountDetails[0];
            
            if (account.balance < premium) {
                await connection.rollback();
                return res.status(400).json({ message: "Insufficient funds to pay first premium." });
            }

            await connection.query("UPDATE accounts SET balance = balance - ? WHERE account_id = ?", [premium, account.account_id]);

            const transactionSql = "INSERT INTO transactions (account_id, from_account, to_account, amount, type) VALUES (?, ?, ?, ?, 'insurance_premium')";
            await connection.query(transactionSql, [account.account_id, account.account_number, 'Bank', premium]);
            
        } else if (action === "reject") {
            newStatus = 'rejected';
        }

        await connection.query("UPDATE insurance SET status = ? WHERE insurance_id = ?", [newStatus, insuranceId]);

        await connection.commit();
        res.json({ message: `Insurance application has been ${newStatus}`, insuranceId });

    } catch (err) {
        await connection.rollback();
        console.error("Database error in /admin/update:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    } finally {
        connection.release();
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
