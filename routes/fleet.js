const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const {requirePermission}=require('../lib/session');
router.get('/dispatch/fleet',async(req,res)=>{
    try {
        const [trucks,drivers,pairs]=await Promise.all([
            pool.query("SELECT plate_number,vehicle_type FROM trucks WHERE status='ACTIVE' ORDER BY plate_number"),
            pool.query("SELECT driver_name FROM drivers WHERE status='ACTIVE' ORDER BY driver_name"),
            pool.query(`SELECT t.plate_number,t.vehicle_type,d.driver_name FROM truck_assignments ta
                JOIN trucks t ON t.id=ta.truck_id JOIN drivers d ON d.id=ta.driver_id
                WHERE t.status='ACTIVE' AND d.status='ACTIVE' ORDER BY t.plate_number`)
        ]);
        res.json({success:true,truckList:trucks.rows.map(r=>r.plate_number),driverList:drivers.rows.map(r=>r.driver_name),
            truckTypes:Object.fromEntries(trucks.rows.map(r=>[r.plate_number,r.vehicle_type])),
            data:pairs.rows.map(r=>[null,r.plate_number,r.vehicle_type,r.driver_name])});
    }catch{res.status(503).json({success:false,message:'โหลดรถและคนขับจากข้อมูลหลักไม่สำเร็จ'});}
});

// ใส่ Route เพิ่มเติมได้ที่นี่ในอนาคต
router.post('/dispatch/fleet/quick',requirePermission('dispatch'),async(req,res)=>{
    let client;
    try{
        const body=req.body,kind=body.kind;
        if(!['truck','driver'].includes(kind))throw Object.assign(Error('ประเภทข้อมูลไม่ถูกต้อง'),{status:400});
        const text=(value,max=100)=>{
            if(value==null)return '';
            if(typeof value!=='string'||value.trim().length>max||/[\x00-\x1f]/.test(value))throw Object.assign(Error('ข้อมูลไม่ถูกต้องหรือยาวเกินกำหนด'),{status:400});
            return value.trim();
        };
        const name=text(kind==='truck'?body.plate_number:body.driver_name);
        const detail=kind==='truck'?[text(body.vehicle_type,50),text(body.brand),text(body.model)]:[text(body.nickname),text(body.phone_number,50)];
        if(!name||(kind==='truck'&&!detail[0]))throw Object.assign(Error('กรุณากรอกชื่อ / ทะเบียน และประเภทรถให้ครบ'),{status:400});
        client=await pool.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(718210)');
        const table=kind==='truck'?'trucks':'drivers',field=kind==='truck'?'plate_number':'driver_name';
        const duplicate=await client.query(`SELECT * FROM ${table} WHERE lower(trim(${field}))=lower($1)`,[name]);
        if(duplicate.rows.length){
            const row=duplicate.rows[0];
            if(row.status!=='ACTIVE')throw Object.assign(Error('รายการนี้มีอยู่แล้วแต่ปิดใช้งาน กรุณาเปิดใช้งานจากหลังบ้าน'),{status:409});
            await client.query('COMMIT');return res.json({success:true,data:row,existing:true});
        }
        const result=kind==='truck'?await client.query(`INSERT INTO trucks(plate_number,vehicle_type,brand,model,status) VALUES($1,$2,$3,$4,'ACTIVE') RETURNING *`,[name,...detail]):
            await client.query(`INSERT INTO drivers(driver_name,nickname,phone_number,status) VALUES($1,$2,$3,'ACTIVE') RETURNING *`,[name,...detail]);
        await client.query('COMMIT');res.json({success:true,data:result.rows[0]});
    }catch(e){if(client)await client.query('ROLLBACK');res.status(e.status||503).json({success:false,message:e.status?e.message:'เพิ่มข้อมูลไม่สำเร็จ ไม่มีการบันทึกบางส่วน'});}
    finally{if(client)client.release();}
});

module.exports = router;
