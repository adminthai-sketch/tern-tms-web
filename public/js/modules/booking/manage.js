// ==========================================
// 📦 MODULE: DISPATCH & CONTAINER MANAGE (5 Legs Workflow - ฉบับสมบูรณ์)
// ==========================================

let hotGridInstance = null;
let rawShipmentList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 

// ตัวแปรเก็บข้อมูลรถและคนขับ
let globalTruckList = [];
let globalDriverList = [];
let fleetAssignments = {}; // { 'ทะเบียนรถ': 'ชื่อคนขับ' }
let isDropYardsHidden = true; // สถานะเริ่มต้น ซ่อนลานฝาก

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
    
    await loadFleetData(); // ดึงรายชื่อรถและคนขับมาก่อน
    loadContainerGridData();
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
                    if (item[1] && item[2]) fleetAssignments[item[1]] = item[2]; // ทะเบียน = คนขับ
                });
            }
        }
    } catch(e) {}
}

function applyZebraStripingCSS() {
    if (!document.getElementById('tms-zebra-css')) {
        const style = document.createElement('style');
        style.id = 'tms-zebra-css';
        style.innerHTML = `
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr td.ht-edited-row { background-color: #fef08a !important; color: #b45309 !important; transition: background-color 0.2s ease; }
            .handsontable tbody tr td.ht-edited-row.unsaved-id-cell { color: #dc2626 !important; font-weight: 800 !important; background-color: #fde047 !important; }
            .handsontable tbody tr:hover td { background-color: #e2e8f0 !important; transition: all 0.2s; }
            .handsontable th { background-color: #f1f5f9; color: #1e293b; font-weight: 700; border-color: #cbd5e1; }
            .invalid-container { background-color: #fee2e2 !important; color: #b91c1c !important; font-weight: bold; }
            .bg-leg-1 { background-color: #fdf4ff !important; } /* ชมพูอ่อน Pick Up */
            .bg-leg-drop { background-color: #f3f4f6 !important; } /* เทา Drop */
            .bg-leg-2 { background-color: #fffbeb !important; } /* เหลืองอ่อน Delivery */
            .bg-leg-3 { background-color: #f0fdf4 !important; } /* เขียวอ่อน Return */
        `;
        document.head.appendChild(style);
    }
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
                    origin: b.origin, destination: b.destination,
                    trip_fee: parseFloat(b.trip_fee) || 0, trans_fee: parseFloat(b.trans_fee) || 0
                };
            });
        }

        if (result.success && result.data) {
            rawShipmentList = result.data.map(row => {
                const fullRow = Array.isArray(row) ? [...row] : [];
                while (fullRow.length < 80) fullRow.push(''); 

                const bNo = fullRow[7] ? String(fullRow[7]).trim() : ''; 
                if (bookingsMap[bNo]) {
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

window.handleCrossFilter = function() { applyFilters(); };
window.applyFilters = function() {
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    filteredList = rawShipmentList.filter(item => {
        const iB = item[7] ? String(item[7]).trim() : ''; 
        const matchB = !b || iB === b;
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        return matchB && matchGlobal;
    });

    initContainerHandsontable(filteredList);
    updateSummaryFooter(filteredList);
};

window.clearAllFilters = function() { 
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = ''; 
    applyFilters(); 
};

function containerValidator(value, callback) {
    if (!value || value === 'ยังไม่ระบุ') { callback(true); return; }
    callback(/^[A-Z]{4}\d{7}$/i.test(value.replace(/\s/g, '')));
}

function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const emptyArray = new Array(80).fill("");
    const gridData = data.length > 0 ? data : Array.from({ length: 10 }, () => [...emptyArray]);

    hotGridInstance = new Handsontable(container, {
        data: gridData,
        // 🌟 หัวตารางซ้อน 2 ชั้น 🌟
        nestedHeaders: [
            [
                { label: '📋 ข้อมูลบิลและตู้', colspan: 6 },
                { label: '📦 ขา 1: PICK UP (รับตู้)', colspan: 4 },
                { label: '🅿️ ขาฝาก 1 (DROP 1)', colspan: 4 },
                { label: '🏭 ขา 2: DELIVERY (เข้าจุดบรรจุ)', colspan: 4 },
                { label: '🅿️ ขาฝาก 2 (DROP 2)', colspan: 4 },
                { label: '🚢 ขา 3: RETURN (คืนตู้)', colspan: 4 },
                { label: '💵 การเงิน', colspan: 2 }
            ],
            [
                '✔', 'Order ID', 'Booking', 'ลูกค้า', 'เบอร์ตู้', 'ขนาด', // ข้อมูลหลัก
                'ทะเบียนรถ', 'พนักงานขับรถ', 'สถานที่ (รับตู้)', '✅',     // Pickup
                'ทะเบียนรถ', 'พนักงานขับรถ', 'สถานที่ (ลานฝาก)', '✅',    // Drop1
                'ทะเบียนรถ', 'พนักงานขับรถ', 'สถานที่ (โรงงาน)', '✅',     // Delivery
                'ทะเบียนรถ', 'พนักงานขับรถ', 'สถานที่ (ลานฝาก)', '✅',    // Drop2
                'ทะเบียนรถ', 'พนักงานขับรถ', 'สถานที่ (ลานคืน)', '✅',     // Return
                'ค่าเที่ยว', 'ค่าขนส่ง'                               // การเงิน
            ]
        ],
        columns: [
            { data: 0, type: 'checkbox', className: 'htCenter htMiddle' }, 
            { data: 1, type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter htMiddle' }, 
            { data: 7, type: 'text', readOnly: true, className: 'font-bold text-emerald-700 htMiddle' }, 
            { data: 6, type: 'text', readOnly: true, className: 'text-slate-600 htMiddle' }, 
            { data: 8, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 uppercase htCenter htMiddle', allowInvalid: true }, 
            { data: 11, type: 'dropdown', source: ['20', '40', '40HC', '45HC'], className: 'htCenter htMiddle' }, 

            { data: 28, type: 'autocomplete', source: globalTruckList, strict: false, className: 'bg-leg-1 font-bold' },
            { data: 27, type: 'autocomplete', source: globalDriverList, strict: false, className: 'bg-leg-1' },
            { data: 30, type: 'text', className: 'bg-leg-1' },
            { data: 31, type: 'checkbox', className: 'htCenter htMiddle bg-leg-1' },

            { data: 34, type: 'autocomplete', source: globalTruckList, strict: false, className: 'bg-leg-drop font-bold' },
            { data: 33, type: 'autocomplete', source: globalDriverList, strict: false, className: 'bg-leg-drop' },
            { data: 35, type: 'text', className: 'bg-leg-drop' },
            { data: 36, type: 'checkbox', className: 'htCenter htMiddle bg-leg-drop' },

            { data: 39, type: 'autocomplete', source: globalTruckList, strict: false, className: 'bg-leg-2 font-bold' },
            { data: 38, type: 'autocomplete', source: globalDriverList, strict: false, className: 'bg-leg-2' },
            { data: 41, type: 'text', className: 'bg-leg-2' },
            { data: 42, type: 'checkbox', className: 'htCenter htMiddle bg-leg-2' },

            { data: 44, type: 'autocomplete', source: globalTruckList, strict: false, className: 'bg-leg-drop font-bold' },
            { data: 43, type: 'autocomplete', source: globalDriverList, strict: false, className: 'bg-leg-drop' },
            { data: 45, type: 'text', className: 'bg-leg-drop' },
            { data: 46, type: 'checkbox', className: 'htCenter htMiddle bg-leg-drop' },

            { data: 49, type: 'autocomplete', source: globalTruckList, strict: false, className: 'bg-leg-3 font-bold' },
            { data: 48, type: 'autocomplete', source: globalDriverList, strict: false, className: 'bg-leg-3' },
            { data: 51, type: 'text', className: 'bg-leg-3' },
            { data: 52, type: 'checkbox', className: 'htCenter htMiddle bg-leg-3' },

            { data: 56, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-green-700 font-bold bg-green-50 htRight htMiddle' }, 
            { data: 57, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50 htRight htMiddle' }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, 
        
        hiddenColumns: {
            columns: isDropYardsHidden ? [10, 11, 12, 13, 18, 19, 20, 21] : [], // สั่งซ่อน/เปิด ลานฝากตั้งต้น
            indicators: true
        },
        contextMenu: ['alignment', 'hidden_columns_hide', 'hidden_columns_show', 'copy'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) editedRowIndices.add(row);
                
                if (prop === 8 && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) this.setDataAtCell(row, this.propToCol(prop), cleanVal, 'auto');
                }

                // 🌟 ดึงชื่อคนขับอัตโนมัติเมื่อพิมพ์ทะเบียนรถ 🌟
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
}

// 🌟 ฟังก์ชันเปิด/ปิด การแสดงผลลานฝาก 🌟
window.toggleDropYards = function() {
    isDropYardsHidden = !isDropYardsHidden;
    const btn = document.getElementById('btn-toggle-drops');
    
    if (isDropYardsHidden) {
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> แสดงลานฝากตู้`;
        btn.classList.replace('bg-purple-600', 'bg-purple-50');
        btn.classList.replace('text-white', 'text-purple-700');
        hotGridInstance.getPlugin('hiddenColumns').hideColumns([10, 11, 12, 13, 18, 19, 20, 21]);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> ซ่อนลานฝากตู้`;
        btn.classList.replace('bg-purple-50', 'bg-purple-600');
        btn.classList.replace('text-purple-700', 'text-white');
        hotGridInstance.getPlugin('hiddenColumns').showColumns([10, 11, 12, 13, 18, 19, 20, 21]);
    }
    hotGridInstance.render();
};

window.updateSummaryFooter = function(data) {
    let total = data.length;
    let missing = 0;
    data.forEach(item => {
        const cNo = item[8] ? String(item[8]).trim() : ''; 
        if (cNo === '' || cNo === 'ยังไม่ระบุ') missing++;
    });
    document.getElementById('sum-total').innerText = total.toLocaleString();
    document.getElementById('sum-filled').innerText = (total - missing).toLocaleString();
    document.getElementById('sum-missing').innerText = missing.toLocaleString();
};

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
    
    if (!filterBooking) { alert("⚠️ กรุณากรองเลือกเลข Booking ที่ต้องการเพิ่มตู้ในช่องค้นหาด้านบนก่อนครับ!"); return; }

    const templateRow = rawShipmentList.find(r => r[7] === filterBooking);
    if (!templateRow) { alert("❌ ไม่พบข้อมูล Booking นี้ในตารางครับ"); return; }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = new Array(80).fill('');
    newRow[0] = false; 
    newRow[1] = timestampID; 
    newRow[2] = templateRow[2]; 
    newRow[4] = templateRow[4]; 
    newRow[5] = templateRow[5]; 
    newRow[6] = templateRow[6]; 
    newRow[7] = filterBooking;  
    newRow[10] = templateRow[10]; 
    newRow[11] = templateRow[11]; 
    newRow[12] = templateRow[12]; 
    newRow[13] = templateRow[13]; 
    newRow[14] = templateRow[14]; 
    newRow[56] = templateRow[56]; 
    newRow[57] = templateRow[57]; 
    newRow[78] = templateRow[78] || ''; 
    newRow[79] = templateRow[79] || '';

    rawShipmentList.unshift(newRow); 
    applyFilters(); 
    
    editedRowIndices.add(0);
    updateSaveStatusBadge();
    
    hotGridInstance.selectCell(0, 11); 
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
            if (orderId && !orderId.includes('ORD-ADD')) { 
                idsToDelete.push(orderId); 
            }
        }
    });

    if (rowsToDelete.length === 0) { alert('🖱️ กรุณาติ๊กถูกที่กล่องสี่เหลี่ยมด้านหน้าสุดของแถวที่ต้องการจะลบตู้ก่อนครับ'); return; }

    if (!confirm(`⚠️ ยืนยันการลบตู้จำนวน ${rowsToDelete.length} รายการทิ้งถาวร?`)) return;

    if (idsToDelete.length > 0) {
        try { 
            const res = await fetch('/api/shipments', { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_ids: idsToDelete }) 
            }); 
            
            const result = await res.json();
            if(!result.success) { alert('❌ ลบในฐานข้อมูลไม่สำเร็จ: ' + result.message); return; }
        } catch (e) {
            alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์'); return;
        }
    }
    
    alert(`✅ ลบตู้เสร็จสิ้น!`);
    loadContainerGridData(); 
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
        
        alert('✅ บันทึกข้อมูลตู้และคนขับสำเร็จ!');
        editedRowIndices.clear();
        loadContainerGridData(); 
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};