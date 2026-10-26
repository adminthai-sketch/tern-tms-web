// ==========================================
// 📋 MODULE: BOOKING LIST (Cross-Filtering, Global Search, Summary Footer)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 

window.addEventListener('DOMContentLoaded', async () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    try {
        const res = await fetch(`/api/users/grid-settings?userId=${user.id}`);
        if (res.ok) {
            const data = await res.json();
            userGridSettings = data.settings?.['booking_list'] || {};
        }
    } catch (err) {}
    
    loadBookingGridData();
});

function applyZebraStripingCSS() {
    if (!document.getElementById('tms-zebra-css')) {
        const style = document.createElement('style');
        style.id = 'tms-zebra-css';
        style.innerHTML = `
            /* 🌟 ตกแต่งตารางให้ Compact และมินิมอลขึ้น 🌟 */
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr td.ht-edited-row { background-color: #fef9c3 !important; }
            .handsontable tbody tr:hover td { background-color: #f1f5f9 !important; transition: all 0.2s; }
            
            /* ลดขนาดช่องว่าง (Padding) ให้ตารางดูไม่เทอะทะ */
            .handsontable th { background-color: #f1f5f9; color: #475569; font-weight: 700; border-color: #e2e8f0; font-size: 11px; padding: 4px 2px !important; }
            .handsontable td { border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; }
            
            /* สไตล์สำหรับกล่องป้ายเวลา (ลดความสูงลง) */
            .time-badge { display: block; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; margin-bottom: 2px; border: 1px solid transparent; line-height: 1.2; text-align: left; letter-spacing: -0.2px; }
            .time-cy { background-color: #f0f9ff; color: #0284c7; border-color: #bae6fd; }
            .time-cutoff { background-color: #fef2f2; color: #dc2626; border-color: #fecaca; }
            .time-load { background-color: #fffbeb; color: #d97706; border-color: #fde68a; }
            .time-gate { background-color: #ecfdf5; color: #059669; border-color: #a7f3d0; }
            .time-return { background-color: #f8fafc; color: #475569; border-color: #e2e8f0; }
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
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawBookingList = result.data;
            filteredList = [...rawBookingList];
            editedRowIndices.clear();
            
            updateSaveStatusBadge();
            updateDropdownOptions();
            initBookingHandsontable(filteredList);
            updateSummaryFooter(filteredList);
        } else {
            rawBookingList = []; filteredList = [];
            initBookingHandsontable([]);
            updateSummaryFooter([]);
        }
    } catch (err) { 
        initBookingHandsontable([]); 
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

function updateDropdownOptions() {
    const dVal = document.getElementById('filter-run-date').value;
    const cVal = document.getElementById('filter-customer').value;
    const bVal = document.getElementById('filter-booking-no').value;

    const dates = new Set(), custs = new Set(), books = new Set();

    rawBookingList.forEach(i => {
        const iD = i.run_date ? String(i.run_date).split('T')[0] : '';
        const iC = i.customer_name ? String(i.customer_name).trim() : '';
        const iJ = i.job_name ? String(i.job_name).trim() : '';
        const iB = i.booking_no ? String(i.booking_no).trim() : '';

        const matchC = !cVal || iC === cVal || iJ === cVal;
        const matchB = !bVal || iB === bVal;
        const matchD = !dVal || iD === dVal;

        if (matchC && matchB && iD) dates.add(iD);
        if (matchD && matchB) { if (iC) custs.add(iC); if (iJ) custs.add(iJ); }
        if (matchD && matchC && iB) books.add(iB);
    });

    const dlDate = document.getElementById('dl-run-date');
    const dlCust = document.getElementById('dl-customer');
    const dlBook = document.getElementById('dl-booking-no');

    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleCrossFilter = function() { updateDropdownOptions(); applyFilters(); };

window.applyFilters = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    const isToday = document.getElementById('qf-today').classList.contains('bg-blue-50');
    const isTomorrow = document.getElementById('qf-tomorrow').classList.contains('bg-blue-50');

    const todayStr = new Date().toISOString().split('T')[0];
    const tomDate = new Date(); tomDate.setDate(tomDate.getDate() + 1);
    const tomorrowStr = tomDate.toISOString().split('T')[0];

    filteredList = rawBookingList.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iJ = item.job_name ? String(item.job_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';
        
        const matchD = !d || iD === d;
        const matchC = !c || iC === c || iJ === c;
        const matchB = !b || iB === b;
        
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);

        let matchQF = true;
        if (isToday) matchQF = matchQF && (iD === todayStr);
        if (isTomorrow) matchQF = matchQF && (iD === tomorrowStr);

        return matchD && matchC && matchB && matchGlobal && matchQF;
    });

    initBookingHandsontable(filteredList);
    updateSummaryFooter(filteredList);
};

window.clearAllFilters = function() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    document.getElementById('global-search').value = '';
    
    ['today', 'tomorrow'].forEach(id => {
        const btn = document.getElementById('qf-' + id);
        btn.classList.remove('bg-blue-50', 'text-blue-600', 'border-blue-300');
        btn.classList.add('bg-white', 'text-slate-600');
    });

    updateDropdownOptions(); applyFilters();
};

window.setQuickFilter = function(type) {
    const btn = document.getElementById('qf-' + type);
    ['today', 'tomorrow'].forEach(id => {
        if (id !== type) {
            const b = document.getElementById('qf-' + id);
            b.classList.remove('bg-blue-50', 'text-blue-600', 'border-blue-300');
            b.classList.add('bg-white', 'text-slate-600');
        }
    });
    btn.classList.toggle('bg-blue-50'); btn.classList.toggle('text-blue-600'); 
    btn.classList.toggle('border-blue-300'); btn.classList.toggle('bg-white'); 
    btn.classList.toggle('text-slate-600');
    applyFilters();
};

function updateSummaryFooter(data) {
    let sumContainers = 0;
    let sumTrans = 0;
    let sumTrip = 0;

    data.forEach(item => {
        let count = parseInt(item.container_count) || 0;
        sumContainers += count;
        sumTrans += (parseFloat(item.trans_fee) || 0) * count;
        sumTrip += (parseFloat(item.trip_fee) || 0) * count;
    });

    document.getElementById('sum-count').innerText = data.length.toLocaleString();
    document.getElementById('sum-container').innerText = sumContainers.toLocaleString();
    document.getElementById('sum-trans').innerText = sumTrans.toLocaleString();
    document.getElementById('sum-trip').innerText = sumTrip.toLocaleString();
}

// ==========================================
// 📊 จัดการตาราง Handsontable (เพิ่ม AGENT และ ขนาดตู้)
// ==========================================
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const formattedTableData = data.map(item => {
        let pickup = [];
        if (item.cy_date && item.cy_date !== 'null') pickup.push(`<div class="time-badge time-cy">CY: ${formatDateTime(item.cy_date)}</div>`);
        if (item.vgm_cutoff && item.vgm_cutoff !== 'null') pickup.push(`<div class="time-badge time-cutoff">VGM: ${formatDateTime(item.vgm_cutoff)}</div>`);
        if (item.cutoff_time && item.cutoff_time !== 'null') pickup.push(`<div class="time-badge time-cutoff">CUT: ${formatDateTime(item.cutoff_time)}</div>`);
        if (item.rent_cutoff && item.rent_cutoff !== 'null') pickup.push(`<div class="time-badge time-cutoff">RNT: ${formatDateTime(item.rent_cutoff)}</div>`);
        if (item.demurrage && item.demurrage !== 'null') pickup.push(`<div class="time-badge time-cutoff">DMR: ${formatDateTime(item.demurrage)}</div>`);

        let delivery = [];
        if (item.load_date && item.load_date !== 'null') delivery.push(`<div class="time-badge time-load">LD: ${formatDateTime(item.load_date)}</div>`);
        if (item.unload_date && item.unload_date !== 'null') delivery.push(`<div class="time-badge time-load">UN: ${formatDateTime(item.unload_date)}</div>`);

        let ret = [];
        if (item.open_gate && item.open_gate !== 'null') ret.push(`<div class="time-badge time-gate">GT: ${formatDateTime(item.open_gate)}</div>`);
        if (item.return_date && item.return_date !== 'null') ret.push(`<div class="time-badge time-return">RT: ${formatDateTime(item.return_date)}</div>`);

        const jobNameDisplay = (item.job_name && item.job_name !== 'NaN') ? item.job_name : (item.job_title || '-');

        return [
            false, item.id, item.booking_no || '', item.mode || 'EXPORT', 
            item.run_date ? String(item.run_date).split('T')[0] : '', item.customer_name || '', 
            item.agent || '', // 🌟 เพิ่ม AGENT
            jobNameDisplay, item.job_type || '', item.origin || '', item.destination || '', 
            item.container_count || 1, 
            item.container_size || '', // 🌟 เพิ่ม ขนาดตู้
            item.price_type || '', item.trip_fee || 0, item.trans_fee || 0, 
            pickup.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>', 
            delivery.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>', 
            ret.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>', 
            item.booking_no 
        ];
    });

    // 🌟 หัวคอลัมน์ใหม่ (รวม 20 คอลัมน์)
    const colHeaders = [
        '✔', 'ID', 'Booking / BL', 'MODE', '📅 วันที่วิ่ง', 'ลูกค้า', 'AGENT', 'ชื่องาน', 'ประเภท', 
        'ต้นทาง', 'ปลายทาง', 'ตู้', 'ขนาด', 'รถ', 'ค่าเที่ยว', 'ค่าขนส่ง', 
        '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN', '⚙️ จัดการ'
    ];

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: colHeaders,
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold bg-slate-50' }, 
            { type: 'text', className: 'font-bold text-primary htMiddle' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'], className: 'htCenter htMiddle font-bold text-slate-600' }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD', className: 'htCenter htMiddle text-slate-700 font-medium' }, 
            { type: 'text', className: 'font-bold text-slate-800 htMiddle' }, 
            { type: 'text', className: 'font-medium text-purple-700 htMiddle bg-purple-50/30' }, // AGENT
            { type: 'text', className: 'font-medium text-slate-700 htMiddle' }, 
            { type: 'dropdown', source: ['Domestic', 'CONTAINER'], className: 'htCenter htMiddle text-slate-600' }, 
            { type: 'text', className: 'htMiddle text-slate-600' }, 
            { type: 'text', className: 'htMiddle text-slate-600' }, 
            { type: 'numeric', className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/50' }, 
            { type: 'text', className: 'htCenter htMiddle font-bold text-blue-700' }, // ขนาดตู้
            { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'], className: 'htCenter htMiddle text-slate-600' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold htRight htMiddle' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold htRight htMiddle' }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if (value) {
                        // 🌟 ปุ่มเล็กลง และดีไซน์ให้ไม่เกะกะ 🌟
                        td.innerHTML = `
                            <div class="flex flex-col items-stretch justify-center gap-1 p-0.5 h-full">
                                <button onclick="window.goToFormEdit('${value}')" class="bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-300 hover:border-amber-400 font-bold py-1 px-1 rounded shadow-sm text-[10px] transition-all flex items-center justify-center gap-1">
                                    <i class="fa-solid fa-pen-to-square text-amber-500"></i> แก้ไข
                                </button>
                                <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(value)}'" class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-1 px-1 rounded shadow-sm text-[10px] transition-all flex items-center justify-center gap-1 border border-transparent">
                                    <i class="fa-solid fa-truck-fast"></i> จัดรถ/ลงตู้
                                </button>
                            </div>
                        `;
                        td.style.verticalAlign = 'middle';
                    }
                } 
            }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        // 🌟 ปรับความกว้างคอลัมน์ให้สมส่วนขึ้น 🌟
        colWidths: userGridSettings.columnWidths || [30, 40, 110, 75, 80, 100, 80, 120, 75, 80, 80, 40, 50, 50, 60, 60, 110, 110, 110, 80],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

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

    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === colHeaders.length) {
        try { hotGridInstance.getPlugin('manualColumnMove').moveColumns(userGridSettings.columnPositions, 0); } catch(e) {}
    }
}

window.saveGridSettings = async function() {
    if (!hotGridInstance) return;
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    const colCount = hotGridInstance.countCols();
    const widths = [];
    for (let i = 0; i < colCount; i++) widths.push(hotGridInstance.getColWidth(i));
    
    const movePlugin = hotGridInstance.getPlugin('manualColumnMove');
    let positions = [];
    if (movePlugin && typeof movePlugin.columnsMapper !== 'undefined') {
        positions = movePlugin.columnsMapper.getIndexesSequence();
    }

    try {
        await fetch('/api/users/grid-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'booking_list', settings: { columnWidths: widths, columnPositions: positions } })
        });
        alert('✅ บันทึกมุมมองตารางสำหรับคุณเรียบร้อยแล้ว!');
    } catch (err) {}
};

window.goToFormEdit = function(bookingNo) { window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`; };

