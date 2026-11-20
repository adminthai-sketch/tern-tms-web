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
function containerList(value) {
    if (!Array.isArray(value) || !value.length || value.length > 100) throw requestError('กรุณาระบุจำนวนและขนาดตู้');
    const rows = value.map(row => {
        if (!row || typeof row.size !== 'string' || !row.size.trim() || row.size.length > 50) throw requestError('ขนาดตู้ไม่ถูกต้อง');
        return { qty: bookingCount(row.qty), size: row.size.trim().toUpperCase() };
    });
    if (rows.reduce((n, row) => n + row.qty, 0) > 1000) throw requestError('สร้างได้ไม่เกิน 1,000 Order ต่อครั้ง');
    return rows;
}

async function saveBookingDetails(client, b, saved, existing) {
    if (hasField(b, 'container_list')) {
        const list = containerList(b.container_list);
        if (existing) {
            const old = existing.container_list || [{ qty: existing.container_count, size: existing.container_size || '' }];
            if (JSON.stringify(list) !== JSON.stringify(old)) throw requestError('ยังไม่รองรับการเปลี่ยนชุดตู้ของ Booking เดิม กรุณาจัดการ Order แยก', 409);
        }
        const result = await client.query('UPDATE bookings SET container_list = $1::jsonb WHERE id = $2 RETURNING *', [JSON.stringify(list), saved.id]);
        saved = result.rows[0];
    }
    for (const field of ['job_owner', 'factory']) {
        if (hasField(b, field)) {
            const result = await client.query('UPDATE bookings SET ' + field + ' = $1 WHERE id = $2 RETURNING *', [cleanVal(b[field]), saved.id]);
            saved = result.rows[0];
        }
    }
    return saved;
}

async function selectedCustomer(client, b) {
    if (!hasField(b, 'customer_id')) return getCustomerId(client, b.customer_name);
    const result = await client.query('SELECT id FROM customers WHERE id = $1', [b.customer_id]);
    if (!result.rows.length) throw requestError('ไม่พบลูกค้าที่เลือก กรุณาเลือกลูกค้าใหม่');
    return result.rows[0].id;
}
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

const shipmentSteps = [
    ['leg1', 'appointment'], ['drop1', 'location'],
    ['leg2', 'appointment'], ['drop2', 'location'], ['leg3', 'appointment']
];
const shipmentStepFields = shipmentSteps.flatMap(([prefix, extra], index) =>
    ['plate', 'driver', 'completed', 'vehicle_type', extra].map(field => {
        const column = prefix + '_' + field;
        const alias = 'step' + (index + 1);
        // Let dispatch keep loading while the vehicle type migration is pending.
        const value = field === 'vehicle_type' ? "to_jsonb(" + alias + ")->>'vehicle_type'" : alias + '.' + field;
        return value + ' AS ' + column;
    })
).join(', ');
const shipmentStepJoins = shipmentSteps.map((_, index) => {
    const step = index + 1;
    return 'LEFT JOIN shipment_legs step' + step +
        ' ON step' + step + '.order_id = s.order_id AND step' + step + '.step_no = ' + step;
}).join('\n');

