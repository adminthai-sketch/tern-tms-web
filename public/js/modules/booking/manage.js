// ==========================================
// 📦 MODULE: CONTAINER MANAGE (Dedicated for Containers Only)
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
        const iD = i[5] ? String(i[5]).trim() : ''; 
        const iC = i[7] ? String(i[7]).trim() : ''; 
        const iB = i[8] ? String(i[8]).trim() : ''; 

        const matchC = !cVal || iC === cVal;
        const matchB = !bVal || iB === bVal;
        const matchD = !dVal || iD === dVal;

        if (matchC && matchB && iD) dates.add(iD);
        if (matchD && matchB && iC) custs.add(iC);
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
        const iD = item[5] ? String(item[5]).trim() : ''; 
        const iC = item[7] ? String(item[7]).trim() : ''; 
        const iB = item[8] ? String(item[8]).trim() : ''; 
        const containerNo = item[9] ? String(item[9]).trim() : ''; 
        
        const matchD = !d || iD === d;
        const matchC = !c || iC === c;
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
        const cNo = item[9] ? String(item[9]).trim() : ''; 
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
// 📊 จัดการตาราง Handsontable
// ==========================================
function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const colHeaders = [
        '✔', 'Order ID', 'วันที่วิ่งงาน', 'ลูกค้า', 'BOOKING NO.', 
        'ชื่องาน(ต้นทาง)', 'POD(ปลายทาง)', 
        'เบอร์ตู้ (ตู้ 1)', 'เบอร์ตู้ (ตู้ 2)', 'ขนาดตู้', 'Seal No.', 
        'Tare', 'Max Gross'
    ];

    const emptyArray = new Array(80).fill("");
    const gridData = data.length > 0 ? data : Array.from({ length: 10 }, () => [...emptyArray]);

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        colHeaders: colHeaders,
        columns: [
            { data: 1, type: 'checkbox', className: 'htCenter htMiddle' }, // 1: ✔ Checkbox
            { data: 2, type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter' }, // 2: Order ID
            { data: 5, type: 'date', dateFormat: 'YYYY-MM-DD', readOnly: true, className: 'htCenter' }, // 5: วันที่
            { data: 7, type: 'text', readOnly: true, className: 'text-slate-600' }, // 7: ลูกค้า
            { data: 8, type: 'text', readOnly: true, className: 'font-bold text-emerald-700 htCenter bg-emerald-50/20' }, // 8: BOOKING NO.
            
            { data: 6, type: 'text', readOnly: true }, // 6: ชื่องาน(ต้นทาง)
            { data: 15, type: 'text', readOnly: true }, // 15: POD(ปลายทาง)

            { data: 9, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, // 9: เบอร์ตู้ 1
            { data: 10, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, // 10: เบอร์ตู้ 2
            
            { data: 12, type: 'dropdown', source: ['20', '40', '40HC', '45HC'] }, // 12: ขนาดตู้
            { data: 16, type: 'text' }, // 16: Seal No.
            { data: 17, type: 'numeric', numericFormat: { pattern: '0,0' } }, // 17: Tare
            { data: 18, type: 'numeric', numericFormat: { pattern: '0,0' } }  // 18: Max Gross
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        colWidths: userGridSettings.columnWidths || [40, 110, 90, 130, 130, 130, 110, 120, 120, 70, 90, 80, 80],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 1) editedRowIndices.add(row);
                
                // แปลงอักษรเบอร์ตู้เป็นตัวพิมพ์ใหญ่
                if ((prop === 9 || prop === 10) && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) {
                        this.setDataAtCell(row, prop, cleanVal, 'auto');
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

    const templateRow = rawShipmentList.find(r => r[8] === filterBooking);
    if (!templateRow) {
        alert("❌ ไม่พบข้อมูล Booking นี้ในตารางครับ");
        return;
    }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = new Array(80).fill('');
    newRow[1] = false; 
    newRow[2] = timestampID; 
    newRow[3] = templateRow[3]; 
    newRow[5] = templateRow[5]; 
    newRow[6] = templateRow[6]; 
    newRow[7] = templateRow[7]; 
    newRow[8] = filterBooking;  
    newRow[12] = templateRow[12]; 
    newRow[15] = templateRow[15]; 

    rawShipmentList.unshift(newRow); 
    applyFilters(); 
    
    editedRowIndices.add(0);
    updateSaveStatusBadge();
    
    hotGridInstance.selectCell(0, 7); 
    alert(`✅ สร้างแถวตู้ใหม่ให้ Booking: ${filterBooking} เรียบร้อยแล้วครับ!`);
};

window.deleteContainerRows = async function() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const rowsToDelete = [];
    const idsToDelete = [];

    data.forEach((row, index) => {
        const src = hotGridInstance.getSourceDataAtRow(index);
        if (src[1] === true) { 
            rowsToDelete.push(index);
            if (src[2] && !src[2].includes('ORD-ADD')) { 
                idsToDelete.push(src[2]); 
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
        
        alert('✅ บันทึกเบอร์ตู้สำเร็จ!');
        editedRowIndices.clear();
        loadContainerGridData(); 
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};