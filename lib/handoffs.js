// A null-crew event retracts that target's acceptance; previous events remain as audit history.
const actualFields=['actual_drop_date','actual_load_date','actual_return_date'];
function summarizeHandoffs(events) {
    const orders=new Map();
    for(const event of events){
        if(!orders.has(event.order_id))orders.set(event.order_id,[]);
        orders.get(event.order_id).push(event);
    }
    return [...orders.values()].map(items=>{
        items.sort((a,b)=>Number(b.id)-Number(a.id));
        const seen=new Set(),targets=[];
        for(const item of items){
            const key=item.stop_id?'stop:'+item.stop_id:'leg:'+item.leg_no;
            if(seen.has(key))continue;seen.add(key);
            if(item.plate||item.driver)targets.push(item);
        }
        return {...(targets[0]||items[0]),targets,no_active:targets.length===0};
    });
}
async function acceptCompletedLegs(client,before,after,patch,actor=null) {
    for(let leg=1;leg<=3;leg++){
        const flag='leg'+leg+'_completed',actual=actualFields[leg-1];
        const completed=patch[flag]===true&&before[flag]!==true;
        const finished=patch[actual]&&!before[actual];
        if(!completed&&!finished)continue;
        const plate=after['leg'+leg+'_plate']||null,driver=after['leg'+leg+'_driver']||null;
        // Preserve legacy jobs that were completed before crew details were entered.
        if(!plate&&!driver)continue;
        const last=await client.query('SELECT * FROM shipment_handoffs WHERE order_id=$1 AND leg_no=$2 AND stop_id IS NULL ORDER BY id DESC LIMIT 1',[after.order_id,leg]);
        if(last.rows[0]?.plate===plate&&last.rows[0]?.driver===driver)continue;
        await client.query(`INSERT INTO shipment_handoffs(order_id,leg_no,stop_id,plate,driver,accepted_by)
            VALUES($1,$2,NULL,$3,$4,$5)`,[after.order_id,leg,plate,driver,actor]);
    }
}
async function acceptCompletedStops(client,orderId,before,after,actor=null) {
    const old=new Map(before.map(stop=>[stop.stop_id,stop]));
    for(const stop of after){
        const previous=old.get(stop.stop_id)||{};
        if(!((stop.completed&&!previous.completed)||(stop.actual_at&&!previous.actual_at))||(!stop.plate&&!stop.driver))continue;
        const last=await client.query('SELECT * FROM shipment_handoffs WHERE order_id=$1 AND stop_id=$2 ORDER BY id DESC LIMIT 1',[orderId,stop.stop_id]);
        if(last.rows[0]?.plate===(stop.plate||null)&&last.rows[0]?.driver===(stop.driver||null))continue;
        await client.query(`INSERT INTO shipment_handoffs(order_id,leg_no,stop_id,plate,driver,accepted_by) VALUES($1,NULL,$2,$3,$4,$5)`,[orderId,stop.stop_id,stop.plate||null,stop.driver||null,actor]);
    }
}
module.exports={summarizeHandoffs,acceptCompletedLegs,acceptCompletedStops,actualFields};
