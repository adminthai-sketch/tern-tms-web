const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ดึงข้อมูลสำหรับหน้าวางบิล
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const lastDay = new Date(y, m, 0).getDate();
        
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const result = await pool.query(`
            SELECT 
                b.id AS booking_id,
                b.booking_no, 
                b.run_date, 
                -- 🌟 ดึงแค่ c.short_name (ลบ b.customer_name ทิ้ง ป้องกันฐานข้อมูลพัง) 🌟
                COALESCE(c.short_name, '-') AS customer_name,
                b.origin, 
                b.destination, 
                b.container_size, 
                COALESCE(b.container_count, 1) AS container_count,
                COALESCE(b.trip_fee, 0) AS trip_fee,
                s.order_id, 
                f.iv_no, 
                f.ar_no
            FROM bookings b
            LEFT JOIN shipment_operations s ON b.booking_no = s.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE b.run_date BETWEEN $1 AND $2
            ORDER BY b.run_date DESC, b.id DESC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Billing Route Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;