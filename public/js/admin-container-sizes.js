let sizeMasterRows=[],editingSize=null;
const sizeEl=id=>document.getElementById(id);
function sizeReset() {
    editingSize=null;sizeEl('size-form').reset();sizeEl('size-save').textContent='เพิ่มประเภทตู้';
}
function sizeRender() {
    const query=sizeEl('size-search').value.trim().toLowerCase(),host=sizeEl('size-rows');host.replaceChildren();
    for(const item of sizeMasterRows.filter(row=>(sizeEl('size-inactive').checked||row.is_active) && (row.size_name+' '+row.description).toLowerCase().includes(query))){
        const tr=document.createElement('tr');tr.className='border-t';
        for(const text of [item.size_name,item.description||'—',item.is_active?'เปิดใช้งาน':'ปิดใช้งาน']){const td=document.createElement('td');td.className='p-3';td.textContent=text;tr.append(td);}
        const td=document.createElement('td');td.className='p-3';const button=document.createElement('button');button.textContent='แก้ไข';button.className='text-blue-800 font-semibold';
        button.onclick=()=>{editingSize=item;sizeEl('size-code').value=item.size_name;sizeEl('size-description').value=item.description;sizeEl('size-active').checked=item.is_active;sizeEl('size-save').textContent='บันทึกการแก้ไข';sizeEl('size-code').focus();};
        td.append(button);
        const toggle=document.createElement('button');
        toggle.type='button';toggle.className='ml-4 font-semibold '+(item.is_active?'text-rose-700':'text-emerald-700');
        toggle.textContent=item.is_active?'ลบจากตัวเลือก':'เปิดใช้งานอีกครั้ง';
        toggle.onclick=async()=>{
            if(item.is_active&&!confirm('นำ '+item.size_name+' ออกจากตัวเลือกสำหรับงานใหม่? ข้อมูลในงานเก่าจะยังอยู่ และเปิดกลับได้'))return;
            toggle.disabled=true;
            try{
                await tmsAuthenticatedRequest('/api/admin/container-sizes/'+encodeURIComponent(item.size_name),{
                    method:'PUT',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({...item,is_active:!item.is_active})
                });
                sizeReset();await sizeLoad();
                sizeEl('size-message').textContent=item.is_active?'นำออกจากตัวเลือกแล้ว งานเก่ายังอยู่ครบ':'เปิดใช้งานอีกครั้งแล้ว';
            }catch(e){sizeEl('size-message').textContent=e.message;}finally{toggle.disabled=false;}
        };
        td.append(toggle);tr.append(td);host.append(tr);
    }
}
async function sizeLoad(){
    try {const result=await tmsAuthenticatedRequest('/api/admin/container-sizes');sizeMasterRows=result.data;sizeRender();sizeEl('size-setup').hidden=result.schema_ready;sizeEl('size-save').disabled=!result.schema_ready;sizeEl('size-message').textContent=result.schema_ready?`ทั้งหมด ${sizeMasterRows.length} รายการ`:'กดเปิดใช้งานครั้งแรกเพื่อเพิ่มคำอธิบาย สถานะ และประวัติรับช่วง ข้อมูลใบงานเดิมจะไม่ถูกเปลี่ยน';}
    catch(e){sizeEl('size-message').textContent=e.message;}
}
sizeEl('size-form').onsubmit=async event=>{
    event.preventDefault();sizeEl('size-save').disabled=true;
    try {
        const body={size_name:sizeEl('size-code').value,description:sizeEl('size-description').value,is_active:sizeEl('size-active').checked,revision:editingSize?.revision};
        const url='/api/admin/container-sizes'+(editingSize?'/'+encodeURIComponent(editingSize.size_name):'');
        await tmsAuthenticatedRequest(url,{method:editingSize?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        sizeReset();await sizeLoad();sizeEl('size-message').textContent='บันทึกเรียบร้อยแล้ว';
    }catch(e){sizeEl('size-message').textContent=e.message;}finally{sizeEl('size-save').disabled=false;}
};
sizeEl('size-search').oninput=sizeRender;sizeEl('size-inactive').onchange=sizeRender;
sizeEl('size-reset').onclick=sizeReset;sizeEl('size-refresh').onclick=sizeLoad;sizeLoad();
sizeEl('size-setup').onclick=async()=>{
    sizeEl('size-setup').disabled=true;
    try{await tmsAuthenticatedRequest('/api/admin/master-setup',{method:'POST'});await sizeLoad();}
    catch(e){sizeEl('size-message').textContent=e.message;}
    finally{sizeEl('size-setup').disabled=false;}
};
