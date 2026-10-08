const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

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

// 2. เรียกใช้ API Routes
app.use('/api', authRoutes);
app.use('/api', bookingRoutes);
app.use('/api', fleetRoutes);
app.use('/api', adminRoutes);
app.use('/api', excelRoutes);
app.use('/api', usersRoutes);

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