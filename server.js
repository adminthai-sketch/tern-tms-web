// ==========================================
// API: บันทึกข้อมูล Booking และ Operation (3 Tables)
// ==========================================
app.post('/api/shipments', async (req, res) => {
    const { data } = req.body;
    if (!data || data.length === 0) {
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับบันทึก' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // เริ่ม Transaction

        for (const row of data) {
            // Mapping ข้อมูลจาก Handsontable (อิงตาม Index ที่ตั้งไว้)
            const order_id = row[1];
            const mode = row[2];
            const booking_date = row[3];
            const run_date = row[4];
            const job_name = row[5];
            const customer = row[6];
            const booking_no = row[7] || `TEMP-${Date.now()}`; // ถ้าไม่มีเลข Booking ให้สร้างชั่วคราว
            const origin = row[8];
            const dest = row[9];
            const container_count = row[12] || 1;
            const job_type = row[14];
            const agent = row[15];

            // ข้อมูลตู้
            const container_no = row[10] || row[11] || ''; // ยุบรวมเบอร์ตู้ 1 และ 2
            const container_size = row[13];
            const pod = row[16];
            const seal_no = row[17];
            const tare = row[18];
            const max_gross = row[19];
            const weight = row[20];

            // ข้อมูลวันที่
            const cy_date = row[21];
            const vgm_cutoff = row[22];
            const cutoff_time = row[23];
            const load_date = row[24];
            const open_gate = row[25];
            const rent_cutoff = row[26];
            const demurrage = row[27];
            const unload_date = row[28];
            const return_date = row[29];

            // เรทราคา
            const trip_fee = row[58] || 0;
            const trans_fee = row[59] || 0;
            const overall_status = row[60] || 'รอจัดรถ';

            // 1. จัดการตาราง bookings (บันทึกส่วนหัว)
            // เช็คว่ามี Booking No. นี้หรือยัง ถ้ายังให้ Insert ถ้ามีแล้วให้อัปเดต
            let bookingId;
            const checkBooking = await client.query('SELECT id FROM bookings WHERE booking_no = $1', [booking_no]);
            
            if (checkBooking.rows.length > 0) {
                bookingId = checkBooking.rows[0].id;
                // Update ข้อมูลส่วนหัว
                await client.query(`
                    UPDATE bookings 
                    SET mode=$1, run_date=$2, job_name=$3, customer_name=$4, origin=$5, destination=$6, 
                        cy_date=$7, vgm_cutoff=$8, cutoff_time=$9, load_date=$10, open_gate=$11, 
                        rent_cutoff=$12, demurrage=$13, unload_date=$14, return_date=$15, 
                        trip_fee=$16, trans_fee=$17, updated_at=CURRENT_TIMESTAMP
                    WHERE id=$18
                `, [mode, run_date, job_name, customer, origin, dest, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date, trip_fee, trans_fee, bookingId]);
            } else {
                // Insert หัวบิลใหม่
                const newBooking = await client.query(`
                    INSERT INTO bookings 
                    (booking_no, mode, booking_date, run_date, job_name, customer_name, origin, destination, container_count, 
                     cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date, trip_fee, trans_fee)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                    RETURNING id
                `, [booking_no, mode, booking_date, run_date, job_name, customer, origin, dest, container_count, cy_date, vgm_cutoff, cutoff_time, load_date, open_gate, rent_cutoff, demurrage, unload_date, return_date, trip_fee, trans_fee]);
                bookingId = newBooking.rows[0].id;
            }

            // 2. จัดการตาราง shipment_operations (บันทึกรายตู้)
            // เช็คว่า Order ID นี้มีหรือยัง (ใช้ Order ID เป็นตัวแยกรายตู้)
            let shipmentId;
            const checkShipment = await client.query('SELECT id FROM shipment_operations WHERE order_id = $1', [order_id]);
            
            if (checkShipment.rows.length > 0) {
                shipmentId = checkShipment.rows[0].id;
                await client.query(`
                    UPDATE shipment_operations 
                    SET container_no=$1, container_size=$2, pod=$3, seal_no=$4, tare=$5, max_gross=$6, weight=$7, overall_status=$8, updated_at=CURRENT_TIMESTAMP
                    WHERE id=$9
                `, [container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status, shipmentId]);
            } else {
                const newShipment = await client.query(`
                    INSERT INTO shipment_operations 
                    (order_id, booking_id, container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                `, [order_id, bookingId, container_no, container_size, pod, seal_no, tare, max_gross, weight, overall_status]);
                shipmentId = newShipment.rows[0].id;

                // 3. จัดการตาราง financials (สร้างรอไว้ให้ฝ่ายบัญชี)
                await client.query(`
                    INSERT INTO financials (shipment_id, billing_status)
                    VALUES ($1, 'รอดำเนินการ')
                    ON CONFLICT DO NOTHING
                `, [shipmentId]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกข้อมูลบุคกิ้งและตู้สินค้าลงฐานข้อมูลสำเร็จ! ✅' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving shipments:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message });
    } finally {
        client.release();
    }
});