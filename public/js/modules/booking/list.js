// ==========================================
// 📋 MODULE: BOOKING LIST (Fix Job Name & DateTime Display)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const monthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    document.getElementById('filter-month').value = monthStr;
    loadBookingGridData();
});

async function loadBookingGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    try {
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawBookingList = result.data;
            filteredList = [...rawBookingList];
            editedRowIndices.clear();
            updateSaveStatusBadge();
            populateRunDateFilter(rawBookingList);
            populateCustomerFilter(rawBookingList);
            populateBookingNoFilter(rawBookingList);
            initBookingHandsontable(rawBookingList);
        } else {
            rawBookingList = []; filteredList = [];
            initBookingHandsontable([]);
        }
    } catch (err) { initBookingHandsontable([]); }
}

function populateRunDateFilter(data) {
    const sel = document.getElementById('filter-run-date');
    sel.innerHTML = '<option value="">-- ทุกลักษณะวันที่ --</option>';
    const dates = new Set();
    data.forEach(i => { if (i.run_date) dates.add(String(i.run_date).split('T')[0]); });
    Array.from(dates).sort().forEach(d => sel.innerHTML += `<option value="${d}">${d}</option>`);
}

function populateCustomerFilter(data) {
    const sel = document.getElementById('filter-customer');
    sel.innerHTML = '<option value="">-- ทุกลูกค้า (Customer) --</option>';
    const custs = new Set();
    data.forEach(i => { if (i.customer_name) custs.add(String(i.customer_name).trim()); });
    Array.from(custs).sort().forEach(c => sel.innerHTML += `<option value="${c}">${c}</option>`);
}

function populateBookingNoFilter(data) {
    const sel = document.getElementById('filter-booking-no');
    sel.innerHTML = '<option value="">-- ทุก Booking / BL --</option>';
    const books = new Set();
    data.forEach(i => { if (i.booking_no) books.add(String(i.booking_no).trim()); });
    Array.from(books).sort().forEach(b => sel.innerHTML += `<option value="${b}">${b}</option>`);
}

function onRunDateChange() {
    const d = document.getElementById('filter-run-date').value;
    let scoped = rawBookingList;
    if (d) scoped = rawBookingList.filter(i => i.run_date && String(i.run_date).split('T')[0] === d);
    populateCustomerFilter(scoped);
    populateBookingNoFilter(scoped);
    applyFilters();
}

function onCustomerChange() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    let scoped = rawBookingList;
    if (d) scoped = scoped.filter(i => i.run_date && String(i.run_date).split('T')[0] === d);
    if (c) scoped = scoped.filter(i => i.customer_name && String(i.customer_name).trim() === c);
    populateBookingNoFilter(scoped);
    applyFilters();
}

function applyFilters() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;

    filteredList = rawBookingList.filter(i => {
        const iD = i.run_date ? String(i.run_date).split('T')[0] : '';
        const iC = i.customer_name ? String(i.customer_name).trim() : '';
        const iB = i.booking_no ? String(i.booking_no).trim() : '';
        return (!d || iD === d) && (!c || iC === c) && (!b || iB === b);
    });
    initBookingHandsontable(filteredList);
}

function clearQuickFilters() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    populateCustomerFilter(rawBookingList);
    populateBookingNoFilter(rawBookingList);
    applyFilters();
}

