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
        let query = 'SELECT booking_no, mode, run_date, job_name, customer_name, origin, destination, container_count, price_type, trip_fee, trans_fee FROM bookings';
        let params = [];

        if (year && month) {
            query += ' WHERE EXTRACT(MONTH FROM run_date) = $1 AND EXTRACT(YEAR FROM run_date) = $2';
            params.push(month, year);
        }
        query += ' ORDER BY id DESC';

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