const workspaceDirty = new Map();
const workspaceSelected = new Set();
const workspaceUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
const workspaceViewKey = 'dispatch-view-v3-' + (workspaceUser.id || 'local');
let workspaceView;
const workspaceDefaultView = () => ({job:false, pickup:true, container:true, delivery:true, returns:true, revenue:false, expense:false});
try { workspaceView = JSON.parse(localStorage.getItem(workspaceViewKey)) || workspaceDefaultView(); } catch { workspaceView = workspaceDefaultView(); }
let workspacePendingOnly = false;
let workspaceMode = ''; // เก็บโหมดงานของ Booking ที่เลือก

// 🎨 1. ตั้งค่าหมวดหมู่ตารางและสี (แยกรายได้-ค่าใช้จ่าย)
const workspaceGroups = {
    job: { label: 'ข้อมูลงาน', fields: [['mode','MODE'],['customer_name','ลูกค้า'],['job_owner','เจ้าของงาน'],['origin','ต้นทาง'],['factory','โรงงาน'],['destination','ปลายทาง'],['container_size','ขนาดตู้']] },
    pickup: { label: 'PICK UP', fields: [['leg1_plate','ทะเบียนรถ'],['leg1_driver','คนขับ'],['leg1_appointment','เวลานัด'],['leg1_completed','สถานะรับตู้'],['order_vgm_cutoff','VGM Cutoff']] },
    container: { label: 'ข้อมูลตู้', fields: [1,2].flatMap(n => [['container_'+n+'_no','เบอร์ตู้ '+n],['tare_'+n,'TARE '+n],['max_gross_'+n,'MAX GROSS '+n],['seal_'+n+'_no','SEAL '+n],['pop_'+n+'_no','POP '+n]]) },
    delivery: { label: 'DELIVERY', fields: [['_copy_delivery','ใช้รถ / คนขับเดิม'],['leg2_plate','ทะเบียนรถ'],['leg2_driver','คนขับ'],['leg2_appointment','เวลาเข้าโรงงาน'],['leg2_completed','สถานะส่งมอบ']] },
    returns: { label: 'RETURN', fields: [['_copy_returns','ใช้รถ / คนขับเดิม'],['leg3_plate','ทะเบียนรถ'],['leg3_driver','คนขับ'],['leg3_appointment','เวลาเปิดประตู'],['order_return_cutoff','Cutoff Time'],['leg3_completed','สถานะคืนตู้']] },
    revenue: { label: 'รายได้ (ลูกค้า)', fields: [['trans_fee','ค่าขนส่ง'],['additional_total','รายได้อื่นรวม'],['iv_no','IV']] },
    expense: { label: 'ค่าใช้จ่าย (ต้นทุน)', fields: [['trip_fee','ค่าเที่ยว'],['port_pass_fee','ค่าผ่านท่า'],['shore_fee','ชอร์'],['lift_fee','ยกตู้'],['deposit_fee','ฝากตู้'],['other_expense','ค่าใช้จ่ายอื่น'],['ar_no','AR']] }
};
const workspaceColors = {job:'slate', pickup:'sky', container:'blue', delivery:'orange', returns:'purple', revenue:'emerald', expense:'rose'};
const workspaceMoney = ['trip_fee','trans_fee','port_pass_fee','shore_fee','lift_fee','deposit_fee','other_expense'];
const workspaceReadOnly = new Set([...workspaceGroups.job.fields.map(([key])=>key), 'iv_no','ar_no','additional_total']);

// 🏷️ 2. เปลี่ยนชื่อหมวดอัตโนมัติตาม MODE
function workspaceGroupLabel(key) {
    const isImport = workspaceMode === 'IMPORT';
    const dynamicLabels = {
        pickup: isImport ? 'PICK UP · ไปรับตู้หนักที่ท่าเรือ' : 'PICK UP · ไปรับตู้เปล่าที่ลาน',
        container: isImport ? 'ข้อมูลตู้ · ตรวจข้อมูลตู้ที่รับ' : 'ข้อมูลตู้ · ลงเบอร์ตู้หลังรับตู้',
        delivery: isImport ? 'DELIVERY · ไปโรงงานส่งสินค้า/ลงของ' : 'DELIVERY · ไปโรงงานรับสินค้า/บรรจุ',
        returns: isImport ? 'RETURN · นำตู้เปล่าไปคืนลาน' : 'RETURN · นำตู้หนักไปส่งที่ท่าเรือ'
    };
    return dynamicLabels[key] || workspaceGroups[key].label;
}

