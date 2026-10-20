const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// 🌟 ฟังก์ชันฮีโร่: ซิงค์จำนวนตู้ (สร้าง/ลบ ออเดอร์อัตโนมัติ) 🌟
async function syncShipments(client, booking_no, run_date, target_count, customer_name, job_name, mode, job_type, origin, destination, price_type, trip_fee, trans_fee, cy_date) {
    const res = await client.query('SELECT order_id FROM shipments WHERE booking_no = $1 ORDER BY order_id ASC', [booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;

    if (current_count < target_count) {
        const to_create = target_count - current_count;
        const dateObj = new Date(run_date);
        const yy = String(dateObj.getFullYear()).substring(2);
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const prefix = `ORD-${yy}${mm}${dd}-`;

        const lastOrderRes = await client.query(`SELECT order_id FROM shipments WHERE order_id LIKE $1 ORDER BY order_id DESC LIMIT 1`, [`${prefix}%`]);
        let start_num = 1;
        if (lastOrderRes.rows.length > 0) {
            const parts = lastOrderRes.rows[0].order_id.split('-');
            if (parts.length === 3) start_num = parseInt(parts[2], 10) + 1;
        }

        for (let i = 0; i < to_create; i++) {
            const new_order_id = `${prefix}${String(start_num + i).padStart(3, '0')}`;
            const raw_data = [
                false, new_order_id, mode || '', '', run_date || '', job_name || '', customer_name || '', booking_no,
                '', '', 1, '', job_type || '', '', '', '', '', '', cy_date || '', trip_fee || 0, trans_fee || 0
            ];
            await client.query(`INSERT INTO shipments (order_id, run_date, customer_name, booking_no, status, raw_data) VALUES ($1, $2, $3, $4, 'รอจัดรถ', $5)`, 
            [new_order_id, run_date, customer_name, booking_no, JSON.stringify(raw_data)]);
        }
    } else if (current_count > target_count) {
        const to_delete = current_count - target_count;
        const ids_to_delete = [];
        for (let i = current_count - 1; i >= target_count; i--) ids_to_delete.push(current_shipments[i].order_id);
        if (ids_to_delete.length > 0) {
            const placeholders = ids_to_delete.map((_, idx) => `$${idx + 1}`).join(',');
            await client.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, ids_to_delete);
        }
    }
}

// POST /api/bookings/header (บันทึกหัวบิล + ซิงค์ตู้)
router.post('/bookings/header', async (req, res) => {
    const { 
        mode, run_date, container_count, job_name, customer_name, booking_no, origin, destination,
        agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
        job_type, price_type, trip_fee, trans_fee
    } = req.body;

    if (!mode || !run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const b_no = booking_no || `BK-${Date.now()}`;
        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, origin, destination,
                agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee
            ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name, customer_name = EXCLUDED.customer_name, 
                container_count = EXCLUDED.container_count, origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                agent = EXCLUDED.agent, cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate, rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, 
                unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date, job_type = EXCLUDED.job_type, price_type = EXCLUDED.price_type, 
                trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee, updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;
        const values = [
            b_no, cleanVal(mode), run_date, job_name || '', customer_name || '', container_count || 1, origin || '', destination || '',
            cleanVal(agent), cleanVal(cy_date), cleanVal(vgm_cutoff), cleanVal(cutoff_time), cleanVal(load_date), cleanVal(open_gate),
            cleanVal(rent_cutoff), cleanVal(demurrage), cleanVal(unload_date), cleanVal(return_date),
            cleanVal(job_type), cleanVal(price_type), cleanNum(trip_fee), cleanNum(trans_fee)
        ];
        
        const result = await client.query(query, values);
        
        // 🌟 เรียกใช้ฮีโร่ของเราเพื่อซิงค์จำนวนตู้ลงใน shipments อัตโนมัติ 🌟
        await syncShipments(client, b_no, run_date, parseInt(container_count || 1), customer_name, job_name, mode, job_type, origin, destination, price_type, trip_fee, trans_fee, cy_date);
        
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    } finally {
        client.release();
    }
});

// PUT /api/bookings/:id (อัปเดตจากหน้ากริด)
router.put('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        booking_no, mode, run_date, customer_name, job_name, job_type, origin, destination, container_count, price_type, trip_fee, trans_fee,
        cy_date, vgm_cutoff, cutoff_time, rent_cutoff, demurrage, load_date, unload_date, open_gate, return_date
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE bookings SET 
                mode=$1, run_date=$2, customer_name=$3, job_name=$4, job_type=$5, origin=$6, destination=$7, container_count=$8, 
                price_type=$9, trip_fee=$10, trans_fee=$11, cy_date=$12, vgm_cutoff=$13, cutoff_time=$14, rent_cutoff=$15, 
                demurrage=$16, load_date=$17, unload_date=$18, open_gate=$19, return_date=$20, updated_at=NOW()
            WHERE id=$21
        `, [
            cleanVal(mode), run_date, customer_name || '', job_name || '', cleanVal(job_type), origin || '', destination || '', container_count || 1,
            cleanVal(price_type), cleanNum(trip_fee), cleanNum(trans_fee), cleanVal(cy_date), cleanVal(vgm_cutoff), cleanVal(cutoff_time), cleanVal(rent_cutoff),
            cleanVal(demurrage), cleanVal(load_date), cleanVal(unload_date), cleanVal(open_gate), cleanVal(return_date), id
        ]);
        
        await syncShipments(client, booking_no, run_date, parseInt(container_count || 1), customer_name, job_name, mode, job_type, origin, destination, price_type, trip_fee, trans_fee, cy_date);
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตและซิงค์ตู้สำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// GET /api/shipments (โหลดตารางลงตู้)
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
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/shipments (บันทึกตารางลงตู้แบบ Manual)
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
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: error.message });
    } finally { client.release(); }
});

router.delete('/shipments', async (req, res) => {
    const { order_ids } = req.body;
    if (!order_ids || order_ids.length === 0) return res.json({ success: true, message: 'ไม่มีรายการลบ' });
    try {
        const placeholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, order_ids);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/bookings/search', async (req, res) => {
    try {
        const { start_date, end_date, search, customer } = req.query;
        let query = `SELECT * FROM bookings WHERE 1=1`;
        let params = []; let paramIndex = 1;
        if (start_date && end_date) { query += ` AND run_date BETWEEN $${paramIndex++} AND $${paramIndex++}`; params.push(start_date, end_date); }
        if (customer) { query += ` AND customer_name = $${paramIndex++}`; params.push(customer); }
        if (search) { query += ` AND (booking_no ILIKE $${paramIndex} OR job_name ILIKE $${paramIndex})`; params.push(`%${search}%`); paramIndex++; }
        query += ` ORDER BY run_date DESC, id DESC LIMIT 100`;
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;