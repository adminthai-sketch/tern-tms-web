require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// เชื่อมต่อ Neon Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. Endpoint Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', message: 'เชื่อมต่อ Neon DB สำเร็จ!', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// 2. API Login (ปลอดภัย ไม่ล่มแม้ยื่น Query พลาด)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
    }

    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        // ตรวจสอบจากตาราง users
        const query = 'SELECT id, username, full_name, role, status FROM users WHERE username = $1 AND password_hash = $2';
        const result = await pool.query(query, [username, hashedPassword]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = result.rows[0];

        if (user.status && user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' });
        }

        // อัปเดตเวลาเข้าใช้งานล่าสุด
        try {
            await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        } catch (e) {
            console.log('Skipped last_login_at update');
        }

        return res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name || user.username,
                role: user.role || 'Admin'
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์: ' + err.message });
    }
});

// ==========================================
// 🚛 API: ฐานข้อมูลคนขับ (Drivers)
// ==========================================
app.get('/api/drivers', async (req, res) => {
    try {
        const result = await pool.query('SELECT plate_no, truck_type, driver_name, nickname FROM drivers ORDER BY id ASC');
        const data = result.rows.map(r => [r.plate_no, r.truck_type, r.driver_name, r.nickname]);
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/drivers', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [plate_no, truck_type, driver_name, nickname] = row;
            if (!plate_no) continue;
            await client.query(`
                INSERT INTO drivers (plate_no, truck_type, driver_name, nickname)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (plate_no) DO UPDATE 
                SET truck_type = EXCLUDED.truck_type, driver_name = EXCLUDED.driver_name, nickname = EXCLUDED.nickname
            `, [plate_no, truck_type, driver_name, nickname]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลคนขับเรียบร้อย!' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 🏢 API: ฐานข้อมูลลูกค้า (Customers)
// ==========================================
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id FROM customers ORDER BY id ASC');
        const data = result.rows.map(r => [r.customer_no, r.customer_name, r.short_name, r.billing_name, r.phone_number, r.address, r.tax_id]);
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const [c_no, c_name, s_name, b_name, phone, addr, tax] = row;
            if (!c_no) continue;
            await client.query(`
                INSERT INTO customers (customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (customer_no) DO UPDATE 
                SET customer_name = EXCLUDED.customer_name, short_name = EXCLUDED.short_name, billing_name = EXCLUDED.billing_name, phone_number = EXCLUDED.phone_number, address = EXCLUDED.address, tax_id = EXCLUDED.tax_id
            `, [c_no, c_name, s_name, b_name, phone, addr, tax]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลลูกค้าเรียบร้อย!' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 💰 API: ฐานข้อมูลเรทราคา (Rates)
// ==========================================
app.get('/api/rates', async (req, res) => {
    try {
        const result = await pool.query('SELECT job_name, customer_name, origin, destination, run_type, container_count, job_type, trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash FROM rates ORDER BY id ASC');
        const data = result.rows.map(r => [r.job_name, r.customer_name, r.origin, r.destination, r.run_type, r.container_count, r.job_type, r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash, r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash]);
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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

            await client.query(`
                INSERT INTO rates (job_name, customer_name, origin, destination, run_type, container_count, job_type, trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (job_name) DO UPDATE 
                SET customer_name = EXCLUDED.customer_name, origin = EXCLUDED.origin, destination = EXCLUDED.destination, run_type = EXCLUDED.run_type, container_count = EXCLUDED.container_count, job_type = EXCLUDED.job_type, trip_fee_6w = EXCLUDED.trip_fee_6w, trip_fee_10w = EXCLUDED.trip_fee_10w, trip_fee_12w = EXCLUDED.trip_fee_12w, trip_fee_cash = EXCLUDED.trip_fee_cash, trans_fee_6w = EXCLUDED.trans_fee_6w, trans_fee_10w = EXCLUDED.trans_fee_10w, trans_fee_12w = EXCLUDED.trans_fee_12w, trans_fee_cash = EXCLUDED.trans_fee_cash
            `, [job_name, customer_name, origin, dest, run_type, parseNum(count), job_type, parseNum(tr_6), parseNum(tr_10), parseNum(tr_12), parseNum(tr_c), parseNum(tf_6), parseNum(tf_10), parseNum(tf_12), parseNum(tf_c)]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: '💾 บันทึกข้อมูลเรทราคาเรียบร้อย!' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 TERN TMS Server running on http://localhost:${PORT}`);
});