// ⏰ 3. ระบบแจ้งเตือนเวลา (VGM / Cutoff)
function workspaceDeadline(value, now = Date.now()) {
    if (!value) return null;
    const text = String(value).replace(' ','T');
    const deadline = Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(text) ? text : text+'+07:00');
    if(!Number.isFinite(deadline)) return null;
    const minutes = Math.ceil((deadline - now)/60000);
    
    if (minutes <= 0) return { level: 'overdue', text: `เลยเวลา ${Math.abs(minutes)} นาที` };
    if (minutes <= 120) return { level: 'red', text: `เหลือ ${Math.floor(minutes/60)} ชม. ${minutes%60} นาที` };
    if (minutes <= 180) return { level: 'yellow', text: `เหลือ ${Math.floor(minutes/60)} ชม. ${minutes%60} นาที` };
    return { level: 'normal', text: '' };
}

function workspaceReady() {
    if (!workspaceDirty.size) return true;
    alert('⚠️ กรุณาบันทึกช่องที่แก้ไขก่อนเปลี่ยนมุมมองตัวกรอง');
    return false;
}

async function workspaceRequest(url, body) {
    const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:workspaceUser.id, ...body}) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
    return result;
}

function workspaceBuildColumns() {
    const fields = [['_checkbox','เลือก'],['_action','จัดรถ'],['order_id','Order ID'],['booking_no','Booking'],['_stop_action','จุดฝาก']];
    const groups = [{label:'จัดการ',colspan:2},{label:'เลขอ้างอิง',colspan:2},'เส้นทาง'];
    for (const [key, group] of Object.entries(workspaceGroups)) {
        if (workspaceView[key] === false) {
            fields.push(['_summary_'+key,'สรุปสถานี · กดเพื่อกาง']);
            groups.push(workspaceGroupLabel(key));
        } else {
            const selected = group.fields.filter(([prop]) => key !== 'container' || workspaceView.second || !/(_2_no|_2)$/.test(prop));
            fields.push(...selected);
            groups.push({label:workspaceGroupLabel(key), colspan:selected.length});
        }
    }
    workspaceColumns = fields;
    return { fields, groups };
}

function workspaceSummary(row, key) {
    if (key === 'revenue') return [row.iv_no, 'รายได้: ฿'+(row.trans_fee||0)].filter(Boolean).join(' · ');
    if (key === 'expense') return [row.ar_no, 'คชจ: ฿'+(row.trip_fee||0)].filter(Boolean).join(' · ');
    if (key === 'container') return [row.container_1_no, row.container_2_no].filter(Boolean).join(' / ');
    const prefix = {pickup:'leg1', delivery:'leg2', returns:'leg3'}[key];
    if (prefix) return [row[prefix+'_plate'] || 'รอจัดรถ', row[prefix+'_driver'], row[prefix+'_appointment'] ? String(row[prefix+'_appointment']).replace('T',' ').slice(0,16) : 'ยังไม่ระบุ'].filter(Boolean).join(' · ');
    return workspaceGroups[key].fields.map(([field])=>row[field]).filter(Boolean).slice(0,3).join(' · ');
}

