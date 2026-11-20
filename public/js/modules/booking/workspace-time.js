function workspaceEditTime(visual,field) {
    if (!hotGridInstance) return;
    const physical=hotGridInstance.toPhysicalRow(visual);
    const row=hotGridInstance.getSourceDataAtRow(physical);
    const {dialog,close}=workspaceDialog('วันเวลา · '+row.order_id+' · '+field);
    const input=document.createElement('input');input.type='datetime-local';input.className='border rounded p-3';input.value=String(row[field]||'').replace(' ','T').slice(0,16);
    const now=document.createElement('button');now.textContent='ลงเวลาตอนนี้';now.onclick=()=>{input.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date()).replace(' ','T');};
    const clear=document.createElement('button');clear.textContent='ล้างเวลา';clear.onclick=()=>{input.value='';};
    const save=document.createElement('button');save.textContent='ใช้เวลานี้';save.className='bg-blue-800 text-white p-2 rounded';save.onclick=()=>{
        if(!input.reportValidity())return;
        const current=hotGridInstance.getSourceData().findIndex(item=>item.order_id===row.order_id);
        const target=hotGridInstance.toVisualRow(current);if(target==null)return;
        hotGridInstance.setDataAtRowProp(target,field,input.value?input.value.replace('T',' ')+':00':null);
        dialog.close();
    };
    dialog.append(input,now,clear,save,close);dialog.showModal();
}
