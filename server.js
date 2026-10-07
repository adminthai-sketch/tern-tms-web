// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. นำเข้า Routers
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

// 2. เรียกใช้ API Routes
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// 3. เสิร์ฟ Static Files (CSS, JS, Images) ใน public
app.use(express.static(path.join(__dirname, 'public')));

// 4. สั่งให้ Express เปิดหน้า HTML ใน public ได้ทุกหน้า (index, booking, admin ฯลฯ)
app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${req.params.page}.html`), (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// หน้าแรก Default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;