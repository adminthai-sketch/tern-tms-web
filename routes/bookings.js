const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper Functions
const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// POST /api/bookings/header (บันทึกหัวบิล)
router.post('/bookings/header', async (req, res) => {
    // 1. รับค่าจาก req.body
    const { 
        mode, run_date, container_count, job_name, customer_name, booking_no, origin, destination,
        cy_date, vgm_cutoff, cutoff_time, load_date, open_gate,
        rent_cutoff, demurrage, unload_date, return_date,
        job_type, price_type, trip_fee, trans_fee
    } = req.body;

    if (!mode || !run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    try {
        const b_no = booking_no || `BK-${Date.now()}`;
        
        // 2. สร้าง SQL Query (เพิ่ม job_type เป็น $18 รวมพารามิเตอร์เป็น 21 ตัว)
        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, origin, destination,
                cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee
            )
            VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name,
                customer_name = EXCLUDED.customer_name, container_count = EXCLUDED.container_count,
                origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate,
                rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date,
                job_type = EXCLUDED.job_type, price_type = EXCLUDED.price_type, trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;

        // 3. ปรับอาร์เรย์ values ให้ปลอดภัยด้วย cleanVal
        const values = [
            b_no, 
            cleanVal(mode),            // $2  ENUM: job_mode_enum
            run_date,                  // $3
            job_name || '',            // $4
            customer_name || '',       // $5
            container_count || 1,      // $6
            origin || '',              // $7
            destination || '',         // $8
            cleanVal(cy_date),         // $9
            cleanVal(vgm_cutoff),      // $10
            cleanVal(cutoff_time),     // $11
            cleanVal(load_date),       // $12
            cleanVal(open_gate),       // $13
            cleanVal(rent_cutoff),     // $14
            cleanVal(demurrage),       // $15
            cleanVal(unload_date),     // $16
            cleanVal(return_date),     // $17
            cleanVal(job_type),        // $18 ENUM: job_type_enum
            cleanVal(price_type),      // $19 ENUM: price_vehicle_type_enum
            cleanNum(trip_fee),        // $20
            cleanNum(trans_fee)        // $21
        ];
        
        const result = await pool.query(query, values);
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    }
});

// GET /api/shipments (โหลดตาราง)
router.get('/shipments', async (req, res) => {
    try {
        const { year, month } = req.query;
        let query = 'SELECT raw_data FROM shipments';
        let params = [];
        if (year && month) {
            query += ' WHERE EXTRACT(MONTH FROM run_date) = $1 AND EXTRACT(YEAR FROM run_date) = $2';
            params.push(month, year);
        }
        query += ' ORDER BY order_id ASC';
        
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows.map(r => r.raw_data) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/shipments (บันทึกตาราง)
router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            const order_id = cleanVal(row[1]);
            if (!order_id) continue;

            const run_date = cleanVal(row[4]);
            const customer_name = cleanVal(row[6]) || '';
            const booking_no = cleanVal(row[7]) || '';
            const status = row[row.length - 1] || 'รอจัดรถ';

            await client.query(`
                INSERT INTO shipments (order_id, run_date, customer_name, booking_no, status, raw_data)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (order_id) DO UPDATE 
                SET run_date = EXCLUDED.run_date, customer_name = EXCLUDED.customer_name,
                    booking_no = EXCLUDED.booking_no, status = EXCLUDED.status,
                    raw_data = EXCLUDED.raw_data, updated_at = NOW()
            `, [order_id, run_date, customer_name, booking_no, status, JSON.stringify(row)]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลตาราง Operation ลงฐานข้อมูลสำเร็จ!' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message });
    } finally {
        client.release();
    }
});

// DELETE /api/shipments
router.delete('/shipments', async (req, res) => {
    const { order_ids } = req.body;
    if (!order_ids || order_ids.length === 0) return res.json({ success: true, message: 'ไม่มีรายการลบ' });
    try {
        const placeholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, order_ids);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;