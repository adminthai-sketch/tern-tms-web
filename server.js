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
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

// 2. เรียกใช้ API Routes
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// 📌 บล็อกดักจับ API Error (ถ้าหา API ไม่เจอ ให้ตอบกลับเป็น JSON เสมอ ป้องกัน HTML หลุดไป)
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `❌ ไม่พบ API Endpoint: ${req.originalUrl}` });
});

// 3. เสิร์ฟ Static Files (HTML, JS, CSS) จาก public
app.use(express.static(path.join(__dirname, 'public')));

// 4. Fallback Routing สำหรับหน้า HTML
app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${req.params.page}.html`), (err) => {
        if (err) res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;