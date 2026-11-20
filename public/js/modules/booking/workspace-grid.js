const workspaceDirty = new Map();
const workspaceSelected = new Set();
const workspaceUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
const workspaceViewKey = 'dispatch-view-' + (workspaceUser.id || 'local');
let workspaceView;
try { workspaceView = JSON.parse(localStorage.getItem(workspaceViewKey)) || {}; } catch { workspaceView = {}; }
let workspaceColumns = [];
const workspaceGroups = {
    job: { label: 'ข้อมูลงาน', fields: [['mode','MODE'],['customer_name','ลูกค้า'],['job_owner','เจ้าของงาน'],['origin','ต้นทาง'],['factory','โรงงาน'],['destination','ปลายทาง'],['container_size','ขนาดตู้']] },
    pickup: { label: 'PICK UP', fields: [['leg1_plate','รถรับตู้'],['leg1_driver','คนขับ'],['leg1_appointment','เวลานัด'],['leg1_completed','รับตู้แล้ว'],['order_vgm_cutoff','VGM Cutoff']] },
    container: { label: 'ข้อมูลตู้', fields: [1,2].flatMap(n => [['container_'+n+'_no','เบอร์ตู้ '+n],['tare_'+n,'TARE '+n],['max_gross_'+n,'MAX '+n],['seal_'+n+'_no','SEAL '+n],['pop_'+n+'_no','POP '+n]]) },
    delivery: { label: 'DELIVERY', fields: [['leg2_plate','รถไปโรงงาน'],['leg2_driver','คนขับ'],['leg2_appointment','เวลานัด'],['leg2_completed','ส่งมอบแล้ว'],['actual_load_date','ส่งมอบจริง']] },
    returns: { label: 'RETURN', fields: [['leg3_plate','รถส่ง/คืนตู้'],['leg3_driver','คนขับ'],['leg3_appointment','เวลานัด'],['order_return_cutoff','Cutoff'],['actual_return_date','คืนตู้จริง']] },
    drops: { label: 'ฝากตู้', fields: [['leg1_is_drop','ฝากหลังรับตู้'],['drop1_plate','รถฝาก 1'],['drop1_driver','คนขับฝาก 1'],['drop1_location','จุดฝาก 1'],['drop1_completed','ฝาก 1 แล้ว'],['leg2_is_drop','ฝากหลังโรงงาน'],['drop2_plate','รถฝาก 2'],['drop2_driver','คนขับฝาก 2'],['drop2_location','จุดฝาก 2'],['drop2_completed','ฝาก 2 แล้ว'],['is_drop_only','ฝากแล้วจบงาน'],['actual_drop_date','ฝากจริง']] },
    finance: { label: 'การเงิน', fields: [['trip_fee','ค่าเที่ยว'],['trans_fee','ค่าขนส่ง'],['additional_total','รายได้เพิ่ม'],['port_pass_fee','ผ่านท่า'],['shore_fee','ชอร์'],['lift_fee','ยกตู้'],['deposit_fee','ฝากตู้'],['advance_fee','เงินเบิก'],['other_expense','ค่าใช้จ่ายอื่น'],['iv_no','IV'],['ar_no','AR']] }
};
const workspaceMoney = ['trip_fee','trans_fee','port_pass_fee','shore_fee','lift_fee','deposit_fee','advance_fee','other_expense'];
const workspaceReadOnly = new Set([...workspaceGroups.job.fields.map(([key])=>key), 'iv_no','ar_no','additional_total']);
function workspaceReady() {
    if (!workspaceDirty.size) return true;
    alert('กรุณาบันทึกช่องที่แก้ก่อนเปลี่ยนมุมมอง');
    return false;
}
async function workspaceRequest(url, body) {
    const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:workspaceUser.id,...body}) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
    return result;
}
function workspaceBuildColumns() {
    const fields = [['_checkbox','เลือก'],['_action','จัดรถ'],['order_id','Order ID'],['booking_no','Booking']];
    const groups = [{label:'เที่ยว',colspan:4}];
    for (const [key, group] of Object.entries(workspaceGroups)) {
        if (workspaceView[key] === false) {
            fields.push(['_summary_'+key,group.label+' · สรุป']);
            groups.push(group.label);
        } else {
            const selected = group.fields.filter(([prop]) => key !== 'container' || workspaceView.second || !/(_2_no|_2)$/.test(prop));
            fields.push(...selected);
            groups.push({label:group.label,colspan:selected.length});
        }
    }
    workspaceColumns = fields;
    return { fields, groups };
}
function workspaceSummary(row, key) {
    if (key === 'finance') return [row.iv_no,row.ar_no,row.overall_status].filter(Boolean).join(' · ');
    if (key === 'container') return [row.container_1_no,row.container_2_no].filter(Boolean).join(' / ');
    const prefix = {pickup:'leg1',delivery:'leg2',returns:'leg3'}[key];
    return prefix ? [row[prefix+'_plate'],row[prefix+'_driver'],row.overall_status].filter(Boolean).join(' · ') :
        workspaceGroups[key].fields.map(([field])=>row[field]).filter(Boolean).slice(0,3).join(' · ');
}
initContainerHandsontable = function(data) {
    if (hotGridInstance) hotGridInstance.destroy();
    const { fields, groups } = workspaceBuildColumns();
    for (const row of data) {
        row._checkbox = workspaceSelected.has(row.order_id);
        row.additional_total = (row.additional_revenue || []).reduce((sum,item)=>sum+Math.round(Number(item.amount||0)*100),0)/100;
        for (const key of Object.keys(workspaceGroups)) row['_summary_'+key] = workspaceSummary(row,key);
        for (const [field,fallback] of [['leg1_appointment','cy_date'],['leg2_appointment',row.mode==='IMPORT'?'unload_date':'load_date'],['leg3_appointment','return_date'],['order_vgm_cutoff','vgm_cutoff'],['order_return_cutoff','cutoff_time']]) {
            if (row[field] == null) row[field] = row[fallback] || null;
        }
    }
    hotGridInstance = new Handsontable(document.getElementById('container-grid-container'), {
        data, columns:fields.map(([field])=> {
            const column = {data:field,readOnly:workspaceReadOnly.has(field)||field.startsWith('_summary')||['_action','order_id','booking_no'].includes(field)};
            if (field==='_checkbox'||field.endsWith('_completed')||field.endsWith('_is_drop')||field==='is_drop_only') column.type='checkbox';
            if (workspaceMoney.includes(field)||/^(tare|max_gross)_/.test(field)) {column.type='numeric';column.numericFormat={pattern:'0,0.00'};}
            if (field.endsWith('_plate')||field.endsWith('_driver')) {column.type='autocomplete';column.source=field.endsWith('_plate')?globalTruckList:globalDriverList;column.strict=false;}
            if (field==='_action') column.renderer=(instance,td,r)=>{
                td.replaceChildren(); const button=document.createElement('button');button.textContent='จัดรถ';button.className='text-blue-700 font-bold';button.onclick=()=>openDispatchModal(r);td.append(button);
            };
            return column;
        }), nestedHeaders:[groups,fields.map(([,label])=>label)], rowHeaders:true,
        fixedColumnsLeft:4, width:'100%',height:'100%',colWidths:130,stretchH:'none',
        manualColumnResize:true,columnSorting:true,filters:true,dropdownMenu:true,
        licenseKey:'non-commercial-and-evaluation',
        afterChange(changes,source) {
            if (!changes||source==='loadData') return;
            for (const [visual,field,old,value] of changes) {
                const row=hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(visual));
                if (!row||old===value) continue;
                if(field==='_checkbox') {if(value)workspaceSelected.add(row.order_id);else workspaceSelected.delete(row.order_id);continue;}
                const patch=workspaceDirty.get(row.order_id)||{order_id:row.order_id};
                patch[field]=value === '' ? null : value;
                workspaceDirty.set(row.order_id,patch);
            }
            editedRowIndices=new Set([...workspaceDirty.keys()]);updateSaveStatusBadge();
        }
    });
};
focusDispatchColumns = function() {};
renderDispatchStages = function(booking,rows) {
    const host=document.getElementById('dispatch-stage-tabs');host.replaceChildren();
    document.getElementById('dispatch-booking-summary').textContent=booking ? booking+' · '+rows.length+' เที่ยว · '+(rows[0]?.customer_name||'') : 'เลือก Booking เพื่อทำงานหลายเที่ยว';
    for(const [key,group] of Object.entries(workspaceGroups)) {
        const button=document.createElement('button');button.textContent=(workspaceView[key]===false?'▸ ':'▾ ')+group.label;
        button.className='border rounded px-3 py-1 bg-blue-50 text-blue-900';
        button.onclick=()=>{if(!workspaceReady())return;workspaceView[key]=workspaceView[key]===false;workspaceRefresh();};host.append(button);
    }
    document.getElementById('dispatch-stage-help').textContent='วันที่กรอก YYYY-MM-DD HH:mm · ติ๊กเที่ยวแล้วออกเอกสารหรือดาวน์โหลด Excel';
};
function workspaceRefresh() {localStorage.setItem(workspaceViewKey,JSON.stringify(workspaceView));applyFilters();}
const workspaceOldApply=applyFilters;
applyFilters=function(){if(workspaceDirty.size)return;dispatchStage='all';workspaceOldApply();};
saveGridChanges=async function(){
    if(!workspaceDirty.size)return true;
    const button=document.getElementById('btn-save-grid');button.disabled=true;
    try{
        const operations=[],finances=[];
        for(const patch of workspaceDirty.values()) {
            const op={order_id:patch.order_id},finance={order_id:patch.order_id};
            for(const [key,value]of Object.entries(patch))if(key!=='order_id')(workspaceMoney.includes(key)?finance:op)[key]=value;
            if(Object.keys(op).length>1)operations.push(op);if(Object.keys(finance).length>1)finances.push(finance);
        }
        let reason='';
        if(finances.some(patch=>rawShipmentList.some(row=>row.order_id===patch.order_id&&(row.iv_no||row.ar_no)))) {
            reason=prompt('ระบุเหตุผลเปิดแก้ยอดหลังออกเอกสาร');
            if(!reason?.trim())return false;
        }
        if(finances.length)await workspaceRequest('/api/dispatch/finance',{data:finances,reopen_reason:reason});
        if(finances.length)for(const patch of workspaceDirty.values())for(const key of workspaceMoney)delete patch[key];
        if(operations.length)await workspaceRequest('/api/shipments',{dispatch_patch:true,data:operations});
        workspaceDirty.clear();editedRowIndices.clear();await loadContainerGridData();return true;
    }catch(error){alert(error.message+' หากการเงินบันทึกแล้ว แต่จัดรถล้มเหลว กรุณาตรวจรายการก่อนลองใหม่');return false;}
    finally{button.disabled=false;}
};
window.addEventListener('DOMContentLoaded',()=>{
    const host=document.getElementById('dispatch-stage-tabs').parentElement;
    const tools=document.createElement('div');tools.className='flex flex-wrap gap-2 my-2';
    for(const [label,action] of [
        ['ภาพรวม',()=>{workspaceView={drops:false,finance:false};}],['รับตู้',()=>workspacePreset('pickup')],
        ['ลงข้อมูลตู้',()=>workspacePreset('container')],['ไปโรงงาน',()=>workspacePreset('delivery')],
        ['ส่ง/คืนตู้',()=>workspacePreset('returns')],['การเงิน',()=>workspacePreset('finance')],
        ['เปิดทั้งหมด',()=>{workspaceView={second:true};}],['คืนค่าเริ่มต้น',()=>{workspaceView={drops:false,finance:false};}],
        ['ตู้ 2',()=>{workspaceView.second=!workspaceView.second;}]
    ]) {const button=document.createElement('button');button.textContent=label;button.className='border rounded px-2 py-1 text-xs bg-white';button.onclick=()=>{if(workspaceReady()){action();workspaceRefresh();}};tools.append(button);}
    const label=document.createElement('label');const pending=document.createElement('input');pending.type='checkbox';
    pending.onchange=()=>{if(!workspaceReady()){pending.checked=!pending.checked;return;}containerQuickFilter='';dispatchStage='all';workspaceOldApply();if(pending.checked)initContainerHandsontable(filteredList.filter(row=>getDispatchStage(row)!=='done'));};
    label.append(pending,document.createTextNode(' เฉพาะงานค้าง'));tools.append(label);host.append(tools);
});
function workspacePreset(active){for(const key of Object.keys(workspaceGroups))workspaceView[key]=key==='job'||key===active;}
