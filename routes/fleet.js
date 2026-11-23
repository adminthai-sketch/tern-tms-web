const express = require('express');
const router = express.Router();
const pool = require('../config/db');
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

module.exports = router;
