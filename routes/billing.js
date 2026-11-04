const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. ดึงข้อมูลตู้และบิลทั้งหมดในเดือน + 🌟 พ่วงงานตกหล่นที่ค้างวางบิลจากเดือนก่อนๆ มาด้วย
router.get('/shipments', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const lastDay = new Date(y, m, 0).getDate();
        
        const startDate = `${y}-${String(m).padStart(2, '0')}-01 00:00:00`;
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;

        // 🌟 เพิ่มเงื่อนไข OR: ให้ดึงงานก่อน startDate ที่มีตู้ค้างวางบิลติดมาด้วยทั้ง Booking
        const result = await pool.query(`
            SELECT 
                b.id AS booking_id, b.booking_no, b.run_date, b.mode, b.job_type, b.job_name, b.price_type, b.agent,
                c.id AS customer_id, COALESCE(c.short_name, '-') AS customer_name, COALESCE(c.customer_name, '-') AS full_customer_name,
                c.address, c.tax_id, b.origin, b.destination, b.container_size, 
                COALESCE(b.container_count, 1) AS container_count,
                COALESCE(b.container_count, 1) AS booking_container_count,
                COALESCE(b.trip_fee, 0) AS booking_trip_fee,
                s.order_id, s.container_1_no, s.container_2_no,
                COALESCE(s.leg1_plate, s.leg2_plate, s.leg3_plate, '-') AS plate,
                s.leg1_plate, s.leg1_driver, s.leg2_plate, s.leg3_plate,
                COALESCE(f.trip_fee, b.trip_fee, 0) AS trip_fee,
                COALESCE(f.trans_fee, b.trans_fee, 0) AS trans_fee,
                f.port_pass_fee,
                f.shore_fee,
                f.lift_fee,
                f.deposit_fee,
                f.other_expense,
                COALESCE(f.bill_weight, f.gross_weight) AS gross_weight,
                f.ar_no, f.iv_no, f.billing_date, f.billing_remark, f.billing_status
            FROM bookings b
            LEFT JOIN shipment_operations s ON b.booking_no = s.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id::text = f.order_id::text
            WHERE (b.run_date >= $1 AND b.run_date <= $2)
               OR (
                   b.run_date < $1 
                   AND b.booking_no IN (
                       SELECT DISTINCT s2.booking_no 
                       FROM shipment_operations s2 
                       LEFT JOIN financials f2 ON s2.order_id::text = f2.order_id::text 
                       WHERE f2.iv_no IS NULL OR TRIM(f2.iv_no) = '' OR TRIM(f2.iv_no) = 'รอออก IV'
                   )
               )
            ORDER BY b.run_date DESC, b.booking_no ASC, s.order_id ASC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("GET /shipments Error:");
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. บันทึกข้อมูลตู้
router.post('/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            if (!row.order_id) continue;

            const rawIv = row.iv_no !== null && row.iv_no !== undefined ? String(row.iv_no).trim() : '';
            const cleanIv = (rawIv !== '' && rawIv !== 'รอออก IV' && rawIv.toLowerCase() !== 'null') ? rawIv : null;
            
            const rawAr = row.ar_no !== null && row.ar_no !== undefined ? String(row.ar_no).trim() : '';
            const cleanAr = (rawAr !== '' && rawAr.toLowerCase() !== 'null') ? rawAr : null;

            const status = cleanIv ? (row.billing_status || 'วางบิลแล้ว') : 'รอดำเนินการ';
            const billingDate = cleanIv ? (row.billing_date || null) : null;

            const getNum = (val) => {
                if (val === undefined || val === null || String(val).trim() === '') return null;
                const num = parseFloat(String(val).replace(/,/g, ''));
                return isNaN(num) ? null : num;
            };

            const params = [
                String(row.order_id).trim(), 
                getNum(row.gross_weight),
                cleanAr, 
                cleanIv, 
                row.billing_remark || null, 
                billingDate,
                getNum(row.trip_fee),
                getNum(row.port_pass_fee),
                getNum(row.deposit_fee),
                getNum(row.lift_fee),
                getNum(row.shore_fee),
                getNum(row.other_expense),
                status,
                ...['trip_fee', 'port_pass_fee', 'deposit_fee', 'lift_fee', 'shore_fee', 'other_expense']
                    .map(field => Object.prototype.hasOwnProperty.call(row, field))
            ];

            const updateRes = await client.query(`
                UPDATE financials SET 
                    bill_weight = $2,
                    gross_weight = $2, 
                    ar_no = $3, 
                    iv_no = $4,
                    billing_remark = $5, 
                    billing_date = $6,
                    billing_status = $13,
                    trip_fee = CASE WHEN $14 THEN $7 ELSE trip_fee END,
                    port_pass_fee = CASE WHEN $15 THEN $8 ELSE port_pass_fee END,
                    deposit_fee = CASE WHEN $16 THEN $9 ELSE deposit_fee END,
                    lift_fee = CASE WHEN $17 THEN $10 ELSE lift_fee END,
                    shore_fee = CASE WHEN $18 THEN $11 ELSE shore_fee END,
                    other_expense = CASE WHEN $19 THEN $12 ELSE other_expense END
                WHERE order_id::text = $1::text
            `, params);

            if (updateRes.rowCount === 0) {
                await client.query(`
                    INSERT INTO financials (
                        order_id, bill_weight, gross_weight, ar_no, iv_no, billing_remark, billing_date,
                        trip_fee, port_pass_fee, deposit_fee, lift_fee, shore_fee, other_expense, billing_status
                    )
                    VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, params.slice(0, 13));
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("POST /shipments Error:");
        res.status(500).json({ success: false, message: error.message });
    } finally { 
        client.release(); 
    }
});

