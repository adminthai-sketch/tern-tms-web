const fs=require('fs');
const path=require('path');
const pool=require('../config/db');
async function setupMasters() {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(718209)');
        const check=await client.query("SELECT to_regclass('public.bookings') IS NOT NULL AND to_regclass('public.shipment_operations') IS NOT NULL AND to_regclass('public.master_container_sizes') IS NOT NULL AS valid");
        if(!check.rows[0]?.valid)throw Error('This is not the expected TMS schema');
        for(const file of ['009-container-size-master.sql','010-shipment-handoffs.sql']){
            const sql=fs.readFileSync(path.join(__dirname,'..','sql',file),'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
            await client.query(sql);
        }
        await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
module.exports={setupMasters};
