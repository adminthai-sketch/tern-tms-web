function workspaceDialog(title, colorClass) {
    const dialog = document.createElement('dialog'); 
    dialog.className = `rounded-xl p-6 w-full max-w-2xl shadow-2xl border-t-4 border-${colorClass}-600 backdrop:bg-slate-900/50`;
    const header = document.createElement('div'); header.className = 'flex justify-between items-center mb-4';
    const heading = document.createElement('h2'); heading.textContent = title; heading.className = `font-bold text-lg text-${colorClass}-800`;
    const closeBtn = document.createElement('button'); closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'; closeBtn.className = 'text-slate-400 hover:text-rose-500 text-xl';
    closeBtn.onclick = () => { dialog.close(); dialog.remove(); };
    header.append(heading, closeBtn); dialog.append(header); document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    return {dialog, close: () => { dialog.close(); dialog.remove(); }};
}

// 💵 ปุ่ม "+ เพิ่มรายได้อื่น ๆ (เรียกเก็บลูกค้า)"
window.openWorkspaceRevenue = function() {
    if(!workspaceReady()) return;
    const selected = rawShipmentList.filter(row => workspaceSelected.has(row.order_id));
    if(selected.length !== 1) return alert('⚠️ กรุณาติ๊กเลือก 1 เที่ยววิ่ง ที่ต้องการลงรายได้เพิ่ม');
    
    const order = selected[0];
    const {dialog, close} = workspaceDialog(`💵 เพิ่มรายได้อื่นเรียกเก็บลูกค้า · Order: ${order.order_id}`, 'emerald');
    const host = document.createElement('div'); dialog.append(host);
    
    const addRow = (item = {}) => {
        const row = document.createElement('div'); row.className = 'flex gap-2 mb-2 items-center';
        for(const [key, placeholder] of [['type','ประเภท (เช่น ค่ารอ)'], ['amount','จำนวนเงิน'], ['note','รายละเอียด (โชว์ในบิล)']]) {
            const input = document.createElement('input'); input.name = key; input.value = item[key]??''; input.placeholder = placeholder;
            input.className = 'border border-slate-300 rounded-lg p-2 text-sm w-full focus:ring-2 focus:ring-emerald-500 outline-none';
            if(key === 'amount') { input.type = 'number'; input.min = '0'; input.step = '0.01'; input.className += ' font-bold text-emerald-700 bg-emerald-50'; }
            row.append(input);
        }
        const remove = document.createElement('button'); remove.innerHTML = '<i class="fa-solid fa-trash-can"></i>'; remove.className = 'text-rose-400 hover:text-rose-600 p-2';
        remove.onclick = () => row.remove(); row.append(remove); host.append(row);
    };
    
    (order.additional_revenue || []).forEach(addRow);
    
    const addBtn = document.createElement('button'); addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> เพิ่มรายการ'; 
    addBtn.className = 'text-emerald-700 font-bold text-sm hover:underline mt-2'; addBtn.onclick = () => addRow();
    
    const saveBtn = document.createElement('button'); saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกรายได้'; 
    saveBtn.className = 'w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg py-2.5 shadow-md transition-all';
    saveBtn.onclick = async () => {
        saveBtn.disabled = true; saveBtn.innerHTML = 'กำลังบันทึก...';
        try {
            const items = Array.from(host.children).map(row => ({
                type: row.querySelector('[name="type"]').value, 
                amount: Number(row.querySelector('[name="amount"]').value), 
                note: row.querySelector('[name="note"]').value
            })).filter(i => i.type && i.amount > 0);
            
            let reason = ''; 
            if(order.iv_no || order.ar_no) { reason = prompt('เอกสารนี้ออก IV/AR ไปแล้ว กรุณาระบุเหตุผลที่แก้ไขยอด:'); if(!reason) return; }
            await workspaceRequest('/api/dispatch/finance', { data: [{ order_id: order.order_id, additional_revenue: items }], reopen_reason: reason });
            close(); await loadContainerGridData();
        } catch(e) { alert(e.message); } finally { saveBtn.disabled = false; }
    };
    dialog.append(addBtn, saveBtn); dialog.showModal();
};

window.openWorkspaceBilling = function() {
    if(!workspaceReady()) return;
    const booking = document.getElementById('filter-booking-no').value.trim();
    if(!booking) return alert('⚠️ เลือก Booking ด้านบนก่อนเปิดหน้าวางบิล');
    location.href = '/billing-detail.html?' + new URLSearchParams({booking, month: loadedDispatchMonth});
};

window.addEventListener('DOMContentLoaded', () => {
    const host = document.getElementById('dispatch-stage-tabs').parentElement;
    const btnGroup = document.createElement('div'); btnGroup.className = 'flex gap-2 mt-2';
    
    const revBtn = document.createElement('button'); revBtn.innerHTML = '<i class="fa-solid fa-hand-holding-dollar"></i> ลงรายได้เพิ่ม (เที่ยวที่เลือก)';
    revBtn.className = 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold px-3 py-1.5 rounded-lg text-[11px] hover:bg-emerald-600 hover:text-white transition-all shadow-sm';
    revBtn.onclick = openWorkspaceRevenue;
    
    const billBtn = document.createElement('button'); billBtn.innerHTML = '<i class="fa-solid fa-file-invoice"></i> วางบิล / พิมพ์ใบปะหน้า';
    billBtn.className = 'bg-blue-50 text-blue-700 border border-blue-300 font-bold px-3 py-1.5 rounded-lg text-[11px] hover:bg-blue-600 hover:text-white transition-all shadow-sm ml-auto';
    billBtn.onclick = openWorkspaceBilling;
    
    btnGroup.append(revBtn, billBtn);
    host.append(btnGroup);
});