// 3. ค้นหาตู้ตกค้างข้าม Booking
router.get('/unbilled-containers', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { customer_id, run_date, booking_no } = req.query;
    if (!customer_id) return res.status(400).json({ success: false, message: 'ต้องระบุ customer_id' });

    try {
        let query = `
            SELECT 
                s.order_id, b.booking_no, b.customer_id, s.container_1_no, s.container_2_no, b.container_size,
                COALESCE(s.leg1_plate, s.leg2_plate, s.leg3_plate, '-') AS leg1_plate, 
                b.run_date, b.origin, b.destination, c.short_name AS customer_name,
                COALESCE(f.trip_fee, b.trip_fee, 0) AS trip_fee, 
                f.port_pass_fee, 
                f.deposit_fee, 
                f.lift_fee, 
                f.shore_fee, 
                f.other_expense,
                COALESCE(f.bill_weight, f.gross_weight) AS gross_weight
            FROM bookings b
            JOIN shipment_operations s ON b.booking_no = s.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            LEFT JOIN financials f ON s.order_id::text = f.order_id::text
            WHERE b.customer_id::text = $1::text 
              AND (f.iv_no IS NULL OR TRIM(f.iv_no) = '' OR TRIM(f.iv_no) = 'รอออก IV')
        `;
        const params = [customer_id];
        if (run_date) { params.push(run_date); query += ` AND b.run_date::text = $${params.length}`; }
        if (booking_no) { params.push(`%${booking_no.trim()}%`); query += ` AND b.booking_no ILIKE $${params.length}`; }
        query += ` ORDER BY b.run_date DESC, s.order_id ASC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) { 
        console.error("GET /unbilled-containers Error:");
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 4. สรุปรายการตามเลข IV (สำหรับหน้า 3 IV List)
router.get('/iv-summary', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const y = parseInt(year, 10); 
        const m = parseInt(month, 10); 
        const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${String(m).padStart(2, '0')}-01 00:00:00`; 
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;

        const result = await pool.query(`
            SELECT 
                f.iv_no, 
                MAX(f.ar_no) AS ar_no, 
                MAX(f.billing_date) AS billing_date,
                MAX(f.billing_status) AS billing_status,
                MAX(f.payment_date) AS payment_date,
                MAX(f.receipt_no) AS receipt_no,
                MAX(f.account_remark) AS account_remark,
                c.id AS customer_id, 
                COALESCE(c.short_name, '-') AS customer_name,
                COUNT(s.order_id) AS total_containers,
                ARRAY_AGG(DISTINCT b.booking_no) AS booking_list,
                SUM(COALESCE(f.trip_fee::NUMERIC, 0)) AS total_trip_fee,
                SUM(
                    COALESCE(f.trip_fee::NUMERIC, 0) + 
                    COALESCE(f.port_pass_fee::NUMERIC, 0) + 
                    COALESCE(f.deposit_fee::NUMERIC, 0) + 
                    COALESCE(f.lift_fee::NUMERIC, 0) + 
                    COALESCE(f.shore_fee::NUMERIC, 0) +
                    COALESCE(f.other_expense::NUMERIC, 0)
                ) AS grand_total
            FROM financials f
            JOIN shipment_operations s ON f.order_id::text = s.order_id::text
            JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            WHERE f.iv_no IS NOT NULL 
              AND TRIM(f.iv_no) != '' 
              AND TRIM(f.iv_no) != 'รอออก IV'
              AND (
                  (b.run_date >= $1 AND b.run_date <= $2)
                  OR (f.billing_date >= $1::timestamp AND f.billing_date <= $2::timestamp)
              )
            GROUP BY f.iv_no, c.id, c.short_name
            ORDER BY f.iv_no ASC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) { 
        console.error("GET /iv-summary Error:");
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 5. บันทึกสถานะและข้อมูลบัญชีของ IV เหมาทั้งบิล (จากหน้า 3)
router.post('/update-iv', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const row of data) {
            if (!row.iv_no) continue;
            
            const params = [
                String(row.iv_no).trim(),
                row.billing_status || 'รอวางบิล',
                row.billing_date || null,
                row.payment_date || null,
                row.receipt_no || null,
                row.account_remark || null
            ];

            await client.query(`
                UPDATE financials SET 
                    billing_status = $2,
                    billing_date = $3,
                    payment_date = $4,
                    receipt_no = $5,
                    account_remark = $6
                WHERE TRIM(iv_no) = $1
            `, params);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกสถานะ IV สำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("POST /update-iv Error:");
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

// 6. 🌟 ดึงข้อมูลตู้เฉพาะของ IV นั้นๆ (สำหรับหน้า 4 IV Detail)
router.get('/iv-detail', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const iv = (req.query.iv || req.query.iv_no || '').trim();
    if (!iv) return res.status(400).json({ success: false, message: 'กรุณาระบุเลข IV' });

    try {
        const result = await pool.query(`
            SELECT 
                s.order_id, b.booking_no, b.run_date, b.origin, b.destination,
                b.job_name, b.mode, b.price_type,
                s.container_1_no, s.container_2_no, b.container_size,
                COALESCE(s.leg1_plate, s.leg2_plate, s.leg3_plate, '-') AS leg1_plate,
                s.leg1_driver,
                c.id AS customer_id, COALESCE(c.short_name, '-') AS customer_name,
                COALESCE(c.customer_name, '-') AS full_customer_name,
                c.address, c.tax_id, c.invoice_layout,
                f.iv_no, f.ar_no, f.billing_date, f.billing_status,
                f.payment_date, f.receipt_no, f.account_remark, f.billing_remark,
                COALESCE(f.trip_fee, b.trip_fee, 0) AS trip_fee,
                f.port_pass_fee, f.deposit_fee, f.lift_fee, f.shore_fee, f.other_expense,
                COALESCE(f.bill_weight, f.gross_weight) AS gross_weight
            FROM financials f
            LEFT JOIN shipment_operations s ON f.order_id::text = s.order_id::text
            LEFT JOIN bookings b ON s.booking_no = b.booking_no
            LEFT JOIN customers c ON b.customer_id = c.id
            WHERE LOWER(TRIM(f.iv_no)) = LOWER(TRIM($1))
            ORDER BY s.order_id ASC
        `, [iv]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("GET /iv-detail Error:");
        res.status(500).json({ success: false, message: err.message });
    }
});

// 7. 🌟 อัปเดตข้อมูลหัวบิลเฉพาะ IV (สำหรับหน้า 4)
router.post('/update-iv-header', async (req, res) => {
    const { iv_no, billing_status, billing_date, payment_date, receipt_no, ar_no } = req.body;
    if (!iv_no) return res.status(400).json({ success: false, message: 'กรุณาระบุเลข IV' });

    try {
        await pool.query(`
            UPDATE financials SET 
                billing_status = COALESCE($2, billing_status),
                billing_date = $3,
                payment_date = $4,
                receipt_no = $5,
                ar_no = COALESCE($6, ar_no)
            WHERE LOWER(TRIM(iv_no)) = LOWER(TRIM($1))
        `, [
            String(iv_no).trim(),
            billing_status || null,
            billing_date || null,
            payment_date || null,
            receipt_no || null,
            ar_no || null
        ]);

        res.json({ success: true, message: 'อัปเดตข้อมูล IV สำเร็จ' });
    } catch (err) {
        console.error("POST /update-iv-header Error:");
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. ดึงข้อมูลสำหรับพิมพ์ใบแนบ A4
router.get('/print-data', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const bookingNo = req.query.booking_no || req.query.booking;
    const ivNo = req.query.iv_no || req.query.iv;

    if (!bookingNo && !ivNo) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุ booking_no หรือ iv_no' });
    }

    try {
        let condition = ''; 
        let param = '';
        if (ivNo) { 
            condition = 'LOWER(TRIM(f.iv_no)) = LOWER(TRIM($1))'; 
            param = String(ivNo).trim(); 
        } else { 
            condition = 'LOWER(TRIM(b.booking_no)) = LOWER(TRIM($1))'; 
            param = String(bookingNo).trim(); 
        }

        const result = await pool.query(`
            SELECT 
                s.order_id, b.booking_no, b.mode, b.price_type,
                s.container_1_no, s.container_2_no, b.container_size, 
                COALESCE(s.leg1_plate, s.leg2_plate, s.leg3_plate, '-') AS plate,
                s.leg1_plate, s.leg2_plate, s.leg3_plate, s.leg1_driver,
                b.run_date, b.origin, b.destination, b.job_name, 
                c.id AS customer_id, 
                COALESCE(c.customer_name, c.short_name, '-') AS customer_name,
                c.address, c.tax_id, c.invoice_layout, 
                COALESCE(f.trip_fee, b.trip_fee, 0) AS trip_fee, 
                COALESCE(f.trans_fee, b.trans_fee, 0) AS trans_fee, 
                f.port_pass_fee, 
                f.shore_fee, 
                f.lift_fee, 
                f.deposit_fee, 
                f.other_expense,
                COALESCE(f.bill_weight, f.gross_weight) AS gross_weight,
                f.ar_no, f.iv_no, f.billing_date, f.billing_remark
            FROM bookings b 
            LEFT JOIN shipment_operations s ON b.booking_no = s.booking_no 
            LEFT JOIN customers c ON b.customer_id = c.id 
            LEFT JOIN financials f ON s.order_id::text = f.order_id::text
            WHERE ${condition} 
            ORDER BY s.order_id ASC
        `, [param]);

        res.json({ success: true, data: result.rows });
    } catch (err) { 
        console.error("GET /print-data Error:");
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 9. บันทึก Layout ใบแนบ
router.post('/save-layout', async (req, res) => {
    const { customer_id, layout } = req.body;
    if (!customer_id) return res.status(400).json({ success: false, message: 'กรุณาระบุ customer_id' });

    try {
        await pool.query('UPDATE customers SET invoice_layout = $1 WHERE id = $2', [JSON.stringify(layout), customer_id]);
        res.json({ success: true, message: 'บันทึก Layout สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
