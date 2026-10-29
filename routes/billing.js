const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. ดึงข้อมูลสำหรับหน้าวางบิล (ทั้ง Master และ Detail)
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
                b.id AS booking_id, b.booking_no, b.run_date, b.mode, b.job_type, b.job_name,
                c.id AS customer_id, COALESCE(c.short_name, '-') AS customer_name, COALESCE(c.customer_name, '-') AS full_customer_name,
                c.address, c.tax_id, b.origin, b.destination, b.container_size, 
                COALESCE(b.container_count, 1) AS container_count,
                COALESCE(b.trip_fee, 0) AS booking_trip_fee,
                s.order_id, s.container_1_no, s.container_2_no,
                s.leg1_plate, s.leg1_driver, s.leg2_plate, s.leg3_plate,
                f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee,
                f.gross_weight, f.ar_no, f.iv_no, f.billing_date, f.billing_remark
            FROM bookings b
            LEFT JOIN shipment_operations s ON b.booking_no = s.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE b.run_date BETWEEN $1 AND $2
            ORDER BY b.run_date ASC, b.booking_no ASC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. บันทึกข้อมูลวางบิล
router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            if (!row.order_id) continue;
            await client.query(`
                INSERT INTO financials (order_id, gross_weight, ar_no, iv_no, billing_remark, billing_date)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (order_id) 
                DO UPDATE SET 
                    gross_weight = EXCLUDED.gross_weight, ar_no = EXCLUDED.ar_no, iv_no = EXCLUDED.iv_no,
                    billing_remark = EXCLUDED.billing_remark, billing_date = EXCLUDED.billing_date
            `, [
                row.order_id, row.gross_weight ? parseFloat(row.gross_weight) : 0,
                row.ar_no || null, row.iv_no || null, row.billing_remark || null, row.billing_date || null
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: error.message });
    } finally { client.release(); }
});

// 3. ค้นหาตู้ตกค้าง / งานพิเศษที่ยังไม่ได้วางบิล 
router.get('/unbilled-containers', async (req, res) => {
    const { customer_id, run_date, booking_no } = req.query;
    if (!customer_id) return res.status(400).json({ success: false, message: 'ต้องระบุ customer_id' });

    try {
        let query = `
            SELECT 
                s.order_id, b.booking_no, s.container_1_no, s.container_2_no, s.container_size,
                s.leg1_plate, b.run_date, b.origin, b.destination, c.short_name AS customer_name,
                f.trip_fee, f.port_pass_fee, f.deposit_fee, f.lift_fee, f.shore_fee, f.gross_weight
            FROM bookings b
            JOIN shipment_operations s ON b.booking_no = s.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE b.customer_id = $1 AND (f.iv_no IS NULL OR f.iv_no = '')
        `;
        const params = [customer_id];
        if (run_date) { params.push(run_date); query += ` AND b.run_date::text = $${params.length}`; }
        if (booking_no) { params.push(`%${booking_no.trim()}%`); query += ` AND b.booking_no ILIKE $${params.length}`; }
        query += ` ORDER BY b.run_date DESC, s.order_id ASC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 4. สรุปรายการตามเลข IV (สำหรับหน้า IV List)
router.get('/iv-summary', async (req, res) => {
    const { year, month } = req.query;
    try {
        const y = parseInt(year, 10); const m = parseInt(month, 10); const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`; const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const result = await pool.query(`
            SELECT 
                f.iv_no, f.ar_no, MAX(f.billing_date) AS billing_date,
                c.id AS customer_id, COALESCE(c.short_name, '-') AS customer_name,
                COUNT(s.order_id) AS total_containers,
                ARRAY_AGG(DISTINCT b.booking_no) AS booking_list,
                SUM(f.trip_fee::NUMERIC) AS total_trip_fee,
                SUM(f.port_pass_fee::NUMERIC + f.deposit_fee::NUMERIC + f.lift_fee::NUMERIC + f.shore_fee::NUMERIC) AS total_other_fee,
                SUM(f.trip_fee::NUMERIC + f.port_pass_fee::NUMERIC + f.deposit_fee::NUMERIC + f.lift_fee::NUMERIC + f.shore_fee::NUMERIC) AS grand_total
            FROM financials f
            JOIN shipment_operations s ON f.order_id = s.order_id
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            WHERE f.iv_no IS NOT NULL AND f.iv_no != '' AND b.run_date BETWEEN $1 AND $2
            GROUP BY f.iv_no, f.ar_no, c.id, c.short_name
            ORDER BY f.iv_no ASC
        `, [startDate, endDate]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 5. ดึงข้อมูลสำหรับพิมพ์ใบแนบ A4
router.get('/print-data', async (req, res) => {
    const { booking_no, iv_no } = req.query;
    try {
        let condition = ''; let param = '';
        if (booking_no) { condition = 'b.booking_no = $1'; param = booking_no; }
        else { condition = 'f.iv_no = $1'; param = iv_no; }
        const result = await pool.query(`
            SELECT s.order_id, b.booking_no, s.container_1_no, s.container_2_no, s.container_size, s.leg1_plate, s.leg2_plate, s.leg3_plate, b.run_date, b.origin, b.destination, b.job_name, c.id AS customer_id, c.customer_name, c.address, c.tax_id, f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee, f.gross_weight, f.ar_no, f.iv_no
            FROM bookings b 
            LEFT JOIN shipment_operations s ON b.booking_no = s.booking_no 
            LEFT JOIN customers c ON b.customer_id = c.id 
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE ${condition} ORDER BY s.order_id ASC
        `, [param]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;