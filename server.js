require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// static folder สำหรับให้บริการไฟล์ index.html และรูปภาพ
app.use(express.static('public'));

// เชื่อมต่อ Neon Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ตั้งค่า Mailer สำหรับส่ง OTP (ใช้ Gmail หรือ SMTP อื่นๆ)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // ใส่อีเมลของคุณใน .env
        pass: process.env.EMAIL_PASS  // ใส่ App Password ใน .env
    }
});

// ==========================================
// 1. Endpoint Health Check
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', message: 'เชื่อมต่อ Neon DB สำหรับ TERN TMS สำเร็จ!', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ==========================================
// 2. API ล็อกอินขั้นที่ 1 (ตรวจ Pass -> ส่ง OTP)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
    }

    try {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        
        const query = `
          SELECT u.id, u.username, u.full_name, u.email, u.status, r.role_name
          FROM users u
          LEFT JOIN roles r ON u.role_id = r.id
          WHERE u.username = $1 AND u.password_hash = $2
        `;
        const result = await pool.query(query, [username, hash]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = result.rows[0];

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' });
        }

        // สุ่ม OTP 6 หลัก และตั้งเวลาหมดอายุ 5 นาที
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 

        // บันทึกลง Neon DB
        await pool.query(
            'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
            [otp, expiresAt, user.id]
        );

        // ยิงอีเมล OTP 
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail({
                from: '"TERN TMS Security" <no-reply@terntms.com>',
                to: user.email,
                subject: '🔐 รหัส OTP สำหรับเข้าสู่ระบบ TERN TMS',
                html: `
                    <div style="font-family: 'Prompt', Arial, sans-serif; padding: 25px; background: #f8fafc; border-radius: 12px; max-width: 450px; border: 1px solid #e2e8f0;">
                        <h2 style="color: #0f4c81; margin-top: 0;">TERN TMS Verification</h2>
                        <p style="color: #475569;">สวัสดีคุณ <b>${user.full_name}</b>,</p>
                        <p style="color: #475569;">กรุณาใช้รหัส OTP ด้านล่างนี้เพื่อยืนยันการเข้าสู่ระบบ (รหัสมีอายุ 5 นาที):</p>
                        <div style="background: #0f4c81; color: #ffffff; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 8px; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            ${otp}
                        </div>
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">หากคุณไม่ได้ขอรหัสนี้ โปรดแจ้งผู้ดูแลระบบทันที</p>
                    </div>
                `
            });
        } else {
             console.log("⚠️ EMAIL_USER or EMAIL_PASS not set in .env. OTP is:", otp);
        }

        res.json({
            success: true,
            requireOTP: true,
            username: user.username,
            emailMasked: user.email ? user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp1 + "*".repeat(gp2.length)) : 'No Email'
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// ==========================================
// 3. API ล็อกอินขั้นที่ 2 (ตรวจ OTP)
// ==========================================
app.post('/api/verify-otp', async (req, res) => {
    const { username, otp } = req.body;

    if (!username || !otp) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    try {
        const query = `
          SELECT u.id, u.username, u.full_name, u.role_id, r.role_name
          FROM users u
          LEFT JOIN roles r ON u.role_id = r.id
          WHERE u.username = $1 AND u.otp_code = $2 AND u.otp_expires_at > NOW()
        `;
        const result = await pool.query(query, [username, otp]);

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว' });
        }

        const user = result.rows[0];

        // เคลียร์ OTP และอัปเดตเวลา Last Login
        await pool.query(
            'UPDATE users SET otp_code = NULL, otp_expires_at = NULL, last_login_at = NOW() WHERE id = $1',
            [user.id]
        );

        res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role_name
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
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