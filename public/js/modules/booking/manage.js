// ==========================================
// 📦 MODULE: DISPATCH & CONTAINER MANAGE (Drop Yard Idea A + Time Display)
// ==========================================

let hotGridInstance = null;
let rawShipmentList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 

let globalTruckList = [];
let globalDriverList = [];
let fleetAssignments = {}; 
let globalContainerSizes = ['20', '40', '40HC', '45HC'];
let isDropYardsHidden = true; 

window.addEventListener('DOMContentLoaded', async () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if (user.id) {
        try {
            const res = await fetch(`/api/users/grid-settings?userId=${user.id}`);
            if (res.ok) {
                const data = await res.json();
                userGridSettings = data.settings?.['container_manage'] || {};
            }
        } catch (err) {}
    }
    
    try {
        const szRes = await fetch('/api/bookings/container-sizes');
        const szResult = await szRes.json();
        if (szResult.success && szResult.data && szResult.data.length > 0) {
            globalContainerSizes = szResult.data.map(r => r.size_name);
        }
    } catch (err) {}

    await loadFleetData(); 
    await loadContainerGridData();
});

async function loadFleetData() {
    try {
        const response = await fetch('/api/truck_assignments');
        const result = await response.json();
        if (result.success) {
            globalTruckList = result.truckList || [];
            globalDriverList = result.driverList || [];
            if (result.data) {
                result.data.forEach(item => {
                    if (item[1] && item[2]) fleetAssignments[item[1]] = item[2]; 
                });
            }
        }
    } catch(e) {}
}

