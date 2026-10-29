const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ดึงข้อมูล Booking แสดงหน้าวางบิลแบบเรียบง่าย
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;

    try {
        let query = `
            SELECT 
                b.id AS booking_id,
                b.booking_no,
                b.run_date,
                COALESCE(c.short_name, b.customer_name, '-') AS customer_name,
                COALESCE(b.container_count, 1) AS total_count,
                COALESCE(b.trip_fee, 0) AS trip_fee,
                b.origin,
                b.destination
            FROM bookings b
            LEFT JOIN customers c ON b.customer_id = c.id
        `;
        
        const params = [];

        // กรองตามเดือน/ปี หากมีระบุมา
        if (year && month) {
            const y = parseInt(year, 10);
            const m = parseInt(month, 10);
            const lastDay = new Date(y, m, 0).getDate();
            const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
            const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            
            query += ` WHERE b.run_date BETWEEN $1 AND $2`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY b.run_date DESC, b.id DESC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Billing GET Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;