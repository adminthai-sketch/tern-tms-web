const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 🚀 นำเข้า Routers ที่แยกโมดูลไว้
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

// หน้าแรก (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// เชื่อมต่อ Routes (นำหน้าด้วย /api)
app.use('/api', bookingRoutes);
app.use('/api', adminRoutes);

// Vercel Serverless Export
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
module.exports = app;