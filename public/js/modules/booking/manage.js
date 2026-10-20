// ==========================================
// 📋 MODULE: CONTAINER MANAGE (Shipments Table)
// ==========================================

let hotGridInstance = null;
let rawShipmentsList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {};

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    try {
        const savedData = localStorage.getItem('tms_container_manage_settings');
        if (savedData) userGridSettings = JSON.parse(savedData);
    } catch (err) {}
    loadContainerGridData();
});

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');

    try {
        // ดึงจากตาราง shipments (ข้อมูลดิบ)
        const res = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawShipmentsList = result.data; // data เป็น array ซ้อน array (raw_data)
            
            // กรองหาตัวเลือก Dropdown
            populateFilters(rawShipmentsList);
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

function onCascadeChange() { applyFilters(); }

function applyFilters() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;

    filteredList = rawShipmentsList.filter(r => {
        return (!d || r[4] === d) && (!c || r[6] === c) && (!b || r[7] === b);
    });
    
    // เรียงตามวันที่และ Order ID
    filteredList.sort((a,b) => String(a[1]).localeCompare(String(b[1])));
    initContainerHandsontable(filteredList);
}

function clearQuickFilters() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    applyFilters();
}

// ----------------------------------------------------
function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid');
    if (hotGridInstance) { hotGridInstance.destroy(); }
    document.getElementById('total-count').innerText = `${data.length} รายการ`;

    // ถ้าไม่มีข้อมูล ให้สร้างแถวว่างเพื่อกรอก
    const gridData = data.length > 0 ? data : Array.from({ length: 15 }, () => new Array(21).fill(""));

    const colHeaders = [
        '✔', 'order ID', 'MODE', 'วันที่Booking', 'วันที่วิ่งงาน', 'ชื่องาน', 'ลูกค้า', 'BOOKING NO.', 
        'เบอร์ตู้1', 'เบอร์ตู้2', 'จำนวนตู้/ใบ', 'ขนาดตู้', 'ประเภทงาน', 'AGENT', 'POD', 'SEAL NO.', 
        'TARE', 'MAX GROSS', 'CY DATE (EX/IM)', 'ค่าเที่ยว', 'ค่าขนส่ง'
    ];

    let moveConfig = true;
    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === colHeaders.length) {
        moveConfig = userGridSettings.columnPositions;
    }

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        colHeaders: colHeaders,
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { type: 'text', className: 'font-bold text-slate-400' }, // order ID
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD HH:mm' }, // bk date
            { type: 'date', dateFormat: 'YYYY-MM-DD' }, // run date
            { type: 'text' }, { type: 'text' }, { type: 'text', className: 'font-bold uppercase text-primary' }, 
            { type: 'text', className: 'font-bold uppercase text-blue-600 bg-blue-50/30' }, // เบอร์ตู้1
            { type: 'text', className: 'font-bold uppercase text-blue-600 bg-blue-50/30' }, // เบอร์ตู้2
            { type: 'numeric' }, { type: 'dropdown', source: ['20', '40', '40HC'] }, 
            { type: 'dropdown', source: ['CONTAINER', 'Domestic'] }, 
            { type: 'text' }, { type: 'text' }, { type: 'text' }, 
            { type: 'numeric' }, { type: 'numeric' }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD HH:mm' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' } }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' } }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', minSpareRows: 1,
        manualColumnResize: true, manualColumnMove: moveConfig,
        colWidths: userGridSettings.columnWidths || undefined,
        hiddenColumns: { indicators: true },
        contextMenu: ['alignment', 'hidden_columns_hide', 'hidden_columns_show', 'clear_column', 'undo', 'redo'],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal) editedRowIndices.add(row);
            });
            updateSaveStatusBadge();
            this.render(); 
        },
        afterColumnResize: function() { saveGridUIState(); },
        afterColumnMove: function() { saveGridUIState(); },
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
    userGridSettings = { columnWidths: widths, columnPositions: positions };
    localStorage.setItem('tms_container_manage_settings', JSON.stringify(userGridSettings));
}

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

window.saveGridChanges = async function() {
    if (!hotGridInstance || editedRowIndices.size === 0) return;
    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;

    // กรองเอาเฉพาะข้อมูลที่มี Order ID เพื่อส่งให้ Backend
    const dataToSave = hotGridInstance.getData().filter(row => row && row[1]);

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