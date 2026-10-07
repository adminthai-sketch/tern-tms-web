const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. เสิร์ฟ Static Files (CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// 2. Import Routes
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

// 3. API Routes (ต้องอยู่ก่อนหน้า Static HTML Routing)
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// 📌 ดักจับ API ที่ไม่มีอยู่จริง (404 API) ให้ตอบกลับเป็น JSON เท่านั้น!
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `❌ ไม่พบ API Endpoint: ${req.originalUrl}` });
});

// 4. Page Routing สำหรับเปิดหน้าเว็บ HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, 'public', `${page}.html`), (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// Fallback สำหรับหน้าเว็บทั่วไป
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;