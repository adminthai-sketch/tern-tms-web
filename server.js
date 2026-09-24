require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

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

// 1. Endpoint Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', message: 'เชื่อมต่อ Neon DB สำหรับ TERN TMS สำเร็จ!', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// 2. Endpoint สำหรับ Login (POST /api/login)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
  }

  try {
    // คำนวณ Hash SHA-256 จาก Password ที่ส่งเข้ามา
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    // ค้นหา User และ Role ใน Neon DB
    const query = `
      SELECT u.id, u.username, u.full_name, u.email, u.status, r.role_name, r.permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = $1 AND u.password_hash = $2
    `;
    const result = await pool.query(query, [username, hashedPassword]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const user = result.rows[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' });
    }

    // อัปเดต เวลาเข้าใช้งานล่าสุด (last_login_at)
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // ส่งข้อมูลผู้ใช้กลับไปให้หน้าเว็บ
    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role_name,
        permissions: user.permissions
      }
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 TERN TMS Server running on http://localhost:${PORT}`);
});