function applyZebraStripingCSS() {
    if (!document.getElementById('tms-manage-css')) {
        const style = document.createElement('style');
        style.id = 'tms-manage-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #334155; font-weight: 700 !important; border-color: #cbd5e1; font-size: 11px !important; }
            
            .zone-info { background-color: #f8fafc !important; color: #475569; }
            .zone-container { background-color: #f0f9ff !important; } 
            .zone-leg1 { background-color: #fdf4ff !important; } 
            .zone-legdrop { background-color: #f3f4f6 !important; } 
            .zone-leg2 { background-color: #fffbeb !important; } 
            .zone-leg3 { background-color: #f0fdf4 !important; } 
            
            .time-cell { background-color: #ffffff !important; color: #64748b !important; font-weight: 600 !important; font-size: 10px !important; }
            
            .handsontable tbody tr:hover td { filter: brightness(0.96); transition: all 0.2s; }
            .ht-edited-row { border-left: 3px solid #f59e0b !important; }
            .unsaved-id-cell { color: #dc2626 !important; font-weight: 800 !important; background-color: #fde047 !important; }
        `;
        document.head.appendChild(style);
    }
}

function formatShortDate(dt) {
    if (!dt || String(dt).trim() === 'NaN' || String(dt).trim() === 'null') return '';
    const s = String(dt).replace('T', ' ').substring(5, 16); 
    return s || '';
}

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const [resShipments, resBookings] = await Promise.all([
            fetch(`/api/shipments?year=${year}&month=${month}`),
            fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`)
        ]);
        
        const result = await resShipments.json();
        const bResult = await resBookings.json();

        const bookingsMap = {};
        if (bResult.success && bResult.data) {
            bResult.data.forEach(b => {
                bookingsMap[b.booking_no] = { 
                    customer: b.customer_name, origin: b.origin, destination: b.destination,
                    trip_fee: parseFloat(b.trip_fee) || 0, trans_fee: parseFloat(b.trans_fee) || 0,
                    time_pickup: b.cy_date || b.vgm_cutoff || '',
                    time_delivery: b.load_date || b.unload_date || '',
                    time_return: b.return_date || b.open_gate || ''
                };
            });
        }

        if (result.success && result.data) {
            rawShipmentList = result.data.map(row => {
                const fullRow = Array.isArray(row) ? [...row] : [];
                while (fullRow.length < 80) fullRow.push(''); 

                const bNo = fullRow[7] ? String(fullRow[7]).trim() : ''; 
                if (bookingsMap[bNo]) {
                    fullRow[6] = bookingsMap[bNo].customer; 
                    fullRow[10] = bookingsMap[bNo].origin; 
                    fullRow[11] = bookingsMap[bNo].destination; 
                    
                    fullRow[29] = formatShortDate(bookingsMap[bNo].time_pickup); 
                    fullRow[40] = formatShortDate(bookingsMap[bNo].time_delivery); 
                    fullRow[50] = formatShortDate(bookingsMap[bNo].time_return); 

                    const currentTrip = parseFloat(String(fullRow[56]).replace(/,/g, '')) || 0;
                    const currentTrans = parseFloat(String(fullRow[57]).replace(/,/g, '')) || 0;
                    if (currentTrip === 0) fullRow[56] = bookingsMap[bNo].trip_fee;
                    if (currentTrans === 0) fullRow[57] = bookingsMap[bNo].trans_fee;
                }
                return fullRow;
            }).filter(row => row[1] !== null && row[1] !== undefined && String(row[1]).trim() !== '');

            editedRowIndices.clear();
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('select')) {
                document.getElementById('filter-booking-no').value = urlParams.get('select');
                window.history.replaceState({}, document.title, "/booking-manage.html");
            }
            updateDropdownOptions(); applyFilters();
        } else {
            rawShipmentList = []; applyFilters();
        }
    } catch (err) { applyFilters(); } finally { document.getElementById('loading-overlay').classList.add('hidden'); }
}

function updateDropdownOptions() {
    const dVal = document.getElementById('filter-run-date').value;
    const cVal = document.getElementById('filter-customer').value;
    const bVal = document.getElementById('filter-booking-no').value;
    const dates = new Set(), custs = new Set(), books = new Set();
    rawShipmentList.forEach(i => {
        const iD = i[4] ? String(i[4]).trim() : ''; 
        const iC = i[6] ? String(i[6]).trim() : ''; 
        const iB = i[7] ? String(i[7]).trim() : ''; 
        if ((!cVal || iC === cVal) && (!bVal || iB === bVal) && iD) dates.add(iD);
        if ((!dVal || iD === dVal) && (!bVal || iB === bVal)) { if (iC) custs.add(iC); }
        if ((!dVal || iD === dVal) && (!cVal || iC === cVal) && iB) books.add(iB);
    });
    const dlDate = document.getElementById('dl-run-date');
    const dlCust = document.getElementById('dl-customer');
    const dlBook = document.getElementById('dl-booking-no');
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleCrossFilter = function() { applyFilters(); };
window.applyFilters = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    filteredList = rawShipmentList.filter(item => {
        const iD = item[4] ? String(item[4]).trim() : ''; 
        const iC = item[6] ? String(item[6]).trim() : ''; 
        const iB = item[7] ? String(item[7]).trim() : ''; 
        const matchD = !d || iD === d; 
        const matchC = !c || iC === c; 
        const matchB = !b || iB === b;
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        return matchD && matchC && matchB && matchGlobal;
    });
    initContainerHandsontable(filteredList);
};

window.clearAllFilters = function() { 
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = ''; 
    applyFilters(); 
};

window.setQuickFilter = function(type) {
    const btnPending = document.getElementById('qf-pending');
    const btnFilled = document.getElementById('qf-filled');
    btnPending.classList.remove('bg-blue-50', 'text-blue-600');
    btnFilled.classList.remove('bg-blue-50', 'text-blue-600');

    if (type === 'pending') {
        btnPending.classList.add('bg-blue-50', 'text-blue-600');
        filteredList = rawShipmentList.filter(item => !item[8] || item[8].trim() === '' || item[8] === 'ยังไม่ระบุ');
    } else {
        btnFilled.classList.add('bg-blue-50', 'text-blue-600');
        filteredList = rawShipmentList.filter(item => item[8] && item[8].trim() !== '' && item[8] !== 'ยังไม่ระบุ');
    }
    initContainerHandsontable(filteredList);
};

function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const emptyArray = new Array(80).fill("");
    const gridData = data.length > 0 ? data : Array.from({ length: 10 }, () => [...emptyArray]);

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        nestedHeaders: [
            [
                { label: '📋 ข้อมูลงาน', colspan: 6 },
                { label: '📦 ข้อมูลตู้ (พิมพ์ข้อมูลตอนหน้างานแจ้งมา)', colspan: 7 },
                { label: '🚚 ขา 1: PICK UP (รับตู้)', colspan: 5 }, 
                { label: '🅿️ ขาฝาก 1 (DROP 1)', colspan: 4 },
                { label: '🏭 ขา 2: DELIVERY (เข้าบรรจุ)', colspan: 4 }, 
                { label: '🅿️ ขาฝาก 2 (DROP 2)', colspan: 4 }, 
                { label: '🚢 ขา 3: RETURN (คืนตู้)', colspan: 4 }, 
                { label: '💵 การเงิน', colspan: 2 }
            ],
            [
                '✔', 'Order ID', 'Booking', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 
                'ขนาดตู้', 'เบอร์ตู้ 1', 'เบอร์ตู้ 2', 'SEAL NO', 'POP', 'TARE', 'MAX GROSS', 
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด', 'เส้นทาง', '✅',
                'ทะเบียนรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅', 
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด', '✅', 
                'ทะเบียนรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด', '✅', 
                'ค่าเที่ยว', 'ค่าขนส่ง'
            ]
        ],
        columns: [
            // 📋 ข้อมูลงาน
            { data: 0, type: 'checkbox', className: 'htCenter htMiddle zone-info' }, 
            { data: 1, type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter htMiddle zone-info' }, 
            { data: 7, type: 'text', readOnly: true, className: 'font-bold text-primary htCenter htMiddle zone-info' }, 
            { data: 6, type: 'text', readOnly: true, className: 'text-slate-700 font-bold htMiddle zone-info' }, 
            { data: 10, type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            { data: 11, type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            
            // 📦 ข้อมูลตู้
            { data: 12, type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700 zone-container' }, 
            { data: 8, type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 9, type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 78, type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 79, type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 76, type: 'numeric', className: 'htCenter htMiddle text-blue-700 zone-container' },
            { data: 77, type: 'numeric', className: 'htCenter htMiddle text-blue-700 zone-container' },

            // 🚚 ขา 1: PICK UP
            { data: 28, type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg1 font-bold htCenter htMiddle text-emerald-700' },
            { data: 27, type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg1 htMiddle font-bold text-emerald-700' },
            { data: 29, type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' },
            { 
                data: 36, 
                readOnly: true, className: 'htCenter htMiddle bg-purple-50/20',
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    const isDrop = (value === true || value === 'true');
                    const btnClass = isDrop ? 'bg-purple-200 text-purple-800 border-purple-400' : 'bg-white text-slate-500 border-slate-300 hover:bg-purple-50 hover:text-purple-600';
                    const icon = isDrop ? '<i class="fa-solid fa-anchor"></i> แวะลานพัก' : '<i class="fa-solid fa-route"></i> ตรงไปโรงงาน';
                    td.innerHTML = `<div class="p-1 w-full h-full"><button onclick="toggleDropRow(${row})" class="w-full h-full text-[10px] font-bold border rounded shadow-sm flex items-center justify-center gap-1 transition-colors ${btnClass}">${icon}</button></div>`;
                }
            },
            { data: 31, type: 'checkbox', className: 'htCenter htMiddle zone-leg1' },

            // 🅿️ ขาฝาก 1 (DROP 1)
            { data: 34, type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            { data: 33, type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 35, type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 36, type: 'checkbox', className: 'htCenter htMiddle zone-legdrop' },

            // 🏭 ขา 2: DELIVERY
            { data: 39, type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg2 font-bold htCenter htMiddle text-amber-700' },
            { data: 38, type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg2 htMiddle font-bold text-amber-700' },
            { data: 40, type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 42, type: 'checkbox', className: 'htCenter htMiddle zone-leg2' },

            // 🅿️ ขาฝาก 2 (DROP 2)
            { data: 44, type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            { data: 43, type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 45, type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 46, type: 'checkbox', className: 'htCenter htMiddle zone-legdrop' },

            // 🚢 ขา 3: RETURN
            { data: 49, type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg3 font-bold htCenter htMiddle text-slate-700' },
            { data: 48, type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg3 htMiddle font-bold text-slate-700' },
            { data: 50, type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 52, type: 'checkbox', className: 'htCenter htMiddle zone-leg3' },

            // 💵 การเงิน
            { data: 56, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold bg-green-50 htRight htMiddle' }, 
            { data: 57, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50 htRight htMiddle' }
        ],
        colWidths: [
            30, 110, 100, 100, 80, 80, // Info 
            60, 100, 100, 90, 80, 70, 80, // Container 
            90, 110, 75, 110, 40, // Leg 1 
            90, 110, 110, 40, // Drop 1 
            90, 110, 75, 40, // Leg 2 
            90, 110, 110, 40, // Drop 2 
            90, 110, 75, 40, // Leg 3 
            70, 70 // Finance 
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        
        hiddenColumns: {
            columns: isDropYardsHidden ? [18, 19, 20, 21, 26, 27, 28, 29] : [], 
            indicators: true
        },
        contextMenu: ['alignment', 'hidden_columns_hide', 'hidden_columns_show', 'copy'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) editedRowIndices.add(row);
                
                if ([8, 9, 78, 79].includes(prop) && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) this.setDataAtCell(row, this.propToCol(prop), cleanVal, 'auto');
                }

                if ([28, 34, 39, 44, 49].includes(prop) && newVal) {
                    if (fleetAssignments[newVal]) {
                        const colIdx = this.propToCol(prop);
                        this.setDataAtCell(row, colIdx + 1, fleetAssignments[newVal], 'auto');
                    }
                }
            });
            updateSaveStatusBadge();
            this.render(); 
        },
        cells: function(row, col) {
            const cp = {};
            if (editedRowIndices.has(row)) {
                cp.className = (cp.className || '') + ' ht-edited-row';
                if (col === 1) cp.className += ' unsaved-id-cell';
            }
            return cp;
        }
    });

    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === hotGridInstance.countCols()) {
        try { hotGridInstance.getPlugin('manualColumnMove').moveColumns(userGridSettings.columnPositions, 0); } catch(e) {}
    }
}

window.toggleDropRow = function(row) {
    const isDrop = hotGridInstance.getDataAtCell(row, 16);
    hotGridInstance.setDataAtCell(row, 16, !isDrop);
    editedRowIndices.add(row);
    updateSaveStatusBadge();
    
    if (!isDrop && isDropYardsHidden) {
        toggleDropYards();
    }
};

window.toggleDropYards = function() {
    isDropYardsHidden = !isDropYardsHidden;
    const btn = document.getElementById('btn-toggle-drops');
    
    if (isDropYardsHidden) {
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> แสดงลานฝากตู้`;
        btn.classList.replace('bg-purple-600', 'bg-purple-50');
        btn.classList.replace('text-white', 'text-purple-700');
        hotGridInstance.getPlugin('hiddenColumns').hideColumns([18, 19, 20, 21, 26, 27, 28, 29]);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> ซ่อนลานฝากตู้`;
        btn.classList.replace('bg-purple-50', 'bg-purple-600');
        btn.classList.replace('text-purple-700', 'text-white');
        hotGridInstance.getPlugin('hiddenColumns').showColumns([18, 19, 20, 21, 26, 27, 28, 29]);
    }
    hotGridInstance.render();
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

window.saveGridSettings = async function() {
    if (!hotGridInstance) return;
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if (!user.id) { alert("❌ ต้องเข้าสู่ระบบก่อนบันทึกมุมมอง"); return; }
    
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
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'container_manage', settings: { columnWidths: widths, columnPositions: positions } })
        });
        alert('✅ บันทึกมุมมองตารางลงเบอร์ตู้เรียบร้อยแล้ว!');
    } catch (err) {}
};

window.addNewContainerRow = function() {
    const filterBooking = document.getElementById('filter-booking-no').value;
    if (!filterBooking) { alert("⚠️ กรุณากรองเลือกเลข Booking ที่ต้องการเพิ่มตู้ในช่องค้นหาด้านบนก่อนครับ!"); return; }

    const templateRow = rawShipmentList.find(r => r[7] === filterBooking);
    if (!templateRow) { alert("❌ ไม่พบข้อมูล Booking นี้ในตารางครับ"); return; }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = new Array(80).fill('');
    newRow[0] = false; newRow[1] = timestampID; newRow[7] = filterBooking;  
    newRow[2] = templateRow[2]; newRow[6] = templateRow[6]; newRow[10] = templateRow[10]; newRow[11] = templateRow[11]; 
    newRow[12] = templateRow[12]; 
    
    newRow[29] = templateRow[29]; 
    newRow[40] = templateRow[40]; 
    newRow[50] = templateRow[50]; 
    
    newRow[56] = templateRow[56]; newRow[57] = templateRow[57]; 

    rawShipmentList.unshift(newRow); 
    applyFilters(); 
    editedRowIndices.add(0);
    updateSaveStatusBadge();
    alert(`✅ สร้างแถวตู้ใหม่ให้ Booking: ${filterBooking} เรียบร้อยแล้วครับ!`);
};

window.deleteContainerRows = async function() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const rowsToDelete = [];
    const idsToDelete = [];

    data.forEach((row, index) => {
        const src = hotGridInstance.getSourceDataAtRow(index);
        if (src[0] === true || src[0] === 'true' || src[0] === 1) { 
            rowsToDelete.push(index);
            const orderId = src[1] !== null && src[1] !== undefined ? String(src[1]).trim() : '';
            if (orderId && !orderId.includes('ORD-ADD')) idsToDelete.push(orderId); 
        }
    });

    if (rowsToDelete.length === 0) { alert('🖱️ กรุณาติ๊กถูกด้านหน้าแถวที่ต้องการจะลบตู้ก่อนครับ'); return; }
    if (!confirm(`⚠️ ยืนยันการลบตู้จำนวน ${rowsToDelete.length} รายการทิ้งถาวร?`)) return;

    if (idsToDelete.length > 0) {
        try { 
            const res = await fetch('/api/shipments', { 
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_ids: idsToDelete }) 
            }); 
            const result = await res.json();
            if(!result.success) { alert('❌ ลบในฐานข้อมูลไม่สำเร็จ: ' + result.message); return; }
        } catch (e) { alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์'); return; }
    }
    
    alert(`✅ ลบตู้เสร็จสิ้น!`);
    loadContainerGridData(); 
};

window.saveGridChanges = async function() {
    if (!hotGridInstance || editedRowIndices.size === 0) return;
    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;

    const dataToSave = [];
    editedRowIndices.forEach(idx => { dataToSave.push(hotGridInstance.getSourceDataAtRow(idx)); });

    try {
        const res = await fetch('/api/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave }) 
        });
        alert('✅ บันทึกข้อมูลตู้และคนขับสำเร็จ!');
        editedRowIndices.clear();
        loadContainerGridData(); 
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};