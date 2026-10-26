const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// 🌟 ฟังก์ชันฮีโร่: ซิงค์เวลาลงตู้ย่อย และ สร้าง/ลบตู้อัตโนมัติ 🌟
async function syncShipments(client, b) {
    const res = await client.query('SELECT order_id, raw_data FROM shipments WHERE booking_no = $1 ORDER BY order_id ASC', [b.booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;
    const target_count = parseInt(b.container_count || 1);
    
    for (const ship of current_shipments) {
        let raw = [];
        try { raw = JSON.parse(ship.raw_data); } catch(e) {}
        while (raw.length < 29) raw.push(''); 
        
        raw[2] = b.mode || raw[2];
        raw[4] = b.run_date || raw[4];
        raw[5] = b.job_name || raw[5];
        raw[6] = b.customer_name || raw[6];
        raw[11] = b.container_size || raw[11]; // 🌟 อัปเดตขนาดตู้ให้ตู้เดิมด้วย 🌟
        raw[12] = b.job_type || raw[12];
        raw[13] = b.agent || raw[13];
        raw[18] = b.cy_date || raw[18];
        raw[19] = b.trip_fee !== undefined ? b.trip_fee : raw[19];
        raw[20] = b.trans_fee !== undefined ? b.trans_fee : raw[20];
        raw[21] = b.vgm_cutoff || raw[21];
        raw[22] = b.cutoff_time || raw[22];
        raw[23] = b.rent_cutoff || raw[23];
        raw[24] = b.demurrage || raw[24];
        raw[25] = b.load_date || raw[25];
        raw[26] = b.unload_date || raw[26];
        raw[27] = b.open_gate || raw[27];
        raw[28] = b.return_date || raw[28];
        
        await client.query(`UPDATE shipments SET run_date=$1, customer_name=$2, raw_data=$3 WHERE order_id=$4`, 
        [raw[4], raw[6], JSON.stringify(raw), ship.order_id]);
    }

    if (current_count < target_count) {
        const to_create = target_count - current_count;
        const dateObj = new Date(b.run_date);
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
                false, new_order_id, b.mode || '', '', b.run_date || '', b.job_name || '', b.customer_name || '', b.booking_no,
                '', '', 1, b.container_size || '', b.job_type || '', b.agent || '', '', '', // 🌟 หยอด b.container_size ลงช่องที่ 11
                '', '', b.cy_date || '', b.trip_fee || 0, b.trans_fee || 0,
                b.vgm_cutoff || '', b.cutoff_time || '', b.rent_cutoff || '', b.demurrage || '', b.load_date || '', b.unload_date || '', b.open_gate || '', b.return_date || ''
            ];
            await client.query(`INSERT INTO shipments (order_id, run_date, customer_name, booking_no, status, raw_data) VALUES ($1, $2, $3, $4, 'รอจัดรถ', $5)`, 
            [new_order_id, b.run_date, b.customer_name, b.booking_no, JSON.stringify(raw_data)]);
        }
    } 
    else if (current_count > target_count) {
        const ids_to_delete = [];
        for (let i = current_count - 1; i >= target_count; i--) ids_to_delete.push(current_shipments[i].order_id);
        if (ids_to_delete.length > 0) {
            const placeholders = ids_to_delete.map((_, idx) => `$${idx + 1}`).join(',');
            await client.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, ids_to_delete);
        }
    }
}

// POST /api/bookings/header (บันทึกหัวบิล)
router.post('/bookings/header', async (req, res) => {
    const b = req.body;
    if (!b.mode || !b.run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        b.booking_no = b.booking_no || `BK-${Date.now()}`;
        // 🌟 แก้ไข SQL โครงสร้างตารางให้มี container_size และ $23
        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, container_size, origin, destination,
                agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee
            ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name, customer_name = EXCLUDED.customer_name, 
                container_count = EXCLUDED.container_count, container_size = EXCLUDED.container_size, origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                agent = EXCLUDED.agent, cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate, rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, 
                unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date, job_type = EXCLUDED.job_type, price_type = EXCLUDED.price_type, 
                trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee, updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;
        const values = [
            b.booking_no, cleanVal(b.mode), b.run_date, b.job_name || '', b.customer_name || '', b.container_count || 1, b.container_size || '', b.origin || '', b.destination || '',
            cleanVal(b.agent), cleanVal(b.cy_date), cleanVal(b.vgm_cutoff), cleanVal(b.cutoff_time), cleanVal(b.load_date), cleanVal(b.open_gate),
            cleanVal(b.rent_cutoff), cleanVal(b.demurrage), cleanVal(b.unload_date), cleanVal(b.return_date),
            cleanVal(b.job_type), cleanVal(b.price_type), cleanNum(b.trip_fee), cleanNum(b.trans_fee)
        ];
        
        const result = await client.query(query, values);
        await syncShipments(client, b);
        
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    } finally { client.release(); }
});

