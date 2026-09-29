require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// ==========================================
// 1. Endpoint Health Check
// ==========================================
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'ok', message: 'เชื่อมต่อ Neon DB สำเร็จ!', time: result.rows[0].now });
    } catch (err) { 
        res.status(500).json({ status: 'error', error: err.message }); 
    }
});

// ==========================================
// 2. API Login
// ==========================================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
    }

    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        
        const query = `
            SELECT u.id, u.username, u.full_name, u.status, r.role_name, r.permissions 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.username = $1 AND u.password_hash = $2
        `;
        const result = await pool.query(query, [username, hashedPassword]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
        
        const user = result.rows[0];
        
        if (user.status && user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' });
        }

        try { await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]); } catch (e) {}

        return res.json({
            success: true, message: 'เข้าสู่ระบบสำเร็จ',
            user: { id: user.id, username: user.username, fullName: user.full_name || user.username, role: user.role_name || 'User', permissions: user.permissions || {} }
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==========================================
// 🛡️ API: ฐานข้อมูลกลุ่มสิทธิ์ (Roles)
// ==========================================
app.get('/api/roles', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, role_name, permissions FROM roles ORDER BY id ASC');
        const data = result.rows.map(r => {
            const p = r.permissions || {};
            return [r.id, r.role_name, !!p.monitor, !!p.booking, !!p.dispatch, !!p.billing, !!p.admin];
        });
        res.json({ success: true, data: data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/roles', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, role_name, p_mon, p_book, p_disp, p_bill, p_adm] = row;
            if (!role_name) continue;
            const permissions = { monitor: p_mon, booking: p_book, dispatch: p_disp, billing: p_bill, admin: p_adm };

            if (id) await client.query('UPDATE roles SET role_name = $1, permissions = $2 WHERE id = $3', [role_name, permissions, id]);
            else await client.query('INSERT INTO roles (role_name, permissions) VALUES ($1, $2)', [role_name, permissions]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลกลุ่มสิทธิ์เรียบร้อย!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 👥 API: ฐานข้อมูลผู้ใช้งาน (Users)
// ==========================================
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT u.id, u.username, u.full_name, u.email, r.role_name, u.status FROM users u LEFT JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC`);
        const data = result.rows.map(r => [r.id, r.username, r.full_name, r.email, r.role_name || '', r.status]);
        const rolesResult = await pool.query('SELECT role_name FROM roles ORDER BY id ASC');
        res.json({ success: true, data: data, roleList: rolesResult.rows.map(r => r.role_name) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/users', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, username, full_name, email, role_text, status] = row;
            if (!username) continue;
            
            // 💡 FIX: ค้นหาสิทธิ์โดยไม่สนตัวพิมพ์เล็กใหญ่
            const roleRes = await client.query('SELECT id FROM roles WHERE LOWER(role_name) = LOWER($1)', [String(role_text || '').trim()]);
            
            let role_id = null;
            if (roleRes.rows.length > 0) {
                role_id = roleRes.rows[0].id;
            } else {
                // 💡 FIX: ถ้าระบุสิทธิ์มามั่วๆ หรือไม่มีในฐานข้อมูล ให้ดึงสิทธิ์ตัวแรกสุดมาใช้เพื่อป้องกัน Error 
                const fallbackRole = await client.query('SELECT id FROM roles LIMIT 1');
                if (fallbackRole.rows.length > 0) {
                    role_id = fallbackRole.rows[0].id;
                } else {
                    const newRole = await client.query(`INSERT INTO roles (role_name, permissions) VALUES ('User', '{}') RETURNING id`);
                    role_id = newRole.rows[0].id;
                }
            }
            
            const userStatus = status || 'ACTIVE';

            if (id) {
                await client.query(`UPDATE users SET full_name=$1, email=$2, role_id=$3, status=$4 WHERE username=$5`, [full_name, email, role_id, userStatus, username]);
            } else {
                const defaultHash = crypto.createHash('sha256').update('1234').digest('hex');
                await client.query(`INSERT INTO users (username, password_hash, full_name, email, role_id, status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email, role_id=EXCLUDED.role_id, status=EXCLUDED.status`, [username, defaultHash, full_name, email, role_id, userStatus]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลผู้ใช้งานเรียบร้อย!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 🚛 API: ข้อมูลรถ (Trucks)
// ==========================================
app.get('/api/trucks', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, plate_number, truck_type, status FROM trucks ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.plate_number, r.truck_type, r.status]) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/trucks', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, plate, type, status] = row;
            if (!plate) continue;
            if (id) {
                await client.query('UPDATE trucks SET plate_number=$1, truck_type=$2, status=$3 WHERE id=$4', [plate, type, status || 'ACTIVE', id]);
            } else {
                await client.query('INSERT INTO trucks (plate_number, truck_type, status) VALUES ($1, $2, $3) ON CONFLICT (plate_number) DO UPDATE SET truck_type=EXCLUDED.truck_type, status=EXCLUDED.status', [plate, type, status || 'ACTIVE']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลรถสำเร็จ!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 🧑‍✈️ API: ข้อมูลคนขับ (Driver Info)
// ==========================================
app.get('/api/driver_info', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, driver_name, nickname, phone, status FROM driver_info ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.driver_name, r.nickname, r.phone, r.status]) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/driver_info', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, name, nickname, phone, status] = row;
            if (!name) continue;
            if (id) {
                await client.query('UPDATE driver_info SET driver_name=$1, nickname=$2, phone=$3, status=$4 WHERE id=$5', [name, nickname, phone, status || 'ACTIVE', id]);
            } else {
                await client.query('INSERT INTO driver_info (driver_name, nickname, phone, status) VALUES ($1, $2, $3, $4) ON CONFLICT (driver_name) DO UPDATE SET nickname=EXCLUDED.nickname, phone=EXCLUDED.phone, status=EXCLUDED.status', [name, nickname, phone, status || 'ACTIVE']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกรายชื่อคนขับสำเร็จ!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 🔗 API: จับคู่รถ-คนขับ (Truck Assignments)
// ==========================================
app.get('/api/truck_assignments', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, plate_number, driver_name FROM truck_assignments ORDER BY id ASC');
        const trucks = await pool.query("SELECT plate_number FROM trucks WHERE status='ACTIVE'");
        const drivers = await pool.query("SELECT driver_name FROM driver_info WHERE status='ACTIVE'");
        
        res.json({ 
            success: true, 
            data: result.rows.map(r => [r.id, r.plate_number, r.driver_name]),
            truckList: trucks.rows.map(r => r.plate_number),
            driverList: drivers.rows.map(r => r.driver_name)
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/truck_assignments', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [id, plate, driver] = row;
            if (!plate) continue;
            if (id) {
                await client.query('UPDATE truck_assignments SET plate_number=$1, driver_name=$2 WHERE id=$3', [plate, driver, id]);
            } else {
                await client.query('INSERT INTO truck_assignments (plate_number, driver_name) VALUES ($1, $2) ON CONFLICT (plate_number) DO UPDATE SET driver_name=EXCLUDED.driver_name', [plate, driver]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกการจับคู่รถกับคนขับสำเร็จ!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 🏢 API: Master Data (Customers)
// ==========================================
app.get('/api/customers', async (req, res) => {
    try { 
        const result = await pool.query('SELECT customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id FROM customers ORDER BY id ASC'); 
        res.json({ success: true, data: result.rows.map(r => [r.customer_no, r.customer_name, r.short_name, r.billing_name, r.phone_number, r.address, r.tax_id]) }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/customers', async (req, res) => {
    const { data } = req.body; 
    const client = await pool.connect();
    try { 
        await client.query('BEGIN'); 
        for (let row of data) { 
            const [c_no, c_name, s_name, b_name, phone, addr, tax] = row; 
            if (!c_no) continue; 
            await client.query(`INSERT INTO customers (customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (customer_no) DO UPDATE SET customer_name=EXCLUDED.customer_name, short_name=EXCLUDED.short_name, billing_name=EXCLUDED.billing_name, phone_number=EXCLUDED.phone_number, address=EXCLUDED.address, tax_id=EXCLUDED.tax_id`, [c_no, c_name, s_name, b_name, phone, addr, tax]); 
        } 
        await client.query('COMMIT'); 
        res.json({ success: true, message: '💾 บันทึกข้อมูลลูกค้าเรียบร้อย!' }); 
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 💰 API: Master Data (Rates)
// ==========================================
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
        for (let row of data) { 
            const [job_name, customer_name, origin, dest, run_type, count, job_type, tr_6, tr_10, tr_12, tr_c, tf_6, tf_10, tf_12, tf_c] = row; 
            if (!job_name) continue; 
            const parseNum = (val) => (val === '' || val === null || isNaN(val)) ? null : Number(val); 
            await client.query(`INSERT INTO rates (job_name, customer_name, origin, destination, run_type, container_count, job_type, trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT (job_name) DO UPDATE SET customer_name=EXCLUDED.customer_name, origin=EXCLUDED.origin, destination=EXCLUDED.destination, run_type=EXCLUDED.run_type, container_count=EXCLUDED.container_count, job_type=EXCLUDED.job_type, trip_fee_6w=EXCLUDED.trip_fee_6w, trip_fee_10w=EXCLUDED.trip_fee_10w, trip_fee_12w=EXCLUDED.trip_fee_12w, trip_fee_cash=EXCLUDED.trip_fee_cash, trans_fee_6w=EXCLUDED.trans_fee_6w, trans_fee_10w=EXCLUDED.trans_fee_10w, trans_fee_12w=EXCLUDED.trans_fee_12w, trans_fee_cash=EXCLUDED.trans_fee_cash`, [job_name, customer_name, origin, dest, run_type, parseNum(count), job_type, parseNum(tr_6), parseNum(tr_10), parseNum(tr_12), parseNum(tr_c), parseNum(tf_6), parseNum(tf_10), parseNum(tf_12), parseNum(tf_c)]); 
        } 
        await client.query('COMMIT'); 
        res.json({ success: true, message: '💾 บันทึกข้อมูลเรทราคาเรียบร้อย!' }); 
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); } 
    finally { client.release(); }
});

// ==========================================
// 📦 API: ฐานข้อมูลรายการรับงาน (Shipments / Bookings)
// ==========================================
app.get('/api/shipments', async (req, res) => {
    try {
        const { month, year } = req.query;
        let query = 'SELECT raw_data FROM shipments';
        let params = [];
        if (month && year) { query += ' WHERE EXTRACT(MONTH FROM run_date) = $1 AND EXTRACT(YEAR FROM run_date) = $2'; params.push(month, year); }
        query += ' ORDER BY order_id ASC';
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows.map(r => r.raw_data) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/shipments', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const order_id = row[1] ? String(row[1]).trim() : null;
            if (!order_id) continue; 
            const run_date = row[4] || null; 
            const customer_name = row[6] || ''; 
            const booking_no = row[7] || ''; 
            const status = row[row.length - 1] || 'รอจัดรถ';

            await client.query(`INSERT INTO shipments (order_id, run_date, customer_name, booking_no, status, raw_data) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (order_id) DO UPDATE SET run_date=EXCLUDED.run_date, customer_name=EXCLUDED.customer_name, booking_no=EXCLUDED.booking_no, status=EXCLUDED.status, raw_data=EXCLUDED.raw_data, updated_at=NOW()`, [order_id, run_date, customer_name, booking_no, status, JSON.stringify(row)]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลตาราง Operation ลงฐานข้อมูลสำเร็จ!' });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message }); } 
    finally { client.release(); }
});

app.delete('/api/shipments', async (req, res) => {
    const { order_ids } = req.body;
    if (!order_ids || order_ids.length === 0) return res.json({ success: true });
    try {
        const placeholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM shipments WHERE order_id IN (${placeholders})`, order_ids);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
    console.log(`🚀 TERN TMS Server running on http://localhost:${PORT}`); 
});

module.exports = app;