const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const {acceptCompletedStops}=require('../lib/handoffs');
const {readSession}=require('../lib/session');
const error = message => Object.assign(new Error(message), {status:400});
function normalizeStops(stops) {
    if (!Array.isArray(stops) || stops.length > 200) throw error('จำนวนจุดฝากไม่ถูกต้อง');
    const ids = new Set();
    return stops.map(stop => {
        if (!stop || typeof stop.stop_id !== 'string' || !/^[\w-]{1,100}$/.test(stop.stop_id) || ids.has(stop.stop_id)) throw error('รหัสจุดฝากซ้ำหรือไม่ถูกต้อง');
        ids.add(stop.stop_id);
        if (!['after_pickup','after_delivery'].includes(stop.segment) || !Number.isInteger(stop.position) || stop.position < 0 || typeof stop.completed !== 'boolean') throw error('ลำดับจุดฝากไม่ถูกต้อง');
        const result = {...stop};
        for (const key of ['location','plate','driver']) {
            if (stop[key] != null && (typeof stop[key] !== 'string' || stop[key].length > 1000)) throw error('ข้อมูลจุดฝากไม่ถูกต้อง');
            result[key] = stop[key]?.trim() || null;
        }
        for (const key of ['appointment','actual_at']) {
            const value = stop[key] || null;
            if (value && (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(value) || !Number.isFinite(Date.parse(value.replace(' ','T')+'+07:00')))) throw error('วันเวลาจุดฝากไม่ถูกต้อง');
            result[key] = value;
        }
        return result;
    });
}
router.get('/dispatch/stops/:orderId', async (req,res) => {
    try {
        const result = await pool.query('SELECT * FROM shipment_stops WHERE order_id=$1 ORDER BY segment DESC,position,stop_id',[req.params.orderId]);
        res.json({success:true,data:result.rows});
    } catch { res.status(503).json({success:false,message:'โหลดจุดฝากไม่สำเร็จ กรุณาตรวจ migration 008'}); }
});
router.put('/dispatch/stops/:orderId', async (req,res) => {
    let client;
    try {
        const stops = normalizeStops(req.body.stops);
        if (!Array.isArray(req.body.base)) throw error('กรุณาโหลดข้อมูลจุดฝากก่อน');
        client = await pool.connect(); await client.query('BEGIN');
        const order = await client.query('SELECT order_id FROM shipment_operations WHERE order_id=$1 FOR UPDATE',[req.params.orderId]);
        if (!order.rows.length) throw error('ไม่พบเที่ยว');
        const old = await client.query('SELECT * FROM shipment_stops WHERE order_id=$1 ORDER BY stop_id',[req.params.orderId]);
        const signature = rows => JSON.stringify(normalizeStops(rows).map(({stop_id,segment,position,location,plate,driver,appointment,actual_at,completed})=>({stop_id,segment,position,location,plate,driver,appointment:appointment?.replace(' ','T'),actual_at:actual_at?.replace(' ','T'),completed})).sort((a,b)=>a.stop_id.localeCompare(b.stop_id)));
        if (signature(old.rows) !== signature(req.body.base)) throw Object.assign(error('ข้อมูลถูกแก้จากอีกหน้าต่าง กรุณาโหลดใหม่'),{status:409});
        for (const stop of stops) await client.query(`INSERT INTO shipment_stops (order_id,stop_id,segment,position,location,plate,driver,appointment,actual_at,completed)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT(order_id,stop_id) DO UPDATE SET segment=EXCLUDED.segment,position=EXCLUDED.position,location=EXCLUDED.location,plate=EXCLUDED.plate,driver=EXCLUDED.driver,appointment=EXCLUDED.appointment,actual_at=EXCLUDED.actual_at,completed=EXCLUDED.completed`,
            [req.params.orderId,stop.stop_id,stop.segment,stop.position,stop.location,stop.plate,stop.driver,stop.appointment,stop.actual_at,stop.completed]);
        await client.query('DELETE FROM shipment_stops WHERE order_id=$1 AND NOT(stop_id=ANY($2::text[]))',[req.params.orderId,stops.map(stop=>stop.stop_id)]);
        await acceptCompletedStops(client,req.params.orderId,old.rows,stops,readSession({headers:req.headers||{}})?.id||null);
        await client.query('COMMIT'); res.json({success:true});
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        res.status(e.status||500).json({success:false,message:e.status?e.message:'บันทึกจุดฝากไม่สำเร็จ ตรวจ migration 008'});
    } finally { if(client)client.release(); }
});
module.exports = router;