initContainerHandsontable = function(data) {
    const modes = [...new Set(data.map(row=>row.mode))];
    workspaceMode = modes.length === 1 ? modes[0] : 'EXPORT'; // Default EXPORT if mixed/empty
    if (hotGridInstance) hotGridInstance.destroy();
    
    const { fields, groups } = workspaceBuildColumns();
    for (const row of data) {
        row._checkbox = workspaceSelected.has(row.order_id);
        row.additional_total = (row.additional_revenue || []).reduce((sum,item)=>sum+Math.round(Number(item.amount||0)*100),0)/100;
        for (const [field, fallback] of [['leg1_appointment','cy_date'],['leg2_appointment',row.mode==='IMPORT'?'unload_date':'load_date'],['leg3_appointment','open_gate'],['order_vgm_cutoff','vgm_cutoff'],['order_return_cutoff','cutoff_time']]) {
            if (row[field] == null) row[field] = row[fallback] || null;
        }
        for (const key of Object.keys(workspaceGroups)) row['_summary_'+key] = workspaceSummary(row,key);
    }
    
    hotGridInstance = new Handsontable(document.getElementById('container-grid-container'), {
        data, 
        columns: fields.map(([field]) => {
            const column = { data: field, readOnly: workspaceReadOnly.has(field) || field.startsWith('_summary') || ['_action','order_id','booking_no'].includes(field) };
            const groupKey = field.startsWith('_summary_') ? field.slice(9) : Object.keys(workspaceGroups).find(key => workspaceGroups[key].fields.some(([prop])=>prop===field));
            column.className = 'workspace-zone-' + (workspaceColors[groupKey] || 'slate');
            const groupFields = fields.filter(([prop]) => prop === '_summary_'+groupKey || workspaceGroups[groupKey]?.fields.some(([key])=>key===prop));
            if (groupFields[0]?.[0] === field) column.className += ' workspace-station-start';
            if (field.includes('appointment')) {
                column.className += ' workspace-time-cell';
                column.renderer = workspaceTimeRenderer;
            }
            if (field.startsWith('_copy_')) {
                column.readOnly = true;
                column.renderer = workspaceCopyRenderer;
            }
            
            // Render Time Warnings
            if(field === 'order_vgm_cutoff' || field === 'order_return_cutoff') {
                column.renderer = (instance, td, r, c, p, value, properties) => {
                    Handsontable.renderers.TextRenderer(instance, td, r, c, p, value, properties);
                    const row = instance.getSourceDataAtRow(instance.toPhysicalRow(r));
                    const isFinished = field === 'order_vgm_cutoff' ? row.leg1_completed : row.actual_return_date;
                    const warning = isFinished ? null : workspaceDeadline(value);
                    if(warning && warning.level !== 'normal') {
                        td.classList.add('deadline-' + warning.level);
                        td.append(document.createElement('br'), document.createTextNode(warning.text));
                        td.title = field === 'order_vgm_cutoff' ? '🚨 VGM Cutoff' : '🚨 Port Cutoff';
                    }
                };
            }
            if (field === '_checkbox' || field.endsWith('_completed') || field.endsWith('_is_drop') || field === 'is_drop_only') column.type = 'checkbox';
            if (workspaceMoney.includes(field) || /^(tare|max_gross)_/.test(field)) { column.type = 'numeric'; column.numericFormat = {pattern:'0,0.00'}; }
            if (field.endsWith('_plate') || field.endsWith('_driver')) { column.type = 'autocomplete'; column.source = field.endsWith('_plate') ? globalTruckList : globalDriverList; column.strict = false; }
            if(field==='_stop_action') { column.readOnly=true; column.renderer=(instance,td,r)=>{const row=instance.getSourceDataAtRow(instance.toPhysicalRow(r));td.textContent='ฝาก '+(row.stop_count||0)+' จุด ＋';td.className='workspace-zone-amber';}; }
            if (field === '_action') {
                column.renderer = (instance, td, r) => {
                    td.replaceChildren(); 
                    const btn = document.createElement('button');
                    btn.innerHTML = '<i class="fa-solid fa-truck-fast"></i> จัดรถ';
                    btn.className = 'w-full bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-300 px-2 py-1 rounded shadow-sm text-[10px] font-bold transition-all';
                    btn.onclick = () => openDispatchModal(r);
                    btn.onmousedown = event => event.stopPropagation();
                    td.append(btn);
                    const row = instance.getSourceDataAtRow(instance.toPhysicalRow(r));
                    const containers = document.createElement('button');
                    const hasSecond = dispatchContainerFields.some(([key]) => row[dispatchContainerKey(key,2)] != null && row[dispatchContainerKey(key,2)] !== '');
                    containers.textContent = hasSecond ? 'ดูตู้ 1 / ตู้ 2' : '＋ เพิ่มตู้ 2';
                    containers.className = 'workspace-container-button';
                    containers.title = 'จัดการข้อมูลตู้ใน Order '+row.order_id+' (ไม่เพิ่มเที่ยวใหม่)';
                    containers.onclick = () => workspaceOpenContainers(r, !hasSecond);
                    containers.onmousedown = event => event.stopPropagation();
                    td.append(containers);
                };
            }
            return column;
        }), 
        nestedHeaders: [groups, fields.map(([,label])=>label)], rowHeaders: true, fixedColumnsLeft: 2, width: '100%', height: '100%',
        colWidths: fields.map(([field]) => field==='_checkbox'?45 : field==='_action'?125 : field.startsWith('_summary')?220 : field==='order_id'?140 : field==='booking_no'?140 : field.endsWith('_driver')?140 : field.includes('appointment')||field.includes('cutoff')?170 : field.endsWith('_completed')?85 : 110),
        rowHeights: 64, columnHeaderHeight: [42, 34], wordWrap: false, manualColumnResize: true, columnSorting: true, filters: true, dropdownMenu: true,
        afterGetColHeader: workspaceStationHeader,
        afterOnCellMouseDown(event, coords) {
            if(coords.row < 0) return;
            const field = hotGridInstance.colToProp(coords.col);
            const item=hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(coords.row));
            if(field==='_stop_action'){openWorkspaceStops(item);return;}
            if(event.detail===2 && /(_appointment|_cutoff|actual_.*_date)$/.test(field)){workspaceEditTime(coords.row,field);return;}
            if(String(field).startsWith('_summary_') && workspaceReady()){ workspaceView[field.slice(9)] = true; workspaceRefresh(); }
        },
        licenseKey: 'non-commercial-and-evaluation',
        afterChange(changes, source) {
            if (!changes || source === 'loadData') return;
            for (const [visual, field, old, value] of changes) {
                const row = hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(visual));
                if (!row || old === value) continue;
                if(field === '_checkbox') { if(value) workspaceSelected.add(row.order_id); else workspaceSelected.delete(row.order_id); continue; }
                const patch = workspaceDirty.get(row.order_id) || { order_id: row.order_id };
                patch[field] = value === '' ? null : value;
                workspaceDirty.set(row.order_id, patch);
            }
            editedRowIndices = new Set([...workspaceDirty.keys()]); updateSaveStatusBadge();
        }
    });
    renderDispatchStages(document.getElementById('filter-booking-no').value, data);
};

