let stopEditorDirty = false;
window.openWorkspaceStops = async function(order) {
    if (!workspaceReady()) return;
    const {dialog,close} = workspaceDialog('เส้นทางฝากตู้ · '+order.order_id);
    const host=document.createElement('div');dialog.append(host);dialog.showModal();
    const listKey=crypto.randomUUID();
    for(const [name,values]of [['plates',globalTruckList],['drivers',globalDriverList]]){
        const list=document.createElement('datalist');list.id='stop-'+name+'-'+listKey;
        for(const value of values)list.append(new Option(value,value));dialog.append(list);
    }
    close.onclick=()=>{if(!stopEditorDirty||confirm('ปิดโดยไม่บันทึกจุดฝาก?'))dialog.close();};
    let stops=[],base=[];
    const input=(row,field,label,type='text')=>{
        const wrapper=document.createElement('label');wrapper.className='text-xs flex flex-col gap-1';wrapper.textContent=label;
        const element=document.createElement('input');element.type=type;element.className='border rounded p-2';
        if(field==='plate'||field==='driver')element.setAttribute('list','stop-'+(field==='plate'?'plates':'drivers')+'-'+listKey);
        if(type==='checkbox')element.checked=row[field];else element.value=type==='datetime-local'?String(row[field]||'').replace(' ','T').slice(0,16):row[field]||'';
        element.onchange=()=>{row[field]=type==='checkbox'?element.checked:element.value||null;stopEditorDirty=true;};
        wrapper.append(element);return wrapper;
    };
    function render(){
        host.replaceChildren();
        for(const [segment,before,after] of [['after_pickup','PICK UP · รับตู้','DELIVERY · โรงงาน'],['after_delivery','DELIVERY · โรงงาน','RETURN · ส่งหรือคืนตู้']]){
            const heading=document.createElement('h3');heading.textContent=before+' → '+after;heading.className='font-bold bg-blue-50 p-3 my-3';host.append(heading);
            const items=stops.filter(stop=>stop.segment===segment).sort((a,b)=>a.position-b.position);
            items.forEach((stop,index)=>{
                const card=document.createElement('section');card.className='border border-amber-300 rounded p-3 my-2';
                const title=document.createElement('p');title.textContent='จุดฝาก '+(index+1)+' · รถที่นำตู้มาถึงจุดนี้';title.className='font-bold mb-2';card.append(title);
                const fields=document.createElement('div');fields.className='grid grid-cols-2 gap-2';
                for(const args of [['location','ลาน / สถานที่'],['plate','ทะเบียนรถ'],['driver','คนขับ'],['appointment','เวลานัด','datetime-local'],['actual_at','เวลาฝากจริง','datetime-local'],['completed','ฝากสำเร็จ','checkbox']])fields.append(input(stop,...args));card.append(fields);
                const accept=document.createElement('button');accept.textContent='✓ ยืนยันรถนำตู้มาฝาก';accept.className='border rounded px-2 py-1 mt-2 bg-emerald-50 text-emerald-800';
                accept.onclick=async()=>{if(stopEditorDirty)return alert('กรุณาบันทึกจุดฝากก่อนยืนยันรถ');accept.disabled=true;try{await workspaceAcceptCrew(order,{stop_id:stop.stop_id},stop);}finally{accept.disabled=false;}};
                card.append(accept);
                for(const [label,action]of [
                    ['ใช้รถจากจุดก่อน',()=>{const previous=items[index-1];const prefix=segment==='after_pickup'?'leg1':'leg2';stop.plate=previous?previous.plate:order[prefix+'_plate'];stop.driver=previous?previous.driver:order[prefix+'_driver'];alert('ใช้ข้อมูลจาก '+(previous?previous.location||'จุดฝากก่อนหน้า':before));}],
                    ['↑',()=>{if(index>0)[items[index].position,items[index-1].position]=[items[index-1].position,items[index].position];}],
                    ['↓',()=>{if(index<items.length-1)[items[index].position,items[index+1].position]=[items[index+1].position,items[index].position];}],
                    ['นำจุดนี้ออก',()=>{if(confirm('นำจุดฝากนี้ออกจากเส้นทาง?'))stops=stops.filter(item=>item!==stop);}]
                ]){const button=document.createElement('button');button.textContent=label;button.className='border rounded px-2 py-1 mr-2 mt-2';button.onclick=()=>{action();stopEditorDirty=true;render();};card.append(button);}host.append(card);
            });
            const add=document.createElement('button');add.textContent='＋ แทรกจุดฝากก่อน '+after;add.className='border border-amber-400 rounded p-2 text-amber-900';add.onclick=()=>{stops.push({stop_id:crypto.randomUUID(),segment,position:(items.at(-1)?.position??-1)+1,completed:false});stopEditorDirty=true;render();};host.append(add);
        }
        const save=document.createElement('button');save.textContent='บันทึกจุดฝากทั้งหมด';save.className='block bg-blue-800 text-white rounded p-3 my-4';save.onclick=async()=>{
            save.disabled=true;
            try{
                const response=await fetch('/api/dispatch/stops/'+encodeURIComponent(order.order_id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({stops,base})});
                const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message);
                stopEditorDirty=false;order._dynamicStops=stops;order.confirmed_stops=stops;order.stop_count=stops.length;dialog.close();hotGridInstance.render();
            }catch(error){alert(error.message);}finally{save.disabled=false;}
        };host.append(save);
    }
    try{
        const response=await fetch('/api/dispatch/stops/'+encodeURIComponent(order.order_id));const result=await response.json();
        if(!response.ok||!result.success)throw new Error(result.message);
        stops=structuredClone(result.data);base=structuredClone(result.data);stopEditorDirty=false;render();
    }catch(error){host.textContent=error.message;}
};
window.addEventListener('DOMContentLoaded',()=>{
    const button=document.createElement('button');button.className='border border-amber-400 bg-amber-50 text-amber-900 rounded px-3 py-2';button.textContent='จัดเส้นทาง / เพิ่มจุดฝาก';
    button.onclick=()=>{const selected=rawShipmentList.filter(row=>workspaceSelected.has(row.order_id));if(selected.length!==1)return alert('เลือกหนึ่งเที่ยวเพื่อจัดจุดฝาก');openWorkspaceStops(selected[0]);};
    document.getElementById('dispatch-primary-views').parentElement.append(button);
});
