// ==========================================
// 📋 MODULE: BOOKING LIST (Typeable Filters & Overdue Blinking)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 
let showOnlyOverdue = false; // 🌟 สถานะปุ่มกดดูเฉพาะ Overdue

window.addEventListener('DOMContentLoaded', () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    // เคลียร์ความจำตาราง Version 1.4
    if (localStorage.getItem('tms_list_version') !== '1.4') {
        localStorage.removeItem('tms_booking_list_settings');
        localStorage.setItem('tms_list_version', '1.4');
    } else {
        try {
            const savedData = localStorage.getItem('tms_booking_list_settings');
            if (savedData) userGridSettings = JSON.parse(savedData);
        } catch (err) {}
    }
    loadBookingGridData();
});

function applyZebraStripingCSS() {
    if (!document.getElementById('tms-zebra-css')) {
        const style = document.createElement('style');
        style.id = 'tms-zebra-css';
        style.innerHTML = `
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr td.ht-edited-row { background-color: #fef9c3 !important; }
            .handsontable tbody tr:hover td { background-color: #e2e8f0 !important; transition: all 0.2s; }
        `;
        document.head.appendChild(style);
    }
}

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
            updateOverdueBadge(); // 🌟 อัปเดตปุ่ม Overdue
            
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

// 🌟 เปลี่ยนจาก select เป็นเติมค่าใน datalist แทน 🌟
function populateRunDateFilter(data) {
    const dl = document.getElementById('dl-run-date');
    if(!dl) return;
    dl.innerHTML = '';
    const dates = new Set();
    data.forEach(i => { if (i.run_date) dates.add(String(i.run_date).split('T')[0]); });
    Array.from(dates).sort().forEach(d => dl.innerHTML += `<option value="${d}">`);
}

function populateCustomerFilter(data) {
    const dl = document.getElementById('dl-customer');
    if(!dl) return;
    dl.innerHTML = '';
    const custs = new Set();
    data.forEach(i => { if (i.customer_name) custs.add(String(i.customer_name).trim()); });
    Array.from(custs).sort().forEach(c => dl.innerHTML += `<option value="${c}">`);
}

function populateBookingNoFilter(data) {
    const dl = document.getElementById('dl-booking-no');
    if(!dl) return;
    dl.innerHTML = '';
    const books = new Set();
    data.forEach(i => { if (i.booking_no) books.add(String(i.booking_no).trim()); });
    Array.from(books).sort().forEach(b => dl.innerHTML += `<option value="${b}">`);
}

window.onRunDateChange = function() {
    const d = document.getElementById('filter-run-date').value;
    let scoped = rawBookingList;
    if (d) scoped = rawBookingList.filter(i => i.run_date && String(i.run_date).split('T')[0] === d);
    populateCustomerFilter(scoped);
    populateBookingNoFilter(scoped);
    applyFilters();
}

window.onCustomerChange = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    let scoped = rawBookingList;
    if (d) scoped = scoped.filter(i => i.run_date && String(i.run_date).split('T')[0] === d);
    if (c) scoped = scoped.filter(i => i.customer_name && String(i.customer_name).trim() === c);
    populateBookingNoFilter(scoped);
    applyFilters();
}

// 🌟 ฟังก์ชันเช็คว่า Booking นี้ Overdue หรือไม่
window.isOverdueItem = function(item) {
    const now = new Date();
    const datesToCheck = [item.cy_date, item.vgm_cutoff, item.cutoff_time, item.rent_cutoff, item.demurrage, item.load_date, item.unload_date, item.open_gate, item.return_date];
    for (let d of datesToCheck) {
        if (d && String(d).trim() !== 'NaN' && String(d).trim() !== 'null') {
            const dt = new Date(String(d).replace(' ', 'T'));
            if (dt < now) return true;
        }
    }
    return false;
};

// 🌟 อัปเดตป้ายแจ้งเตือนจำนวน Overdue
function updateOverdueBadge() {
    const badge = document.getElementById('overdue-badge');
    const badgeCount = document.getElementById('overdue-count');
    if (!badge || !badgeCount) return;
    
    const overdueCount = rawBookingList.filter(window.isOverdueItem).length;
    if (overdueCount > 0) {
        badgeCount.innerText = overdueCount;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
    } else {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
    }
}

