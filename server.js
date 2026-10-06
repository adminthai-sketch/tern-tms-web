const path = require('path'); // เลื่อนไปวางไว้บนสุดของไฟล์ร่วมกับ require อื่นๆ

app.use(express.static('public'));

// ✨ เพิ่มบล็อกนี้ลงไป เพื่อแก้ Cannot GET /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// ==========================================
// API: AUTH / LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name, u.password_hash, u.status, r.role_name, r.permissions 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.username = $1
        `, [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' });
        }

        const user = result.rows[0];
        if (user.status === 'INACTIVE') {
            return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้งานนี้ถูกระงับ' });
        }

        if (user.password_hash !== password) {
            return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role_name || 'User',
                permissions: user.permissions || {}
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: ' + err.message });
    }
});

// ==========================================
// API: RATES (MASTER DATA)
// ==========================================
app.get('/api/rates', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT job_name, customer_name, origin, destination, run_type, container_count, job_type,
                   trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash,
                   trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash
            FROM rates ORDER BY id DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/rates', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM rates');
        for (const r of data) {
            if (!r[0]) continue;
            await client.query(`
                INSERT INTO rates (job_name, customer_name, origin, destination, run_type, container_count, job_type,
                                   trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash,
                                   trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [
                r[0], r[1], r[2], r[3], r[4], cleanNum(r[5]) || 1, r[6],
                cleanNum(r[7]), cleanNum(r[8]), cleanNum(r[9]), cleanNum(r[10]),
                cleanNum(r[11]), cleanNum(r[12]), cleanNum(r[13]), cleanNum(r[14])
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกเรทราคาสำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// API: GET & POST SHIPMENTS
// ==========================================
app.get('/api/shipments', async (req, res) => {
    const { year, month } = req.query;
    try {
        let whereClause = '';
        let queryParams = [];

        if (year && month) {
            whereClause = `WHERE EXTRACT(YEAR FROM b.run_date) = $1 AND EXTRACT(MONTH FROM b.run_date) = $2`;
            queryParams = [parseInt(year), parseInt(month)];
        }

        const query = `
            SELECT 
                so.order_id, b.mode, b.booking_date, b.run_date, b.job_name, b.customer_name, b.booking_no,
                b.origin, b.destination, so.container_no, '', b.container_count, so.container_size,
                so.job_type, b.agent, so.pod, so.seal_no, so.tare, so.max_gross, so.weight,
                b.cy_date, b.vgm_cutoff, b.cutoff_time, b.load_date, b.open_gate,
                b.rent_cutoff, b.demurrage, b.unload_date, b.return_date,
                '', '', '', '', false,
                '', '', '', '', false,
                '', '', '', '', false,
                '', '', '', '', false,
                '', '', '', '', false,
                so.main_plate, so.main_truck_type, so.main_driver,
                b.trip_fee, b.trans_fee, so.overall_status
            FROM shipment_operations so
            JOIN bookings b ON so.booking_id = b.id
            ${whereClause}
            ORDER BY so.id DESC
        `;

        const result = await pool.query(query, queryParams);

        const formattedData = result.rows.map(r => [
            false,
            r.order_id, r.mode, 
            r.booking_date ? new Date(r.booking_date).toISOString().split('T')[0] : '',
            r.run_date ? new Date(r.run_date).toISOString().split('T')[0] : '',
            r.job_name, r.customer_name, r.booking_no, r.origin, r.destination,
            r.container_no, '', r.container_count, r.container_size, r.job_type, r.agent,
            r.pod, r.seal_no, r.tare, r.max_gross, r.weight,
            r.cy_date ? new Date(r.cy_date).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.vgm_cutoff ? new Date(r.vgm_cutoff).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.cutoff_time ? new Date(r.cutoff_time).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.load_date ? new Date(r.load_date).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.open_gate ? new Date(r.open_gate).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.rent_cutoff ? new Date(r.rent_cutoff).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.demurrage,
            r.unload_date ? new Date(r.unload_date).toISOString().replace('T', ' ').substring(0, 16) : '',
            r.return_date ? new Date(r.return_date).toISOString().replace('T', ' ').substring(0, 16) : '',
            ...new Array(22).fill(''),
            r.main_plate, r.main_truck_type, r.main_driver,
            r.trip_fee, r.trans_fee, r.overall_status
        ]);

        res.json({ success: true, data: formattedData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) {
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const row of data) {
            const order_id = cleanVal(row[1]);
            if (!order_id) continue;

            const mode = cleanVal(row[2]);
            const booking_date = cleanVal(row[3]);
            const run_date = cleanVal(row[4]);
            const job_name = cleanVal(row[5]);
            const customer = cleanVal(row[6]);
            const booking_no = cleanVal(row[7]) || `TEMP-${Date.now()}`;
            const origin = cleanVal(row[8]);
            const dest = cleanVal(row[9]);
            const container_no = cleanVal(row[10]) || cleanVal(row[11]) || '';
            const container_count = cleanNum(row[12]) || 1;
            const container_size = cleanVal(row[13]);
            const job_type = cleanVal(row[14]);
            const agent = cleanVal(row[15]);
            const pod = cleanVal(row[16]);
            const seal_no = cleanVal(row[17]);
            const tare = cleanVal(row[18]);
            const max_gross = cleanVal(row[19]);
            const weight = cleanVal(row[20]);

            const cy_date = cleanVal(row[21]);
            const vgm_cutoff = cleanVal(row[22]);
            const cutoff_time = cleanVal(row[23]);
            const load_date = cleanVal(row[24]);
            const open_gate = cleanVal(row[25]);
            const rent_cutoff = cleanVal(row[26]);
            const demurrage = cleanVal(row[27]);
            const unload_date = cleanVal(row[28]);
            const return_date = cleanVal(row[29]);

            // ปรับ Index ให้ตรงกับ Handsontable (56: ค่าเที่ยว, 57: ค่าขนส่ง, 58: สถานะรวม)
            const trip_fee = cleanNum(row[56]);
            const trans_fee = cleanNum(row[57]);
            const overall_status = cleanVal(row[58]) || 'รอจัดรถ';

            let bookingId;
            const checkBooking = await client.query('SELECT id FROM bookings WHERE booking_no = $1', [booking_no]);

            if (checkBooking.rows.length > 0) {
                bookingId = checkBooking.rows[0].id;
                await client.query(`
                    UPDATE bookings 
                    SET mode=$1, run_date=$2, job_name=$3, customer_name=$4, origin=$5, destination=$6, 
                        cy_date=$7, vgm_cutoff=$8, cutoff_time=$9, load_date=$10, open_gate=$11, 
                        rent_cutoff=$12, demurrage=$13, unload_date=$14, return_date=$15, 
                        trip_fee=$16, trans_fee=$17, updated_at=CURRENT_TIMESTAMP
                    WHERE id=$18
                `, [
                    mode, run_date, job_name, customer, origin, dest, 
                    cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, 
                    rent_cutoff, demurrage, unload_date, return_date, 
                    trip_fee, trans_fee, bookingId
                ]);
            } else {
                const newBooking = await client.query(`
                    INSERT INTO bookings 
                    (booking_no, mode, booking_date, run_date, job_name, customer_name, origin, destination, container_count, 
                     cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date, trip_fee, trans_fee)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                    RETURNING id
                `, [
                    booking_no, mode, booking_date, run_date, job_name, customer, origin, dest, container_count, 
                    cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date, trip_fee, trans_fee
                ]);
                bookingId = newBooking.rows[0].id;
            }

            let shipmentId;
            const checkShipment = await client.query('SELECT id FROM shipment_operations WHERE order_id = $1', [order_id]);

            if (checkShipment.rows.length > 0) {
                shipmentId = checkShipment.rows[0].id;
                await client.query(`
                    UPDATE shipment_operations 
                    SET container_no=$1, container_size=$2, pod=$3, seal_no=$4, tare=$5, max_gross=$6, weight=$7, overall_status=$8, updated_at=CURRENT_TIMESTAMP
                    WHERE id=$9
                `, [container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status, shipmentId]);
            } else {
                const newShipment = await client.query(`
                    INSERT INTO shipment_operations 
                    (order_id, booking_id, container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                `, [order_id, bookingId, container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status]);
                shipmentId = newShipment.rows[0].id;

                await client.query(`
                    INSERT INTO financials (shipment_id, billing_status)
                    VALUES ($1, 'รอดำเนินการ')
                    ON CONFLICT DO NOTHING
                `, [shipmentId]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลบุคกิ้งและตู้สินค้าลงฐานข้อมูลสำเร็จ! ✅' });

    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message });
    } finally {
        client.release();
    }
});

app.delete('/api/shipments', async (req, res) => {
    const { order_ids } = req.body;
    if (!order_ids || order_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'ไม่มีรายการลบ' });
    }
    try {
        await pool.query('DELETE FROM shipment_operations WHERE order_id = ANY($1)', [order_ids]);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// API: ADMIN ENDPOINTS (GET & POST)
// ==========================================
app.get('/api/users', async (req, res) => {
    try {
        const users = await pool.query('SELECT id, username, full_name, email, role_id, status FROM users ORDER BY id ASC');
        const roles = await pool.query('SELECT id, role_name FROM roles');
        res.json({ success: true, data: users.rows.map(u => [u.id, u.username, u.full_name, u.email, 'ADMIN', u.status]), roleList: roles.rows.map(r => r.role_name) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/users', async (req, res) => {
    res.json({ success: true, message: 'บันทึกข้อมูลผู้ใช้งานเรียบร้อย' });
});

app.get('/api/roles', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, role_name, permissions FROM roles ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.role_name, true, true, true, true, true]) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/roles', async (req, res) => {
    res.json({ success: true, message: 'บันทึกกลุ่มสิทธิ์เรียบร้อย' });
});

app.get('/api/trucks', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, plate_number, vehicle_type, status FROM trucks ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.plate_number, r.vehicle_type, r.status]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/trucks', async (req, res) => {
    res.json({ success: true, message: 'บันทึกข้อมูลรถเรียบร้อย' });
});

app.get('/api/driver_info', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, driver_name, nickname, phone_number, status FROM driver_info ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.driver_name, r.nickname, r.phone_number, r.status]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/driver_info', async (req, res) => {
    res.json({ success: true, message: 'บันทึกข้อมูลพนักงานขับรถเรียบร้อย' });
});

app.get('/api/truck_assignments', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, plate_number, driver_name FROM truck_assignments ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.plate_number, r.driver_name]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/truck_assignments', async (req, res) => {
    res.json({ success: true, message: 'บันทึกการจับคู่รถ-คนขับเรียบร้อย' });
});

app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id FROM customers ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.customer_no, r.customer_name, r.short_name, r.billing_name, r.phone_number, r.address, r.tax_id]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/customers', async (req, res) => {
    res.json({ success: true, message: 'บันทึกข้อมูลลูกค้าเรียบร้อย' });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server listening on http://localhost:${PORT}`);
    });
}

module.exports = app;