// ----------------------------------------------------
// 📊 จัดการตาราง Handsontable
// ----------------------------------------------------
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }
    document.getElementById('total-count').innerText = `${data.length} รายการ`;

    const formattedTableData = data.map(item => {
        let pickup = [];
        if (item.cy_date && String(item.cy_date).trim() !== 'NaN' && String(item.cy_date).trim() !== 'null') pickup.push(`CY: ${formatDateTime(item.cy_date)}`);
        if (item.vgm_cutoff && String(item.vgm_cutoff).trim() !== 'NaN' && String(item.vgm_cutoff).trim() !== 'null') pickup.push(`VGM: ${formatDateTime(item.vgm_cutoff)}`);
        if (item.cutoff_time && String(item.cutoff_time).trim() !== 'NaN' && String(item.cutoff_time).trim() !== 'null') pickup.push(`CUTOFF: ${formatDateTime(item.cutoff_time)}`);
        if (item.rent_cutoff && String(item.rent_cutoff).trim() !== 'NaN' && String(item.rent_cutoff).trim() !== 'null') pickup.push(`RENT: ${formatDateTime(item.rent_cutoff)}`);

        let delivery = [];
        if (item.load_date && String(item.load_date).trim() !== 'NaN' && String(item.load_date).trim() !== 'null') delivery.push(`LOAD: ${formatDateTime(item.load_date)}`);
        if (item.unload_date && String(item.unload_date).trim() !== 'NaN' && String(item.unload_date).trim() !== 'null') delivery.push(`UNLOAD: ${formatDateTime(item.unload_date)}`);

        let ret = [];
        if (item.open_gate && String(item.open_gate).trim() !== 'NaN' && String(item.open_gate).trim() !== 'null') ret.push(`GATE: ${formatDateTime(item.open_gate)}`);
        if (item.return_date && String(item.return_date).trim() !== 'NaN' && String(item.return_date).trim() !== 'null') ret.push(`RETURN: ${formatDateTime(item.return_date)}`);

        // จัดการชื่องาน ไม่ให้โชว์ '-' ถ้ามีข้อมูล
        const jobNameDisplay = (item.job_name && String(item.job_name).trim() !== 'NaN') ? item.job_name : (item.job_title || '-');

        return [
            false, 
            item.id, 
            item.booking_no || '', 
            item.mode || 'EXPORT', 
            item.run_date ? String(item.run_date).split('T')[0] : '', 
            item.customer_name || '', 
            jobNameDisplay, // <--- แสดงชื่องานได้ถูกต้องแล้ว
            item.origin || '', 
            item.destination || '', 
            item.container_count || 1, 
            pickup.join('\n') || 'คลิกเพิ่มเวลา', 
            delivery.join('\n') || 'คลิกเพิ่มเวลา', 
            ret.join('\n') || 'คลิกเพิ่มเวลา', 
            item.booking_no 
        ];
    });

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: ['✔', 'ID', 'Booking / BL', 'MODE', '📅 วันที่วิ่งงาน', 'ลูกค้า', 'ชื่องาน', 'ต้นทาง', 'ปลายทาง', 'ตู้', '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN', 'การจัดการ'],
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold' }, 
            { type: 'text', className: 'font-bold text-primary' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD', className: 'htCenter cursor-pointer' }, 
            { type: 'text', className: 'font-semibold text-slate-800' }, 
            { type: 'text', className: 'font-medium text-slate-800' }, // ชื่องานเน้นตัวหนานิดนึง
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'numeric', className: 'htCenter font-bold text-blue-600 bg-blue-50/20' }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if (value) {
                        td.innerHTML = `
                            <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(value)}'" class="btn-grid btn-manage"><i class="fa-solid fa-boxes-stacked"></i> ลงตู้</button>
                            <button onclick="window.location.href='/booking-monitor.html?select=${encodeURIComponent(value)}'" class="btn-grid btn-dispatch"><i class="fa-solid fa-truck-fast"></i> จัดรถ</button>
                        `;
                        td.style.textAlign = 'center';
                    }
                } 
            }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',
        colWidths: [30, 45, 120, 75, 95, 120, 140, 90, 90, 40, 140, 140, 140, 130],

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) editedRowIndices.add(row);
            });
            updateSaveStatusBadge();
            this.render(); 
        },
        cells: function(row, col) {
            const cp = {};
            if (editedRowIndices.has(row)) cp.className = (cp.className || '') + ' ht-edited-row';
            return cp;
        }
    });
}