// 🌟 ฟังก์ชันกดปุ่ม Filter ตัว Overdue
window.toggleOverdueFilter = function() {
    showOnlyOverdue = !showOnlyOverdue;
    const badge = document.getElementById('overdue-badge');
    if(badge) {
        if(showOnlyOverdue) {
            badge.classList.add('ring-2', 'ring-red-500', 'bg-red-200');
        } else {
            badge.classList.remove('ring-2', 'ring-red-500', 'bg-red-200');
        }
    }
    applyFilters();
};

window.applyFilters = function() {
    const d = document.getElementById('filter-run-date')?.value || '';
    const c = document.getElementById('filter-customer')?.value || '';
    const b = document.getElementById('filter-booking-no')?.value || '';
    const searchEl = document.getElementById('search-text');
    const txt = searchEl ? searchEl.value.toLowerCase().trim() : '';

    filteredList = rawBookingList.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';
        
        const matchD = !d || iD === d;
        const matchC = !c || iC === c;
        const matchB = !b || iB === b;
        const matchTxt = !txt || JSON.stringify(item).toLowerCase().includes(txt);
        
        // 🌟 กรองแสดงเฉพาะ Overdue ถ้าเปิดใช้งาน
        const matchOverdue = !showOnlyOverdue || window.isOverdueItem(item);

        return matchD && matchC && matchB && matchTxt && matchOverdue;
    });
    initBookingHandsontable(filteredList);
};

window.clearQuickFilters = function() {
    if(document.getElementById('filter-run-date')) document.getElementById('filter-run-date').value = '';
    if(document.getElementById('filter-customer')) document.getElementById('filter-customer').value = '';
    if(document.getElementById('filter-booking-no')) document.getElementById('filter-booking-no').value = '';
    if(document.getElementById('search-text')) document.getElementById('search-text').value = '';
    showOnlyOverdue = false;
    const badge = document.getElementById('overdue-badge');
    if(badge) badge.classList.remove('ring-2', 'ring-red-500', 'bg-red-200');
    
    populateCustomerFilter(rawBookingList);
    populateBookingNoFilter(rawBookingList);
    applyFilters();
};

window.unhideAllColumns = function() {
    if (!hotGridInstance) return;
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    plugin.showColumns(Array.from({length: hotGridInstance.countCols()}, (_, i) => i));
    hotGridInstance.render();
    saveGridUIState();
};