async function saveShipmentContainers(client, orderId, row) {
    for (const position of [1, 2]) {
        const fields = ['container_' + position + '_no', 'seal_' + position + '_no',
            'tare_' + position, 'max_gross_' + position];
        const provided = fields.map(field => hasField(row, field));
        if (!provided.some(Boolean)) continue;

        const values = fields.map((field, index) => {
            if (!provided[index] || row[field] == null || String(row[field]).trim() === '') return null;
            return index < 2 ? cleanVal(row[field]) : priceValue(row[field]);
        });
        await client.query(`
            INSERT INTO shipment_containers (order_id, container_position, container_no, seal_no, tare, max_gross)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (order_id, container_position) DO UPDATE SET
                container_no = CASE WHEN $7 THEN EXCLUDED.container_no ELSE shipment_containers.container_no END,
                seal_no = CASE WHEN $8 THEN EXCLUDED.seal_no ELSE shipment_containers.seal_no END,
                tare = CASE WHEN $9 THEN EXCLUDED.tare ELSE shipment_containers.tare END,
                max_gross = CASE WHEN $10 THEN EXCLUDED.max_gross ELSE shipment_containers.max_gross END
        `, [orderId, position, ...values, ...provided]);
    }
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

async function syncShipments(client, b, allowCreate = true) {
    if (!b.booking_no) return; 
    
    const res = await client.query('SELECT order_id FROM shipment_operations WHERE booking_no = $1 ORDER BY order_id ASC', [b.booking_no]);
    const current_shipments = res.rows;
    const current_count = current_shipments.length;
    const target_count = bookingCount(b.container_count);
    if (current_count > target_count) throw requestError(reductionMessage, 409);
    if (!allowCreate) return;
    
    if (current_count < target_count) {
        const to_create = target_count - current_count;
        const date = typeof b.run_date === 'string' ? b.run_date.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(b.run_date || new Date());
        const prefix = `ORD-${date.replace(/-/g, '').slice(2)}-`;

        await client.query('SELECT pg_advisory_xact_lock(718204)');
        const lastOrderRes = await client.query(`SELECT order_id FROM shipment_operations WHERE order_id LIKE $1 ORDER BY length(order_id) DESC, order_id DESC LIMIT 1`, [`${prefix}%`]);
        let start_num = 1;
        if (lastOrderRes.rows.length > 0) {
            const parts = lastOrderRes.rows[0].order_id.split('-');
            if (parts.length === 3) start_num = parseInt(parts[2], 10) + 1;
        }

        const sizes = b.container_list ? containerList(b.container_list).flatMap(row => Array(row.qty).fill(row.size)) : Array(target_count).fill(b.container_size || null);
        for (let i = 0; i < to_create; i++) {
            const new_order_id = `${prefix}${String(start_num + i).padStart(3, '0')}`;
            await client.query(`INSERT INTO shipment_operations (order_id, booking_no, overall_status, order_container_size) VALUES ($1, $2, 'รอจัดรถ', $3)`, [new_order_id, b.booking_no, sizes[current_count + i]]);
            await client.query(`INSERT INTO financials (order_id, trip_fee, trans_fee) VALUES ($1, $2, $3)`, [new_order_id, cleanNum(b.trip_fee), cleanNum(b.trans_fee)]);
        }
    }
}

// 1. สร้างหัวบุคกิ้งใหม่
router.post('/customers/quick', async (req, res) => {
    let client;
    try {
        const fields = ['short_name', 'customer_name', 'billing_name', 'tax_id', 'address'];
        const values = fields.map(field => cleanVal(req.body[field]));
        if (!values[0] || !values[1]) throw requestError('กรุณากรอกตัวย่อและชื่อลูกค้า');
        const limits = [100, 255, 255, 50, 10000];
        if (values.some((value, index) => value && value.length > limits[index])) throw requestError('ข้อมูลลูกค้ายาวเกินไป');
        client = await pool.connect();
        await client.query('BEGIN');
        // Also serialize against existing admin writers, which do not use advisory locks.
        await client.query('LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE');
        const duplicate = await client.query('SELECT id FROM customers WHERE lower(trim(short_name)) = lower($1)', [values[0]]);
        if (duplicate.rows.length) throw requestError('ตัวย่อลูกค้านี้มีอยู่แล้ว กรุณาเลือกจากรายการ', 409);
        const result = await client.query(`INSERT INTO customers (short_name, customer_name, billing_name, tax_id, address)
            VALUES ($1, $2, $3, $4, $5) RETURNING id, short_name, customer_name`, values);
        await client.query('COMMIT');
        res.json({ success: true, customer_id: result.rows[0].id, data: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'เพิ่มลูกค้าไม่สำเร็จ' });
    } finally { if (client) client.release(); }
});

router.post('/bookings/header', async (req, res) => {
    const b = req.body;
    if (!b.mode || !b.run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        b.booking_no = b.booking_no || `BK-${Date.now()}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [b.booking_no]);
        const existingResult = await client.query('SELECT * FROM bookings WHERE booking_no = $1 FOR UPDATE', [b.booking_no]);
        const existing = existingResult.rows[0];
        const previousCount = existing?.container_count;
        if (existing?.container_list && !hasField(b, 'container_list') &&
            ((hasField(b, 'container_count') && Number(b.container_count) !== existing.container_count) ||
             (hasField(b, 'container_size') && cleanVal(b.container_size) !== cleanVal(existing.container_size)))) {
            throw requestError('กรุณาคงชุดตู้เดิมของ Booking ที่มีหลายขนาด', 409);
        }
        if (hasField(b, 'container_list')) {
            b.container_list = containerList(b.container_list);
            b.container_count = b.container_list.reduce((n, row) => n + row.qty, 0);
            b.container_size = b.container_list.length === 1 ? b.container_list[0].size : null;
        }
        b.container_count = hasField(b, 'container_count') ? bookingCount(b.container_count) : (existing ? (existing.container_count ?? 1) : 1);
        if (existing && b.container_count < existing.container_count) throw requestError(reductionMessage, 409);
        const customer_id = await selectedCustomer(client, b);
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
        const header = await saveBookingDetails(client, b, saved.rows[0], existing);
        await syncShipments(client, header, !existing || header.container_count > previousCount);
        await client.query('COMMIT');
        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${b.booking_no} เรียบร้อย!` });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(error.status || 500).json({ success: false, message: error.message });
    } finally { if (client) client.release(); }
});

