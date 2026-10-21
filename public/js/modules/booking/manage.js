// ==========================================
// 📋 MODULE: CONTAINER MANAGE (Grouped Dates, Auto Order ID, Auto Count Container)
// ==========================================

let hotGridInstance = null;
let rawShipmentsList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {};

window.addEventListener('DOMContentLoaded', () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    // 🌟 รีเซ็ตการจำค่าเก่าที่พัง และโหลดค่าใหม่
    if (localStorage.getItem('tms_manage_version') !== '1.2') {
        localStorage.removeItem('tms_container_manage_settings');
        localStorage.setItem('tms_manage_version', '1.2');
    } else {
        try {
            const savedData = localStorage.getItem('tms_container_manage_settings');
            if (savedData) userGridSettings = JSON.parse(savedData);
        } catch (err) {}
    }
    loadContainerGridData();
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

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');

    try {
        const res = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawShipmentsList = result.data; 
            populateFilters(rawShipmentsList);
            
            const urlParams = new URLSearchParams(window.location.search);
            const selectBooking = urlParams.get('select');
            if (selectBooking) {
                const bFilter = document.getElementById('filter-booking-no');
                if(bFilter) {
                    if(!Array.from(bFilter.options).some(o => o.value === selectBooking)) {
                        bFilter.innerHTML += `<option value="${selectBooking}">${selectBooking}</option>`;
                    }
                    bFilter.value = selectBooking;
                }
                window.history.replaceState({}, document.title, "/booking-manage.html");
            }
            applyFilters();
        } else {
            initContainerHandsontable([]);
        }
    } catch (err) { initContainerHandsontable([]); }
}

function populateFilters(data) {
    const sD = document.getElementById('filter-run-date');
    const sC = document.getElementById('filter-customer');
    const sB = document.getElementById('filter-booking-no');
    if(!sD || !sC || !sB) return;
    
    sD.innerHTML = '<option value="">-- วันที่วิ่งงาน --</option>';
    sC.innerHTML = '<option value="">-- ลูกค้า (Customer) --</option>';
    sB.innerHTML = '<option value="">-- ทุก Booking / BL --</option>';
    
    const dates=new Set(), custs=new Set(), books=new Set();
    data.forEach(r => {
        if(r[4]) dates.add(r[4]); 
        if(r[6]) custs.add(r[6]); 
        if(r[7]) books.add(r[7]);
    });
    Array.from(dates).sort().forEach(d => sD.innerHTML += `<option value="${d}">${d}</option>`);
    Array.from(custs).sort().forEach(c => sC.innerHTML += `<option value="${c}">${c}</option>`);
    Array.from(books).sort().forEach(b => sB.innerHTML += `<option value="${b}">${b}</option>`);
}

window.onCascadeChange = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    
    let scoped = rawShipmentsList;
    if (d) scoped = scoped.filter(r => r[4] === d);
    
    const sC = document.getElementById('filter-customer');
    const cVal = sC.value;
    sC.innerHTML = '<option value="">-- ลูกค้า (Customer) --</option>';
    const custs = new Set();
    scoped.forEach(r => { if(r[6]) custs.add(r[6]); });
    Array.from(custs).sort().forEach(cust => sC.innerHTML += `<option value="${cust}">${cust}</option>`);
    if(Array.from(custs).includes(cVal)) sC.value = cVal;

    if (c) scoped = scoped.filter(r => r[6] === c);
    
    const sB = document.getElementById('filter-booking-no');
    const bVal = sB.value;
    sB.innerHTML = '<option value="">-- ทุก Booking / BL --</option>';
    const books = new Set();
    scoped.forEach(r => { if(r[7]) books.add(r[7]); });
    Array.from(books).sort().forEach(book => sB.innerHTML += `<option value="${book}">${book}</option>`);
    if(Array.from(books).includes(bVal)) sB.value = bVal;

    applyFilters();
}

