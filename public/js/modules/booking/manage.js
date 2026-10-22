// ==========================================
// 📦 MODULE: CONTAINER MANAGE (Complete Columns with Separate Origin, Dest & POD)
// ==========================================

let hotGridInstance = null;
let rawShipmentList = []; 
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
            userGridSettings = data.settings?.['container_manage'] || {};
        }
    } catch (err) {}
    
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
            .invalid-container { background-color: #fee2e2 !important; color: #b91c1c !important; font-weight: bold; }
        `;
        document.head.appendChild(style);
    }
}

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const res = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        
        if (result.success && result.data) {
            rawShipmentList = result.data;
            editedRowIndices.clear();
            
            const urlParams = new URLSearchParams(window.location.search);
            const selectBooking = urlParams.get('select');
            if (selectBooking) {
                document.getElementById('filter-booking-no').value = selectBooking;
                window.history.replaceState({}, document.title, "/booking-manage.html");
            }

            updateDropdownOptions();
            applyFilters();
        } else {
            rawShipmentList = [];
            applyFilters();
        }
    } catch (err) { 
        applyFilters(); 
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// ==========================================
// 🔍 ระบบ Cross-Filtering
// ==========================================
function updateDropdownOptions() {
    const dVal = document.getElementById('filter-run-date').value;
    const cVal = document.getElementById('filter-customer').value;
    const bVal = document.getElementById('filter-booking-no').value;

    const dates = new Set(), custs = new Set(), books = new Set();

    rawShipmentList.forEach(i => {
        const iD = i[4] ? String(i[4]).trim() : ''; 
        const iC = i[6] ? String(i[6]).trim() : ''; 
        const iJ = i[5] ? String(i[5]).trim() : ''; 
        const iB = i[7] ? String(i[7]).trim() : ''; 

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

window.handleCrossFilter = function() {
    updateDropdownOptions(); 
    applyFilters(); 
};

window.applyFilters = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    const isMissing = document.getElementById('qf-missing').classList.contains('bg-red-50');
    const isCompleted = document.getElementById('qf-completed').classList.contains('bg-emerald-50');

    filteredList = rawShipmentList.filter(item => {
        const iD = item[4] ? String(item[4]).trim() : ''; 
        const iC = item[6] ? String(item[6]).trim() : ''; 
        const iJ = item[5] ? String(item[5]).trim() : ''; 
        const iB = item[7] ? String(item[7]).trim() : ''; 
        const containerNo = item[8] ? String(item[8]).trim() : ''; 
        
        const matchD = !d || iD === d;
        const matchC = !c || iC === c || iJ === c;
        const matchB = !b || iB === b;
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);

        let matchQF = true;
        if (isMissing) matchQF = matchQF && (containerNo === '' || containerNo === 'ยังไม่ระบุ');
        if (isCompleted) matchQF = matchQF && (containerNo !== '' && containerNo !== 'ยังไม่ระบุ');

        return matchD && matchC && matchB && matchGlobal && matchQF;
    });

    initContainerHandsontable(filteredList);
    updateSummaryFooter(filteredList);
};

window.clearAllFilters = function() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    document.getElementById('global-search').value = '';
    
    ['missing', 'completed'].forEach(id => {
        const btn = document.getElementById('qf-' + id);
        btn.classList.remove('bg-red-50', 'text-red-600', 'border-red-300', 'bg-emerald-50', 'text-emerald-600', 'border-emerald-300');
        btn.classList.add('bg-white', 'text-slate-600');
    });

    updateDropdownOptions();
    applyFilters();
};

window.setQuickFilter = function(type) {
    const btn = document.getElementById('qf-' + type);
    
    ['missing', 'completed'].forEach(id => {
        if (id !== type) {
            const b = document.getElementById('qf-' + id);
            b.classList.remove('bg-red-50', 'text-red-600', 'border-red-300', 'bg-emerald-50', 'text-emerald-600', 'border-emerald-300');
            b.classList.add('bg-white', 'text-slate-600');
        }
    });
    
    if (type === 'missing') {
        btn.classList.toggle('bg-red-50'); btn.classList.toggle('text-red-600'); btn.classList.toggle('border-red-300');
    } else {
        btn.classList.toggle('bg-emerald-50'); btn.classList.toggle('text-emerald-600'); btn.classList.toggle('border-emerald-300');
    }
    btn.classList.toggle('bg-white'); btn.classList.toggle('text-slate-600');
    
    applyFilters();
};

function updateSummaryFooter(data) {
    let total = data.length;
    let missing = 0;
    
    data.forEach(item => {
        const cNo = item[8] ? String(item[8]).trim() : ''; 
        if (cNo === '' || cNo === 'ยังไม่ระบุ') missing++;
    });

    document.getElementById('sum-total').innerText = total.toLocaleString();
    document.getElementById('sum-filled').innerText = (total - missing).toLocaleString();
    document.getElementById('sum-missing').innerText = missing.toLocaleString();
}

function containerValidator(value, callback) {
    if (!value || value === 'ยังไม่ระบุ') {
        callback(true);
        return;
    }
    const regex = /^[A-Z]{4}\d{7}$/i; 
    const isValid = regex.test(value.replace(/\s/g, ''));
    callback(isValid);
}

// ==========================================
// 📊 จัดการตาราง Handsontable (แยก ต้นทาง, ปลายทาง, POD ชัดเจน)
// ==========================================
function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const colHeaders = [
        '✔', 'Order ID', 'MODE', 'วันที่วิ่งงาน', 'ชื่องาน', 'ลูกค้า', 'BOOKING NO.', 
        'ประเภทงาน', 'ต้นทาง', 'ปลายทาง', 'POD',
        'เบอร์ตู้ (ตู้ 1)', 'เบอร์ตู้ (ตู้ 2)', 'ขนาดตู้', 
        'Seal No.', 'Tare', 'Max Gross', 'ค่าเที่ยว', 'ค่าขนส่ง'
    ];

    const emptyArray = new Array(80).fill("");
    const gridData = data.length > 0 ? data : Array.from({ length: 10 }, () => [...emptyArray]);

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        colHeaders: colHeaders,
        columns: [
            { data: 0, type: 'checkbox', className: 'htCenter htMiddle' }, 
            
            // ข้อมูลอ้างอิงของงาน
            { data: 1, type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter' }, // 1: Order ID
            { data: 2, type: 'text', readOnly: true, className: 'htCenter font-bold text-slate-500' }, // 2: MODE
            { data: 4, type: 'date', dateFormat: 'YYYY-MM-DD', readOnly: true, className: 'htCenter text-slate-600' }, // 4: วันที่วิ่งงาน
            { data: 5, type: 'text', readOnly: true, className: 'font-semibold text-slate-700' }, // 5: ชื่องาน
            { data: 6, type: 'text', readOnly: true, className: 'text-slate-600' }, // 6: ลูกค้า
            { data: 7, type: 'text', readOnly: true, className: 'font-bold text-emerald-700 htCenter bg-emerald-50/20' }, // 7: BOOKING NO.
            
            // ประเภทงาน (Autocomplete พิมพ์คำใหม่ได้)
            { data: 12, type: 'autocomplete', source: ['ตู้บรรจุ 1*40', 'ทอยตู้เปล่า 1*40', 'ทอยตู้เปล่า 2*20'], strict: false }, // 12: ประเภทงาน
            
            // 🌟 ต้นทาง, ปลายทาง, POD แยกคอลัมน์ชัดเจน 🌟
            { data: 10, type: 'text', className: 'font-medium text-slate-700' }, // 10: ต้นทาง (Origin)
            { data: 13, type: 'text', className: 'font-medium text-slate-700' }, // 13: ปลายทาง (Destination)
            { data: 14, type: 'text', className: 'font-bold text-blue-600 htCenter bg-blue-50/20' }, // 14: POD (แยกเดี่ยว)
            
            // ข้อมูลตู้
            { data: 8, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, // 8: เบอร์ตู้ 1
            { data: 9, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, // 9: เบอร์ตู้ 2
            { data: 11, type: 'dropdown', source: ['20', '40', '40HC', '45HC'] }, // 11: ขนาดตู้
            
            // ข้อมูลซีลและน้ำหนัก
            { data: 15, type: 'text' }, // 15: Seal No.
            { data: 16, type: 'numeric', numericFormat: { pattern: '0,0' } }, // 16: Tare
            { data: 17, type: 'numeric', numericFormat: { pattern: '0,0' } }, // 17: Max Gross
            
            // ค่าเที่ยว / ค่าขนส่ง
            { data: 56, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-green-700 font-bold bg-green-50/30 htRight' }, // 56: ค่าเที่ยว
            { data: 57, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50/30 htRight' }  // 57: ค่าขนส่ง
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        colWidths: userGridSettings.columnWidths || [40, 110, 75, 90, 140, 120, 120, 130, 100, 100, 90, 120, 120, 70, 95, 80, 80, 85, 85],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) editedRowIndices.add(row);
                
                // แปลงเบอร์ตู้เป็นตัวพิมพ์ใหญ่อัตโนมัติ
                if ((prop === 8 || prop === 9) && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) {
                        this.setDataAtCell(row, this.propToCol(prop), cleanVal, 'auto');
                    }
                }
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
            body: JSON.stringify({ userId: user.id, gridName: 'container_manage', settings: { columnWidths: widths, columnPositions: positions } })
        });
        alert('✅ บันทึกมุมมองตารางลงเบอร์ตู้เรียบร้อยแล้ว!');
    } catch (err) {}
};

window.addNewContainerRow = function() {
    const filterBooking = document.getElementById('filter-booking-no').value;
    
    if (!filterBooking) {
        alert("⚠️ กรุณากรองเลือกเลข Booking ที่ต้องการเพิ่มตู้ในช่องค้นหาด้านบนก่อนครับ!");
        return;
    }

    const templateRow = rawShipmentList.find(r => r[7] === filterBooking);
    if (!templateRow) {
        alert("❌ ไม่พบข้อมูล Booking นี้ในตารางครับ");
        return;
    }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = new Array(80).fill('');
    newRow[0] = false; 
    newRow[1] = timestampID; 
    newRow[2] = templateRow[2]; // Mode
    newRow[4] = templateRow[4]; // วันที่วิ่งงาน
    newRow[5] = templateRow[5]; // ชื่องาน
    newRow[6] = templateRow[6]; // ลูกค้า
    newRow[7] = filterBooking;  // Booking
    newRow[10] = templateRow[10]; // ต้นทาง
    newRow[11] = templateRow[11]; // ขนาดตู้
    newRow[12] = templateRow[12]; // ประเภทงาน
    newRow[13] = templateRow[13]; // ปลายทาง
    newRow[14] = templateRow[14]; // POD
    newRow[56] = templateRow[56]; // ค่าเที่ยว
    newRow[57] = templateRow[57]; // ค่าขนส่ง

    rawShipmentList.unshift(newRow); 
    applyFilters(); 
    
    editedRowIndices.add(0);
    updateSaveStatusBadge();
    
    hotGridInstance.selectCell(0, 11); // เลื่อนโฟกัสไปที่ช่องเบอร์ตู้ 1 ทันที
    alert(`✅ สร้างแถวตู้ใหม่ให้ Booking: ${filterBooking} เรียบร้อยแล้วครับ!`);
};

window.deleteContainerRows = async function() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const rowsToDelete = [];
    const idsToDelete = [];

    data.forEach((row, index) => {
        const src = hotGridInstance.getSourceDataAtRow(index);
        if (src[0] === true) { 
            rowsToDelete.push(index);
            if (src[1] && !src[1].includes('ORD-ADD')) { 
                idsToDelete.push(src[1]); 
            }
        }
    });

    if (rowsToDelete.length === 0) {
        alert('🖱️ กรุณาติ๊กถูกด้านหน้าแถวที่ต้องการจะลบตู้ก่อนครับ');
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบตู้จำนวน ${rowsToDelete.length} รายการทิ้งถาวร?`)) return;

    hotGridInstance.alter('remove_row', rowsToDelete[0], rowsToDelete.length);
    
    if (idsToDelete.length > 0) {
        for (let id of idsToDelete) {
            try { await fetch(`/api/shipments/${id}`, { method: 'DELETE' }); } catch (e) {}
        }
    }
    
    alert(`✅ ลบตู้เสร็จสิ้น!`);
};

function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge');
    if(!badge) return;
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "ml-auto text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> ${count} รายการรอเซฟ`;
    } else {
        badge.className = "ml-auto text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-check text-emerald-500"></i> อัปเดตล่าสุดแล้ว`;
    }
}

window.saveGridChanges = async function() {
    if (!hotGridInstance || editedRowIndices.size === 0) return;
    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;

    const dataToSave = [];
    editedRowIndices.forEach(idx => {
        dataToSave.push(hotGridInstance.getSourceDataAtRow(idx));
    });

    try {
        const res = await fetch('/api/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave }) 
        });
        
        alert('✅ บันทึกข้อมูลเบอร์ตู้สำเร็จ!');
        editedRowIndices.clear();
        loadContainerGridData(); 
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};