// 🌟 วาดเซลล์เวลาให้คลิกเพื่อเปิด Modal ได้
window.renderClickableTimeCell = function(instance, td, row, col, prop, value) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    let content = value ? String(value).replace(/\n/g, '<br>') : '-';
    let textStyle = value === 'คลิกเพิ่มเวลา' ? 'text-slate-300 font-normal italic' : 'text-slate-800 font-bold';
    
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[35px] cell-time-hover p-1 rounded transition-colors ${textStyle}" onclick="openDateTimeModal(${row}, ${col})">
            ${content}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-sm items-center justify-center">
               <i class="fa-solid fa-pen text-[10px]"></i>
            </div>
        </div>
    `;
    td.style.fontSize = '10px'; td.style.lineHeight = '1.4';
};

// 💡 แก้บั๊ก: รองรับทั้งเวลาที่มีตัว T (ISO format) และแบบเว้นวรรคปกติ
function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).replace('T', ' '); // เปลี่ยน T เป็นช่องว่าง
    return cleanStr.length >= 16 ? cleanStr.substring(0, 16) : cleanStr; // เอาแค่ YYYY-MM-DD HH:mm
}

// ----------------------------------------------------
// 🪟 ระบบ Modal Pop-up แก้ไขเวลา
// ----------------------------------------------------
let currentModalRow = -1;
let currentModalCol = -1;

window.openDateTimeModal = function(row, col) {
    currentModalRow = row; currentModalCol = col;
    const gridData = hotGridInstance.getDataAtRow(row);
    const bookingNo = gridData[2];
    const mode = gridData[3];
    
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if (!item) return;

    let html = '';
    let title = '';

    if (col === 10) { // PICK UP
        title = 'เวลา PICK UP (รับตู้/ลาน)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('cy_date', 'CY Date & Time', item.cy_date);
            html += createDatetimeInput('vgm_cutoff', 'VGM Cutoff (Time)', item.vgm_cutoff);
            html += createDatetimeInput('cutoff_time', 'Cutoff Time', item.cutoff_time);
        } else {
            html += createDatetimeInput('cy_date', 'CY Date & Time', item.cy_date);
            html += createDatetimeInput('rent_cutoff', 'Rent Cutoff (Time)', item.rent_cutoff);
            html += createDatetimeInput('demurrage', 'Demurrage', item.demurrage);
        }
    } else if (col === 11) { // DELIVERY
        title = 'เวลา DELIVERY (โหลดของ/ลงของ)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('load_date', 'Load Date & Time', item.load_date);
        } else {
            html += createDatetimeInput('unload_date', 'Unload Date & Time', item.unload_date);
        }
    } else if (col === 12) { // RETURN
        title = 'เวลา RETURN (คืนตู้/เข้าท่า)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('open_gate', 'Open Gate & Time', item.open_gate);
        } else {
            html += createDatetimeInput('return_date', 'Return Date & Time', item.return_date);
        }
    }

    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = html;

    const modal = document.getElementById('datetime-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('datetime-modal-content').classList.remove('scale-95');
    }, 10);
};

// 💡 แก้บั๊ก Input DateTime ให้รองรับ Value Format
function createDatetimeInput(field, label, val) {
    let formattedVal = '';
    if (val && String(val).trim() !== 'NaN' && String(val).trim() !== 'null') {
        formattedVal = String(val).replace(' ', 'T').substring(0, 16);
    }
    return `
        <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
            <input type="datetime-local" id="modal_input_${field}" value="${formattedVal}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
        </div>
    `;
}

window.closeDateTimeModal = function() {
    const modal = document.getElementById('datetime-modal');
    modal.classList.add('opacity-0');
    document.getElementById('datetime-modal-content').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.saveDateTimeModal = function() {
    const gridData = hotGridInstance.getDataAtRow(currentModalRow);
    const bookingNo = gridData[2];
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if(!item) return;

    const inputs = document.querySelectorAll('#modal-body input[type="datetime-local"]');
    inputs.forEach(input => {
        const field = input.id.replace('modal_input_', '');
        item[field] = input.value ? input.value.replace('T', ' ') : null; // เซฟคืนให้เป็นช่องว่างแทน T
    });

    let pickupInfo = [], deliveryInfo = [], returnInfo = [];
    if (item.cy_date && item.cy_date !== 'null') pickupInfo.push(`CY: ${formatDateTime(item.cy_date)}`);
    if (item.vgm_cutoff && item.vgm_cutoff !== 'null') pickupInfo.push(`VGM: ${formatDateTime(item.vgm_cutoff)}`);
    if (item.cutoff_time && item.cutoff_time !== 'null') pickupInfo.push(`CUTOFF: ${formatDateTime(item.cutoff_time)}`);
    if (item.rent_cutoff && item.rent_cutoff !== 'null') pickupInfo.push(`RENT: ${formatDateTime(item.rent_cutoff)}`);
    
    if (item.load_date && item.load_date !== 'null') deliveryInfo.push(`LOAD: ${formatDateTime(item.load_date)}`);
    if (item.unload_date && item.unload_date !== 'null') deliveryInfo.push(`UNLOAD: ${formatDateTime(item.unload_date)}`);
    
    if (item.open_gate && item.open_gate !== 'null') returnInfo.push(`GATE: ${formatDateTime(item.open_gate)}`);
    if (item.return_date && item.return_date !== 'null') returnInfo.push(`RETURN: ${formatDateTime(item.return_date)}`);

    if (currentModalCol === 10) hotGridInstance.setDataAtCell(currentModalRow, 10, pickupInfo.join('\n') || 'คลิกเพิ่มเวลา');
    if (currentModalCol === 11) hotGridInstance.setDataAtCell(currentModalRow, 11, deliveryInfo.join('\n') || 'คลิกเพิ่มเวลา');
    if (currentModalCol === 12) hotGridInstance.setDataAtCell(currentModalRow, 12, returnInfo.join('\n') || 'คลิกเพิ่มเวลา');

    editedRowIndices.add(currentModalRow);
    updateSaveStatusBadge();
    closeDateTimeModal();
};

// ----------------------------------------------------
function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge');
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> ${count} รายการรอการบันทึก`;
    } else {
        badge.className = "text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-check text-emerald-500"></i> บันทึกข้อมูลแล้ว`;
    }
}

// 💾 บันทึกตาราง
window.saveGridChanges = async function() {
    if (!hotGridInstance || editedRowIndices.size === 0) return;
    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;

    const data = hotGridInstance.getData();
    let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex];
        if (!row[1]) continue; 
        const item = filteredList.find(i => i.booking_no === row[2]);

        const updateData = {
            booking_no: row[2], mode: row[3], run_date: row[4],
            customer_name: row[5], job_name: row[6], origin: row[7], 
            destination: row[8], container_count: row[9],
            cy_date: item.cy_date, vgm_cutoff: item.vgm_cutoff, cutoff_time: item.cutoff_time,
            rent_cutoff: item.rent_cutoff, demurrage: item.demurrage,
            load_date: item.load_date, unload_date: item.unload_date,
            open_gate: item.open_gate, return_date: item.return_date
        };

        try {
            const res = await fetch(`/api/bookings/${row[1]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            if (res.ok) successCount++;
        } catch (err) {}
    }

    btn.innerHTML = orgText; btn.disabled = false;
    if (successCount > 0) { 
        alert(`✅ บันทึกข้อมูลสำเร็จ ${successCount} รายการ`); 
        editedRowIndices.clear(); loadBookingGridData(); 
    }
};

window.deleteSelectedRows = async function() {
    if (!hotGridInstance) return;
    const idsToDelete = [];
    hotGridInstance.getData().forEach(row => { if (row[0] && row[1]) idsToDelete.push(row[1]); });
    if (idsToDelete.length === 0) return;
    if (!confirm(`⚠️ ยืนยันการลบ ${idsToDelete.length} รายการ?`)) return;
    for (let id of idsToDelete) { try { await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); } catch (err) {} }
    alert('✅ ลบรายการสำเร็จ'); loadBookingGridData();
};