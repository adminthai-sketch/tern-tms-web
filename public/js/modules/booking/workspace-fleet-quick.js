let workspaceFleetOffers=Promise.resolve();
const workspaceFleetOffered=new Set();
function workspaceNewFleetDialog(kind,value='') {
    return new Promise(resolve=>{
        const {dialog,close}=workspaceDialog(kind==='truck'?'เพิ่มทะเบียนรถในข้อมูลหลัก':'เพิ่มคนขับในข้อมูลหลัก','blue');
        const form=document.createElement('form');form.className='grid gap-3';
        const note=document.createElement('p');note.className='text-xs text-slate-500';note.textContent='บันทึกในข้อมูลหลักเพื่อเลือกใช้ในเที่ยวถัดไป หรือปิดเพื่อใช้เฉพาะเที่ยวนี้';form.append(note);
        const fields=kind==='truck'?[['plate_number','ทะเบียนรถ',true],['vehicle_type','ประเภทรถ',true],['brand','ยี่ห้อ',false],['model','รุ่น',false]]:
            [['driver_name','ชื่อ–นามสกุล',true],['nickname','ชื่อเล่น',false],['phone_number','เบอร์โทรศัพท์',false]];
        const inputs={};
        for(const [key,caption,required] of fields){
            const label=document.createElement('label');label.className='text-sm';label.textContent=caption+(required?' *':'');
            const input=document.createElement('input');input.name=key;input.required=required;input.maxLength=key==='vehicle_type'||key==='phone_number'?50:100;
            input.className='w-full border rounded px-3 py-2 mt-1';if(key===fields[0][0])input.value=value;
            inputs[key]=input;label.append(input);form.append(label);
        }
        const message=document.createElement('p');message.className='text-sm text-rose-700';message.setAttribute('role','alert');
        const save=document.createElement('button');save.type='submit';save.className='bg-blue-700 text-white rounded px-4 py-2';save.textContent='บันทึกในข้อมูลหลัก';
        let saved=null;
        form.onsubmit=async event=>{
            event.preventDefault();save.disabled=true;
            try{
                const result=await tmsAuthenticatedRequest('/api/dispatch/fleet/quick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()]))})});
                saved=result.data;await loadFleetData();
                // Column autocomplete sources retain these arrays until the next render.
                if(typeof hotGridInstance!=='undefined'&&hotGridInstance){
                    const position=workspaceCaptureScroll();
                    const columns=hotGridInstance.getSettings().columns;
                    for(const column of columns){if(column.data.endsWith('_plate'))column.source=globalTruckList;if(column.data.endsWith('_driver'))column.source=globalDriverList;}
                    hotGridInstance.updateSettings({columns});
                    workspaceRestoreScroll(position);
                }
                close();
            }catch(e){message.textContent=e.message;}finally{save.disabled=false;}
        };
        form.append(message,save);dialog.append(form);dialog.addEventListener('close',()=>resolve(saved),{once:true});dialog.showModal();
    });
}
function workspaceOfferNewFleet(changes,source) {
    if(['loadData','fleet-auto'].includes(source))return;
    for(const [,field,old,value] of changes){
        if(typeof field!=='string'||!value||value===old||(!field.endsWith('_plate')&&!field.endsWith('_driver')))continue;
        const kind=field.endsWith('_plate')?'truck':'driver',known=kind==='truck'?globalTruckList:globalDriverList;
        const name=String(value).trim(),key=kind+':'+name.toLowerCase();
        if(!name||known.some(item=>item.toLowerCase()===name.toLowerCase())||workspaceFleetOffered.has(key))continue;
        workspaceFleetOffered.add(key);
        workspaceFleetOffers=workspaceFleetOffers.then(async()=>{
            if(confirm((kind==='truck'?'ทะเบียนรถ ':'คนขับ ')+name+' ยังไม่มีในข้อมูลหลัก ต้องการบันทึกไว้ไหม?'))await workspaceNewFleetDialog(kind,name);
        }).catch(error=>alert(error.message));
    }
}
async function workspaceNewModalFleet(kind,select,leg) {
    const field=kind==='truck'?'plate_number':'driver_name';
    const previous=currentDispatchOrder?.['leg'+leg+(kind==='truck'?'_plate':'_driver')]||'';
    select.value=previous;
    const saved=await workspaceNewFleetDialog(kind);
    fillFleetOptions(select,kind==='truck'?globalTruckList:globalDriverList,saved?.[field]||previous,kind==='truck'?'-- เลือกรถ --':'-- เลือกคนขับ --');
}
