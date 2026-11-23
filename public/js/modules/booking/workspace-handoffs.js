async function workspaceLoadHandoffs(rows) {
    const month=document.getElementById('filter-month').value;
    if(!month)return;
    const [year,monthNumber]=month.split('-');
    try{
        const response=await fetch('/api/dispatch/handoffs?'+new URLSearchParams({year,month:monthNumber}));
        const result=await response.json();
        if(!response.ok||!result.success)throw Error('โหลดสถานะรับช่วงไม่สำเร็จ');
        const map=new Map(result.data.map(item=>[item.order_id,item]));
        for(const row of rows){row._handoffs=map.get(row.order_id)||null;row._handoffsUnavailable=!result.available;}
    }catch(e){
        for(const row of rows)row._handoffsUnavailable=true;
        document.getElementById('dispatch-stage-help').textContent=e.message+' กรุณาโหลดใหม่ก่อนยืนยันรับช่วง';
    }
}
function workspaceTargetHandoff(row,target) {
    return row._handoffs?.targets?.find(item=>target.stop_id?item.stop_id===target.stop_id:item.leg_no===target.leg_no&&!item.stop_id);
}
async function workspaceAcceptCrew(order,target,crew,cancellation) {
    if(!workspaceReady())return;
    const plate=crew?crew.plate:order['leg'+target.leg_no+'_plate'];
    const driver=crew?crew.driver:order['leg'+target.leg_no+'_driver'];
    if(!cancellation&&!plate&&!driver)return alert('กรุณาจัดรถและคนขับ แล้วบันทึกก่อนยืนยันรับช่วง');
    let saved=false;
    try {
        await tmsAuthenticatedRequest('/api/dispatch/handoffs/'+encodeURIComponent(order.order_id),{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...target,expected_plate:plate||'',expected_driver:driver||'',...(cancellation?{cancel:true,expected_handoff_id:cancellation.id}:{})})
        });
        saved=true;
        if(typeof rawShipmentList!=='undefined')await workspaceLoadHandoffs(rawShipmentList);
        if(typeof hotGridInstance!=='undefined')hotGridInstance?.render();
        document.getElementById('dispatch-stage-help').textContent=(cancellation?'ยกเลิกรับช่วงแล้ว':'ยืนยันรับช่วงแล้ว')+' · '+order.order_id+' · Monitor จะแสดงหลังรีเฟรช';
        return true;
    }catch(e){alert((saved?'บันทึกแล้ว แต่โหลดสถานะใหม่ไม่สำเร็จ: ':'')+e.message);return false;}
}
function workspaceEditHandoff(order,target,active,crew,onchange) {
    if(!workspaceReady())return;
    const {dialog,close}=workspaceDialog('แก้ไขสถานะรับช่วง','blue');
    const info=document.createElement('p');info.className='text-sm my-3';info.textContent='รับช่วงแล้ว: '+[active.plate,active.driver].filter(Boolean).join(' · ');
    const cancel=document.createElement('button');cancel.type='button';cancel.className='border border-rose-200 text-rose-700 rounded px-3 py-2 text-sm';cancel.textContent='ยกเลิกการรับช่วงครั้งนี้';
    cancel.onclick=async()=>{cancel.disabled=true;if(await workspaceAcceptCrew(order,target,crew,active)){close();onchange?.();}else cancel.disabled=false;};
    dialog.append(info,cancel);
    const plate=crew?crew.plate:order['leg'+target.leg_no+'_plate'],driver=crew?crew.driver:order['leg'+target.leg_no+'_driver'];
    if((plate||'')!==(active.plate||'')||(driver||'')!==(active.driver||'')){
        const update=document.createElement('button');update.type='button';update.className='bg-blue-700 text-white rounded px-3 py-2 text-sm ml-2';update.textContent='รับช่วงด้วยรถ / คนขับที่แก้ไข';
        update.onclick=async()=>{update.disabled=true;if(await workspaceAcceptCrew(order,target,crew)){close();onchange?.();}else update.disabled=false;};dialog.append(update);
    }
    dialog.showModal();
}
function workspaceHandoffRenderer(instance,td,visual,col,prop,value,properties) {
    Handsontable.renderers.TextRenderer(instance,td,visual,col,prop,value,properties);td.replaceChildren();
    const leg_no={_accept_pickup:1,_accept_delivery:2,_accept_returns:3}[prop];
    const row=instance.getSourceDataAtRow(instance.toPhysicalRow(visual)),target={leg_no},active=workspaceTargetHandoff(row,target);
    const button=document.createElement('button');button.type='button';button.className='workspace-handoff-button'+(active?' is-accepted':'');
    button.textContent=row._handoffsUnavailable?'โหลดสถานะใหม่':active?'✓ รับช่วงแล้ว · แก้ไข':'รับช่วงงาน';
    button.title=active?[active.plate,active.driver,'กดเพื่อแก้ไขหรือยกเลิก'].filter(Boolean).join(' · '):'ใช้รถและคนขับที่บันทึกในขานี้';
    button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
    button.onclick=async event=>{
        event.stopPropagation();button.disabled=true;
        try{
            if(row._handoffsUnavailable){await workspaceLoadHandoffs(rawShipmentList);instance.render();}
            else if(active)workspaceEditHandoff(row,target,active);
            else await workspaceAcceptCrew(row,target);
        }finally{button.disabled=false;}
    };
    td.append(button);
}
