const express = require('express');
const router = express.Router();
const db = require('../config/db'); // ⚠️ ปรับพาทไปหาไฟล์เชื่อมต่อ Database (เช่น db.js หรือ pool) ของคุณ

// GET: ดึงการตั้งค่าตารางของ User
router.get('/users/grid-settings', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'ระบุ userId ไม่ถูกต้อง' });

        const result = await db.query('SELECT grid_settings FROM users WHERE id = $1', [userId]);
        res.json({ success: true, settings: result.rows[0]?.grid_settings || {} });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT: บันทึกการตั้งค่าตาราง
router.put('/users/grid-settings', async (req, res) => {
    try {
        const { userId, gridName, settings } = req.body;
        if (!userId || !gridName) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });

        // ใช้ jsonb_set เพื่ออัปเดตค่าเฉพาะคีย์ gridName นั้นๆ โดยไม่ทับของตารางอื่น
        const query = `
            UPDATE users 
            SET grid_settings = jsonb_set(
                COALESCE(grid_settings, '{}'::jsonb), 
                ARRAY[$1], 
                $2::jsonb
            )
            WHERE id = $3
        `;
        await db.query(query, [gridName, JSON.stringify(settings), userId]);
        res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;