const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. ดึงข้อมูลตู้และบิลทั้งหมดในเดือน (เอา COALESCE ออกเพื่อให้แสดงค่าว่างได้)
router.get('/shipments', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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
                
                -- 🌟 คง COALESCE ไว้เฉพาะค่าบรรทุก (trip_fee) เพราะห้ามว่าง
                COALESCE(f.trip_fee, b.trip_fee, 0) AS trip_fee,
                COALESCE(f.trans_fee, b.trans_fee, 0) AS trans_fee,
                
                -- 🌟 ปลดล็อกให้ค่าพวกนี้เป็น NULL (ช่องว่าง) ได้
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
            WHERE b.run_date BETWEEN $1 AND $2
            ORDER BY b.run_date DESC, b.booking_no ASC, s.order_id ASC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("GET /shipments Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. บันทึกข้อมูลวางบิลรายตู้
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

            const status = cleanIv ? 'วางบิลแล้ว' : 'รอดำเนินการ';
            const billingDate = cleanIv ? (row.billing_date || null) : null;

            const getNum = (val) => (val !== undefined && val !== null && String(val).trim() !== '') ? parseFloat(val) : null;

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
                status
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
                    trip_fee = COALESCE($7, trip_fee),
                    port_pass_fee = $8,
                    deposit_fee = $9,
                    lift_fee = $10,
                    shore_fee = $11,
                    other_expense = $12
                WHERE order_id::text = $1::text
            `, params);

            if (updateRes.rowCount === 0) {
                await client.query(`
                    INSERT INTO financials (
                        order_id, bill_weight, gross_weight, ar_no, iv_no, billing_remark, billing_date,
                        trip_fee, port_pass_fee, deposit_fee, lift_fee, shore_fee, other_expense, billing_status
                    )
                    VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, params);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("POST /shipments Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    } finally { 
        client.release(); 
    }
});

// 3. ค้นหาตู้ตกค้าง / งานพิเศษที่ยังไม่ได้วางบิล 
router.get('/unbilled-containers', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { customer_id, run_date, booking_no } = req.query;
    if (!customer_id) return res.status(400).json({ success: false, message: 'ต้องระบุ customer_id' });

    try {
        let query = `
            SELECT 
                s.order_id, b.booking_no, s.container_1_no, s.container_2_no, s.container_size,
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
        console.error("GET /unbilled-containers Error:", err.message);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 4. สรุปรายการตามเลข IV (สำหรับหน้า IV List)
router.get('/iv-summary', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'กรุณาระบุปีและเดือน' });

    try {
        const y = parseInt(year, 10); 
        const m = parseInt(month, 10); 
        const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`; 
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const result = await pool.query(`
            SELECT 
                f.iv_no, MAX(f.ar_no) AS ar_no, MAX(f.billing_date) AS billing_date,
                c.id AS customer_id, COALESCE(c.short_name, '-') AS customer_name,
                COUNT(s.order_id) AS total_containers,
                ARRAY_AGG(DISTINCT b.booking_no) AS booking_list,
                SUM(COALESCE(f.trip_fee::NUMERIC, 0)) AS total_trip_fee,
                SUM(
                    COALESCE(f.port_pass_fee::NUMERIC, 0) + 
                    COALESCE(f.deposit_fee::NUMERIC, 0) + 
                    COALESCE(f.lift_fee::NUMERIC, 0) + 
                    COALESCE(f.shore_fee::NUMERIC, 0) +
                    COALESCE(f.other_expense::NUMERIC, 0)
                ) AS total_other_fee,
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
              AND b.run_date BETWEEN $1 AND $2
            GROUP BY f.iv_no, c.id, c.short_name
            ORDER BY f.iv_no ASC
        `, [startDate, endDate]);

        res.json({ success: true, data: result.rows });
    } catch (err) { 
        console.error("GET /iv-summary Error:", err.message);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 5. ดึงข้อมูลสำหรับพิมพ์ใบแนบ A4
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
            condition = 'f.iv_no = $1'; 
            param = String(ivNo).trim(); 
        } else { 
            condition = 'b.booking_no = $1'; 
            param = String(bookingNo).trim(); 
        }

        const result = await pool.query(`
            SELECT 
                s.order_id, b.booking_no, b.mode, b.price_type,
                s.container_1_no, s.container_2_no, s.container_size, 
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
        console.error("GET /print-data Error:", err.message);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// 6. บันทึก Layout ใบแนบ
router.post('/save-layout', async (req, res) => {
    const { customer_id, layout } = req.body;
    if (!customer_id) return res.status(400).json({ success: false, message: 'กรุณาระบุ customer_id' });

    try {
        await pool.query('UPDATE customers SET invoice_layout = $1 WHERE id = $2', [JSON.stringify(layout), customer_id]);
        res.json({ success: true, message: 'บันทึก Layout สำเร็จ' });
    } catch (err) {
        console.error("POST /save-layout Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;