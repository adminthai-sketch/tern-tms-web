const router=require('express').Router();
const pool=require('../config/db');
const {requirePermission}=require('../lib/session');
const {summarizeHandoffs,actualFields}=require('../lib/handoffs');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
router.get('/dispatch/handoffs',async(req,res)=>{
    const {year,month}=req.query;
    if(!/^\d{4}$/.test(year||'') || !/^(0?[1-9]|1[0-2])$/.test(month||''))return res.status(400).json({success:false,message:'กรุณาระบุเดือนและปี'});
    try {
        const result=await pool.query(`SELECT DISTINCT ON(h.order_id,h.leg_no,h.stop_id) h.* FROM shipment_handoffs h
            JOIN shipment_operations s ON s.order_id=h.order_id JOIN bookings b ON b.booking_no=s.booking_no
            WHERE EXTRACT(YEAR FROM b.run_date)=$1::int AND EXTRACT(MONTH FROM b.run_date)=$2::int ORDER BY h.order_id,h.leg_no,h.stop_id,h.id DESC`,[year,month]);
        res.json({success:true,data:summarizeHandoffs(result.rows),available:true});
    }catch(e){
        if(e.code==='42P01')return res.json({success:true,data:[],available:false});
        res.status(503).json({success:false,message:'โหลดข้อมูลรับช่วงงานไม่สำเร็จ'});
    }
});
router.post('/dispatch/handoffs/:orderId',requirePermission('dispatch'),async(req,res)=>{
    let client;
    try {
        const {leg_no,stop_id,expected_plate,expected_driver,cancel,expected_handoff_id}=req.body;
        if(!((Number.isInteger(leg_no)&&leg_no>=1&&leg_no<=3&&!stop_id)||(!leg_no&&typeof stop_id==='string'&&stop_id.length<=100)))throw fail('กรุณาเลือกขาหรือจุดฝาก');
        client=await pool.connect();await client.query('BEGIN');
        const order=await client.query('SELECT * FROM shipment_operations WHERE order_id=$1 FOR UPDATE',[req.params.orderId]);
        if(!order.rows.length)throw fail('ไม่พบเที่ยว',404);
        let crew;
        if(stop_id){const result=await client.query('SELECT plate,driver,completed,actual_at FROM shipment_stops WHERE order_id=$1 AND stop_id=$2',[req.params.orderId,stop_id]);crew=result.rows[0];}
        else {
            const result=await client.query('SELECT plate,driver,completed FROM shipment_legs WHERE order_id=$1 AND step_no=$2',[req.params.orderId,leg_no*2-1]);
            crew=result.rows[0]||{plate:order.rows[0]['leg'+leg_no+'_plate'],driver:order.rows[0]['leg'+leg_no+'_driver']};
        }
        if(cancel===true){
            const last=await client.query('SELECT * FROM shipment_handoffs WHERE order_id=$1 AND leg_no IS NOT DISTINCT FROM $2::smallint AND stop_id IS NOT DISTINCT FROM $3::text ORDER BY id DESC LIMIT 1',[req.params.orderId,leg_no||null,stop_id||null]);
            const current=last.rows[0];
            if(!current||(!current.plate&&!current.driver)||String(current.id)!==String(expected_handoff_id))throw fail('สถานะรับช่วงเปลี่ยนแล้ว กรุณาโหลดใหม่',409);
            if(crew?.completed||crew?.actual_at||(!stop_id&&(order.rows[0]['leg'+leg_no+'_completed']||order.rows[0][actualFields[leg_no-1]])))throw fail('กรุณาเอาติ๊กเสร็จงานและเวลาที่เสร็จจริงของขานี้ออกก่อนยกเลิกรับช่วง',409);
            const saved=await client.query(`INSERT INTO shipment_handoffs(order_id,leg_no,stop_id,plate,driver,accepted_by) VALUES($1,$2,$3,NULL,NULL,$4) RETURNING *`,[req.params.orderId,leg_no||null,stop_id||null,req.sessionUser.id]);
            await client.query('COMMIT');return res.json({success:true,data:saved.rows[0],cancelled:true});
        }
        if(!crew || (!crew.plate&&!crew.driver))throw fail('กรุณาจัดรถและคนขับพร้อมบันทึกก่อนยืนยันรับช่วง');
        if((crew.plate||'')!==expected_plate || (crew.driver||'')!==expected_driver)throw fail('ข้อมูลรถหรือคนขับเปลี่ยนแล้ว กรุณาโหลดใหม่',409);
        const last=await client.query('SELECT * FROM shipment_handoffs WHERE order_id=$1 ORDER BY id DESC LIMIT 1',[req.params.orderId]);
        const previous=last.rows[0];
        let saved=previous;
        if(!previous || previous.leg_no!==(leg_no||null) || previous.stop_id!==(stop_id||null) || previous.plate!==(crew.plate||null) || previous.driver!==(crew.driver||null)){
            const result=await client.query(`INSERT INTO shipment_handoffs(order_id,leg_no,stop_id,plate,driver,accepted_by)
                VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.params.orderId,leg_no||null,stop_id||null,crew.plate||null,crew.driver||null,req.sessionUser.id]);
            saved=result.rows[0];
        }
        await client.query('COMMIT');res.json({success:true,data:saved});
    }catch(e){
        if(client)await client.query('ROLLBACK');
        res.status(e.status||503).json({success:false,message:e.status?e.message:e.code==='42P01'?'กรุณารัน SQL 010-shipment-handoffs.sql ก่อนยืนยันรับช่วง':'ยืนยันรับช่วงไม่สำเร็จ'});
    }finally{if(client)client.release();}
});
module.exports=router;
