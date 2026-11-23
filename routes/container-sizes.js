const router=require('express').Router();
const pool=require('../config/db');
const {requirePermission}=require('../lib/session');
const {setupMasters}=require('../lib/master-setup');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const fields="size_name,description,is_active,to_jsonb(master_container_sizes)->>'updated_at' AS revision";
router.post('/admin/master-setup',requirePermission('admin'),async(req,res)=>{
    try{await setupMasters();res.json({success:true});}catch{res.status(503).json({success:false,message:'เตรียมข้อมูลไม่สำเร็จ ไม่มีการบันทึกบางส่วน กรุณาตรวจฐาน TMS'});}
});
router.get('/admin/container-sizes',requirePermission('admin'),async(req,res)=>{
    try {
        const result=await pool.query(`SELECT size_name,COALESCE(to_jsonb(m)->>'description','') AS description,
            COALESCE((to_jsonb(m)->>'is_active')::boolean,true) AS is_active,to_jsonb(m)->>'updated_at' AS revision FROM master_container_sizes m ORDER BY size_name`);
        const schema=await pool.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='master_container_sizes' AND column_name='is_active') AND to_regclass('public.shipment_handoffs') IS NOT NULL AS ready");
        res.json({success:true,data:result.rows,schema_ready:schema.rows[0].ready});
    }catch(e){res.status(503).json({success:false,message:e.code==='42703'?'กรุณารัน SQL 009-container-size-master.sql ก่อนใช้งาน':'โหลดข้อมูลประเภทตู้ไม่สำเร็จ'});}
});
async function saveSize(req,res) {
    let client;
    try {
        const {size_name,description='',is_active=true,revision}=req.body;
        if(typeof size_name!=='string' || !size_name.trim() || size_name.trim().length>50 || /[\x00-\x1f]/.test(size_name)) throw fail('กรุณากรอกรหัสตู้ไม่เกิน 50 ตัวอักษร');
        if(typeof description!=='string' || description.length>500 || typeof is_active!=='boolean') throw fail('คำอธิบายหรือสถานะไม่ถูกต้อง');
        const code=size_name.trim().toUpperCase(),old=req.params.code;
        client=await pool.connect();await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(718209)');
        if(old) {
            const current=await client.query(`SELECT ${fields} FROM master_container_sizes WHERE size_name=$1 FOR UPDATE`,[old]);
            if(!current.rows.length) throw fail('ไม่พบประเภทตู้นี้',404);
            if(current.rows[0].revision!==revision) throw fail('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่',409);
            if(code!==old) {
                const used=await client.query(`SELECT 1 FROM bookings b WHERE b.container_size=$1
                    OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(b.container_list,'[]'::jsonb)) item WHERE item->>'size'=$1)
                    UNION ALL SELECT 1 FROM shipment_operations WHERE order_container_size=$1 LIMIT 1`,[old]);
                if(used.rows.length) throw fail('รหัสนี้ถูกใช้ในงานแล้ว แก้คำอธิบายหรือปิดใช้งานได้ หากเปลี่ยนรหัสให้เพิ่มรายการใหม่',409);
            }
        }
        const duplicate=await client.query('SELECT size_name FROM master_container_sizes WHERE lower(trim(size_name))=lower($1) AND ($2::text IS NULL OR size_name<>$2)',[code,old||null]);
        if(duplicate.rows.length) throw fail('รหัสประเภทตู้นี้มีอยู่แล้ว',409);
        const saved=old?await client.query(`UPDATE master_container_sizes SET size_name=$1,description=$2,is_active=$3,updated_at=CURRENT_TIMESTAMP WHERE size_name=$4 RETURNING ${fields}`,[code,description.trim(),is_active,old]):
            await client.query(`INSERT INTO master_container_sizes(size_name,description,is_active) VALUES($1,$2,$3) RETURNING ${fields}`,[code,description.trim(),is_active]);
        await client.query('COMMIT');res.json({success:true,data:saved.rows[0]});
    }catch(e){
        if(client)await client.query('ROLLBACK');
        res.status(e.status||500).json({success:false,message:e.status?e.message:e.code==='42703'?'กรุณารัน SQL 009-container-size-master.sql ก่อนใช้งาน':'บันทึกประเภทตู้ไม่สำเร็จ'});
    }finally{if(client)client.release();}
}
router.post('/admin/container-sizes',requirePermission('admin'),saveSize);
router.put('/admin/container-sizes/:code',requirePermission('admin'),saveSize);
// Legacy write URL now uses the same admin permission and validation.
router.post('/container-sizes',requirePermission('admin'),saveSize);
module.exports=router;
