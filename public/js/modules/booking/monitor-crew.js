// Display confirmed crew only. This does not allocate pay or customer revenue.
function monitorAssignedCrew(order) {
    const snapshot=order._confirmedCrew;
    if(snapshot)return {plate:snapshot.plate||'',driver:snapshot.driver||'',leg:snapshot.leg_no,
        label:snapshot.stop_id?'จุดฝาก · ยืนยันแล้ว':['','PICK UP','DELIVERY','RETURN'][snapshot.leg_no]+' · ยืนยันแล้ว'};
    // Legacy work has no handoff history: use completed work, never a future assignment.
    let current={plate:order.leg1_plate||'',driver:order.leg1_driver||'',leg:1,label:'PICK UP · ข้อมูลเดิม'};
    const done=value=>value===true||value==='true';
    const stops=Array.isArray(order.confirmed_stops)?order.confirmed_stops:[];
    function useStops(segment) {
        for(const stop of stops.filter(s=>s.segment===segment&&(done(s.completed)||s.actual_at)).sort((a,b)=>a.position-b.position)){
            if(stop.plate||stop.driver)current={plate:stop.plate||'',driver:stop.driver||'',leg:null,label:'จุดฝาก '+(stop.location||'')+' · ข้อมูลเดิม'};
        }
    }
    useStops('after_pickup');
    if(done(order.leg2_completed)||order.actual_load_date){
        if(order.leg2_plate||order.leg2_driver)current={plate:order.leg2_plate||'',driver:order.leg2_driver||'',leg:2,label:'DELIVERY · ข้อมูลเดิม'};
    }
    useStops('after_delivery');
    if(done(order.leg3_completed)||order.actual_return_date){
        if(order.leg3_plate||order.leg3_driver)current={plate:order.leg3_plate||'',driver:order.leg3_driver||'',leg:3,label:'RETURN · ข้อมูลเดิม'};
    }
    return current;
}

function monitorCrewText(value) {
    return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