// PUT /api/bookings/:id (อัปเดตจากหน้ากริด)
router.put('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const b = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE bookings SET 
                mode=$1, run_date=$2, customer_name=$3, job_name=$4, job_type=$5, origin=$6, destination=$7, container_count=$8, container_size=$9,
                price_type=$10, trip_fee=$11, trans_fee=$12, cy_date=$13, vgm_cutoff=$14, cutoff_time=$15, rent_cutoff=$16, 
                demurrage=$17, load_date=$18, unload_date=$19, open_gate=$20, return_date=$21, updated_at=NOW()
            WHERE id=$22
        `, [
            cleanVal(b.mode), b.run_date, b.customer_name || '', b.job_name || '', cleanVal(b.job_type), b.origin || '', b.destination || '', b.container_count || 1, b.container_size || '',
            cleanVal(b.price_type), cleanNum(b.trip_fee), cleanNum(b.trans_fee), cleanVal(b.cy_date), cleanVal(b.vgm_cutoff), cleanVal(b.cutoff_time), cleanVal(b.rent_cutoff),
            cleanVal(b.demurrage), cleanVal(b.load_date), cleanVal(b.unload_date), cleanVal(b.open_gate), cleanVal(b.return_date), id
        ]);
        
        await syncShipments(client, b);
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตและซิงค์ตู้สำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

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

router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            let order_id = cleanVal(row[1]);
            const run_date = cleanVal(row[4]);
            const customer_name = cleanVal(row[6]) || '';
            const booking_no = cleanVal(row[7]) || '';
            const status = row[row.length - 1] || 'รอจัดรถ';

            if (!order_id) {
                if (!run_date) continue; 
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
                order_id = `${prefix}${String(start_num).padStart(3, '0')}`;
                row[1] = order_id; 
            }

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

router.delete('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const bRes = await client.query('SELECT booking_no FROM bookings WHERE id = $1', [id]);
        if (bRes.rows.length > 0) {
            const booking_no = bRes.rows[0].booking_no;
            await client.query('DELETE FROM shipments WHERE booking_no = $1', [booking_no]);
        }
        await client.query('DELETE FROM bookings WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) { 
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message }); 
    } finally { client.release(); }
});

router.post('/rates/single', async (req, res) => {
    const r = req.body;
    if (!r.job_name) return res.status(400).json({ success: false });
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO rates (job_name, customer_name, origin, destination, job_type, 
                               trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash,
                               trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (job_name) DO UPDATE SET 
                customer_name=EXCLUDED.customer_name, origin=EXCLUDED.origin, destination=EXCLUDED.destination, job_type=EXCLUDED.job_type,
                trip_fee_6w = COALESCE(EXCLUDED.trip_fee_6w, rates.trip_fee_6w),
                trip_fee_10w = COALESCE(EXCLUDED.trip_fee_10w, rates.trip_fee_10w),
                trip_fee_12w = COALESCE(EXCLUDED.trip_fee_12w, rates.trip_fee_12w),
                trip_fee_cash = COALESCE(EXCLUDED.trip_fee_cash, rates.trip_fee_cash),
                trans_fee_6w = COALESCE(EXCLUDED.trans_fee_6w, rates.trans_fee_6w),
                trans_fee_10w = COALESCE(EXCLUDED.trans_fee_10w, rates.trans_fee_10w),
                trans_fee_12w = COALESCE(EXCLUDED.trans_fee_12w, rates.trans_fee_12w),
                trans_fee_cash = COALESCE(EXCLUDED.trans_fee_cash, rates.trans_fee_cash)
        `, [
            r.job_name, r.customer_name, r.origin, r.destination, r.job_type,
            r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash,
            r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash
        ]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); } finally { client.release(); }
});
module.exports = router;