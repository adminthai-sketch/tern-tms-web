const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');

const cleanNum = (val) => {
    if (val === '' || val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// ฟังก์ชันช่วยทำความสะอาด ID ก่อนลบ (กัน Error พังจากหน้าเว็บส่งค่าว่างมา)
const getValidIds = (idsArray) => {
    if (!idsArray || !Array.isArray(idsArray)) return [];
    return idsArray.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
};

// ==========================================
// 🔑 Login
// ==========================================
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name, u.status, r.role_name, r.permissions 
            FROM users u LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.username = $1 AND u.password_hash = $2
        `, [username, hashedPassword]);

        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        
        const user = result.rows[0];
        if (user.status && user.status !== 'ACTIVE') return res.status(403).json({ success: false, message: 'บัญชีผู้ใช้งานนี้ถูกระงับ' });

        res.json({
            success: true,
            user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name || 'User', permissions: user.permissions || {} }
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==========================================
// 👤 Users & Roles
// ==========================================
router.get('/users', async (req, res) => {
    try {
        const usersResult = await pool.query('SELECT u.id, u.username, u.full_name, u.email, r.role_name, u.status FROM users u LEFT JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC');
        const rolesResult = await pool.query('SELECT role_name FROM roles ORDER BY id ASC');
        const data = usersResult.rows.map(u => [u.id, u.username, u.full_name, u.email, u.role_name || '', u.status]);
        res.json({ success: true, data: data, roleList: rolesResult.rows.map(r => r.role_name) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/users', async (req, res) => {
    const { data, deletedIds } = req.body; 
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const idsToDelete = getValidIds(deletedIds);
        if (idsToDelete.length > 0) {
            await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        for (let row of data) {
            const [id, username, full_name, email, role_name, status] = row;
            if (!username) continue;
            let roleId = null;
            if (role_name) {
                const rRes = await client.query('SELECT id FROM roles WHERE LOWER(role_name) = LOWER($1)', [role_name]);
                if (rRes.rows.length > 0) roleId = rRes.rows[0].id;
            }
            if (id) {
                await client.query(`UPDATE users SET username=$1, full_name=$2, email=$3, role_id=$4, status=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6`, [username, full_name, email, roleId, status, id]);
            } else {
                const defaultPassword = crypto.createHash('sha256').update('password123').digest('hex');
                await client.query(`INSERT INTO users (username, full_name, email, role_id, status, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`, [username, full_name, email, roleId, status || 'ACTIVE', defaultPassword]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึก/ลบ ข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

router.get('/roles', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, role_name, permissions FROM roles ORDER BY id ASC');
        const data = result.rows.map(r => {
            const p = r.permissions || {};
            return [r.id, r.role_name, p.monitor || false, p.booking || false, p.dispatch || false, p.billing || false, p.admin || false];
        });
        res.json({ success: true, data: data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/roles', async (req, res) => {
    const { data, deletedIds } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลส่งมา' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const idsToDelete = getValidIds(deletedIds);
        if (idsToDelete.length > 0) {
            await client.query('DELETE FROM roles WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        for (let row of data) {
            const [id, role_name, p_monitor, p_booking, p_dispatch, p_billing, p_admin] = row;
            if (!role_name) continue;
            const permissions = { monitor: p_monitor, booking: p_booking, dispatch: p_dispatch, billing: p_billing, admin: p_admin };
            if (id) {
                await client.query('UPDATE roles SET role_name=$1, permissions=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3', [role_name, permissions, id]);
            } else {
                await client.query('INSERT INTO roles (role_name, permissions) VALUES ($1, $2)', [role_name, permissions]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึก/ลบ ข้อมูลกลุ่มสิทธิ์เรียบร้อยแล้ว' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'ไม่สามารถลบ Role ได้เนื่องจากมี User ใช้งานอยู่' });
    } finally { client.release(); }
});

// ==========================================
// 🚚 Fleet (รถ / คนขับ) 
// ==========================================
router.get('/trucks', async (req, res) => {
    try {
        const query = `SELECT id, plate_number, vehicle_type, status, brand, model FROM trucks ORDER BY id ASC`;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows.map(r => [r.id, r.plate_number, r.vehicle_type, r.status, r.brand, r.model]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

router.post('/trucks', async (req, res) => {
    const { data, deletedIds } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false });
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const idsToDelete = getValidIds(deletedIds);
        if (idsToDelete.length > 0) {
            await client.query('DELETE FROM trucks WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        for (const row of data) {
            const [id, plate_number, vehicle_type, status, brand, model] = row;
            if (!plate_number) continue;

            if (id) {
                const updateQuery = `UPDATE trucks SET plate_number=$1, vehicle_type=$2, status=$3, brand=$4, model=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6`;
                await client.query(updateQuery, [plate_number, vehicle_type, status || 'ACTIVE', brand || '', model || '', id]);
            } else {
                const insertQuery = `INSERT INTO trucks (plate_number, vehicle_type, status, brand, model) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`;
                await client.query(insertQuery, [plate_number, vehicle_type, status || 'ACTIVE', brand || '', model || '']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึก/ลบ ข้อมูลรถเรียบร้อย' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'ลบไม่ได้: รถคันนี้อาจถูกใช้งานในระบบงานอยู่' });
    } finally { client.release(); }
});

router.get('/driver_info', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, driver_name, nickname, phone_number, status FROM drivers ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.driver_name, r.nickname, r.phone_number, r.status]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

router.post('/driver_info', async (req, res) => {
    const { data, deletedIds } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const idsToDelete = getValidIds(deletedIds);
        if (idsToDelete.length > 0) {
            await client.query('DELETE FROM drivers WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        for (const row of data) {
            const [id, driver_name, nickname, phone_number, status] = row;
            if (!driver_name) continue;
            if (id) {
                await client.query(`UPDATE drivers SET driver_name = $1, nickname = $2, phone_number = $3, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`, [driver_name, nickname, phone_number, status || 'ACTIVE', id]);
            } else {
                await client.query(`INSERT INTO drivers (driver_name, nickname, phone_number, status) VALUES ($1, $2, $3, $4)`, [driver_name, nickname, phone_number, status || 'ACTIVE']);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึก/ลบ ข้อมูลคนขับเรียบร้อย' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'ลบไม่ได้: พนักงานรายนี้อาจถูกใช้งานในระบบงานอยู่' });
    } finally { client.release(); }
});

router.get('/truck_assignments', async (req, res) => {
    try {
        const query = `
            SELECT ta.id, t.plate_number, t.vehicle_type, d.driver_name 
            FROM truck_assignments ta JOIN trucks t ON ta.truck_id = t.id LEFT JOIN drivers d ON ta.driver_id = d.id ORDER BY ta.id ASC
        `;
        const result = await pool.query(query);
        const trucks = await pool.query("SELECT plate_number FROM trucks WHERE status = 'ACTIVE'");
        const drivers = await pool.query("SELECT driver_name FROM drivers WHERE status = 'ACTIVE'");
        
        res.json({ 
            success: true, 
            data: result.rows.map(r => [r.id, r.plate_number, r.vehicle_type || '', r.driver_name || '']),
            truckList: trucks.rows.map(t => t.plate_number),
            driverList: drivers.rows.map(d => d.driver_name)
        });
    } catch (err) { res.json({ success: true, data: [], truckList: [], driverList: [] }); }
});
    
router.post('/truck_assignments', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM truck_assignments'); 

        for (const row of data) {
            const [id, plate_number, dummy, driver_name] = row;
            if (!plate_number) continue;

            const tRes = await client.query('SELECT id FROM trucks WHERE plate_number = $1 LIMIT 1', [plate_number]);
            if (tRes.rows.length === 0) continue; 
            const truck_id = tRes.rows[0].id;

            let driver_id = null;
            if (driver_name) {
                const dRes = await client.query('SELECT id FROM drivers WHERE driver_name = $1 LIMIT 1', [driver_name]);
                if (dRes.rows.length > 0) driver_id = dRes.rows[0].id;
            }

            await client.query(`INSERT INTO truck_assignments (truck_id, driver_id) VALUES ($1, $2) ON CONFLICT (truck_id) DO UPDATE SET driver_id = EXCLUDED.driver_id, updated_at = CURRENT_TIMESTAMP`, [truck_id, driver_id]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกการจับคู่รถ-คนขับ สำเร็จ 100%' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

// ==========================================
// 🏢 Master Data (ลูกค้า / เรทราคา)
// ==========================================
router.get('/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id, credit_term FROM customers ORDER BY id ASC');
        res.json({ success: true, data: result.rows.map(r => [r.id, r.customer_no, r.customer_name, r.short_name, r.billing_name, r.phone_number, r.address, r.tax_id, r.credit_term]) });
    } catch (err) { res.json({ success: true, data: [] }); }
});

router.post('/customers', async (req, res) => {
    const { data, deletedIds } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const idsToDelete = getValidIds(deletedIds);
        if (idsToDelete.length > 0) {
            await client.query('DELETE FROM customers WHERE id = ANY($1::int[])', [idsToDelete]);
        }

        for (const row of data) {
            const [id, c_no, c_name, s_name, b_name, phone, addr, tax, credit] = row;
            if (!c_name) continue; 
            
            if (id) {
                await client.query(`UPDATE customers SET customer_no=$1, customer_name=$2, short_name=$3, billing_name=$4, phone_number=$5, address=$6, tax_id=$7, credit_term=$8 WHERE id=$9`, 
                [c_no, c_name, s_name, b_name, phone, addr, tax, cleanNum(credit) || 30, id]);
            } else {
                await client.query(`INSERT INTO customers (customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id, credit_term) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, 
                [c_no, c_name, s_name, b_name, phone, addr, tax, cleanNum(credit) || 30]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึก/ลบ ข้อมูลลูกค้าเรียบร้อย' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: 'ลบไม่ได้: ลูกค้ารายนี้อาจมีการผูกใบสั่งงาน (Booking) ค้างอยู่' });
    } finally { client.release(); }
});

