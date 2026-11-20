window.exportToExcel=async function(){
    if(workspaceDirty.size && !await saveGridChanges())return;
    const {dialog,close}=workspaceDialog('ดาวน์โหลด Excel');
    const allFields=[['order_id','Order ID'],['booking_no','Booking'],...Object.values(workspaceGroups).flatMap(group=>group.fields)];
    const template=document.createElement('select');template.className='border rounded p-2';template.add(new Option('รูปแบบใหม่',''));
    const name=document.createElement('input');name.placeholder='ชื่อรูปแบบ';name.className='border rounded p-2';
    const scope=document.createElement('select');scope.add(new Option('รูปแบบส่วนตัว',''));const customerIds=[...new Set(filteredList.map(row=>row.customer_id).filter(Boolean))];
    if(customerIds.length===1)scope.add(new Option('ผูกลูกค้า '+(filteredList[0]?.customer_name||''),customerIds[0]));
    const rowsMode=document.createElement('select');rowsMode.add(new Option('ทุกแถวตามตัวกรอง','all'));rowsMode.add(new Option('เฉพาะที่ติ๊ก','selected'));
    const host=document.createElement('div');host.className='max-h-80 overflow-auto border rounded my-3';
    let ordered=allFields.map(([key])=>key);
    let chosen=new Set(ordered);
    let templates=[];
    const preview=document.createElement('p');preview.className='text-sm my-2';
    const selectedRows=()=>hotGridInstance.getData().map((_,visual)=>hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(visual))).filter(row=>rowsMode.value==='all'||workspaceSelected.has(row.order_id));
    function render(){
        host.replaceChildren();
        for(const key of ordered){
            const label=allFields.find(([field])=>field===key)?.[1];if(!label)continue;
            const row=document.createElement('div');row.className='flex gap-2 p-1';
            const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=chosen.has(key);checkbox.onchange=()=>{if(checkbox.checked)chosen.add(key);else chosen.delete(key);update();};
            row.append(checkbox,document.createTextNode(label));
            for(const [title,delta]of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.textContent=title;button.onclick=()=>{const index=ordered.indexOf(key),next=index+delta;if(next<0||next>=ordered.length)return;[ordered[index],ordered[next]]=[ordered[next],ordered[index]];render();};row.append(button);}host.append(row);
        }update();
    }
    function update(){preview.textContent=selectedRows().length+' แถว · '+ordered.filter(key=>chosen.has(key)).map(key=>allFields.find(([field])=>field===key)?.[1]).join(' | ');}
    rowsMode.onchange=update;
    for(const group of Object.values(workspaceGroups)){
        const button=document.createElement('button');button.textContent=group.label;button.className='border rounded p-1 m-1';button.onclick=()=>{const enable=!group.fields.every(([key])=>chosen.has(key));for(const [key]of group.fields)if(enable)chosen.add(key);else chosen.delete(key);render();};dialog.append(button);
    }
    template.onchange=()=>{const item=templates.find(t=>String(t.id)===template.value);if(!item)return;name.value=item.name;scope.value=String(item.customer_id||'');ordered=[...item.columns.filter(key=>allFields.some(([field])=>field===key)),...allFields.map(([key])=>key).filter(key=>!item.columns.includes(key))];chosen=new Set(item.columns);render();};
    const save=document.createElement('button');save.textContent='บันทึกรูปแบบ';save.onclick=async()=>{
        try{const result=await workspaceRequest('/api/dispatch/templates',{id:template.value||undefined,name:name.value,customer_id:scope.value||null,columns:ordered.filter(key=>chosen.has(key))});templates=templates.filter(t=>t.id!==result.data.id);templates.push(result.data);template.add(new Option(result.data.name,result.data.id));template.value=result.data.id;alert('บันทึกรูปแบบแล้ว');}catch(error){alert(error.message);}
    };
    const download=document.createElement('button');download.textContent='ดาวน์โหลด';download.className='bg-green-700 text-white p-2 rounded mx-2';download.onclick=()=>{
        const fields=ordered.filter(key=>chosen.has(key));const rows=selectedRows();if(!fields.length||!rows.length)return alert('เลือกแถวและคอลัมน์');
        const sheet=XLSX.utils.aoa_to_sheet([fields.map(key=>allFields.find(([field])=>field===key)[1]),...rows.map(row=>fields.map(key=>row[key]??''))]);
        // aoa_to_sheet stores text as string cells, including leading =, +, - and @.
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Dispatch');XLSX.writeFile(book,'TMS-dispatch.xlsx');
    };
    dialog.prepend(template,name,scope,rowsMode);dialog.append(host,preview,save,download,close);render();dialog.showModal();
    try{const response=await fetch('/api/dispatch/templates?'+new URLSearchParams({user_id:workspaceUser.id,customer_id:customerIds.length===1?customerIds[0]:''}));const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message);templates=result.data;for(const item of templates)template.add(new Option(item.name,item.id));}catch(error){preview.textContent=error.message+' · ยังดาวน์โหลดโดยเลือกรูปแบบเองได้';}
};
