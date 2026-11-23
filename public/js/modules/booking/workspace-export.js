function workspaceExportRows(instance, mode, selected) {
    return instance.getData().map((_,visual)=>instance.getSourceDataAtRow(instance.toPhysicalRow(visual)))
        .filter(row=>row && (mode==='all'||selected.has(row.order_id)));
}
window.exportToExcel = async function() {
    const {dialog} = workspaceDialog('ดาวน์โหลด Excel', 'blue');
    const allFields=[['order_id','Order ID'],['booking_no','Booking'],...Object.values(workspaceGroups).flatMap(g=>g.fields).filter(([key])=>!key.startsWith('_'))];
    const visibleRows=()=>workspaceExportRows(hotGridInstance,'all',workspaceSelected);
    const picked=()=>workspaceExportRows(hotGridInstance,'selected',workspaceSelected);
    const customerIds=[...new Set(visibleRows().map(r=>r.customer_id).filter(Boolean))];
    const customerId=customerIds.length===1?customerIds[0]:null;
    const customerName=visibleRows()[0]?.customer_name||'';
    const rowsMode=document.createElement('select');rowsMode.className='w-full rounded-lg border border-blue-200 bg-blue-50 p-3 my-3 text-sm';
    rowsMode.add(new Option(`แถวที่ติ๊ก — ${picked().length} เที่ยว`,'selected'));
    rowsMode.add(new Option(`ทั้งหมดตามตัวกรอง — ${visibleRows().length} เที่ยว`,'all'));
    rowsMode.value=picked().length?'selected':'all';
    const settings=document.createElement('details');settings.className='border rounded-lg p-3 my-3';
    const summary=document.createElement('summary');summary.textContent='ปรับคอลัมน์ / บันทึกรูปแบบ';summary.className='cursor-pointer text-sm font-semibold text-blue-800';
    const template=document.createElement('select'),scope=document.createElement('select'),name=document.createElement('input');
    for(const input of [template,scope,name])input.className='w-full border rounded-lg p-2 my-2 text-sm';
    template.setAttribute('aria-label','รูปแบบ Excel');scope.setAttribute('aria-label','บันทึกส่วนตัวหรือผูกลูกค้า');name.setAttribute('aria-label','ชื่อรูปแบบ');
    name.placeholder='ตั้งชื่อรูปแบบ';template.add(new Option('รูปแบบใหม่ / ทุกคอลัมน์',''));
    scope.add(new Option('รูปแบบส่วนตัว',''));
    if(customerId)scope.add(new Option('ผูกกับลูกค้า '+customerName,String(customerId)));
    const host=document.createElement('div');host.className='max-h-60 overflow-auto my-2';
    const preview=document.createElement('p');preview.className='text-xs text-slate-600 my-3';
    let ordered=allFields.map(([key])=>key),chosen=new Set(ordered),templates=[],templatesLoaded=false;
    const selectedRows=()=>workspaceExportRows(hotGridInstance,rowsMode.value,workspaceSelected);
    function update(){preview.textContent=`${selectedRows().length} เที่ยว · ${ordered.filter(k=>chosen.has(k)).length} คอลัมน์ · ข้อมูลตามตัวกรองปัจจุบัน`;}
    function render(){
        host.replaceChildren();
        for(const key of ordered){
            const row=document.createElement('div');row.className='flex gap-2 items-center py-1';
            const label=document.createElement('label');label.className='flex gap-2 items-center flex-1 text-sm';
            const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=chosen.has(key);
            checkbox.onchange=()=>{checkbox.checked?chosen.add(key):chosen.delete(key);update();};
            label.append(checkbox,document.createTextNode(allFields.find(([field])=>field===key)[1]));row.append(label);
            for(const [text,delta] of [['↑',-1],['↓',1]]){
                const button=document.createElement('button');button.type='button';button.textContent=text;button.className='px-2 text-blue-700';
                button.setAttribute('aria-label',text+' '+allFields.find(([field])=>field===key)[1]);
                button.onclick=()=>{const i=ordered.indexOf(key),j=i+delta;if(j<0||j>=ordered.length)return;[ordered[i],ordered[j]]=[ordered[j],ordered[i]];render();};
                row.append(button);
            }
            host.append(row);
        }
        update();
    }
    function chooseTemplate(item){
        if(!item){ordered=allFields.map(([key])=>key);chosen=new Set(ordered);name.value='';scope.value='';render();return;}
        name.value=item.name;scope.value=String(item.customer_id||'');
        const valid=item.columns.filter(k=>allFields.some(([field])=>field===k));
        ordered=[...valid,...allFields.map(([key])=>key).filter(k=>!valid.includes(k))];chosen=new Set(valid);render();
    }
    template.onchange=()=>chooseTemplate(templates.find(t=>String(t.id)===template.value));
    rowsMode.onchange=update;
    const save=document.createElement('button');save.type='button';save.textContent='บันทึกรูปแบบ';save.className='border rounded-lg px-4 py-2 text-sm text-blue-800';
    async function saveTemplate(asNew=false){
        const columns=ordered.filter(k=>chosen.has(k));
        if(!name.value.trim()||!columns.length)throw Error('กรุณาตั้งชื่อและเลือกอย่างน้อย 1 คอลัมน์');
        const existing=templates.find(t=>String(t.id)===template.value);
        const id=!asNew&&existing&&String(existing.owner_id)===String(workspaceUser.id)?existing.id:undefined;
        const result=await workspaceRequest('/api/dispatch/templates',{id,name:name.value.trim(),customer_id:scope.value||null,columns});
        templates=templates.filter(t=>String(t.id)!==String(result.data.id));templates.push(result.data);
        template.replaceChildren(new Option('รูปแบบใหม่ / ทุกคอลัมน์',''));
        for(const item of templates)template.add(new Option(item.name,item.id));
        template.value=String(result.data.id);localStorage.setItem('dispatch-excel-template-'+workspaceUser.id,template.value);
    }
    save.onclick=async()=>{save.disabled=true;try{await saveTemplate();alert('บันทึกรูปแบบแล้ว');}catch(e){alert(e.message);}finally{save.disabled=false;}};
    const copy=document.createElement('button');copy.type='button';copy.textContent='บันทึกเป็นรูปแบบใหม่';copy.className=save.className+' ml-2';
    copy.onclick=async()=>{copy.disabled=true;try{await saveTemplate(true);alert('บันทึกเป็นรูปแบบใหม่แล้ว');}catch(e){alert(e.message);}finally{copy.disabled=false;}};
    const download=document.createElement('button');download.type='button';
    download.textContent=workspaceDirty.size?'บันทึกแล้วดาวน์โหลด Excel':'ดาวน์โหลด Excel';
    download.className='w-full rounded-lg bg-emerald-600 text-white font-semibold px-4 py-3';
    download.onclick=async()=>{
        const fields=ordered.filter(k=>chosen.has(k)),ids=selectedRows().map(r=>r.order_id);
        if(!fields.length||!ids.length)return alert('เลือกอย่างน้อย 1 แถว และ 1 คอลัมน์');
        download.disabled=true;
        try{
            if(workspaceDirty.size&&!await saveGridChanges())return;
            const byId=new Map(rawShipmentList.map(row=>[row.order_id,row]));
            const rows=ids.map(id=>byId.get(id));
            if(rows.some(row=>!row))throw Error('มีเที่ยวเปลี่ยนแปลง กรุณาปิดแล้วเปิดดาวน์โหลดใหม่');
            if(templatesLoaded&&customerId&&!templates.some(t=>String(t.customer_id)===String(customerId))&&confirm('ลูกค้านี้ยังไม่มีรูปแบบ Excel ต้องการบันทึกรูปแบบนี้ไว้ใช้ครั้งถัดไปไหม?')){
                scope.value=String(customerId);name.value=name.value.trim()||customerName+' Excel';await saveTemplate();
            }
            // aoa_to_sheet stores user text as string cells, never executable formula objects.
            const sheet=XLSX.utils.aoa_to_sheet([fields.map(k=>allFields.find(([field])=>field===k)[1]),...rows.map(row=>fields.map(key=>row[key]??''))]);
            const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Dispatch Data');XLSX.writeFile(book,'TMS_Export_'+Date.now()+'.xlsx');
        }catch(e){alert(e.message);}finally{download.disabled=false;download.textContent=workspaceDirty.size?'บันทึกแล้วดาวน์โหลด Excel':'ดาวน์โหลด Excel';}
    };
    settings.append(summary,template,name,scope,host,save,copy);dialog.append(rowsMode,preview,download,settings);render();dialog.showModal();
    try{
        const response=await fetch('/api/dispatch/templates?'+new URLSearchParams({user_id:workspaceUser.id,customer_id:customerId||''}));
        const result=await response.json();if(!response.ok||!result.success)throw Error('โหลดรูปแบบเดิมไม่สำเร็จ');
        templatesLoaded=true;templates=result.data.filter(t=>!t.customer_id||(customerId&&String(t.customer_id)===String(customerId)));for(const item of templates)template.add(new Option(item.name,item.id));
        const preferred=templates.find(t=>customerId&&String(t.customer_id)===String(customerId))||templates.find(t=>String(t.id)===localStorage.getItem('dispatch-excel-template-'+workspaceUser.id));
        if(preferred){template.value=String(preferred.id);chooseTemplate(preferred);}
    }catch(e){preview.textContent+=' · โหลดรูปแบบเดิมไม่ได้ ใช้รูปแบบปัจจุบันได้';}
};