function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }
    document.getElementById('total-count').innerText = `${data.length} รายการ`;

    const formattedTableData = data.map(item => {
        let pickup = [];
        if (item.cy_date && item.cy_date !== 'null') pickup.push(`CY: ${formatDateTime(item.cy_date)}`);
        if (item.vgm_cutoff && item.vgm_cutoff !== 'null') pickup.push(`VGM: ${formatDateTime(item.vgm_cutoff)}`);
        if (item.cutoff_time && item.cutoff_time !== 'null') pickup.push(`CUTOFF: ${formatDateTime(item.cutoff_time)}`);
        if (item.rent_cutoff && item.rent_cutoff !== 'null') pickup.push(`RENT: ${formatDateTime(item.rent_cutoff)}`);
        if (item.demurrage && item.demurrage !== 'null') pickup.push(`DEMUR: ${formatDateTime(item.demurrage)}`);

        let delivery = [];
        if (item.load_date && item.load_date !== 'null') delivery.push(`LOAD: ${formatDateTime(item.load_date)}`);
        if (item.unload_date && item.unload_date !== 'null') delivery.push(`UNLOAD: ${formatDateTime(item.unload_date)}`);

        let ret = [];
        if (item.open_gate && item.open_gate !== 'null') ret.push(`GATE: ${formatDateTime(item.open_gate)}`);
        if (item.return_date && item.return_date !== 'null') ret.push(`RETURN: ${formatDateTime(item.return_date)}`);

        const jobNameDisplay = (item.job_name && item.job_name !== 'NaN') ? item.job_name : (item.job_title || '-');

        return [
            false, item.id, item.booking_no || '', item.mode || 'EXPORT', 
            item.run_date ? String(item.run_date).split('T')[0] : '', item.customer_name || '', 
            jobNameDisplay, item.job_type || '', item.origin || '', item.destination || '', 
            item.container_count || 1, item.price_type || '', item.trip_fee || 0, item.trans_fee || 0, 
            pickup.join('\n') || 'คลิกเพิ่มเวลา', delivery.join('\n') || 'คลิกเพิ่มเวลา', 
            ret.join('\n') || 'คลิกเพิ่มเวลา', item.booking_no 
        ];
    });

    const colHeaders = [
        '✔', 'ID', 'Booking / BL', 'MODE', '📅 วันที่วิ่งงาน', 'ลูกค้า', 'ชื่องาน', 'ประเภทงาน', 
        'ต้นทาง', 'ปลายทาง', 'ตู้', 'ประเภทรถ', 'ค่าเที่ยว', 'ค่าขนส่ง', 
        '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN', 'การจัดการ'
    ];

    let moveConfig = true;
    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === colHeaders.length) {
        moveConfig = userGridSettings.columnPositions;
    }

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: colHeaders,
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold' }, 
            { type: 'text', className: 'font-bold text-primary' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD', className: 'htCenter cursor-pointer' }, 
            { type: 'text', className: 'font-semibold text-slate-800' }, 
            { type: 'text', className: 'font-medium text-slate-800' },
            { type: 'dropdown', source: ['Domestic', 'CONTAINER'] }, 
            { type: 'text' }, { type: 'text' }, 
            { type: 'numeric', className: 'htCenter font-bold text-blue-600 bg-blue-50/20' }, 
            { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-green-700 font-bold' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold' }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if (value) {
                        td.innerHTML = `
                            <div class="flex flex-col items-stretch justify-center gap-1.5 py-1 px-1">
                                <button onclick="window.goToFormEdit('${value}')" class="bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300 font-bold py-1 px-2 rounded text-[10px] shadow-sm"><i class="fa-solid fa-pen-to-square"></i> แก้ฟอร์ม</button>
                                <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(value)}'" class="btn-grid btn-manage shadow-sm py-1"><i class="fa-solid fa-boxes-stacked"></i> ลงตู้</button>
                                <button onclick="window.location.href='/booking-monitor.html?select=${encodeURIComponent(value)}'" class="btn-grid btn-dispatch shadow-sm py-1"><i class="fa-solid fa-truck-fast"></i> จัดรถ</button>
                            </div>
                        `;
                        td.style.verticalAlign = 'middle';
                    }
                } 
            }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: moveConfig,
        colWidths: userGridSettings.columnWidths || [30, 45, 120, 75, 95, 120, 140, 90, 90, 90, 40, 80, 75, 75, 140, 140, 140, 90],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        hiddenColumns: { indicators: true, columns: userGridSettings.hiddenColumns || [] },
        contextMenu: ['alignment', 'hidden_columns_hide', 'clear_column', 'undo', 'redo'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) editedRowIndices.add(row);
            });
            updateSaveStatusBadge();
            this.render(); 
        },
        afterColumnResize: function() { saveGridUIState(); },
        afterColumnMove: function() { saveGridUIState(); },
        afterHideColumns: function() { saveGridUIState(); },
        afterUnhideColumns: function() { saveGridUIState(); },
        cells: function(row, col) {
            const cp = {};
            if (editedRowIndices.has(row)) cp.className = (cp.className || '') + ' ht-edited-row';
            return cp;
        }
    });
}

function saveGridUIState() {
    if (!hotGridInstance) return;
    const colCount = hotGridInstance.countCols();
    const widths = [];
    for (let i = 0; i < colCount; i++) widths.push(hotGridInstance.getColWidth(i));
    
    const movePlugin = hotGridInstance.getPlugin('manualColumnMove');
    let positions = [];
    if (movePlugin && typeof movePlugin.columnsMapper !== 'undefined') positions = movePlugin.columnsMapper.getIndexesSequence();
    
    const hiddenPlugin = hotGridInstance.getPlugin('hiddenColumns');
    const hiddenCols = hiddenPlugin ? hiddenPlugin.getHiddenColumns() : [];

    userGridSettings = { columnWidths: widths, columnPositions: positions, hiddenColumns: hiddenCols };
    localStorage.setItem('tms_booking_list_settings', JSON.stringify(userGridSettings));
}

