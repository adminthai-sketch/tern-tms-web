const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 🚀 ใช้ Database URL ของคุณโดยตรงเพื่อป้องกันการเชื่อมต่อหลุด
const dbUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_U0xNiHICd9SJ@ep-patient-mode-b4g3dk4w-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Unexpected error on idle DB client:', err));

// ==========================================
// 🏠 จัดการหน้าแรก (Redirect to Index/Dashboard)
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 📦 API: บันทึกหัวบุคกิ้งลงตาราง "bookings" โดยเฉพาะ
// ==========================================
app.post('/api/bookings/header', async (req, res) => {
    const { mode, run_date, container_count, job_name, customer_name, booking_no, origin, destination } = req.body;
    
    if (!mode || !run_date) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Mode และวันที่วิ่งงาน' });
    }

    try {
        const b_no = booking_no || `BK-${Date.now()}`;
        
        const query = `
            INSERT INTO bookings (booking_no, mode, booking_date, run_date, job_name, customer_name, container_count, origin, destination)
            VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (booking_no) DO UPDATE 
            SET mode = EXCLUDED.mode,
                run_date = EXCLUDED.run_date,
                job_name = EXCLUDED.job_name,
                customer_name = EXCLUDED.customer_name,
                container_count = EXCLUDED.container_count,
                origin = EXCLUDED.origin,
                destination = EXCLUDED.destination,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, booking_no;
        `;

        const values = [b_no, mode, run_date, job_name || '', customer_name || '', container_count || 1, origin || '', destination || ''];
        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: `บันทึกหัวบุคกิ้งเลข ${result.rows[0].booking_no} ลงตาราง bookings เรียบร้อย!`,
            bookingId: result.rows[0].id
        });

    } catch (error) {
        console.error('Save booking header error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกลง DB: ' + error.message });
    }
});

// ==========================================
// API อื่นๆ เดิม (Login, Users, Roles, Shipments, etc.)
// ==========================================
const cleanVal = (val) => (val === '' || val === undefined || val === null ? null : val);
const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// ... [Login API] ...
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const result = await pool.query(`SELECT u.id, u.username, u.full_name, u.status, r.role_name, r.permissions FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.username = $1 AND u.password_hash = $2`, [username, hashedPassword]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        const user = result.rows[0];
        return res.json({ success: true, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name, permissions: user.permissions || {} } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ... [Shipments API สำหรับตาราง Operation] ...
app.post('/api/shipments', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let row of data) {
            const order_id = row[1]; if (!order_id) continue;
            // ลอจิกบันทึก Shipment ...
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกตารางลงฐานข้อมูลสำเร็จ' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 TERN TMS Server running on port ${PORT}`));
module.exports = app;