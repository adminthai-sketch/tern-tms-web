const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const moneyFields = ['trip_fee', 'trans_fee', 'port_pass_fee', 'shore_fee', 'lift_fee', 'deposit_fee', 'advance_fee', 'other_expense'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function revenueItems(items) {
    if (!Array.isArray(items) || items.length > 100) throw fail('รายการรายได้ไม่ถูกต้อง');
    return items.map(item => {
        if (!item || typeof item.type !== 'string' || !item.type.trim() || item.type.length > 100 ||
            typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 ||
            item.amount > 99999999 || Math.round(item.amount * 100) / 100 !== item.amount) throw fail('ประเภทรายได้หรือจำนวนเงินไม่ถูกต้อง');
        return { type: item.type.trim(), amount: item.amount, note: String(item.note || '').slice(0, 500) };
    });
}

async function actorFor(client, userId) {
    const result = await client.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (!result.rows.length) throw fail('กรุณาเข้าสู่ระบบใหม่', 401);
    // This is an asserted application identity, following the existing TMS userId API.
    return result.rows[0].username;
}

async function transaction(req, res, work) {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const actor = await actorFor(client, req.body.user_id);
        const result = await work(client, actor);
        await client.query('COMMIT');
        res.json({ success: true, ...result });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'บันทึกไม่สำเร็จ กรุณาตรวจ migration และการเชื่อมต่อ' });
    } finally { if (client) client.release(); }
}

router.post('/dispatch/finance', (req, res) => transaction(req, res, async (client, actor) => {
    const { data, reopen_reason } = req.body;
    if (!Array.isArray(data) || !data.length || data.length > 500) throw fail('กรุณาเลือกเที่ยว');
    for (const patch of [...data].sort((a, b) => String(a.order_id).localeCompare(String(b.order_id)))) {
        const result = await client.query('SELECT * FROM financials WHERE order_id = $1 FOR UPDATE', [patch.order_id]);
        const previous = result.rows[0];
        if (!previous) throw fail('ไม่พบข้อมูลการเงินของเที่ยว', 404);
        if ((previous.iv_no || previous.ar_no) && !String(reopen_reason || '').trim()) throw fail('กรุณาระบุเหตุผลเปิดแก้เอกสาร', 409);
        const updates = [];
        const values = [];
        for (const field of moneyFields) {
            if (!own(patch, field)) continue;
            const value = patch[field];
            if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw fail('จำนวนเงินไม่ถูกต้อง');
            values.push(value);
            updates.push(field + ' = $' + values.length);
        }
        if (own(patch, 'additional_revenue')) {
            values.push(JSON.stringify(revenueItems(patch.additional_revenue)));
            updates.push('additional_revenue = $' + values.length + '::jsonb');
        }
        if (!updates.length) continue;
        values.push(patch.order_id);
        const saved = await client.query('UPDATE financials SET ' + updates.join(', ') + ' WHERE order_id = $' + values.length + ' RETURNING *', values);
        await client.query('INSERT INTO dispatch_document_audit (order_id, actor, action, before_data, after_data) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
            [patch.order_id, actor, reopen_reason ? 'reopen: ' + String(reopen_reason).slice(0, 500) : 'finance', JSON.stringify(previous), JSON.stringify(saved.rows[0])]);
    }
    return {};
}));

router.post('/dispatch/documents', (req, res) => transaction(req, res, async (client, actor) => {
    const { booking_no, order_ids, iv_no, ar_no } = req.body;
    if (!booking_no || !Array.isArray(order_ids) || !order_ids.length || new Set(order_ids).size !== order_ids.length ||
        order_ids.length > 500 || !String(iv_no || '').trim() || !String(ar_no || '').trim()) throw fail('เลือกเที่ยวและกรอก IV/AR ให้ครบ');
    await client.query('SELECT pg_advisory_xact_lock(718205)');
    const existing = await client.query('SELECT order_id FROM financials WHERE iv_no = $1 OR ar_no = $2', [iv_no.trim(), ar_no.trim()]);
    if (existing.rows.length) throw fail('เลข IV หรือ AR นี้มีรอบเอกสารอยู่แล้ว กรุณาพิมพ์ซ้ำจากรอบเดิม', 409);
    const selected = await client.query(`SELECT s.order_id, s.booking_no, s.overall_status, f.*
        FROM shipment_operations s JOIN financials f ON f.order_id = s.order_id
        WHERE s.order_id = ANY($1::text[]) ORDER BY s.order_id FOR UPDATE OF s, f`, [order_ids]);
    if (selected.rows.length !== order_ids.length || selected.rows.some(row => row.booking_no !== booking_no ||
        !['รอวางบิล', 'ปิดงาน', 'คืนตู้แล้ว'].includes(row.overall_status) || row.iv_no || row.ar_no)) throw fail('ทุกเที่ยวต้องจบงาน อยู่ Booking เดียว และยังไม่ออกเอกสาร', 409);
    for (const row of selected.rows) {
        const saved = await client.query("UPDATE financials SET iv_no=$1, ar_no=$2, billing_status='วางบิลแล้ว', billing_date=CURRENT_DATE WHERE order_id=$3 RETURNING *", [iv_no.trim(), ar_no.trim(), row.order_id]);
        await client.query("INSERT INTO dispatch_document_audit (order_id, actor, action, before_data, after_data) VALUES ($1,$2,'issue',$3::jsonb,$4::jsonb)", [row.order_id, actor, JSON.stringify(row), JSON.stringify(saved.rows[0])]);
    }
    return { iv_no: iv_no.trim() };
}));

router.get('/dispatch/templates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dispatch_export_templates WHERE owner_id=$1 OR (customer_id=$2 AND customer_id IS NOT NULL) ORDER BY name', [req.query.user_id, req.query.customer_id || null]);
        res.json({ success: true, data: result.rows });
    } catch { res.status(500).json({ success: false, message: 'โหลดรูปแบบไม่สำเร็จ กรุณาตรวจ migration 007' }); }
});

router.post('/dispatch/templates', (req, res) => transaction(req, res, async (client) => {
    const { id, user_id, customer_id, name, columns } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 150 || !Array.isArray(columns) || !columns.length || columns.length > 150 || columns.some(key => typeof key !== 'string' || key.length > 80)) throw fail('ชื่อและคอลัมน์ไม่ถูกต้อง');
    let result;
    if (id) {
        result = await client.query('UPDATE dispatch_export_templates SET name=$1, columns=$2::jsonb, customer_id=$3, updated_at=now() WHERE id=$4 AND owner_id=$5 RETURNING *', [name.trim(), JSON.stringify(columns), customer_id || null, id, user_id]);
        if (!result.rows.length) throw fail('แก้ไขได้เฉพาะรูปแบบที่ตนเองสร้าง', 403);
    } else result = await client.query('INSERT INTO dispatch_export_templates (owner_id, customer_id, name, columns) VALUES ($1,$2,$3,$4::jsonb) RETURNING *', [user_id, customer_id || null, name.trim(), JSON.stringify(columns)]);
    return { data: result.rows[0] };
}));

module.exports = router;
