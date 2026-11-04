const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const cleanVal = (val) => (!val || val === '' || val === 'NaN') ? null : String(val).trim();
const cleanNum = (val) => {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

const hasField = (data, field) => Object.prototype.hasOwnProperty.call(data, field);
const reductionMessage = 'ยังไม่อนุญาตให้ลดจำนวน Order จากหัว Booking กรุณาคงจำนวนเดิม จนกว่าจะยืนยันขั้นตอนยกเลิกงาน';

function requestError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function bookingCount(value) {
    const count = Number(value);
    if (value === null || String(value).trim() === '' || !Number.isSafeInteger(count) || count < 1) {
        throw requestError('จำนวน Order ต้องเป็นจำนวนเต็มตั้งแต่ 1');
    }
    return count;
}

function priceValue(value) {
    if (value === null) return null;
    const normalized = String(value).replace(/,/g, '').trim();
    const price = Number(normalized);
    if (normalized === '' || !Number.isFinite(price)) throw requestError('ราคาไม่ถูกต้อง กรุณาระบุตัวเลขหรือ null');
    return price;
}

// 🌟 ดึงค่า AGENT ยืดหยุ่น รองรับทุกฟิลด์ที่ส่งมาจาก Frontend
const getAgentVal = (b) => {
    const raw = b.agent || b.agent_name || b.agentName || b.shipping_agent || b.agent_code || b.shipping_line || b.line || b.pAgent || b.pAgentExp || b.pAgentImp;
    return (!raw || raw === '' || raw === 'NaN' || raw === 'null') ? null : String(raw).trim();
};

async function getCustomerId(client, customerName) {
    if (!customerName) return null;
    const res = await client.query('SELECT id FROM customers WHERE short_name = $1 OR customer_name = $1 LIMIT 1', [customerName]);
    return res.rows.length > 0 ? res.rows[0].id : null;
}

async function syncShipments(client, b) {
    if (!b.booking_no) return; 
    
    const res = await client.query('SELECT order_id FROM shipment_operations WHERE booking_no = $1 ORDER BY order_id ASC', [b.booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;
    const target_count = bookingCount(b.container_count);
    if (current_count > target_count) throw requestError(reductionMessage, 409);
    
    if (current_count < target_count) {
        const to_create = target_count - current_count;
        const dateObj = b.run_date ? new Date(b.run_date) : new Date();
        const yy = String(dateObj.getFullYear()).substring(2);
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const prefix = `ORD-${yy}${mm}${dd}-`;

        await client.query('SELECT pg_advisory_xact_lock(718204)');
        const lastOrderRes = await client.query(`SELECT order_id FROM shipment_operations WHERE order_id LIKE $1 ORDER BY order_id DESC LIMIT 1`, [`${prefix}%`]);
        let start_num = 1;
        if (lastOrderRes.rows.length > 0) {
            const parts = lastOrderRes.rows[0].order_id.split('-');
            if (parts.length === 3) start_num = parseInt(parts[2], 10) + 1;
        }

        for (let i = 0; i < to_create; i++) {
            const new_order_id = `${prefix}${String(start_num + i).padStart(3, '0')}`;
            await client.query(`INSERT INTO shipment_operations (order_id, booking_no, overall_status) VALUES ($1, $2, 'รอจัดรถ')`, [new_order_id, b.booking_no]);
            await client.query(`INSERT INTO financials (order_id, trip_fee, trans_fee) VALUES ($1, $2, $3)`, [new_order_id, cleanNum(b.trip_fee), cleanNum(b.trans_fee)]);
        }
    }
}

// 1. สร้างหัวบุคกิ้งใหม่
router.post('/bookings/header', async (req, res) => {
    const b = req.body;
    if (!b.mode || !b.run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        b.booking_no = b.booking_no || `BK-${Date.now()}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [b.booking_no]);
        const existingResult = await client.query('SELECT * FROM bookings WHERE booking_no = $1 FOR UPDATE', [b.booking_no]);
        const existing = existingResult.rows[0];
        b.container_count = hasField(b, 'container_count') ? bookingCount(b.container_count) : (existing ? (existing.container_count ?? 1) : 1);
        if (existing && b.container_count < existing.container_count) throw requestError(reductionMessage, 409);
        const customer_id = await getCustomerId(client, b.customer_name);
        const query = `
            INSERT INTO bookings (
                booking_no, mode, booking_date, run_date, job_name, customer_id, container_count, origin, destination,
                agent, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date,
                job_type, price_type, trip_fee, trans_fee, container_size
            ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, 
                run_date = EXCLUDED.run_date, 
                job_name = EXCLUDED.job_name, 
                customer_id = EXCLUDED.customer_id, 
                container_count = EXCLUDED.container_count, 
                origin = EXCLUDED.origin, 
                destination = EXCLUDED.destination,
                agent = CASE WHEN EXCLUDED.agent IS NOT NULL AND EXCLUDED.agent != '' THEN EXCLUDED.agent ELSE bookings.agent END, 
                cy_date = COALESCE(EXCLUDED.cy_date, bookings.cy_date), 
                vgm_cutoff = COALESCE(EXCLUDED.vgm_cutoff, bookings.vgm_cutoff), 
                cutoff_time = COALESCE(EXCLUDED.cutoff_time, bookings.cutoff_time),
                load_date = COALESCE(EXCLUDED.load_date, bookings.load_date), 
                open_gate = COALESCE(EXCLUDED.open_gate, bookings.open_gate), 
                rent_cutoff = COALESCE(EXCLUDED.rent_cutoff, bookings.rent_cutoff), 
                demurrage = CASE WHEN $26 THEN EXCLUDED.demurrage ELSE bookings.demurrage END,
                unload_date = COALESCE(EXCLUDED.unload_date, bookings.unload_date), 
                return_date = COALESCE(EXCLUDED.return_date, bookings.return_date), 
                job_type = EXCLUDED.job_type, 
                price_type = EXCLUDED.price_type, 
                trip_fee = CASE WHEN $24 THEN EXCLUDED.trip_fee ELSE bookings.trip_fee END,
                trans_fee = CASE WHEN $25 THEN EXCLUDED.trans_fee ELSE bookings.trans_fee END,
                container_size = EXCLUDED.container_size,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [
            b.booking_no, cleanVal(b.mode), b.run_date, b.job_name || '', customer_id, parseInt(b.container_count || 1), b.origin || '', b.destination || '',
            getAgentVal(b), cleanVal(b.cy_date), cleanVal(b.vgm_cutoff), cleanVal(b.cutoff_time), cleanVal(b.load_date), cleanVal(b.open_gate),
            cleanVal(b.rent_cutoff), cleanVal(b.demurrage), cleanVal(b.unload_date), cleanVal(b.return_date),
            cleanVal(b.job_type), cleanVal(b.price_type), hasField(b, 'trip_fee') ? priceValue(b.trip_fee) : 0, hasField(b, 'trans_fee') ? priceValue(b.trans_fee) : 0, cleanVal(b.container_size),
            hasField(b, 'trip_fee'), hasField(b, 'trans_fee'), hasField(b, 'demurrage')
        ];
        const saved = await client.query(query, values);
        await syncShipments(client, saved.rows[0]);
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${b.booking_no} เรียบร้อย!` });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ success: false, message: error.message });
    } finally { client.release(); }
});

// 2. แก้ไขข้อมูลบุคกิ้ง
router.put('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const b = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lookup = /^\d+$/.test(id) ? 'id = $1' : 'booking_no = $1';
        const currentResult = await client.query('SELECT * FROM bookings WHERE ' + lookup + ' FOR UPDATE', [id]);
        const current = currentResult.rows[0];
        if (!current) throw requestError('ไม่พบ Booking ที่ต้องการแก้ไข', 404);
        const updates = [];
        const values = [];
        const setField = (field, value) => {
            values.push(value);
            updates.push(field + ' = $' + values.length);
        };
        if (hasField(b, 'container_count')) {
            const count = bookingCount(b.container_count);
            if (count < current.container_count) throw requestError(reductionMessage, 409);
            setField('container_count', count);
        }
        for (const field of ['trip_fee', 'trans_fee']) {
            if (hasField(b, field)) setField(field, priceValue(b[field]));
        }
        for (const field of ['mode', 'run_date', 'job_name', 'job_type', 'origin', 'destination', 'container_size', 'price_type',
            'cy_date', 'vgm_cutoff', 'cutoff_time', 'rent_cutoff', 'load_date', 'unload_date', 'open_gate', 'return_date']) {
            if (hasField(b, field) && cleanVal(b[field]) !== null) setField(field, cleanVal(b[field]));
        }
        if (hasField(b, 'demurrage')) setField('demurrage', cleanVal(b.demurrage));
        if (hasField(b, 'customer_name')) {
            const customerId = await getCustomerId(client, b.customer_name);
            if (customerId !== null) setField('customer_id', customerId);
        }
        const agent = getAgentVal(b);
        if (agent !== null) setField('agent', agent);
        let saved = current;
        if (updates.length) {
            values.push(current.id);
            const result = await client.query('UPDATE bookings SET ' + updates.join(', ') +
                ', updated_at = CURRENT_TIMESTAMP WHERE id = $' + values.length + ' RETURNING *', values);
            saved = result.rows[0];
        }
        if (hasField(b, 'container_count')) await syncShipments(client, saved);
        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(err.status || 500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

// 3. ดึงรายการตู้ตามเดือน/ปี
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });
    try {
        const result = await pool.query(`
            SELECT 
                s.*,
                b.id AS booking_id, b.mode, b.run_date, b.customer_id, c.short_name AS customer_name,
                b.origin, b.destination, b.container_size, b.job_type, b.agent, b.job_name,
                b.cy_date, b.vgm_cutoff, b.cutoff_time, b.demurrage, b.load_date, b.unload_date, b.return_date, b.open_gate,
                f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee, f.advance_fee, f.other_expense
            FROM shipment_operations s
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            WHERE EXTRACT(MONTH FROM b.run_date) = $1::INTEGER 
              AND EXTRACT(YEAR FROM b.run_date) = $2::INTEGER
            ORDER BY s.order_id ASC
        `, [month, year]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("API GET Shipments Error:");
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. บันทึกข้อมูลตู้แบบ Batch
router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            let final_order_id = row.order_id;
            if (final_order_id && final_order_id.includes('ORD-ADD-')) {
                const booking = await client.query('SELECT id FROM bookings WHERE booking_no = $1 FOR UPDATE', [row.booking_no]);
                if (!booking.rows.length) throw requestError('ไม่พบ Booking สำหรับเพิ่ม Order', 404);
                await client.query('SELECT pg_advisory_xact_lock(718204)');
                const dateObj = new Date();
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
                final_order_id = `${prefix}${String(start_num).padStart(3, '0')}`;
                
                await client.query(`INSERT INTO shipment_operations (order_id, booking_no) VALUES ($1, $2)`, [final_order_id, row.booking_no]);
                await client.query(`
                    INSERT INTO financials (order_id, trip_fee, trans_fee, port_pass_fee, shore_fee, lift_fee, deposit_fee, advance_fee, other_expense) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [final_order_id, cleanNum(row.trip_fee), cleanNum(row.trans_fee), cleanNum(row.port_pass_fee), cleanNum(row.shore_fee), cleanNum(row.lift_fee), cleanNum(row.deposit_fee), cleanNum(row.advance_fee), cleanNum(row.other_expense)]);
                await client.query(`UPDATE bookings SET container_count = container_count + 1 WHERE booking_no = $1`, [row.booking_no]);
            }

            const rowAgent = getAgentVal(row);
            if (row.booking_no && rowAgent !== null && rowAgent !== '') {
                await client.query(`
                    UPDATE bookings SET
                        agent = $1,
                        cy_date = COALESCE($2, cy_date),
                        vgm_cutoff = COALESCE($3, vgm_cutoff),
                        cutoff_time = COALESCE($4, cutoff_time),
                        load_date = COALESCE($5, load_date),
                        unload_date = COALESCE($6, unload_date),
                        return_date = COALESCE($7, return_date),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE booking_no = $8
                `, [
                    rowAgent, cleanVal(row.cy_date), cleanVal(row.vgm_cutoff),
                    cleanVal(row.cutoff_time), cleanVal(row.load_date), cleanVal(row.unload_date),
                    cleanVal(row.return_date), row.booking_no
                ]);
            }

            await client.query(`
                UPDATE shipment_operations SET
                    container_1_no=$1, container_2_no=$2, seal_no=$3, pop_no=$4, tare=$5, max_gross=$6,
                    leg1_plate=$7, leg1_driver=$8, leg1_appointment=$9, leg1_is_drop=$10, leg1_completed=$11,
                    drop1_plate=$12, drop1_driver=$13, drop1_location=$14, drop1_completed=$15,
                    leg2_plate=$16, leg2_driver=$17, leg2_appointment=$18, leg2_is_drop=$19, leg2_completed=$20,
                    drop2_plate=$21, drop2_driver=$22, drop2_location=$23, drop2_completed=$24,
                    leg3_plate=$25, leg3_driver=$26, leg3_appointment=$27, leg3_completed=$28,
                    remark=$29, overall_status=$30, updated_at = CURRENT_TIMESTAMP
                WHERE order_id=$31
            `, [
                cleanVal(row.container_1_no), cleanVal(row.container_2_no), cleanVal(row.seal_no), cleanVal(row.pop_no), cleanNum(row.tare), cleanNum(row.max_gross),
                cleanVal(row.leg1_plate), cleanVal(row.leg1_driver), cleanVal(row.leg1_appointment), !!row.leg1_is_drop, !!row.leg1_completed,
                cleanVal(row.drop1_plate), cleanVal(row.drop1_driver), cleanVal(row.drop1_location), !!row.drop1_completed,
                cleanVal(row.leg2_plate), cleanVal(row.leg2_driver), cleanVal(row.leg2_appointment), !!row.leg2_is_drop, !!row.leg2_completed,
                cleanVal(row.drop2_plate), cleanVal(row.drop2_driver), cleanVal(row.drop2_location), !!row.drop2_completed,
                cleanVal(row.leg3_plate), cleanVal(row.leg3_driver), cleanVal(row.leg3_appointment), !!row.leg3_completed,
                cleanVal(row.remark), cleanVal(row.overall_status) || 'รอจัดรถ', final_order_id
            ]);
            
            await client.query(`
                UPDATE financials SET 
                    trip_fee = CASE WHEN $10 THEN $1 ELSE trip_fee END,
                    trans_fee = CASE WHEN $11 THEN $2 ELSE trans_fee END,
                    port_pass_fee = CASE WHEN $12 THEN $3 ELSE port_pass_fee END,
                    shore_fee = CASE WHEN $13 THEN $4 ELSE shore_fee END,
                    lift_fee = CASE WHEN $14 THEN $5 ELSE lift_fee END,
                    deposit_fee = CASE WHEN $15 THEN $6 ELSE deposit_fee END,
                    advance_fee = CASE WHEN $16 THEN $7 ELSE advance_fee END,
                    other_expense = CASE WHEN $17 THEN $8 ELSE other_expense END
                WHERE order_id=$9
            `, [
                ...['trip_fee', 'trans_fee', 'port_pass_fee', 'shore_fee', 'lift_fee', 'deposit_fee', 'advance_fee', 'other_expense']
                    .map(field => hasField(row, field) ? priceValue(row[field]) : null),
                final_order_id,
                ...['trip_fee', 'trans_fee', 'port_pass_fee', 'shore_fee', 'lift_fee', 'deposit_fee', 'advance_fee', 'other_expense']
                    .map(field => hasField(row, field))
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ success: false, message: error.message });
    } finally { client.release(); }
});

// 5. ลบตู้
router.delete('/shipments', async (req, res) => {
    const { order_ids } = req.body;
    if (!order_ids || order_ids.length === 0) return res.json({ success: true, message: 'ไม่มีรายการลบ' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const placeholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
        for(let oid of order_ids) {
            const bRes = await client.query(`SELECT booking_no FROM shipment_operations WHERE order_id = $1`, [oid]);
            if(bRes.rows.length > 0) {
                await client.query(`UPDATE bookings SET container_count = container_count - 1 WHERE booking_no = $1 AND container_count > 0`, [bRes.rows[0].booking_no]);
            }
        }
        await client.query(`DELETE FROM shipment_operations WHERE order_id IN (${placeholders})`, order_ids);
        await client.query('COMMIT');
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) { 
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message }); 
    } finally { client.release(); }
});

// 6. ค้นหาบุคกิ้ง
router.get('/bookings/search', async (req, res) => {
    try {
        const { start_date, end_date, search, customer } = req.query;
        let query = `SELECT b.*, c.short_name AS customer_name FROM bookings b LEFT JOIN customers c ON b.customer_id = c.id WHERE 1=1`;
        let params = []; let paramIndex = 1;
        if (start_date && end_date) { query += ` AND b.run_date BETWEEN $${paramIndex++} AND $${paramIndex++}`; params.push(start_date, end_date); }
        if (customer) { query += ` AND c.short_name = $${paramIndex++}`; params.push(customer); }
        if (search) { query += ` AND (b.booking_no ILIKE $${paramIndex} OR b.job_name ILIKE $${paramIndex})`; params.push(`%${search}%`); paramIndex++; }
        query += ` ORDER BY b.run_date DESC, b.id DESC LIMIT 100`;
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 7. ลบบุคกิ้ง
router.delete('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 8. บันทึกราคาเรท
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

// 9. ขนาดตู้
router.get('/container-sizes', async (req, res) => {
    try {
        const result = await pool.query('SELECT size_name FROM master_container_sizes ORDER BY size_name ASC');
        res.json({ success: true, data: result.rows });
    } catch(err) { res.status(500).json({ success: false }); }
});

// 10. เพิ่มขนาดตู้
router.post('/container-sizes', async (req, res) => {
    try {
        const { size_name } = req.body;
        await pool.query('INSERT INTO master_container_sizes (size_name) VALUES ($1) ON CONFLICT DO NOTHING', [size_name.trim().toUpperCase()]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

module.exports = router;
