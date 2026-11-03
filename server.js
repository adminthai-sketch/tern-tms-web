const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg'); // เพิ่มตัวเชื่อมฐานข้อมูล
require('dotenv').config();

const app = express();

// ==========================================
// 🔗 ตั้งค่าการเชื่อมต่อฐานข้อมูล Neon DB
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. นำเข้า API Routes
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const fleetRoutes = require('./routes/fleet');
const adminRoutes = require('./routes/admin');
const excelRoutes = require('./routes/excel');
const usersRoutes = require('./routes/users');
const billingRoutes = require('./routes/billing');

// 2. เรียกใช้ API Routes
// 🌟 วาง /api/billing ไว้ก่อน /api เพื่อป้องกัน Route Interception
app.use('/api/billing', billingRoutes);

app.use('/api', authRoutes);
app.use('/api', bookingRoutes);
app.use('/api', fleetRoutes);
app.use('/api', adminRoutes);
app.use('/api', excelRoutes);
app.use('/api', usersRoutes);

// ==========================================
// 🔑 API เปลี่ยนรหัสผ่านส่วนตัว (Change Password)
// ==========================================
app.post('/api/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    
    try {
        const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
        
        // 1. ตรวจสอบรหัสเดิมว่าถูกไหม
        const userRes = await pool.query('SELECT id FROM users WHERE username = $1 AND password_hash = $2', [username, oldHash]);
        if (userRes.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }
        
        // 2. เข้ารหัสรหัสผ่านใหม่แล้วอัปเดตลงฐานข้อมูล
        const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [newHash, username]);
        
        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ! กรุณาล็อกอินใหม่' });
    } catch (err) {
        console.error('Change Password Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// 📌 บล็อกดักจับ API Error 404 (ให้ตอบกลับเป็น JSON เสมอ)
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `❌ ไม่พบ API Endpoint: ${req.originalUrl}` });
});

// 3. เสิร์ฟไฟล์ Static ทั้งหมดจากโฟลเดอร์ public (CSS, JS, HTML)
app.use(express.static(path.join(__dirname, 'public')));

// 4. HTML Page Routing สำหรับเรียกหน้าเว็บต่างๆ ใน public
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// Route หน้าแรก
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback รวมสำหรับเส้นทางอื่นๆ
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;