focusDispatchColumns = function() {};

renderDispatchStages = function(booking, rows) {
    const host = document.getElementById('dispatch-stage-tabs'); host.replaceChildren();
    document.getElementById('dispatch-booking-summary').textContent = booking ? `${booking} · ${rows.length} เที่ยว · ${rows[0]?.customer_name || ''}` : 'เลือก Booking จากตัวกรองด้านบนเพื่อทำงานหลายเที่ยว';
    
    for(const [key, group] of Object.entries(workspaceGroups)) {
        const isCollapsed = workspaceView[key] === false;
        const btn = document.createElement('button');
        btn.textContent = `${workspaceGroupLabel(key)} · ${isCollapsed ? '＋ กาง' : '− พับ'}`;
        btn.setAttribute('aria-expanded', String(!isCollapsed));
        btn.title = workspaceGroupLabel(key) + (isCollapsed ? ' (แสดงรายละเอียด)' : ' (ย่อหมวด)');
        btn.className = `workspace-group workspace-zone-${workspaceColors[key]} shadow-sm ${isCollapsed ? 'is-collapsed' : 'is-expanded'}`;
        btn.onclick = () => { if(workspaceReady()){ workspaceView[key] = isCollapsed; workspaceRefresh(); } };
        host.append(btn);
    }
};

function workspaceRefresh() {
    const scroll = workspaceCaptureScroll();
    localStorage.setItem(workspaceViewKey, JSON.stringify(workspaceView));
    applyFilters();
    workspaceRestoreScroll(scroll);
}
const workspaceOldApply = applyFilters;

applyFilters = function() {
    if(workspaceDirty.size) return;
    dispatchStage = 'all'; 
    workspaceOldApply();
    if(workspacePendingOnly) {
        filteredList = filteredList.filter(row => getDispatchStage(row) !== 'done');
        initContainerHandsontable(filteredList);
    }
};

saveGridChanges = async function() {
    if(!workspaceDirty.size) return true;
    const btn = document.getElementById('btn-save-grid'); btn.disabled = true;
    try {
        const operations = [], finances = [];
        for(const patch of workspaceDirty.values()) {
            const op = {order_id: patch.order_id}, finance = {order_id: patch.order_id};
            for(const [key, value] of Object.entries(patch)) if(key !== 'order_id') (workspaceMoney.includes(key) ? finance : op)[key] = value;
            if(Object.keys(op).length > 1) operations.push(op);
            if(Object.keys(finance).length > 1) finances.push(finance);
        }
        if(finances.length) await workspaceRequest('/api/dispatch/finance', { data: finances });
        if(finances.length) for(const patch of workspaceDirty.values()) for(const key of workspaceMoney) delete patch[key];
        if(operations.length) await workspaceRequest('/api/shipments', { dispatch_patch: true, data: operations });
        
        workspaceDirty.clear(); editedRowIndices.clear(); await loadContainerGridData(); return true;
    } catch(err) { alert('❌ ' + err.message); return false; }
    finally { btn.disabled = false; }
};

