const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Database Connection
const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_U0xNiHICd9SJ@ep-patient-mode-b4g3dk4w-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client:', err);
});

// Helper Functions
const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// ==========================================
// 🏠 Frontend Routing & Login
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name, u.status, r.role_name, r.permissions 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.username = $1 AND u.password_hash = $2
        `, [username, hashedPassword]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = result.rows[0];
        if (user.status && user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้งานนี้ถูกระงับ' });
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
// 📦 API: Bookings & Shipments
// ==========================================
app.post('/api/bookings/header', async (req, res) => {
    const { mode, run_date, container_count, job_name, customer_name, booking_no, origin, destination } = req.body;
    if (!mode || !run_date) return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });

    try {
        const b_no = booking_no || `BK-${Date.now()}`;
        const query = `
            INSERT INTO bookings (booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, origin, destination)
            VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode, run_date = EXCLUDED.run_date, job_name = EXCLUDED.job_name,
                customer_name = EXCLUDED.customer_name, container_count = EXCLUDED.container_count,
                origin = EXCLUDED.origin, destination = EXCLUDED.destination, updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;
        const values = [b_no, mode, run_date, job_name || '', customer_name || '', container_count || 1, origin || '', destination || ''];
        const result = await pool.query(query, values);

        res.json({ success: true, message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} เรียบร้อย!`, bookingId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    }
});

app.get('/api/shipments', async (req, res) => {
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

app.post('/api/shipments', async (req, res) => {
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

app.delete('/api/shipments', async (req, res) => {
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
// ⚙️ API: Admin & Master Data
// ==========================================
app.get('/api/users', async (req, res) => {
    try {
        const usersResult = await pool.query('SELECT u.id, u.username, u.full_name, u.email, r.role_name, u.status FROM users u LEFT JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC');
        const rolesResult = await pool.query('SELECT role_name FROM roles ORDER BY id ASC');
        const data = usersResult.rows.map(u => [u.id, u.username, u.full_name, u.email, u.role_name || '', u.status]);
        res.json({ success: true, data: data, roleList: rolesResult.rows.map(r => r.role_name) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/users', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, username, full_name, email, role_name, status] = row;
            if (!username) continue;

            let roleId = null;
            if (role_name) {
                const rRes = await client.query('SELECT id FROM roles WHERE LOWER(role_name) = LOWER($1)', [role_name]);
                if (rRes.rows.length > 0) roleId = rRes.rows[0].id;
            }

            if (id) {
                await client.query(`UPDATE users SET username=$1, full_name=$2, email=$3, role_id=$4, status=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6`, [username, full_name, email, roleId, status, id]);
            } else {
                const defaultPassword = crypto.createHash('sha256').update('password123').digest('hex');
                await client.query(`INSERT INTO users (username, full_name, email, role_id, status, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`, [username, full_name, email, roleId, status || 'ACTIVE', defaultPassword]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

app.get('/api/roles', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, role_name, permissions FROM roles ORDER BY id ASC');
        const data = result.rows.map(r => {
            const p = r.permissions || {};
            return [r.id, r.role_name, p.monitor || false, p.booking || false, p.dispatch || false, p.billing || false, p.admin || false];
        });
        res.json({ success: true, data: data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/roles', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, role_name, p_monitor, p_booking, p_dispatch, p_billing, p_admin] = row;
            if (!role_name) continue;
            const permissions = { monitor: p_monitor, booking: p_booking, dispatch: p_dispatch, billing: p_billing, admin: p_admin };
            if (id) {
                await client.query('UPDATE roles SET role_name=$1, permissions=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3', [role_name, permissions, id]);
            } else {
                await client.query('INSERT INTO roles (role_name, permissions) VALUES ($1, $2)', [role_name, permissions]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลกลุ่มสิทธิ์เรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

// จัดการข้อมูลรถ 
app.get('/api/trucks', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, default_plate_number, default_vehicle_type, status FROM drivers WHERE default_plate_number IS NOT NULL ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.default_plate_number, r.default_vehicle_type, r.status]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/trucks', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            const [id, plate_number, vehicle_type, status] = row;
            if (!plate_number) continue;
            
            if (id) {
                await client.query(`UPDATE drivers SET default_plate_number = $1, default_vehicle_type = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`, 
                [plate_number, vehicle_type, status || 'ACTIVE', id]);
            } else {
                await client.query(`INSERT INTO drivers (default_plate_number, default_vehicle_type, status) VALUES ($1, $2, $3)`, 
                [plate_number, vehicle_type, status || 'ACTIVE']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลรถเรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
    } finally { client.release(); }
});

// จัดการข้อมูลคนขับ
app.get('/api/driver_info', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, driver_name, nickname, phone_number, status FROM drivers ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.driver_name, r.nickname, r.phone_number, r.status]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/driver_info', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            const [id, driver_name, nickname, phone_number, status] = row;
            if (!driver_name) continue;

            if (id) {
                await client.query(`UPDATE drivers SET driver_name = $1, nickname = $2, phone_number = $3, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`, 
                [driver_name, nickname, phone_number, status || 'ACTIVE', id]);
            } else {
                await client.query(`INSERT INTO drivers (driver_name, nickname, phone_number, status) VALUES ($1, $2, $3, $4)`, 
                [driver_name, nickname, phone_number, status || 'ACTIVE']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลพนักงานขับรถเรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
    } finally { client.release(); }
});

// จัดการจับคู่รถ-คนขับ
app.get('/api/truck_assignments', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, default_plate_number, driver_name FROM drivers ORDER BY id ASC');
        const trucks = await pool.query("SELECT default_plate_number FROM drivers WHERE status = 'ACTIVE' AND default_plate_number IS NOT NULL");
        const drivers = await pool.query("SELECT driver_name FROM drivers WHERE status = 'ACTIVE'");
        
        res.json({ 
            success: true, 
            data: result.rows.map(r => [r.id, r.default_plate_number, r.driver_name]),
            truckList: trucks.rows.map(t => t.default_plate_number),
            driverList: drivers.rows.map(d => d.driver_name)
        });
    } catch (err) { res.json({ success: true, data: [], truckList: [], driverList: [] }); }
});

app.post('/api/truck_assignments', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            const [id, plate_number, driver_name] = row;
            if (id) {
                await client.query(`UPDATE drivers SET default_plate_number = $1, driver_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, 
                [plate_number, driver_name, id]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกการจับคู่รถและคนขับเรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
    } finally { client.release(); }
});

