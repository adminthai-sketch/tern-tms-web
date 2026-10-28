const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ดึงข้อมูลสำหรับหน้าวางบิล (ดึงข้อมูลตู้ที่มีการจัดรถแล้ว)
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const result = await pool.query(`
            SELECT 
                s.order_id, s.booking_no, s.container_1_no, s.container_2_no,
                s.leg1_plate, s.leg1_driver, s.leg2_plate, s.leg2_driver, s.leg3_plate, s.leg3_driver,
                b.mode, b.run_date, b.customer_id, c.short_name AS customer_name,
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
        console.error("Billing GET Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// บันทึกข้อมูลเลข AR, IV และน้ำหนัก
router.post('/shipments', async (req, res) => {
    const { data, user_id, user_role } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            // เช็คสถานะการล็อคก่อนบันทึก
            const checkLock = await client.query('SELECT is_locked FROM financials WHERE order_id = $1', [row.order_id]);
            const isCurrentlyLocked = checkLock.rows.length > 0 ? checkLock.rows[0].is_locked : false;

            // ถ้าล็อคอยู่ และคนกดเซฟไม่ใช่ ADMIN ให้ข้ามการบันทึกแถวนี้ไปเลย (ป้องกันคนแอบแฮ็กยิง API)
            if (isCurrentlyLocked && user_role !== 'ADMIN' && user_role !== 'admin') {
                continue; 
            }

            await client.query(`
                UPDATE financials SET 
                    gross_weight = $1, 
                    ar_no = $2, 
                    iv_no = $3, 
                    billing_remark = $4
                WHERE order_id = $5
            `, [
                row.gross_weight ? parseFloat(row.gross_weight) : 0,
                row.ar_no || null,
                row.iv_no || null,
                row.billing_remark || null,
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

// API สำหรับกด "ปิดจ๊อบ" หรือ "ปลดล็อค" (Admin Only สำหรับปลดล็อค)
router.post('/toggle-lock', async (req, res) => {
    const { order_id, is_locked, username, role } = req.body;
    
    // ดักไว้เลยว่า ถ้าจะสั่ง "ปลดล็อค (is_locked = false)" ต้องเป็น Admin เท่านั้น!
    if (is_locked === false && role !== 'ADMIN' && role !== 'admin') {
        return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ปลดล็อคเอกสาร (Admin Only)' });
    }

    try {
        await pool.query(`
            UPDATE financials 
            SET is_locked = $1, 
                locked_by = $2, 
                locked_at = CURRENT_TIMESTAMP,
                billing_status = $3
            WHERE order_id = $4
        `, [
            is_locked, 
            is_locked ? username : null, 
            is_locked ? 'ปิดจ๊อบ' : 'รอวางบิล',
            order_id
        ]);
        
        res.json({ success: true, message: is_locked ? 'ล็อคข้อมูลเรียบร้อย' : 'ปลดล็อคข้อมูลเรียบร้อย' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;