// 2. แก้ไขข้อมูลบุคกิ้ง
router.put('/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const b = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const lookup = /^\d+$/.test(id) ? 'id = $1' : 'booking_no = $1';
        const currentResult = await client.query('SELECT * FROM bookings WHERE ' + lookup + ' FOR UPDATE', [id]);
        const current = currentResult.rows[0];
        if (!current) throw requestError('ไม่พบ Booking ที่ต้องการแก้ไข', 404);
        const previousCount = current.container_count;
        if (hasField(b, 'container_list')) {
            const list = containerList(b.container_list);
            const old = current.container_list || [{ qty: current.container_count, size: current.container_size || '' }];
            if (JSON.stringify(list) !== JSON.stringify(old)) throw requestError('ยังไม่รองรับการเปลี่ยนชุดตู้ของ Booking เดิม', 409);
        }
        if (current.container_list && ((hasField(b, 'container_count') && Number(b.container_count) !== current.container_count) ||
            (hasField(b, 'container_size') && cleanVal(b.container_size) !== cleanVal(current.container_size)))) {
            throw requestError('กรุณาคงชุดตู้เดิมของ Booking ที่มีหลายขนาด', 409);
        }
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
        if (hasField(b, 'customer_id') || hasField(b, 'customer_name')) {
            const customerId = await selectedCustomer(client, b);
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
        saved = await saveBookingDetails(client, b, saved, current);
        if (hasField(b, 'container_count')) await syncShipments(client, saved, saved.container_count > previousCount);
        await client.query('COMMIT');
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        res.status(err.status || 500).json({ success: false, message: err.message });
    } finally { if (client) client.release(); }
});