app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id FROM customers ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.customer_no, r.customer_name, r.short_name, r.billing_name, r.phone_number, r.address, r.tax_id]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

app.post('/api/customers', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM customers');
        for (const row of data) {
            const [c_no, c_name, s_name, b_name, phone, addr, tax] = row;
            if (!c_no) continue;
            await client.query(`INSERT INTO customers (customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [c_no, c_name, s_name, b_name, phone, addr, tax]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลลูกค้าเรียบร้อย' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

app.get('/api/rates', async (req, res) => {
    try {
        const result = await pool.query('SELECT job_name, customer_name, origin, destination, run_type, container_count, job_type, trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash FROM rates ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.job_name, r.customer_name, r.origin, r.destination, r.run_type, r.container_count, r.job_type, r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash, r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash]) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/rates', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM rates');
        for (const r of data) {
            if (!r[0]) continue;
            await client.query(`INSERT INTO rates (job_name, customer_name, origin, destination, run_type, container_count, job_type, trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [r[0], r[1], r[2], r[3], r[4], cleanNum(r[5]) || 1, r[6], cleanNum(r[7]), cleanNum(r[8]), cleanNum(r[9]), cleanNum(r[10]), cleanNum(r[11]), cleanNum(r[12]), cleanNum(r[13]), cleanNum(r[14])]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกเรทราคาสำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

// Vercel Serverless Export
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
module.exports = app;