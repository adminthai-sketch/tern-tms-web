const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../config/db');

// ตั้งค่า Multer สำหรับพักไฟล์อัปโหลดในหน่วยความจำ
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 📥 1. IMPORT: อ่านไฟล์ Excel/CSV แล้วแปลงเป็น JSON
// ==========================================
router.post('/import-excel', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ Excel หรือ CSV' });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        res.json({ success: true, message: 'อ่านข้อมูลไฟล์สำเร็จ', rowsCount: jsonData.length, data: jsonData });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านไฟล์: ' + error.message });
    }
});

// ==========================================
// 📤 2. EXPORT: ดึงข้อมูลจาก DB ออกมาเป็นไฟล์ .xlsx
// ==========================================
router.get('/export-bookings', async (req, res) => {
    try {
        const { year, month } = req.query;
        
        // 🌟 แก้ไขคำสั่ง SQL ให้ Join ไปดึงชื่อลูกค้า (short_name) จากตาราง customers
        let query = `
            SELECT b.booking_no, b.mode, b.run_date, b.job_name, c.short_name AS customer_name, 
                   b.origin, b.destination, b.container_count, b.price_type, b.trip_fee, b.trans_fee 
            FROM bookings b
            LEFT JOIN customers c ON b.customer_id = c.id
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        if (year && month) {
            query += ` AND EXTRACT(MONTH FROM b.run_date) = $${paramIndex++} AND EXTRACT(YEAR FROM b.run_date) = $${paramIndex++}`;
            params.push(month, year);
        }
        query += ` ORDER BY b.id DESC`;

        const result = await pool.query(query, params);

        const headers = [['Booking No', 'Mode', 'Run Date', 'Job Name', 'Customer Name', 'Origin', 'Destination', 'Containers', 'Price Type', 'Trip Fee', 'Trans Fee']];
        const rows = result.rows.map(r => [
            r.booking_no, r.mode, r.run_date, r.job_name, r.customer_name,
            r.origin, r.destination, r.container_count, r.price_type, r.trip_fee, r.trans_fee
        ]);

        const worksheetData = [...headers, ...rows];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Bookings_Export_${Date.now()}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการ Export: ' + error.message });
    }
});

module.exports = router;