window.renderClickableTimeCell = function(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[25px] p-0.5 rounded transition-colors" onclick="openDateTimeModal(${row}, ${prop})">
            <div class="flex flex-col items-start justify-center h-full gap-[1px]">
                ${value}
            </div>
            <div class="absolute top-0 right-0 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-md items-center justify-center transition-all z-10"><i class="fa-solid fa-pen text-[9px]"></i></div>
        </div>
    `;
    td.style.verticalAlign = 'middle';
    if (!value || value.includes('+ เวลา')) {
        td.style.backgroundColor = '#f8fafc';
    }
};

function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).replace('T', ' '); 
    return cleanStr.length >= 16 ? cleanStr.substring(5, 16) : cleanStr; // 🌟 ตัดปีออกโชว์แค่ MM-DD HH:mm เพื่อประหยัดที่
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

    // Index อัปเดตใหม่: PickUp=16, Delivery=17, Return=18
    if (prop === 16) { 
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
    } else if (prop === 17) { 
        title = 'เวลา DELIVERY (โหลดของ/ลงของ)';
        if (mode === 'EXPORT') {
            html += createDatetimeInput('load_date', 'Load Date & Time', item.load_date);
        } else {
            html += createDatetimeInput('unload_date', 'Unload Date & Time', item.unload_date);
        }
    } else if (prop === 18) { 
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

    editedRowIndices.add(currentModalRow);
    
    let pickup = [], delivery = [], ret = [];
    if (item.cy_date && item.cy_date !== 'null') pickup.push(`<div class="time-badge time-cy">CY: ${formatDateTime(item.cy_date)}</div>`);
    if (item.vgm_cutoff && item.vgm_cutoff !== 'null') pickup.push(`<div class="time-badge time-cutoff">VGM: ${formatDateTime(item.vgm_cutoff)}</div>`);
    if (item.cutoff_time && item.cutoff_time !== 'null') pickup.push(`<div class="time-badge time-cutoff">CUT: ${formatDateTime(item.cutoff_time)}</div>`);
    if (item.rent_cutoff && item.rent_cutoff !== 'null') pickup.push(`<div class="time-badge time-cutoff">RNT: ${formatDateTime(item.rent_cutoff)}</div>`);
    if (item.demurrage && item.demurrage !== 'null') pickup.push(`<div class="time-badge time-cutoff">DMR: ${formatDateTime(item.demurrage)}</div>`);
    
    if (item.load_date && item.load_date !== 'null') delivery.push(`<div class="time-badge time-load">LD: ${formatDateTime(item.load_date)}</div>`);
    if (item.unload_date && item.unload_date !== 'null') delivery.push(`<div class="time-badge time-load">UN: ${formatDateTime(item.unload_date)}</div>`);
    
    if (item.open_gate && item.open_gate !== 'null') ret.push(`<div class="time-badge time-gate">GT: ${formatDateTime(item.open_gate)}</div>`);
    if (item.return_date && item.return_date !== 'null') ret.push(`<div class="time-badge time-return">RT: ${formatDateTime(item.return_date)}</div>`);

    // อัปเดตตาราง
    if (currentModalProp === 16) hotGridInstance.setDataAtRowProp(currentModalRow, 16, pickup.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>');
    if (currentModalProp === 17) hotGridInstance.setDataAtRowProp(currentModalRow, 17, delivery.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>');
    if (currentModalProp === 18) hotGridInstance.setDataAtRowProp(currentModalRow, 18, ret.join('') || '<span class="text-slate-300 italic text-[10px]">+ เวลา</span>');

    updateSaveStatusBadge();
    closeDateTimeModal();
};

function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge');
    if(!badge) return;
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "ml-auto text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> ${count} รอเซฟ`;
    } else {
        badge.className = "ml-auto text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-check text-emerald-500"></i> บันทึกแล้ว`;
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
            customer_name: row[5], agent: row[6], job_name: row[7], job_type: row[8], origin: row[9], 
            destination: row[10], container_count: row[11], container_size: row[12], price_type: row[13],
            trip_fee: row[14], trans_fee: row[15],
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
    const data = hotGridInstance.getData();
    const idsToDelete = new Set();

    data.forEach((row, index) => {
        if (row[0] === true) {
            const rowData = hotGridInstance.getSourceDataAtRow(index);
            if (rowData && rowData[1]) idsToDelete.add(rowData[1]);
        }
    });

    const idsArray = Array.from(idsToDelete);
    if (idsArray.length === 0) {
        alert('🖱️ กรุณาติ๊กถูกหน้าแถว ที่ต้องการจะลบก่อนครับ');
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