router.get('/rates', async (req, res) => {
    try {
        const query = `
            SELECT r.id, c.short_name, r.job_name, r.origin, r.destination, r.run_type, r.container_count, r.job_type, 
                   r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash, 
                   r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash 
            FROM rates r LEFT JOIN customers c ON r.customer_id = c.id ORDER BY r.id ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows.map(r => [r.id, r.short_name, r.job_name, r.origin, r.destination, r.run_type, r.container_count, r.job_type, r.trip_fee_6w, r.trip_fee_10w, r.trip_fee_12w, r.trip_fee_cash, r.trans_fee_6w, r.trans_fee_10w, r.trans_fee_12w, r.trans_fee_cash]) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/rates', async (req, res) => {
    const { data } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM rates'); 
        for (const r of data) {
            const short_name = r[1];
            if (!short_name || !r[2]) continue; 

            const custRes = await client.query('SELECT id FROM customers WHERE short_name = $1 LIMIT 1', [short_name]);
            const customer_id = custRes.rows.length > 0 ? custRes.rows[0].id : null;

            await client.query(`
                INSERT INTO rates (customer_id, job_name, origin, destination, run_type, container_count, job_type, 
                                   trip_fee_6w, trip_fee_10w, trip_fee_12w, trip_fee_cash, 
                                   trans_fee_6w, trans_fee_10w, trans_fee_12w, trans_fee_cash) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, 
                [customer_id, r[2], r[3], r[4], r[5], cleanNum(r[6]) || 1, r[7], 
                 cleanNum(r[8]), cleanNum(r[9]), cleanNum(r[10]), cleanNum(r[11]), 
                 cleanNum(r[12]), cleanNum(r[13]), cleanNum(r[14]), cleanNum(r[15])]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'บันทึกเรทราคาและผูกรหัสลูกค้าสำเร็จ!' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

module.exports = router;