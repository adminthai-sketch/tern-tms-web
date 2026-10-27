const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// 🌟 ฟังก์ชันหา ID ลูกค้าจากชื่อ 🌟
async function getCustomerId(client, customerName) {
    if (!customerName) return null;
    const res = await client.query('SELECT id FROM customers WHERE short_name = $1 OR customer_name = $1 LIMIT 1', [customerName]);
    return res.rows.length > 0 ? res.rows[0].id : null;
}

// 🌟 ฟังก์ชันฮีโร่: ซิงค์เวลาลงตู้ย่อย และ สร้าง/ลบตู้อัตโนมัติ 🌟
async function syncShipments(client, b, customer_id) {
    const res = await client.query('SELECT order_id, raw_data FROM shipments WHERE booking_no = $1 ORDER BY order_id ASC', [b.booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;
    const target_count = parseInt(b.container_count || 1);
    
    for (const ship of current_shipments) {
        let raw = [];
        try { raw = JSON.parse(ship.raw_data); } catch(e) {}
        while (raw.length < 80) raw.push(''); // ขยายเผื่อโครงสร้างตารางใหม่
        
        raw[2] = b.mode || raw[2];
        raw[4] = b.run_date || raw[4];
        raw[5] = b.job_name || raw[5];
        raw[6] = b.customer_name || raw[6];
        raw[11] = b.container_size || raw[11];
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
        
        // 🌟 เซฟตู้ย่อยโดยผูก customer_id
        await client.query(`UPDATE shipments SET run_date=$1, customer_id=$2, raw_data=$3 WHERE order_id=$4`, 
        [raw[4], customer_id, JSON.stringify(raw), ship.order_id]);
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
            const raw_data = new Array(80).fill('');
            raw_data[0] = false; raw_data[1] = new_order_id; raw_data[2] = b.mode || ''; raw_data[4] = b.run_date || '';
            raw_data[5] = b.job_name || ''; raw_data[6] = b.customer_name || ''; raw_data[7] = b.booking_no;
            raw_data[10] = 1; raw_data[11] = b.container_size || ''; raw_data[12] = b.job_type || ''; raw_data[13] = b.agent || '';
            raw_data[18] = b.cy_date || ''; raw_data[19] = b.trip_fee || 0; raw_data[20] = b.trans_fee || 0;
            raw_data[21] = b.vgm_cutoff || ''; raw_data[22] = b.cutoff_time || ''; raw_data[23] = b.rent_cutoff || '';
            raw_data[24] = b.demurrage || ''; raw_data[25] = b.load_date || ''; raw_data[26] = b.unload_date || '';
            raw_data[27] = b.open_gate || ''; raw_data[28] = b.return_date || '';

            // 🌟 สร้างตู้ย่อยใหม่ ผูกกับ customer_id และ booking_no
            await client.query(`INSERT INTO shipments (order_id, run_date, customer_id, booking_no, status, raw_data) VALUES ($1, $2, $3, $4, 'รอจัดรถ', $5)`, 
            [new_order_id, b.run_date, customer_id, b.booking_no, JSON.stringify(raw_data)]);
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
        
        // 🌟 ดึง ID ลูกค้าจากตารางลูกค้า
        const customer_id = await getCustomerId(client, b.customer_name);

        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_id, container_count, origin, destination,
                cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                price_type, trip_fee, trans_fee
            ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name, customer_id = EXCLUDED.customer_id, 
                container_count = EXCLUDED.container_count, origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate, rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, 
                unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date, price_type = EXCLUDED.price_type, 
                trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee, updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;
        const values = [
            b.booking_no, cleanVal(b.mode), b.run_date, b.job_name || '', customer_id, b.container_count || 1, b.origin || '', b.destination || '',
            cleanVal(b.cy_date), cleanVal(b.vgm_cutoff), cleanVal(b.cutoff_time), cleanVal(b.load_date), cleanVal(b.open_gate),
            cleanVal(b.rent_cutoff), cleanVal(b.demurrage), cleanVal(b.unload_date), cleanVal(b.return_date),
            cleanVal(b.price_type), cleanNum(b.trip_fee), cleanNum(b.trans_fee)
        ];
        
        const result = await client.query(query, values);
        
        // 🌟 ซิงค์ตู้โดยส่ง ID เข้าไปแทนชื่อ
        await syncShipments(client, b, customer_id);
        
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    } finally { client.release(); }
});

// PUT /api/bookings/:id (อัปเดตข้อมูลจากตาราง Booking List)
router.put('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const {
        mode, run_date, customer_name, agent, job_name, job_type, origin, destination,
        container_count, container_size, price_type, trip_fee, trans_fee,
        cy_date, vgm_cutoff, cutoff_time, rent_cutoff, demurrage,
        load_date, unload_date, open_gate, return_date
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. อัปเดตตารางหัวบุคกิ้ง (Bookings) - เพิ่ม agent, job_type, container_size ให้ครบ!
        const updateBookingQuery = `
            UPDATE bookings 
            SET mode = $1, run_date = $2, customer_name = $3, agent = $4, job_name = $5, job_type = $6, 
                origin = $7, destination = $8, container_count = $9, container_size = $10, price_type = $11, 
                trip_fee = $12, trans_fee = $13, cy_date = $14, vgm_cutoff = $15, cutoff_time = $16, 
                rent_cutoff = $17, demurrage = $18, load_date = $19, unload_date = $20, 
                open_gate = $21, return_date = $22, updated_at = CURRENT_TIMESTAMP
            WHERE id = $23
            RETURNING booking_no;
        `;
        const bookingValues = [
            mode, run_date, customer_name, agent, job_name, job_type, 
            origin, destination, container_count, container_size, price_type, 
            cleanNum(trip_fee), cleanNum(trans_fee), cleanVal(cy_date), cleanVal(vgm_cutoff), cleanVal(cutoff_time), 
            cleanVal(rent_cutoff), cleanVal(demurrage), cleanVal(load_date), cleanVal(unload_date), 
            cleanVal(open_gate), cleanVal(return_date), id
        ];
        
        const bResult = await client.query(updateBookingQuery, bookingValues);

        // 2. ถ้าแก้ขนาดตู้ หรือชื่อลูกค้า ให้ไปอัปเดตตารางลูก (Shipments) ด้วย เพื่อให้หน้าจัดรถอัปเดตตาม
        if (bResult.rows.length > 0) {
            const bNo = bResult.rows[0].booking_no;
            await client.query(`
                UPDATE shipments 
                SET customer_name = $1, container_size = $2, job_title = $3
                WHERE booking_no = $4
            `, [customer_name, container_size, job_name, bNo]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ 100%' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
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
            
            const customer_id = await getCustomerId(client, customer_name);

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
                INSERT INTO shipments (order_id, run_date, customer_id, booking_no, status, raw_data)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (order_id) DO UPDATE 
                SET run_date = EXCLUDED.run_date, customer_id = EXCLUDED.customer_id,
                    booking_no = EXCLUDED.booking_no, status = EXCLUDED.status,
                    raw_data = EXCLUDED.raw_data, updated_at = NOW()
            `, [order_id, run_date, customer_id, booking_no, status, JSON.stringify(row)]);
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
        // 🌟 เชื่อมตารางลูกค้าเพื่อดึงชื่อออกไปโชว์ที่หน้าเว็บ
        let query = `
            SELECT b.*, c.short_name AS customer_name 
            FROM bookings b 
            LEFT JOIN customers c ON b.customer_id = c.id 
            WHERE 1=1
        `;
        let params = []; let paramIndex = 1;
        if (start_date && end_date) { query += ` AND b.run_date BETWEEN $${paramIndex++} AND $${paramIndex++}`; params.push(start_date, end_date); }
        if (customer) { query += ` AND c.short_name = $${paramIndex++}`; params.push(customer); }
        if (search) { query += ` AND (b.booking_no ILIKE $${paramIndex} OR b.job_name ILIKE $${paramIndex})`; params.push(`%${search}%`); paramIndex++; }
        query += ` ORDER BY b.run_date DESC, b.id DESC LIMIT 100`;
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
        const customer_id = await getCustomerId(client, r.customer_name);
        await client.query(`
            INSERT INTO rates (job_name, customer_id, origin, destination, job_type, 
                               trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash,
                               trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (job_name) DO UPDATE SET 
                customer_id=EXCLUDED.customer_id, origin=EXCLUDED.origin, destination=EXCLUDED.destination, job_type=EXCLUDED.job_type,
                trip_fee_6w = COALESCE(EXCLUDED.trip_fee_6w, rates.trip_fee_6w),
                trip_fee_10w = COALESCE(EXCLUDED.trip_fee_10w, rates.trip_fee_10w),
                trip_fee_12w = COALESCE(EXCLUDED.trip_fee_12w, rates.trip_fee_12w),
                trip_fee_cash = COALESCE(EXCLUDED.trip_fee_cash, rates.trip_fee_cash),
                trans_fee_6w = COALESCE(EXCLUDED.trans_fee_6w, rates.trans_fee_6w),
                trans_fee_10w = COALESCE(EXCLUDED.trans_fee_10w, rates.trans_fee_10w),
                trans_fee_12w = COALESCE(EXCLUDED.trans_fee_12w, rates.trans_fee_12w),
                trans_fee_cash = COALESCE(EXCLUDED.trans_fee_cash, rates.trans_fee_cash)
        `, [
            r.job_name, customer_id, r.origin, r.destination, r.job_type,
            r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash,
            r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash
        ]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); } finally { client.release(); }
});

router.get('/container-sizes', async (req, res) => {
    try {
        const result = await pool.query('SELECT size_name FROM master_container_sizes ORDER BY size_name ASC');
        res.json({ success: true, data: result.rows });
    } catch(err) { res.status(500).json({ success: false }); }
});

router.post('/container-sizes', async (req, res) => {
    try {
        const { size_name } = req.body;
        await pool.query('INSERT INTO master_container_sizes (size_name) VALUES ($1) ON CONFLICT DO NOTHING', [size_name.trim().toUpperCase()]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

module.exports = router;