// 3. ดึงรายการตู้ตามเดือน/ปี
router.get('/shipments', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });
    try {
        const result = await pool.query(`
            SELECT 
                s.*,
                (SELECT count(*)::integer FROM shipment_stops st WHERE st.order_id=s.order_id) AS stop_count,
                b.id AS booking_id, b.mode, b.run_date, b.customer_id, c.short_name AS customer_name,
                b.origin, b.destination, COALESCE(s.order_container_size, b.container_size) AS container_size, b.job_type, b.agent, b.job_name, b.job_owner, b.factory,
                b.cy_date, b.vgm_cutoff, b.cutoff_time, b.demurrage, b.load_date, b.unload_date, b.return_date, b.open_gate,
                f.trip_fee, f.trans_fee, f.port_pass_fee, f.shore_fee, f.lift_fee, f.deposit_fee, f.advance_fee, f.other_expense,
                f.iv_no, f.ar_no, to_jsonb(f)->'additional_revenue' AS additional_revenue,
                container1.container_no AS container_1_no, container1.seal_no AS seal_1_no,
                CASE WHEN to_jsonb(container1) ? 'pop_no' THEN to_jsonb(container1)->>'pop_no'
                     WHEN container2.container_no IS NULL THEN s.pop_no END AS pop_1_no,
                to_jsonb(container2)->>'pop_no' AS pop_2_no,
                container1.tare AS tare_1, container1.max_gross AS max_gross_1,
                container2.container_no AS container_2_no, container2.seal_no AS seal_2_no,
                container2.tare AS tare_2, container2.max_gross AS max_gross_2,
                ${shipmentStepFields}
            FROM shipment_operations s
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id = f.order_id
            LEFT JOIN shipment_containers container1 ON container1.order_id = s.order_id AND container1.container_position = 1
            LEFT JOIN shipment_containers container2 ON container2.order_id = s.order_id AND container2.container_position = 2
            ${shipmentStepJoins}
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

async function saveDispatchPatch(client, row) {
    const result = await client.query(`
        SELECT s.*, b.mode, b.job_type FROM shipment_operations s
        JOIN bookings b ON b.booking_no = s.booking_no
        WHERE s.order_id = $1 FOR UPDATE OF s
    `, [row.order_id]);
    if (!result.rows.length) throw requestError('ไม่พบ Order ที่ต้องการบันทึก', 404);
    const allowed = ['leg1_plate', 'leg1_driver', 'leg1_appointment',
        'leg2_plate', 'leg2_driver', 'leg2_appointment', 'leg3_plate', 'leg3_driver', 'leg3_appointment',
        'is_drop_only', 'actual_drop_date', 'actual_load_date', 'actual_return_date',
        'order_vgm_cutoff', 'order_return_cutoff', 'leg1_completed', 'leg2_completed', 'leg3_completed',
        'leg1_is_drop', 'leg2_is_drop', 'drop1_plate', 'drop1_driver', 'drop1_location', 'drop1_completed',
        'drop2_plate', 'drop2_driver', 'drop2_location', 'drop2_completed', 'remark'];
    const patch = {};
    for (const field of allowed) {
        if (!hasField(row, field)) continue;
        if (field === 'is_drop_only' || field.endsWith('_completed') || field.endsWith('_is_drop')) {
            if (typeof row[field] !== 'boolean') throw requestError('สถานะต้องเป็น true หรือ false');
            patch[field] = row[field];
        } else {
            const value = cleanVal(row[field]);
            if (value && (field.endsWith('_date') || field.endsWith('_appointment') || field.endsWith('_cutoff')) &&
                (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(value) || !Number.isFinite(Date.parse(value + '+07:00')))) {
                throw requestError('รูปแบบวันเวลาไม่ถูกต้อง');
            }
            patch[field] = value;
        }
    }
    const order = { ...result.rows[0], ...patch };
    const deliveryEndsJob = order.mode === 'TRANSFER' || String(order.job_type).trim().toUpperCase() === 'DOMESTIC';
    const actual = order.is_drop_only ? order.actual_drop_date : deliveryEndsJob ? order.actual_load_date : order.actual_return_date;
    patch.overall_status = actual ? 'รอวางบิล' :
        DISPATCH_COMPLETION_FIELDS.some(field => order[field]) ? 'กำลังเดินทาง' :
        ['leg1', 'leg2', 'leg3'].some(leg => order[leg + '_plate'] || order[leg + '_driver']) ? 'จัดรถแล้ว' : 'รอจัดรถ';
    const entries = Object.entries(patch);
    await client.query('UPDATE shipment_operations SET ' + entries.map(([field], i) => field + ' = $' + (i + 1)).join(', ') +
        ', updated_at = CURRENT_TIMESTAMP WHERE order_id = $' + (entries.length + 1), [...entries.map(([, value]) => value), row.order_id]);
    for (const position of [1, 2]) {
        const popField = 'pop_' + position + '_no';
        if (!hasField(row, popField)) continue;
        await client.query(`
            INSERT INTO shipment_containers (order_id, container_position, pop_no) VALUES ($1, $2, $3)
            ON CONFLICT (order_id, container_position) DO UPDATE SET pop_no = EXCLUDED.pop_no
        `, [row.order_id, position, cleanVal(row[popField])]);
    }
    await saveShipmentContainers(client, row.order_id, row);
    return patch.overall_status;
}

const DISPATCH_COMPLETION_FIELDS = ['leg1_completed', 'drop1_completed', 'leg2_completed', 'drop2_completed', 'leg3_completed'];

// 4. บันทึกข้อมูลตู้แบบ Batch
router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (req.body.dispatch_patch === true) {
            if (!Array.isArray(data) || data.length > 500 || new Set(data.map(row => row.order_id)).size !== data.length) throw requestError('รายการเที่ยวไม่ถูกต้อง');
            let status;
            for (const row of [...data].sort((a,b) => String(a.order_id).localeCompare(String(b.order_id)))) status = await saveDispatchPatch(client, row);
            await client.query('COMMIT');
            return res.json({ success: true, overall_status: status });
        }
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

                const lastOrderRes = await client.query(`SELECT order_id FROM shipment_operations WHERE order_id LIKE $1 ORDER BY length(order_id) DESC, order_id DESC LIMIT 1`, [`${prefix}%`]);
                let start_num = 1;
                if (lastOrderRes.rows.length > 0) {
                    const parts = lastOrderRes.rows[0].order_id.split('-');
                    if (parts.length === 3) start_num = parseInt(parts[2], 10) + 1;
                }
                final_order_id = `${prefix}${String(start_num).padStart(3, '0')}`;
                
                await client.query(`INSERT INTO shipment_operations (order_id, booking_no, order_container_size) VALUES ($1, $2, $3)`, [final_order_id, row.booking_no, cleanVal(row.container_size)]);
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
                    container_1_no=CASE WHEN $32 THEN $1 ELSE container_1_no END,
                    container_2_no=CASE WHEN $33 THEN $2 ELSE container_2_no END,
                    seal_no=CASE WHEN $34 THEN $3 ELSE seal_no END, pop_no=$4,
                    tare=CASE WHEN $35 THEN $5 ELSE tare END,
                    max_gross=CASE WHEN $36 THEN $6 ELSE max_gross END,
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
                cleanVal(row.remark), cleanVal(row.overall_status) || 'รอจัดรถ', final_order_id,
                ...['container_1_no', 'container_2_no', 'seal_no', 'tare', 'max_gross'].map(field => hasField(row, field))
            ]);
            await saveShipmentContainers(client, final_order_id, row);
            
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

// อัปเดตข้อมูลลูกค้าเดิม (กรณีข้อมูลเลขภาษีหรือที่อยู่ยังไม่ครบ)
router.put('/customers/:id', async (req, res) => {
    const { id } = req.params;
    let client;
    try {
        const customer_name = cleanVal(req.body.customer_name);
        const billing_name = cleanVal(req.body.billing_name);
        const tax_id = cleanVal(req.body.tax_id);
        const address = cleanVal(req.body.address);

        if (!customer_name) throw requestError('กรุณากรอกชื่อบริษัทเต็ม');

        client = await pool.connect();
        const result = await client.query(`
            UPDATE customers 
            SET customer_name = $1, 
                billing_name = COALESCE($2, billing_name), 
                tax_id = $3, 
                address = $4
            WHERE id = $5 
            RETURNING id, short_name, customer_name, billing_name, tax_id, address
        `, [customer_name, billing_name, tax_id, address, id]);

        if (!result.rows.length) throw requestError('ไม่พบข้อมูลลูกค้าในระบบ', 404);
        res.json({ success: true, customer_id: result.rows[0].id, data: result.rows[0] });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