window.goToFormEdit = function(bookingNo) { window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`; };

// 🌟 ตัว Render ที่ทำหน้าที่เปรียบเทียบเวลาว่า Overdue หรือยัง และสั่งให้กระพริบแดง 🌟
window.renderClickableTimeCell = function(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    let content = '-';
    let textStyle = 'text-slate-800 font-bold';
    
    if (value && value !== 'คลิกเพิ่มเวลา') {
        const lines = String(value).split('\n');
        const now = new Date();
        const htmlLines = lines.map(line => {
            const parts = line.split(': ');
            if (parts.length >= 2) {
                const dtStr = parts.slice(1).join(': ').trim();
                const dt = new Date(dtStr.replace(' ', 'T'));
                // ตรวจสอบว่าเวลาที่ระบุ น้อยกว่าเวลาปัจจุบันหรือไม่ (ถ้าใช่นับเป็น Overdue ทันที)
                if (dt < now) {
                    return `<span class="text-red-600 animate-pulse font-extrabold" title="เลยกำหนดเวลาแล้ว!"><i class="fa-solid fa-circle-exclamation text-[10px]"></i> ${line}</span>`;
                }
            }
            return line;
        });
        content = htmlLines.join('<br>');
    } else if (value === 'คลิกเพิ่มเวลา') {
        content = value;
        textStyle = 'text-slate-300 font-normal italic';
    }

    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[35px] cell-time-hover p-1 rounded transition-colors ${textStyle}" onclick="openDateTimeModal(${row}, ${prop})">
            ${content}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-sm items-center justify-center"><i class="fa-solid fa-pen text-[10px]"></i></div>
        </div>
    `;
    td.style.fontSize = '10px'; td.style.lineHeight = '1.4';
};

function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).replace('T', ' '); 
    return cleanStr.length >= 16 ? cleanStr.substring(0, 16) : cleanStr; 
}

let currentModalRow = -1;
let currentModalProp = -1;

window.openDateTimeModal = function(row, prop) {
    currentModalRow = row; 
    currentModalProp = prop;
    
    const rData = hotGridInstance.getSourceDataAtRow(row);
    const bookingNo = rData[2]; 
    const mode = rData[3];
    
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if (!item) return;

    let html = '';
    let title = '';

    if (prop === 14) { 
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
    } else if (prop === 15) { 
        title = 'เวลา DELIVERY (โหลดของ/ลงของ)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('load_date', 'Load Date & Time', item.load_date);
        } else {
            html += createDatetimeInput('unload_date', 'Unload Date & Time', item.unload_date);
        }
    } else if (prop === 16) { 
        title = 'เวลา RETURN (คืนตู้/เข้าท่า)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('open_gate', 'Open Gate & Time', item.open_gate);
        } else {
            html += createDatetimeInput('return_date', 'Return Date & Time', item.return_date);
        }
    } else { return; }

    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = html;

    const modal = document.getElementById('datetime-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('datetime-modal-content').classList.remove('scale-95');
    }, 10);
};

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
    const rData = hotGridInstance.getSourceDataAtRow(currentModalRow);
    const bookingNo = rData[2];
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if(!item) return;

    const inputs = document.querySelectorAll('#modal-body input[type="datetime-local"]');
    inputs.forEach(input => {
        const field = input.id.replace('modal_input_', '');
        item[field] = input.value ? input.value.replace('T', ' ') : null; 
    });

    let pickupInfo = [], deliveryInfo = [], returnInfo = [];
    if (item.cy_date && item.cy_date !== 'null') pickupInfo.push(`CY: ${formatDateTime(item.cy_date)}`);
    if (item.vgm_cutoff && item.vgm_cutoff !== 'null') pickupInfo.push(`VGM: ${formatDateTime(item.vgm_cutoff)}`);
    if (item.cutoff_time && item.cutoff_time !== 'null') pickupInfo.push(`CUTOFF: ${formatDateTime(item.cutoff_time)}`);
    if (item.rent_cutoff && item.rent_cutoff !== 'null') pickupInfo.push(`RENT: ${formatDateTime(item.rent_cutoff)}`);
    if (item.demurrage && item.demurrage !== 'null') pickupInfo.push(`DEMUR: ${formatDateTime(item.demurrage)}`);
    
    if (item.load_date && item.load_date !== 'null') deliveryInfo.push(`LOAD: ${formatDateTime(item.load_date)}`);
    if (item.unload_date && item.unload_date !== 'null') deliveryInfo.push(`UNLOAD: ${formatDateTime(item.unload_date)}`);
    
    if (item.open_gate && item.open_gate !== 'null') returnInfo.push(`GATE: ${formatDateTime(item.open_gate)}`);
    if (item.return_date && item.return_date !== 'null') returnInfo.push(`RETURN: ${formatDateTime(item.return_date)}`);

    if (currentModalProp === 14) hotGridInstance.setDataAtRowProp(currentModalRow, 14, pickupInfo.join('\n') || 'คลิกเพิ่มเวลา');
    if (currentModalProp === 15) hotGridInstance.setDataAtRowProp(currentModalRow, 15, deliveryInfo.join('\n') || 'คลิกเพิ่มเวลา');
    if (currentModalProp === 16) hotGridInstance.setDataAtRowProp(currentModalRow, 16, returnInfo.join('\n') || 'คลิกเพิ่มเวลา');

    editedRowIndices.add(currentModalRow);
    
    // รีเฟรชป้ายแจ้งเตือนเผื่อมีการเลื่อนเวลาให้รอดพ้น Overdue
    updateOverdueBadge();
    updateSaveStatusBadge();
    closeDateTimeModal();
};

