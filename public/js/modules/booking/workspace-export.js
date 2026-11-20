window.exportToExcel = async function() {
    if(workspaceDirty.size && !await saveGridChanges()) return;
    const {dialog, close} = workspaceDialog('ดาวน์โหลด Excel (Export Data)', 'blue');
    
    // ดึงฟิลด์ทั้งหมดจาก workspaceGroups 
    const allFields = [['order_id','Order ID'], ['booking_no','Booking No.'], ...Object.values(workspaceGroups).flatMap(g => g.fields)];
    
    const template = document.createElement('select'); template.className = 'border border-slate-300 rounded-lg p-2 text-sm font-bold text-slate-700 w-full mb-3'; template.add(new Option('➕ สร้างรูปแบบใหม่ (New Template)', ''));
    const name = document.createElement('input'); name.placeholder = 'ตั้งชื่อรูปแบบ (เช่น: Format ส่งคุณสมหมาย)'; name.className = 'border border-slate-300 rounded-lg p-2 text-sm w-full mb-3 focus:ring-2 focus:ring-blue-500 outline-none';
    const scope = document.createElement('select'); scope.className = 'border border-slate-300 rounded-lg p-2 text-sm w-full mb-3 bg-slate-50';
    scope.add(new Option('🔒 บันทึกเป็นรูปแบบส่วนตัว (Private)', ''));
    
    const customerIds = [...new Set(filteredList.map(row => row.customer_id).filter(Boolean))];
    if(customerIds.length === 1) scope.add(new Option(`🏢 ผูกกับลูกค้ารายนี้เท่านั้น (${filteredList[0]?.customer_name})`, customerIds[0]));
    
    const rowsMode = document.createElement('select'); rowsMode.className = 'border border-slate-300 rounded-lg p-2 text-sm w-full mb-4 bg-blue-50 text-blue-800 font-bold';
    rowsMode.add(new Option('📂 โหลดข้อมูลทุกแถวที่เห็นในตาราง', 'all'));
    rowsMode.add(new Option('✅ โหลดเฉพาะแถวที่ "ติ๊กถูก" เลือกไว้', 'selected'));
    
    const host = document.createElement('div'); host.className = 'max-h-60 overflow-y-auto border border-slate-200 rounded-lg mb-4 bg-slate-50 p-2 shadow-inner';
    let ordered = allFields.map(([key]) => key); let chosen = new Set(ordered); let templates = [];
    
    const preview = document.createElement('div'); preview.className = 'text-xs font-bold text-slate-500 mb-4 bg-white p-2 rounded border border-slate-200';
    const selectedRows = () => hotGridInstance.getData().map((_, v) => hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(v))).filter(r => rowsMode.value === 'all' || workspaceSelected.has(r.order_id));
    
    function render() {
        host.replaceChildren();
        ordered.forEach(key => {
            const label = allFields.find(([f]) => f === key)?.[1]; if(!label) return;
            const row = document.createElement('div'); row.className = 'flex items-center gap-3 p-1.5 hover:bg-white rounded border border-transparent hover:border-slate-200 transition-colors';
            
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'w-4 h-4 accent-blue-600'; checkbox.checked = chosen.has(key);
            checkbox.onchange = () => { checkbox.checked ? chosen.add(key) : chosen.delete(key); update(); };
            
            const labelSpan = document.createElement('span'); labelSpan.textContent = label; labelSpan.className = 'text-sm text-slate-700 flex-1';
            row.append(checkbox, labelSpan);
            
            [['▲', -1], ['▼', 1]].forEach(([icon, delta]) => {
                const btn = document.createElement('button'); btn.textContent = icon; btn.className = 'text-slate-400 hover:text-blue-600 px-1 text-xs';
                btn.onclick = () => {
                    const idx = ordered.indexOf(key), nxt = idx + delta;
                    if(nxt < 0 || nxt >= ordered.length) return;
                    [ordered[idx], ordered[nxt]] = [ordered[nxt], ordered[idx]]; render();
                };
                row.append(btn);
            });
            host.append(row);
        }); update();
    }
    
    function update() { preview.textContent = `📊 พร้อมโหลด: ${selectedRows().length} แถว | ${ordered.filter(k => chosen.has(k)).length} คอลัมน์`; }
    rowsMode.onchange = update;
    
    template.onchange = () => {
        const item = templates.find(t => String(t.id) === template.value); if(!item) return;
        name.value = item.name; scope.value = String(item.customer_id || '');
        ordered = [...item.columns.filter(k => allFields.some(([f]) => f === k)), ...allFields.map(([k]) => k).filter(k => !item.columns.includes(k))];
        chosen = new Set(item.columns); render();
    };
    
    const btnGroup = document.createElement('div'); btnGroup.className = 'flex gap-2';
    const saveBtn = document.createElement('button'); saveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> บันทึกรูปแบบนี้'; saveBtn.className = 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold p-2.5 rounded-lg w-1/3 transition-colors text-sm';
    saveBtn.onclick = async () => {
        if(!name.value) return alert('ตั้งชื่อรูปแบบก่อนบันทึกครับ');
        try {
            const res = await workspaceRequest('/api/dispatch/templates', { id: template.value || undefined, name: name.value, customer_id: scope.value || null, columns: ordered.filter(k => chosen.has(k)) });
            templates = templates.filter(t => t.id !== res.data.id); templates.push(res.data);
            template.add(new Option(res.data.name, res.data.id)); template.value = res.data.id;
            alert('✅ บันทึก Template เรียบร้อย');
        } catch(e) { alert(e.message); }
    };
    
    const downloadBtn = document.createElement('button'); downloadBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i> ดาวน์โหลดไฟล์ Excel'; downloadBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold p-2.5 rounded-lg w-2/3 transition-colors shadow-md text-sm';
    downloadBtn.onclick = () => {
        const fields = ordered.filter(k => chosen.has(k)); const rows = selectedRows();
        if(!fields.length || !rows.length) return alert('⚠️ ต้องเลือกอย่างน้อย 1 แถว และ 1 คอลัมน์');
        const sheet = XLSX.utils.aoa_to_sheet([fields.map(k => allFields.find(([f]) => f === k)[1]), ...rows.map(r => fields.map(k => r[k] ?? ''))]);
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Dispatch Data'); XLSX.writeFile(book, `TMS_Export_${new Date().getTime()}.xlsx`);
    };
    
    btnGroup.append(saveBtn, downloadBtn);
    dialog.querySelector('h2').insertAdjacentElement('afterend', template);
    dialog.querySelector('h2').insertAdjacentElement('afterend', rowsMode);
    dialog.querySelector('h2').insertAdjacentElement('afterend', scope);
    dialog.querySelector('h2').insertAdjacentElement('afterend', name);
    dialog.append(host, preview, btnGroup); render(); dialog.showModal();
    
    try {
        const res = await fetch('/api/dispatch/templates?' + new URLSearchParams({user_id: workspaceUser.id, customer_id: customerIds.length === 1 ? customerIds[0] : ''}));
        const result = await res.json(); if(result.success) { templates = result.data; templates.forEach(t => template.add(new Option(t.name, t.id))); }
    } catch(e) {}
};