// 🔎 4. ตัวกรองสัมพันธ์กัน (Cascading Filter)
handleCrossFilter = function(event) {
    if(!workspaceReady()) return;
    const ids = ['filter-run-date', 'filter-customer', 'filter-booking-no'];
    const props = ['run_date', 'customer_name', 'booking_no'];
    const changedIndex = ids.indexOf(event?.target?.id || document.activeElement?.id);
    const priority = [changedIndex, ...ids.map((_,i)=>i)].filter((item, i, arr) => item >= 0 && arr.indexOf(item) === i);
    
    let available = rawShipmentList;
    const cleared = [];
    
    for(const idx of priority) {
        const input = document.getElementById(ids[idx]);
        if(!input.value) continue;
        const val = input.value.trim();
        const matching = available.filter(row => (idx === 0 ? String(row[props[0]]||'').slice(0,10) : String(row[props[idx]]||'').trim()) === val);
        if(matching.length > 0) available = matching;
        else { input.value = ''; cleared.push(['วันที่','ลูกค้า','Booking'][idx]); }
    }
    
    updateDropdownOptions(); applyFilters();
    if(cleared.length) document.getElementById('dispatch-stage-help').innerHTML = `<span class="text-rose-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> ล้างค่าตัวกรองที่ไม่สัมพันธ์กัน: ${cleared.join(', ')}</span>`;
    else document.getElementById('dispatch-stage-help').textContent = 'เลือกมุมมองด้านล่าง · ปุ่ม 🔽 เปิดหมวดเพิ่มเติม · เวลาระบุเป็น YYYY-MM-DD HH:mm';
};

// เครื่องมือมุมมอง
window.addEventListener('DOMContentLoaded', () => {
    const host = document.getElementById('dispatch-primary-views');
    const tools = document.createElement('div'); tools.className = 'workspace-view-tabs';
    
    const presets = [
        ['ภาพรวม (ย่อ)', () => workspaceView = workspaceDefaultView()],
        ['รับตู้', () => workspacePreset('pickup')],
        ['ลงข้อมูลตู้', () => workspacePreset('container')],
        ['ไปโรงงาน', () => workspacePreset('delivery')],
        ['ส่ง/คืนตู้', () => workspacePreset('returns')],
        ['การเงิน', () => workspacePreset('finance')], // เปิดทั้งรายได้และคชจ.
        ['เปิดทั้งหมด', () => { Object.keys(workspaceGroups).forEach(k => workspaceView[k] = true); workspaceView.second = true; }]
    ];
    
    for(const [label, action] of presets) {
        const btn = document.createElement('button'); btn.textContent = label;
        btn.className = 'border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-white text-slate-600 hover:bg-slate-100 hover:text-primary transition-colors shadow-sm';
        btn.onclick = () => { if(workspaceReady()){ action(); workspaceRefresh(); tools.querySelectorAll('button').forEach(button=>button.classList.toggle('is-active',button===btn)); } };
        tools.append(btn);
    }
    
    const pendingLabel = document.createElement('label'); pendingLabel.className = 'flex items-center gap-1.5 ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 cursor-pointer';
    const pendingCb = document.createElement('input'); pendingCb.type = 'checkbox'; pendingCb.className = 'accent-amber-600';
    pendingCb.onchange = () => { if(!workspaceReady()){ pendingCb.checked = !pendingCb.checked; return; } workspacePendingOnly = pendingCb.checked; containerQuickFilter = ''; applyFilters(); };
    pendingLabel.append(pendingCb, document.createTextNode('เฉพาะงานค้าง')); tools.append(pendingLabel);
    host.append(tools);
});

function workspacePreset(active) {
    for(const key of Object.keys(workspaceGroups)) {
        if(active === 'finance') workspaceView[key] = ['job', 'revenue', 'expense'].includes(key);
        else workspaceView[key] = ['job', active].includes(key);
    }
}