function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge');
    if(!badge) return;
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> ${count} รายการรอการบันทึก`;
    } else {
        badge.className = "text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-check text-emerald-500"></i> บันทึกข้อมูลแล้ว`;
    }
}

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
            customer_name: row[5], job_name: row[6], job_type: row[7], origin: row[8], 
            destination: row[9], container_count: row[10], price_type: row[11],
            trip_fee: row[12], trans_fee: row[13],
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
    const selectedRanges = hotGridInstance.getSelected() || [];
    const data = hotGridInstance.getData();
    const idsToDelete = new Set();
    
    selectedRanges.forEach(([row1, col1, row2, col2]) => {
        const startRow = Math.min(row1, row2);
        const endRow = Math.max(row1, row2);
        for (let r = startRow; r <= endRow; r++) {
            const rowData = hotGridInstance.getSourceDataAtRow(r);
            if (rowData && rowData[1]) idsToDelete.add(rowData[1]); 
        }
    });

    data.forEach((row, index) => {
        if (row[0] === true) {
            const rowData = hotGridInstance.getSourceDataAtRow(index);
            if (rowData && rowData[1]) idsToDelete.add(rowData[1]);
        }
    });

    const idsArray = Array.from(idsToDelete);
    if (idsArray.length === 0) {
        alert('🖱️ กรุณาคลุมดำแถว (หรือติ๊กถูกหน้าแถว) ที่ต้องการจะลบก่อนครับ');
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบทิ้ง ${idsArray.length} บุคกิ้ง?\n\n(ตู้ทั้งหมดที่อยู่ในบุคกิ้งเหล่านี้จะถูกลบทิ้งไปด้วยอัตโนมัติ)`)) return;

    let successCount = 0;
    for (let id of idsArray) { 
        try { 
            const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); 
            if(res.ok) successCount++;
        } catch (err) {} 
    }
    
    if (successCount > 0) {
        alert(`✅ ลบรายการสำเร็จ ${successCount} บุคกิ้ง`); 
        editedRowIndices.clear(); 
        updateSaveStatusBadge();
        loadBookingGridData();
    } else {
        alert(`❌ ไม่สามารถลบข้อมูลได้ หรือเชื่อมต่อเซิร์ฟเวอร์ไม่ได้`);
    }
};