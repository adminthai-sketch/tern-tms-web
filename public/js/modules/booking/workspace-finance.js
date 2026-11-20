function workspaceDialog(title) {
    const dialog=document.createElement('dialog');dialog.className='rounded-xl p-6 w-full max-w-3xl shadow-xl';
    const heading=document.createElement('h2');heading.textContent=title;heading.className='font-bold text-lg mb-4';
    const close=document.createElement('button');close.textContent='ปิด';close.className='border rounded px-3 py-2 mt-4';close.onclick=()=>{dialog.close();dialog.remove();};
    dialog.append(heading);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    return {dialog,close};
}
window.openWorkspaceRevenue=function() {
    if(!workspaceReady())return;
    const selected=rawShipmentList.filter(row=>workspaceSelected.has(row.order_id));
    if(selected.length!==1)return alert('เลือกหนึ่งเที่ยวเพื่อลงรายได้เพิ่ม');
    const order=selected[0];
    const {dialog,close}=workspaceDialog('รายได้เพิ่ม · '+order.order_id);
    const host=document.createElement('div');dialog.append(host);
    const addRow=(item={})=>{
        const row=document.createElement('div');row.className='flex gap-2 mb-2';
        for(const [key,placeholder]of [['type','ประเภท เช่น OT'],['amount','จำนวนเงิน'],['note','หมายเหตุ']]){
            const input=document.createElement('input');input.name=key;input.value=item[key]??'';input.placeholder=placeholder;input.className='border rounded p-2 min-w-0';
            if(key==='amount'){input.type='number';input.min='0.01';input.step='0.01';}row.append(input);
        }
        const remove=document.createElement('button');remove.textContent='ลบ';remove.onclick=()=>row.remove();row.append(remove);host.append(row);
    };
    (order.additional_revenue||[]).forEach(addRow);
    const add=document.createElement('button');add.textContent='+ เพิ่มรายการ';add.onclick=()=>addRow();
    const save=document.createElement('button');save.textContent='บันทึกรายได้';save.className='bg-blue-800 text-white rounded p-2 mx-3';
    save.onclick=async()=>{
        save.disabled=true;
        try{
            const items=Array.from(host.children,row=>({type:row.querySelector('[name="type"]').value,amount:Number(row.querySelector('[name="amount"]').value),note:row.querySelector('[name="note"]').value}));
            let reason='';if(order.iv_no||order.ar_no){reason=prompt('เหตุผลเปิดแก้เอกสาร');if(!reason)return;}
            await workspaceRequest('/api/dispatch/finance',{data:[{order_id:order.order_id,additional_revenue:items}],reopen_reason:reason});
            dialog.close();await loadContainerGridData();
        }catch(error){alert(error.message);}finally{save.disabled=false;}
    };
    dialog.append(add,save,close);dialog.showModal();
};
window.openWorkspaceBilling=function(){
    if(!workspaceReady())return;
    const booking=document.getElementById('filter-booking-no').value.trim();
    if(!booking)return alert('เลือก Booking ก่อนเปิดวางบิล');
    location.href='/billing-detail.html?'+new URLSearchParams({booking,month:loadedDispatchMonth});
};
window.addEventListener('DOMContentLoaded',()=>{
    const host=document.getElementById('dispatch-stage-tabs').parentElement;
    for(const [title,action]of [['เพิ่มรายได้ของเที่ยวที่เลือก',openWorkspaceRevenue],['เปิดวางบิล / พิมพ์ใบปะหน้า',openWorkspaceBilling]]){
        const button=document.createElement('button');button.textContent=title;button.className='m-1 border rounded px-3 py-2 text-xs bg-violet-50';button.onclick=action;host.append(button);
    }
});