window.applyFilters = function() {
    const d = document.getElementById('filter-run-date')?.value || '';
    const c = document.getElementById('filter-customer')?.value || '';
    const b = document.getElementById('filter-booking-no')?.value || '';
    const searchEl = document.getElementById('search-text');
    const txt = searchEl ? searchEl.value.toLowerCase().trim() : '';

    filteredList = rawShipmentsList.filter(r => {
        const matchD = !d || r[4] === d;
        const matchC = !c || r[6] === c;
        const matchB = !b || r[7] === b;
        const matchTxt = !txt || JSON.stringify(r).toLowerCase().includes(txt);
        return matchD && matchC && matchB && matchTxt;
    });
    
    filteredList.sort((a,b) => String(a[1]).localeCompare(String(b[1])));
    initContainerHandsontable(filteredList);
};

window.clearQuickFilters = function() {
    if(document.getElementById('filter-run-date')) document.getElementById('filter-run-date').value = '';
    if(document.getElementById('filter-customer')) document.getElementById('filter-customer').value = '';
    if(document.getElementById('filter-booking-no')) document.getElementById('filter-booking-no').value = '';
    if(document.getElementById('search-text')) document.getElementById('search-text').value = '';
    populateFilters(rawShipmentsList);
    applyFilters();
};

window.unhideAllColumns = function() {
    if (!hotGridInstance) return;
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    plugin.showColumns(Array.from({length: hotGridInstance.countCols()}, (_, i) => i));
    hotGridInstance.render();
    saveGridUIState();
};

