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
    const { 
        mode, run_date, container_count, job_name, customer_name, booking_no, origin, destination,
        agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate,
        rent_cutoff, demurrage, unload_date, return_date,
        job_type, price_type, trip_fee, trans_fee
    } = req.body;

    if (!mode || !run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    try {
        const b_no = booking_no || `BK-${Date.now()}`;
        
        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, origin, destination,
                agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee
            )
            VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name,
                customer_name = EXCLUDED.customer_name, container_count = EXCLUDED.container_count,
                origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                agent = EXCLUDED.agent, cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate,
                rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date,
                job_type = EXCLUDED.job_type, price_type = EXCLUDED.price_type, trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;

        const values = [
            b_no, cleanVal(mode), run_date, job_name || '', customer_name || '', container_count || 1, origin || '', destination || '',
            cleanVal(agent), cleanVal(cy_date), cleanVal(vgm_cutoff), cleanVal(cutoff_time), cleanVal(load_date), cleanVal(open_gate),
            cleanVal(rent_cutoff), cleanVal(demurrage), cleanVal(unload_date), cleanVal(return_date),
            cleanVal(job_type), cleanVal(price_type), cleanNum(trip_fee), cleanNum(trans_fee)
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

// ==========================================
// 🔍 MONITOR & DISPATCH API
// ==========================================

// 1. GET /api/bookings/search (ค้นหาหัวบิลตามเงื่อนไข)
router.get('/bookings/search', async (req, res) => {
    try {
        const { start_date, end_date, search, customer } = req.query;
        
        // 🌟 แก้ไข: สั่งให้ดึงคอลัมน์เวลาต่างๆ และชื่องาน ออกมาให้ครบถ้วน 🌟
      let query = `
            SELECT 
                id, booking_no, run_date, customer_name, origin, destination, container_count, mode, job_type,
                job_name, price_type, trip_fee, trans_fee,
                cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, 
                rent_cutoff, demurrage, unload_date, return_date
            FROM bookings 
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        if (start_date && end_date) {
            query += ` AND run_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
            params.push(start_date, end_date);
        }
        if (customer) {
            query += ` AND customer_name = $${paramIndex++}`;
            params.push(customer);
        }
        if (search) {
            query += ` AND (booking_no ILIKE $${paramIndex} OR job_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ` ORDER BY run_date DESC, id DESC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. GET /api/bookings/:booking_no/containers (ดึงรายการหางบิล/ตู้คอนเทนเนอร์ ของบิลนั้นๆ)
router.get('/bookings/:booking_no/containers', async (req, res) => {
    try {
        const { booking_no } = req.params;
        const result = await pool.query(`
            SELECT id, order_id, status, raw_data 
            FROM shipments 
            WHERE booking_no = $1 
            ORDER BY order_id ASC
        `, [booking_no]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. PUT /api/shipments/update-container (อัปเดตข้อมูลรายตู้ เช่น จัดรถ, ใส่เบอร์ตู้)
router.put('/shipments/update-container', async (req, res) => {
    const { order_id, status, raw_data } = req.body;
    if (!order_id) return res.status(400).json({ success: false, message: 'ไม่พบ Order ID' });

    try {
        await pool.query(`
            UPDATE shipments 
            SET status = $1, raw_data = $2, updated_at = NOW()
            WHERE order_id = $3
        `, [status || 'รอจัดรถ', JSON.stringify(raw_data), order_id]);
        
        res.json({ success: true, message: 'อัปเดตข้อมูลตู้สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;