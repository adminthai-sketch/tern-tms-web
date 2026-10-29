const express = require('express');
const router = express.Router();
const { pool } = require('../config/db'); // ตรวจสอบ path ให้ตรงกับโปรเจกต์

// 1. ดึงข้อมูลสำหรับหน้าวางบิล
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const result = await pool.query(`
            SELECT 
                s.order_id, s.booking_no, s.container_1_no, s.container_2_no,
                s.leg1_plate, s.leg1_driver, s.leg2_plate, s.leg2_driver, s.leg3_plate, s.leg3_driver,
                b.mode, b.run_date, b.customer_id, 
                c.short_name AS customer_name, c.customer_name AS full_customer_name, c.address, c.tax_id,
                b.origin, b.destination, b.container_size, b.job_type,
                f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee,
                f.gross_weight, f.ar_no, f.iv_no, f.billing_date, f.billing_status, f.billing_remark,
                f.is_locked, f.locked_by, f.locked_at
            FROM shipment_operations s
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE EXTRACT(MONTH FROM b.run_date) = $1::INTEGER 
              AND EXTRACT(YEAR FROM b.run_date) = $2::INTEGER
            ORDER BY b.run_date ASC, s.order_id ASC
        `, [month, year]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. บันทึกข้อมูลเลข AR, IV และน้ำหนัก
router.post('/shipments', async (req, res) => {
    const { data, user_id, user_role } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            const checkLock = await client.query('SELECT is_locked FROM financials WHERE order_id = $1', [row.order_id]);
            const isCurrentlyLocked = checkLock.rows.length > 0 ? checkLock.rows[0].is_locked : false;

            if (isCurrentlyLocked && user_role !== 'ADMIN' && user_role !== 'admin') {
                continue; 
            }

            await client.query(`
                UPDATE financials SET 
                    gross_weight = $1, ar_no = $2, iv_no = $3, billing_remark = $4, billing_date = $5
                WHERE order_id = $6
            `, [
                row.gross_weight ? parseFloat(row.gross_weight) : 0,
                row.ar_no || null,
                row.iv_no || null,
                row.billing_remark || null,
                row.billing_date || null,
                row.order_id
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลวางบิลสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

// 3. ค้นหาตู้ตกค้าง / งานพิเศษที่ยังไม่ได้วางบิล 
router.get('/unbilled-containers', async (req, res) => {
    const { customer_id, run_date, booking_no } = req.query;
    if (!customer_id) return res.status(400).json({ success: false, message: 'ต้องระบุ customer_id' });

    try {
        let query = `
            SELECT 
                s.order_id, s.booking_no, s.container_1_no, s.container_2_no, s.container_size,
                s.leg1_plate, b.run_date, b.origin, b.destination, c.short_name AS customer_name,
                f.trip_fee, f.port_pass_fee, f.deposit_fee, f.lift_fee, f.shore_fee, f.gross_weight
            FROM shipment_operations s
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE b.customer_id = $1 
              AND (f.iv_no IS NULL OR f.iv_no = '')
        `;
        const params = [customer_id];

        if (run_date) {
            params.push(run_date);
            query += ` AND b.run_date = $${params.length}`;
        }
        if (booking_no) {
            params.push(`%${booking_no.trim()}%`);
            query += ` AND s.booking_no ILIKE $${params.length}`;
        }
        query += ` ORDER BY b.run_date DESC, s.order_id ASC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. สรุปรายการตามเลข IV (สำหรับแท็บ IV List)
router.get('/iv-summary', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const result = await pool.query(`
            SELECT 
                f.iv_no, f.ar_no, MAX(f.billing_date) AS billing_date,
                c.id AS customer_id, c.short_name AS customer_name,
                COUNT(s.order_id) AS total_containers,
                ARRAY_AGG(DISTINCT s.booking_no) AS booking_list,
                SUM(COALESCE(f.trip_fee, 0)) AS total_trip_fee,
                SUM(COALESCE(f.port_pass_fee, 0) + COALESCE(f.deposit_fee, 0) + COALESCE(f.lift_fee, 0) + COALESCE(f.shore_fee, 0)) AS total_other_fee,
                SUM(COALESCE(f.trip_fee, 0) + COALESCE(f.port_pass_fee, 0) + COALESCE(f.deposit_fee, 0) + COALESCE(f.lift_fee, 0) + COALESCE(f.shore_fee, 0)) AS grand_total
            FROM financials f
            JOIN shipment_operations s ON f.order_id = s.order_id
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            WHERE f.iv_no IS NOT NULL AND f.iv_no != ''
              AND EXTRACT(MONTH FROM b.run_date) = $1::INTEGER 
              AND EXTRACT(YEAR FROM b.run_date) = $2::INTEGER
            GROUP BY f.iv_no, f.ar_no, c.id, c.short_name
            ORDER BY f.iv_no ASC
        `, [month, year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// (สำหรับหน้า Print Invoice)
router.get('/print-data', async (req, res) => {
    const { booking_no, iv_no } = req.query;
    if (!booking_no && !iv_no) return res.status(400).json({ success: false, message: 'Missing param' });
    try {
        let condition = ''; let param = '';
        if (booking_no) { condition = 's.booking_no = $1'; param = booking_no; }
        else { condition = 'f.iv_no = $1'; param = iv_no; }
        const result = await pool.query(`
            SELECT s.order_id, s.booking_no, s.container_1_no, s.container_2_no, s.container_size, s.leg1_plate, s.leg2_plate, s.leg3_plate, b.run_date, b.origin, b.destination, b.job_name, c.id AS customer_id, c.customer_name, c.address, c.tax_id, c.invoice_layout, f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee, f.advance_fee, f.other_expense, f.gross_weight, f.ar_no, f.iv_no
            FROM shipment_operations s JOIN bookings b ON s.booking_no = b.booking_no LEFT JOIN customers c ON b.customer_id = c.id LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE ${condition} ORDER BY s.order_id ASC
        `, [param]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;