// 🌟 Renderer จัดกลุ่มเวลาให้สวยงาม 🌟
function renderGroupedDate(instance, td, row, col, prop, value, type) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    const rData = instance.getSourceDataAtRow(row);
    let arr = [];
    if (type === 'PICKUP') {
        if (rData[18]) arr.push(`CY: ${formatDateTime(rData[18])}`);
        if (rData[21]) arr.push(`VGM: ${formatDateTime(rData[21])}`);
        if (rData[22]) arr.push(`CUTOFF: ${formatDateTime(rData[22])}`);
        if (rData[23]) arr.push(`RENT: ${formatDateTime(rData[23])}`);
        if (rData[24]) arr.push(`DEMUR: ${formatDateTime(rData[24])}`);
    } else if (type === 'DELIVERY') {
        if (rData[25]) arr.push(`LOAD: ${formatDateTime(rData[25])}`);
        if (rData[26]) arr.push(`UNLOAD: ${formatDateTime(rData[26])}`);
    } else if (type === 'RETURN') {
        if (rData[27]) arr.push(`GATE: ${formatDateTime(rData[27])}`);
        if (rData[28]) arr.push(`RETURN: ${formatDateTime(rData[28])}`);
    }
    
    let content = arr.join('<br>') || 'คลิกเพิ่มเวลา';
    let textStyle = content === 'คลิกเพิ่มเวลา' ? 'text-slate-300 font-normal italic' : 'text-slate-800 font-bold';
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[35px] cell-time-hover p-1 rounded transition-colors ${textStyle}" onclick="openGroupModal(${row}, '${type}')">
            ${content}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-sm items-center justify-center"><i class="fa-solid fa-pen text-[10px]"></i></div>
        </div>
    `;
    td.style.fontSize = '10px'; td.style.lineHeight = '1.4';
}

function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid');
    if (hotGridInstance) { hotGridInstance.destroy(); }
    document.getElementById('total-count').innerText = `${data.length} รายการ`;

    const gridData = data.length > 0 ? data : Array.from({ length: 15 }, () => new Array(29).fill(""));
    const colHeaders = [
        '✔', 'order ID', 'MODE', 'วันที่Booking', 'วันที่วิ่งงาน', 'ชื่องาน', 'ลูกค้า', 'BOOKING NO.', 
        'เบอร์ตู้1', 'เบอร์ตู้2', 'จำนวนตู้/ใบ', 'ขนาดตู้', 'ประเภทงาน', 'AGENT', 'POD', 'SEAL NO.', 
        'TARE', 'MAX GROSS', 'ค่าเที่ยว', 'ค่าขนส่ง',
        '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN', // คอลัมน์โชว์แบบจัดกลุ่ม
        'CY_HIDDEN', 'VGM_HIDDEN', 'CUT_HIDDEN', 'RENT_HIDDEN', 'DEMUR_HIDDEN', 'LOAD_HIDDEN', 'UNLOAD_HIDDEN', 'GATE_HIDDEN', 'RET_HIDDEN'
    ];

    let moveConfig = true;
    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === colHeaders.length) {
        moveConfig = userGridSettings.columnPositions;
    }

    // Default column widths (23 columns visual)
    const defaultWidths = [30, 110, 70, 95, 95, 120, 100, 110, 100, 100, 50, 60, 90, 80, 80, 80, 60, 60, 70, 70, 140, 140, 140, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        colHeaders: colHeaders,
        columns: [
            { data: 0, type: 'checkbox', className: 'htCenter htMiddle' }, 
            { data: 1, type: 'text', className: 'font-bold text-slate-400', readOnly: true }, 
            { data: 2, type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { data: 3, type: 'date', dateFormat: 'YYYY-MM-DD HH:mm' }, 
            { data: 4, type: 'date', dateFormat: 'YYYY-MM-DD', className: 'font-bold' }, 
            { data: 5, type: 'text' }, { data: 6, type: 'text' }, { data: 7, type: 'text', className: 'font-bold uppercase text-primary' }, 
            { data: 8, type: 'text', className: 'font-bold uppercase text-blue-600 bg-blue-50/30' }, 
            { data: 9, type: 'text', className: 'font-bold uppercase text-blue-600 bg-blue-50/30' }, 
            { data: 10, type: 'numeric', className: 'htCenter font-bold bg-amber-50' }, 
            { data: 11, type: 'dropdown', source: ['20', '40', '40HC'] }, 
            { data: 12, type: 'dropdown', source: ['CONTAINER', 'Domestic'] }, 
            { data: 13, type: 'text' }, { data: 14, type: 'text' }, { data: 15, type: 'text' }, 
            { data: 16, type: 'numeric' }, { data: 17, type: 'numeric' }, 
            { data: 19, type: 'numeric', numericFormat: { pattern: '0,0' } }, 
            { data: 20, type: 'numeric', numericFormat: { pattern: '0,0' } },
            // คอลัมน์จัดกลุ่มเวลา
            { data: 18, renderer: function(...args) { renderGroupedDate.apply(this, [...args, 'PICKUP']); }, readOnly: true },
            { data: 25, renderer: function(...args) { renderGroupedDate.apply(this, [...args, 'DELIVERY']); }, readOnly: true },
            { data: 27, renderer: function(...args) { renderGroupedDate.apply(this, [...args, 'RETURN']); }, readOnly: true },
            // คอลัมน์ดิบ (ซ่อนไว้หลังบ้าน)
            { data: 18 }, { data: 21 }, { data: 22 }, { data: 23 }, { data: 24 }, { data: 25 }, { data: 26 }, { data: 27 }, { data: 28 }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', minSpareRows: 1,
        manualColumnResize: true, manualColumnMove: moveConfig,
        colWidths: userGridSettings.columnWidths && userGridSettings.columnWidths.length === colHeaders.length ? userGridSettings.columnWidths : defaultWidths,
        hiddenColumns: { indicators: true, columns: userGridSettings.hiddenColumns || [23,24,25,26,27,28,29,30,31] },
        contextMenu: ['alignment', 'hidden_columns_hide', 'clear_column', 'undo', 'redo'],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal) {
                    editedRowIndices.add(row);
                    
                    // 🌟 1. นับจำนวนตู้อัตโนมัติเวลาใส่เบอร์ตู้ 1, 2 🌟
                    if (prop === 8 || prop === 9) {
                        const c1 = this.getSourceDataAtCell(row, 8);
                        const c2 = this.getSourceDataAtCell(row, 9);
                        let count = 0;
                        if (c1 && String(c1).trim() !== '') count++;
                        if (c2 && String(c2).trim() !== '') count++;
                        this.setDataAtCell(row, 10, count > 0 ? count : 1, 'autoCalc'); 
                    }

                    // 🌟 2. Auto Generate Order ID เมื่อพิมพ์วันที่วิ่งงาน 🌟
                    if (prop === 4) { 
                        const currentOrderId = this.getSourceDataAtCell(row, 1);
                        const runDate = newVal;
                        if (!currentOrderId && runDate) {
                            const d = new Date(runDate);
                            const prefix = `ORD-${String(d.getFullYear()).substring(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`;
                            let maxNum = 0;
                            this.getData().forEach(r => {
                                if (r && r[1] && String(r[1]).startsWith(prefix)) {
                                    const num = parseInt(String(r[1]).split('-')[2], 10);
                                    if (num > maxNum) maxNum = num;
                                }
                            });
                            this.setDataAtCell(row, 1, `${prefix}${String(maxNum + 1).padStart(3, '0')}`, 'autoGen');
                        }
                    }
                }
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
    localStorage.setItem('tms_container_manage_settings', JSON.stringify(userGridSettings));
}

// ----------------------------------------------------
// 🪟 ระบบ Modal Popup จัดการเวลาแบบใหม่
// ----------------------------------------------------
let activeModalRow = -1;

function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).replace('T', ' '); 
    return cleanStr.length >= 16 ? cleanStr.substring(0, 16) : cleanStr; 
}

window.openGroupModal = function(row, type) {
    activeModalRow = row;
    const rData = hotGridInstance.getSourceDataAtRow(row);
    const mode = rData[2];
    
    let html = '';
    let title = '';

    if (type === 'PICKUP') {
        title = 'เวลา PICK UP (รับตู้/ลาน)';
        if (mode === 'EXPORT') {
            html += createInput(18, 'CY Date & Time', rData[18]);
            html += createInput(21, 'VGM Cutoff (Time)', rData[21]);
            html += createInput(22, 'Cutoff Time', rData[22]);
        } else {
            html += createInput(18, 'CY Date & Time', rData[18]);
            html += createInput(23, 'Rent Cutoff (Time)', rData[23]);
            html += createInput(24, 'Demurrage', rData[24]);
        }
    } else if (type === 'DELIVERY') {
        title = 'เวลา DELIVERY (โหลดของ/ลงของ)';
        if (mode === 'EXPORT') html += createInput(25, 'Load Date & Time', rData[25]);
        else html += createInput(26, 'Unload Date & Time', rData[26]);
    } else if (type === 'RETURN') {
        title = 'เวลา RETURN (คืนตู้/เข้าท่า)';
        if (mode === 'EXPORT') html += createInput(27, 'Open Gate & Time', rData[27]);
        else html += createInput(28, 'Return Date & Time', rData[28]);
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

function createInput(index, label, val) {
    let formattedVal = '';
    if (val && String(val).trim() !== 'NaN' && String(val).trim() !== 'null') {
        formattedVal = String(val).replace(' ', 'T').substring(0, 16);
    }
    return `
        <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
            <input type="datetime-local" id="modal_input_${index}" value="${formattedVal}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
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
    const rData = hotGridInstance.getSourceDataAtRow(activeModalRow);
    const inputs = document.querySelectorAll('#modal-body input[type="datetime-local"]');
    
    inputs.forEach(input => {
        const dataIndex = parseInt(input.id.replace('modal_input_', ''));
        rData[dataIndex] = input.value ? input.value.replace('T', ' ') : null; 
    });

    editedRowIndices.add(activeModalRow);
    hotGridInstance.render(); // อัปเดตตารางให้แสดงค่าใหม่ทันที
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

    // กรองเอาข้อมูลที่จะบันทึก (ต้องมีการระบุวันที่วิ่งงาน หรือ มี Order ID แล้ว)
    const dataToSave = hotGridInstance.getSourceData().filter(row => row && (row[1] || row[4]));

    try {
        const res = await fetch('/api/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave })
        });
        const result = await res.json();
        if (result.success) {
            alert('✅ บันทึกข้อมูลเบอร์ตู้ลงตารางสำเร็จ');
            editedRowIndices.clear();
            loadContainerGridData();
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};