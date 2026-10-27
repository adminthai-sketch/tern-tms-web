const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ฟังก์ชันแปลงค่า ป้องกัน Error
const cleanVal = (val) => (!val || val === '' || val === 'NaN') ? null : String(val).trim();
const cleanNum = (val) => {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// 🌟 ฟังก์ชันหา ID ลูกค้าจากชื่อ
async function getCustomerId(client, customerName) {
    if (!customerName) return null;
    const res = await client.query('SELECT id FROM customers WHERE short_name = $1 OR customer_name = $1 LIMIT 1', [customerName]);
    return res.rows.length > 0 ? res.rows[0].id : null;
}

// 🌟 ฟังก์ชันฮีโร่: ซิงค์เวลาลงตู้ย่อย แบบแยกคอลัมน์มาตรฐาน (3-Tier Schema) 🌟
async function syncShipments(client, b) {
    const res = await client.query('SELECT order_id FROM shipment_operations WHERE booking_no = $1 ORDER BY order_id ASC', [b.booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;
    const target_count = parseInt(b.container_count || 1);
    
    // สร้างเพิ่มถ้าตู้น้อยกว่าที่ระบุ
    if (current_count < target_count) {
        const to_create = target_count - current_count;
        const dateObj = new Date(b.run_date);
        const yy = String(dateObj.getFullYear()).substring(2);
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const prefix = `ORD-${yy}${mm}${dd}-`;

        const lastOrderRes = await client.query(`SELECT order_id FROM shipment_operations WHERE order_id LIKE $1 ORDER BY order_id DESC LIMIT 1`, [`${prefix}%`]);
        let start_num = 1;
        if (lastOrderRes.rows.length > 0) {
            const parts = lastOrderRes.rows[0].order_id.split('-');
            if (parts.length === 3) start_num = parseInt(parts[2], 10) + 1;
        }

        for (let i = 0; i < to_create; i++) {
            const new_order_id = `${prefix}${String(start_num + i).padStart(3, '0')}`;
            
            // สร้างข้อมูลตู้ (Operations)
            await client.query(`
                INSERT INTO shipment_operations (order_id, booking_no, overall_status) 
                VALUES ($1, $2, 'รอจัดรถ')
            `, [new_order_id, b.booking_no]);

            // สร้างกระเป๋าเงินประจำตู้ (Financials) คู่กันเสมอ
            await client.query(`
                INSERT INTO financials (order_id, trip_fee, trans_fee) 
                VALUES ($1, $2, $3)
            `, [new_order_id, cleanNum(b.trip_fee), cleanNum(b.trans_fee)]);
        }
    } 
    // ลบตู้ที่เกินทิ้ง
    else if (current_count > target_count) {
        const ids_to_delete = [];
        for (let i = current_count - 1; i >= target_count; i--) ids_to_delete.push(current_shipments[i].order_id);
        if (ids_to_delete.length > 0) {
            const placeholders = ids_to_delete.map((_, idx) => `$${idx + 1}`).join(',');
            // ตาราง financials จะถูกลบอัตโนมัติตาม (ON DELETE CASCADE)
            await client.query(`DELETE FROM shipment_operations WHERE order_id IN (${placeholders})`, ids_to_delete);
        }
    }
}

// 🌟 POST /api/bookings/header (สร้าง Booking ใหม่) 🌟
router.post('/bookings/header', async (req, res) => {
    const b = req.body;
    if (!b.mode || !b.run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        b.booking_no = b.booking_no || `BK-${Date.now()}`;
        
        const customer_id = await getCustomerId(client, b.customer_name);

        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_id, container_count, origin, destination,
                agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee, container_size
            ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name, customer_id = EXCLUDED.customer_id, 
                container_count = EXCLUDED.container_count, origin = EXCLUDED.origin, destination = EXCLUDED.destination,
                agent = EXCLUDED.agent, cy_date = EXCLUDED.cy_date, vgm_cutoff = EXCLUDED.vgm_cutoff, cutoff_time = EXCLUDED.cutoff_time,
                load_date = EXCLUDED.load_date, open_gate = EXCLUDED.open_gate, rent_cutoff = EXCLUDED.rent_cutoff, demurrage = EXCLUDED.demurrage, 
                unload_date = EXCLUDED.unload_date, return_date = EXCLUDED.return_date, 
                job_type = EXCLUDED.job_type, price_type = EXCLUDED.price_type, 
                trip_fee = EXCLUDED.trip_fee, trans_fee = EXCLUDED.trans_fee, container_size = EXCLUDED.container_size,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;
        const values = [
            b.booking_no, cleanVal(b.mode), b.run_date, b.job_name || '', customer_id, b.container_count || 1, b.origin || '', b.destination || '',
            cleanVal(b.agent), cleanVal(b.cy_date), cleanVal(b.vgm_cutoff), cleanVal(b.cutoff_time), cleanVal(b.load_date), cleanVal(b.open_gate),
            cleanVal(b.rent_cutoff), cleanVal(b.demurrage), cleanVal(b.unload_date), cleanVal(b.return_date),
            cleanVal(b.job_type), cleanVal(b.price_type), cleanNum(b.trip_fee), cleanNum(b.trans_fee), cleanVal(b.container_size)
        ];
        
        const result = await client.query(query, values);
        
        // 🌟 เรียกซิงค์ตู้เข้าตาราง operation 🌟
        await syncShipments(client, b);
        
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    } finally { client.release(); }
});

// 🌟 PUT /api/bookings/:id (อัปเดตข้อมูลจากตาราง Booking List) 🌟
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
        const customer_id = await getCustomerId(client, customer_name);

        const updateBookingQuery = `
            UPDATE bookings 
            SET mode = $1, run_date = $2, customer_id = $3, agent = $4, job_name = $5, job_type = $6, 
                origin = $7, destination = $8, container_count = $9, container_size = $10, price_type = $11, 
                trip_fee = $12, trans_fee = $13, cy_date = $14, vgm_cutoff = $15, cutoff_time = $16, 
                rent_cutoff = $17, demurrage = $18, load_date = $19, unload_date = $20, 
                open_gate = $21, return_date = $22, updated_at = CURRENT_TIMESTAMP
            WHERE id = $23
            RETURNING booking_no;
        `;
        const bookingValues = [
            cleanVal(mode), run_date, customer_id, cleanVal(agent), job_name || '', cleanVal(job_type), 
            origin || '', destination || '', container_count, cleanVal(container_size), cleanVal(price_type), 
            cleanNum(trip_fee), cleanNum(trans_fee), cleanVal(cy_date), cleanVal(vgm_cutoff), cleanVal(cutoff_time), 
            cleanVal(rent_cutoff), cleanVal(demurrage), cleanVal(load_date), cleanVal(unload_date), 
            cleanVal(open_gate), cleanVal(return_date), id
        ];
        
        await client.query(updateBookingQuery, bookingValues);
        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("PUT /bookings/:id Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// 🌟 ดึงข้อมูลรายการบุคกิ้งทั้งหมดไปโชว์ที่ List 🌟
router.get('/bookings/search', async (req, res) => {
    try {
        const { start_date, end_date, search, customer } = req.query;
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

// 🌟 ลบบุคกิ้ง (Cascade ลบข้อมูลย่อยทิ้งทั้งหมดอัตโนมัติ) 🌟
router.delete('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// === (หมวด Rates และ Container Sizes คงเดิม) ===
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