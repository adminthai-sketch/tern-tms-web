async function workspaceAcceptCrew(order,target,crew) {
    if(!workspaceReady())return;
    const plate=crew?crew.plate:order['leg'+target.leg_no+'_plate'];
    const driver=crew?crew.driver:order['leg'+target.leg_no+'_driver'];
    if(!plate&&!driver)return alert('กรุณาจัดรถและคนขับ แล้วบันทึกก่อนยืนยันรับช่วง');
    if(!confirm(`ยืนยัน ${plate||'ไม่ระบุรถ'} · ${driver||'ไม่ระบุคนขับ'} รับผิดชอบ ${order.order_id} ที่จุดนี้?`))return;
    try {
        await tmsAuthenticatedRequest('/api/dispatch/handoffs/'+encodeURIComponent(order.order_id),{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...target,expected_plate:plate||'',expected_driver:driver||''})
        });
        document.getElementById('dispatch-stage-help').textContent='ยืนยันรับช่วงแล้ว · '+order.order_id+' · '+(driver||plate)+' · Monitor จะแสดงหลังรีเฟรช';
    }catch(e){alert(e.message);}
}
function workspaceHandoffRenderer(instance,td,visual,col,prop,value,properties) {
    Handsontable.renderers.TextRenderer(instance,td,visual,col,prop,value,properties);td.replaceChildren();
    const leg_no={_accept_pickup:1,_accept_delivery:2,_accept_returns:3}[prop];
    const row=instance.getSourceDataAtRow(instance.toPhysicalRow(visual));
    const button=document.createElement('button');button.type='button';button.className='workspace-copy-button';button.textContent='✓ ยืนยันรับช่วง';
    button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
    button.onclick=async event=>{event.stopPropagation();button.disabled=true;try{await workspaceAcceptCrew(row,{leg_no});}finally{button.disabled=false;}};
    td.append(button);
}
