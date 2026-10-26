// ==========================================
// 📦 MODULE: CONTAINER MANAGE (Ghost Sweeper & Auto-Sync)
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
            .handsontable tbody tr td.ht-edited-row { background-color: #fef08a !important; color: #b45309 !important; transition: background-color 0.2s ease; }
            .handsontable tbody tr td.ht-edited-row.unsaved-id-cell { color: #dc2626 !important; font-weight: 800 !important; background-color: #fde047 !important; }
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
                    origin: b.origin, 
                    destination: b.destination,
                    trip_fee: parseFloat(b.trip_fee) || 0,
                    trans_fee: parseFloat(b.trans_fee) || 0
                };
            });
        }

        if (result.success && result.data) {
            rawShipmentList = result.data.map(row => {
                const fullRow = Array.isArray(row) ? [...row] : [];
                while (fullRow.length < 80) fullRow.push(''); 

                const bNo = fullRow[7] ? String(fullRow[7]).trim() : ''; 
                
                if (bookingsMap[bNo]) {
                    if (!fullRow[78]) fullRow[78] = bookingsMap[bNo].origin || '';
                    if (!fullRow[79]) fullRow[79] = bookingsMap[bNo].destination || '';
                    
                    const currentTrip = parseFloat(String(fullRow[56]).replace(/,/g, '')) || 0;
                    const currentTrans = parseFloat(String(fullRow[57]).replace(/,/g, '')) || 0;
                    
                    if (currentTrip === 0) fullRow[56] = bookingsMap[bNo].trip_fee;
                    if (currentTrans === 0) fullRow[57] = bookingsMap[bNo].trans_fee;
                }
                return fullRow;
            })
            // 🌟 Ghost Sweeper: ดักเตะ "ตู้ผี" ที่ไม่มี Order ID ทิ้งกลางอากาศ ไม่ให้หลุดมาโชว์ในตาราง! 🌟
            .filter(row => row[1] !== null && row[1] !== undefined && String(row[1]).trim() !== '');

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
// 📊 จัดการตาราง Handsontable 
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
            
            { data: 1, type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter' }, 
            { data: 2, type: 'text', readOnly: true, className: 'htCenter font-bold text-slate-500' }, 
            { data: 4, type: 'date', dateFormat: 'YYYY-MM-DD', readOnly: true, className: 'htCenter text-slate-600' }, 
            { data: 5, type: 'text', readOnly: true, className: 'font-semibold text-slate-700' }, 
            { data: 6, type: 'text', readOnly: true, className: 'text-slate-600' }, 
            { data: 7, type: 'text', readOnly: true, className: 'font-bold text-emerald-700 htCenter bg-emerald-50/20' }, 
            
            { data: 12, type: 'autocomplete', source: ['ตู้บรรจุ 1*40', 'ทอยตู้เปล่า 1*40', 'ทอยตู้เปล่า 2*20'], strict: false }, 
            
            { data: 78, type: 'text', className: 'font-medium text-amber-700 bg-amber-50/30' }, 
            { data: 79, type: 'text', className: 'font-medium text-amber-700 bg-amber-50/30' }, 
            { data: 14, type: 'text', className: 'font-bold text-blue-600 htCenter bg-blue-50/20' }, 
            
            { data: 8, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, 
            { data: 9, type: 'text', validator: containerValidator, className: 'font-bold text-blue-700 bg-blue-50 uppercase htCenter', allowInvalid: true }, 
            { data: 11, type: 'dropdown', source: ['20', '40', '40HC', '45HC'] }, 
            
            { data: 15, type: 'text' }, 
            { data: 16, type: 'numeric', numericFormat: { pattern: '0,0' } }, 
            { data: 17, type: 'numeric', numericFormat: { pattern: '0,0' } }, 
            
            { data: 56, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-green-700 font-bold bg-green-50/30 htRight' }, 
            { data: 57, type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50/30 htRight' }  
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        colWidths: userGridSettings.columnWidths || [40, 110, 75, 90, 140, 120, 120, 130, 100, 100, 90, 120, 120, 70, 95, 80, 80, 85, 85],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) {
                    editedRowIndices.add(row);
                }
                
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
            if (editedRowIndices.has(row)) {
                cp.className = (cp.className || '') + ' ht-edited-row';
                if (col === 1) {
                    cp.className += ' unsaved-id-cell';
                }
            }
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

    if (rowsToDelete.length === 0) {
        alert('🖱️ กรุณาติ๊กถูกที่กล่องสี่เหลี่ยมด้านหน้าสุดของแถวที่ต้องการจะลบตู้ก่อนครับ');
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบตู้จำนวน ${rowsToDelete.length} รายการทิ้งถาวร?`)) return;

    if (idsToDelete.length > 0) {
        try { 
            const res = await fetch('/api/shipments', { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_ids: idsToDelete }) 
            }); 
            
            const result = await res.json();
            if(!result.success) {
                alert('❌ ลบในฐานข้อมูลไม่สำเร็จ: ' + result.message);
                return; 
            }
        } catch (e) {
            alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
            return;
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
        
        alert('✅ บันทึกข้อมูลเบอร์ตู้สำเร็จ!');
        editedRowIndices.clear();
        loadContainerGridData(); 
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};