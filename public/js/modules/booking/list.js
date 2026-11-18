// ==========================================
// 📋 MODULE: BOOKING LIST (Row Grouping & Quick Filters)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 
let globalContainerSizes = ['20', '40', '40HC', '45HC']; 
let rateDataMap = {}; 

let currentQuickFilter = 'all'; 
let expandedBookings = {}; // 🌟 ตัวแปรเก็บสถานะการกางแถว

window.addEventListener('DOMContentLoaded', async () => {
    applyZebraStripingCSS(); 
    
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    const user = JSON.parse(savedUser);
    const userEl = document.getElementById('user-fullname');
    if (userEl) userEl.innerText = user.fullName || user.username || 'ผู้ดูแลระบบ';
    
    if (user.id) {
        try {
            const res = await fetch(`/api/users/grid-settings?userId=${user.id}`);
            if (res.ok) {
                const data = await res.json();
                userGridSettings = data.settings?.['booking_list'] || {};
            }
        } catch (err) {}
    }
    
    try {
        const szRes = await fetch('/api/container-sizes');
        const szResult = await szRes.json();
        if (szResult.success && szResult.data && szResult.data.length > 0) {
            globalContainerSizes = szResult.data.map(r => r.size_name);
        }
    } catch (err) {}

    try {
        const res = await fetch('/api/rates');
        const d = await res.json();
        if (d.success && d.data) {
            d.data.forEach(r => {
                rateDataMap[r[2]] = {
                    customer: r[1], origin: r[3], dest: r[4], jobType: r[7],
                    trp6: r[8], trp10: r[9], trp12: r[10], trpCash: r[11],
                    trn6: r[12], trn10: r[13], trn12: r[14], trnCash: r[15]
                };
            });
        }
    } catch (err) {}

    await loadBookingGridData();
});

function applyZebraStripingCSS() {
    if (!document.getElementById('tms-zebra-css')) {
        const style = document.createElement('style');
        style.id = 'tms-zebra-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f1f5f9; color: #475569; font-weight: 700; border-color: #cbd5e1; font-size: 11px; padding: 4px !important; }
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr td.ht-edited-row { background-color: #fef9c3 !important; }
            .handsontable tbody tr:hover td { background-color: #f1f5f9 !important; }
            
            /* 🌟 สไตล์พิเศษของแถวลูก */
            .handsontable tbody tr td.child-row { background-color: #f0f9ff !important; color: #3b82f6 !important; border-top: 1px dashed #bfdbfe !important; font-weight: 600; }
            
            .time-row { display: flex; justify-content: space-between; align-items: center; background-color: #ffffff; border: 1px solid #f1f5f9; padding: 2px 4px; border-radius: 4px; margin-bottom: 2px; }
            .time-row:last-child { margin-bottom: 0; }
            .time-label { font-size: 9px; font-weight: 700; color: #64748b; }
            .time-val { font-size: 10px; font-weight: 700; }
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
    expandedBookings = {}; // เคลียร์สถานะการกาง

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
            updateQuickFilterCounts();
            updateSummaryFooter(filteredList);
        } else {
            rawBookingList = []; filteredList = []; initBookingHandsontable([]); updateSummaryFooter([]);
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

        if ((!cVal || iC === cVal || iJ === cVal) && (!bVal || iB === bVal) && iD) dates.add(iD);
        if ((!dVal || iD === dVal) && (!bVal || iB === bVal)) { if (iC) custs.add(iC); if (iJ) custs.add(iJ); }
        if ((!dVal || iD === dVal) && (!cVal || iC === cVal || iJ === cVal) && iB) books.add(iB);
    });

    const dlDate = document.getElementById('dl-run-date'); 
    const dlCust = document.getElementById('dl-customer'); 
    const dlBook = document.getElementById('dl-booking-no');
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleCrossFilter = function() { updateDropdownOptions(); applyFilters(); };

window.setQuickFilter = function(type) {
    currentQuickFilter = type;
    
    document.querySelectorAll('.qf-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-primary', 'shadow-sm', 'ring-1', 'ring-slate-200/50');
        btn.classList.add('text-slate-500');
        const span = btn.querySelector('span');
        if(span) { span.classList.replace('bg-blue-100', 'bg-slate-200'); span.classList.replace('text-blue-700', 'text-slate-600'); }
    });

    const activeBtn = document.getElementById('qf-' + type);
    activeBtn.classList.remove('text-slate-500');
    activeBtn.classList.add('bg-white', 'text-primary', 'shadow-sm', 'ring-1', 'ring-slate-200/50');
    const activeSpan = activeBtn.querySelector('span');
    if(activeSpan) { activeSpan.classList.replace('bg-slate-200', 'bg-blue-100'); activeSpan.classList.replace('text-slate-600', 'text-blue-700'); }

    applyFilters();
};

function updateQuickFilterCounts() {
    const todayStr = new Date().toISOString().split('T')[0]; 
    const tomDate = new Date(); tomDate.setDate(tomDate.getDate() + 1); 
    const tomorrowStr = tomDate.toISOString().split('T')[0];

    let countToday = 0, countTomorrow = 0;

    rawBookingList.forEach(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        if (iD === todayStr) countToday++;
        if (iD === tomorrowStr) countTomorrow++;
    });

    document.getElementById('count-all').innerText = rawBookingList.length;
    document.getElementById('count-today').innerText = countToday;
    document.getElementById('count-tomorrow').innerText = countTomorrow;
}

window.applyFilters = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();
    
    const todayStr = new Date().toISOString().split('T')[0]; 
    const tomDate = new Date(); tomDate.setDate(tomDate.getDate() + 1); 
    const tomorrowStr = tomDate.toISOString().split('T')[0];

    expandedBookings = {}; // พอกรองใหม่ ต้องพับที่เคยกางไว้ทั้งหมด
    
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
        if (currentQuickFilter === 'today') matchQF = (iD === todayStr); 
        if (currentQuickFilter === 'tomorrow') matchQF = (iD === tomorrowStr);
        
        return matchD && matchC && matchB && matchGlobal && matchQF;
    });

    updateQuickFilterCounts(); 
    initBookingHandsontable(filteredList); 
    updateSummaryFooter(filteredList);
};

window.clearAllFilters = function() {
    document.getElementById('filter-run-date').value = ''; 
    document.getElementById('filter-customer').value = ''; 
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = '';
    setQuickFilter('all');
};

function updateSummaryFooter(data) {
    let sumContainers = 0, sumTrans = 0, sumTrip = 0;
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

function createTimeListHtml(mode, type, item) {
    let html = '<div class="flex flex-col w-full">';
    let hasData = false;
    const addRow = (label, val, colorCls) => {
        if(val && String(val).trim() !== 'NaN' && String(val).trim() !== 'null') {
            const fVal = formatDateTime(val);
            if(fVal) {
                html += `<div class="time-row"><span class="time-label whitespace-nowrap mr-2">${label}</span><span class="time-val ${colorCls} whitespace-nowrap">${fVal}</span></div>`;
                hasData = true;
            }
        }
    };

    if (mode === 'EXPORT') {
        if (type === 'PICKUP') { addRow('CY DATE', item.cy_date, 'text-blue-600'); addRow('VGM CUT', item.vgm_cutoff, 'text-red-500'); addRow('CUTOFF', item.cutoff_time, 'text-red-600'); } 
        else if (type === 'DELIVERY') { addRow('LOAD', item.load_date, 'text-amber-600'); } 
        else if (type === 'RETURN') { addRow('OPEN GATE', item.open_gate, 'text-emerald-600'); addRow('CUTOFF', item.cutoff_time, 'text-red-600'); }
    } else if (mode === 'IMPORT') {
        if (type === 'PICKUP') { addRow('CY DATE', item.cy_date, 'text-blue-600'); addRow('RENT CUT', item.rent_cutoff, 'text-red-500'); addRow('DEMURRAGE', item.demurrage, 'text-purple-600'); } 
        else if (type === 'DELIVERY') { addRow('UNLOAD', item.unload_date, 'text-amber-600'); } 
        else if (type === 'RETURN') { addRow('RETURN', item.return_date, 'text-slate-700'); }
    } else if (mode === 'TRANSFER') {
        if (type === 'PICKUP') { addRow('PICK UP', item.cy_date, 'text-blue-600'); if (item.demurrage) addRow('DEMURRAGE', item.demurrage, 'text-purple-600'); } 
        else if (type === 'DELIVERY') { addRow('LOAD', item.load_date, 'text-amber-600'); addRow('UNLOAD', item.unload_date, 'text-amber-600'); } 
        else if (type === 'RETURN') { addRow('RETURN', item.return_date, 'text-slate-700'); }
    }

    html += '</div>';
    return hasData ? html : '<span class="text-slate-300 italic text-[10px] w-full text-center block py-1">+ เพิ่มเวลา</span>';
}

function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const formattedTableData = data.map(item => {
        const jobNameDisplay = (item.job_name && item.job_name !== 'NaN') ? item.job_name : (item.job_title || '-');
        return [
            false, item.booking_no, item.id, item.booking_no || '', '', item.mode || 'EXPORT', 
            item.run_date ? String(item.run_date).split('T')[0] : '', item.customer_name || '', 
            item.agent || '', jobNameDisplay, item.job_type || '', item.origin || '', item.destination || '', 
            item.container_count || 1, item.container_size || '', item.price_type || '', item.trip_fee || 0, item.trans_fee || 0, 
            createTimeListHtml(item.mode, 'PICKUP', item), createTimeListHtml(item.mode, 'DELIVERY', item), createTimeListHtml(item.mode, 'RETURN', item)
        ];
    });

    // 🌟 คอลัมน์ที่ 4 (Index 4) คือ "📦 ตู้ย่อย"
    const colHeaders = [
        '✔', '⚙️ จัดการ', 'ID', 'Booking / BL', '📦 ตู้ย่อย', 'MODE', '📅 วันที่', 'ลูกค้า', 'AGENT', 'ชื่องาน', 'ประเภท', 
        'ต้นทาง', 'ปลายทาง', 'ตู้', 'ขนาดตู้', 'รถ', 'ค่าเที่ยว', 'ค่าขนส่ง', 
        '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN'
    ];

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: colHeaders,
        autoRowSize: true, 
        wordWrap: false, 
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    const rData = instance.getSourceDataAtRow(instance.toPhysicalRow(row));
                    if (rData && rData._isChild) {
                        td.innerHTML = `
                            <div class="flex items-center justify-center p-0.5 h-full">
                                <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(rData[3])}'" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold px-2 py-1 rounded shadow-sm text-[10px] flex items-center">
                                    <i class="fa-solid fa-truck-fast mr-1"></i> เลือกรถ
                                </button>
                            </div>`;
                    } else if (value) {
                        td.innerHTML = `
                            <div class="flex flex-col items-stretch justify-center gap-1 w-full p-0.5">
                                <button onclick="window.goToFormEdit('${value}')" class="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-bold px-1 py-1 rounded text-[10px] shadow-sm flex items-center justify-center whitespace-nowrap"><i class="fa-solid fa-pen mr-1"></i> แก้</button>
                                <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(value)}&month=${document.getElementById("filter-month").value}'" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-1 py-1 rounded text-[10px] shadow-sm flex items-center justify-center whitespace-nowrap"><i class="fa-solid fa-truck-fast mr-1"></i> จัดรถ</button>
                            </div>`;
                    }
                    td.style.verticalAlign = 'middle';
                } 
            },
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold bg-slate-50' }, 
            { type: 'text', className: 'font-bold text-primary htMiddle' }, 
            
            // 🌟 ปุ่มกางแถวลูก 🌟
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    const rData = instance.getSourceDataAtRow(instance.toPhysicalRow(row));
                    const bookingNo = rData[3];
                    
                    if (rData._isChild) {
                        td.innerHTML = `<span class="text-blue-600 font-bold px-1 py-0.5 rounded text-[10px]">↳ ${rData._orderId || 'Order'}</span>`;
                    } else if (bookingNo) {
                        const isExpanded = expandedBookings[bookingNo];
                        const icon = isExpanded ? 'fa-minus' : 'fa-plus';
                        const color = isExpanded ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700';
                        td.innerHTML = `
                            <button onclick="toggleRowExpansion('${bookingNo}', ${row})" class="w-full h-full flex items-center justify-center gap-1.5 ${color} hover:bg-blue-200 transition-colors font-bold text-[10px] rounded px-1">
                                <i class="fa-solid ${icon}"></i> <span>ดูตู้</span>
                            </button>`;
                    }
                    td.style.verticalAlign = 'middle';
                }
            },

            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'], className: 'htCenter htMiddle font-bold text-slate-600' }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD', className: 'htCenter htMiddle text-slate-700' }, 
            { type: 'text', className: 'font-bold text-slate-800 htMiddle' }, 
            { type: 'text', className: 'font-bold text-purple-700 htMiddle bg-purple-50/20' }, 
            { type: 'text', className: 'font-medium text-slate-700 htMiddle' }, 
            { type: 'dropdown', source: ['Domestic', 'CONTAINER'], className: 'htCenter htMiddle text-slate-600' }, 
            { type: 'text', className: 'htMiddle text-slate-600' }, 
            { type: 'text', className: 'htMiddle text-slate-600' }, 
            { type: 'numeric', className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/40' }, 
            { type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700' }, 
            { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'], className: 'htCenter htMiddle text-slate-600' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold htRight htMiddle' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold htRight htMiddle' }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }, 
            { type: 'text', renderer: renderClickableTimeCell, readOnly: true }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        hiddenColumns: { indicators: true },
        colWidths: userGridSettings.columnWidths || [30, 50, 40, 100, 75, 70, 75, 90, 70, 110, 70, 75, 75, 35, 55, 45, 55, 55, 145, 120, 130],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) {
                    const rData = this.getSourceDataAtRow(this.toPhysicalRow(row));
                    if(rData && rData._isChild) return; // ห้ามบันทึกการแก้แถวลูกในตารางหัวบิล
                    
                    editedRowIndices.add(row);
                    const colName = this.getColHeader(prop);
                    const headersNow = this.getColHeader(); 
                    
                    const custIdx = headersNow.indexOf('ลูกค้า');
                    const jobTypeIdx = headersNow.indexOf('ประเภท');
                    const originIdx = headersNow.indexOf('ต้นทาง');
                    const destIdx = headersNow.indexOf('ปลายทาง');
                    const carTypeIdx = headersNow.indexOf('รถ');
                    const tripIdx = headersNow.indexOf('ค่าเที่ยว');
                    const transIdx = headersNow.indexOf('ค่าขนส่ง');
                    const jobNameIdx = headersNow.indexOf('ชื่องาน');

                    if (colName === 'ชื่องาน' && newVal) {
                        const rate = rateDataMap[newVal.trim()];
                        if (rate) {
                            if(custIdx >= 0) this.setDataAtCell(row, custIdx, rate.customer || '', 'auto');
                            if(jobTypeIdx >= 0) this.setDataAtCell(row, jobTypeIdx, rate.jobType || '', 'auto');
                            if(originIdx >= 0) this.setDataAtCell(row, originIdx, rate.origin || '', 'auto');
                            if(destIdx >= 0) this.setDataAtCell(row, destIdx, rate.dest || '', 'auto');
                            if(carTypeIdx >= 0) {
                                const carType = this.getDataAtCell(row, carTypeIdx);
                                if (carType) applyRateDynamicallyInList(this, row, rate, carType, tripIdx, transIdx);
                            }
                        }
                    }
                    if (colName === 'รถ' && newVal) {
                        if(jobNameIdx >= 0) {
                            const jobName = this.getDataAtCell(row, jobNameIdx); 
                            if (jobName && rateDataMap[jobName.trim()]) {
                                applyRateDynamicallyInList(this, row, rateDataMap[jobName.trim()], newVal, tripIdx, transIdx);
                            }
                        }
                    }
                }
            });
            updateSaveStatusBadge(); this.render(); 
        },
        cells: function(row, col) {
            const cp = {};
            const rData = this.instance.getSourceDataAtRow(this.instance.toPhysicalRow(row));
            
            // 🌟 สไตล์พิเศษสำหรับแถวลูก 🌟
            if (rData && rData._isChild) {
                cp.className = (cp.className || '') + ' child-row';
                cp.readOnly = true; 
            } else if (editedRowIndices.has(row)) {
                cp.className = (cp.className || '') + ' ht-edited-row';
            }
            return cp;
        }
    });

    buildColumnToggleList();
}

// 🌟 ระบบดึงข้อมูลและแทรกแถวลูก (Row Grouping) 🌟
window.toggleRowExpansion = async function(bookingNo, visualRow) {
    if (!hotGridInstance) return;

    if (!expandedBookings[bookingNo]) {
        showLoadingToast(true);
        try {
            const monthVal = document.getElementById('filter-month').value;
            const [year, month] = monthVal.split('-');
            
            const res = await fetch(`/api/shipments?year=${year}&month=${month}`);
            const result = await res.json();
            
            if (result.success && result.data && result.data.length > 0) {
                // กรองเฉพาะตู้ที่เป็นของ Booking นี้
                const childOrders = result.data.filter(r => r[7] === bookingNo);
                
                if (childOrders.length === 0) {
                    alert('ยังไม่มีการสร้างตู้ลูกสำหรับบุคกิ้งนี้');
                    showLoadingToast(false); return;
                }

                const physicalRow = hotGridInstance.toPhysicalRow(visualRow);
                
                const childRowsData = childOrders.map((child) => {
                    const parentData = [...hotGridInstance.getSourceDataAtRow(physicalRow)];
                    parentData[0] = false; 
                    parentData[2] = ''; 
                    parentData[3] = bookingNo; 
                    parentData[4] = ''; 
                    parentData[14] = child[12] || ''; // ขนาดตู้
                    
                    // ซ่อนข้อมูลที่ไม่จำเป็นในแถวลูก
                    [5, 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20].forEach(idx => parentData[idx] = '');
                    
                    parentData._isChild = true;
                    parentData._orderId = child[1]; 
                    return parentData;
                });

                hotGridInstance.alter('insert_row_below', visualRow, childRowsData.length);
                hotGridInstance.populateFromArray(visualRow + 1, 0, childRowsData);
                
                expandedBookings[bookingNo] = childRowsData.length; 
            }
        } catch (e) {
            console.error(e); alert('ดึงข้อมูลตู้ย่อยล้มเหลว');
        } finally {
            showLoadingToast(false);
        }
    } else {
        const countToRemove = expandedBookings[bookingNo];
        hotGridInstance.alter('remove_row', visualRow + 1, countToRemove);
        delete expandedBookings[bookingNo];
    }
};

function showLoadingToast(show) {
    const toast = document.getElementById('child-loading-toast');
    if (show) { toast.classList.remove('translate-y-20', 'opacity-0'); } 
    else { toast.classList.add('translate-y-20', 'opacity-0'); }
}

function buildColumnToggleList() {
    const listContainer = document.getElementById('column-toggle-list');
    if (!listContainer || !hotGridInstance) return;
    
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    const hiddenCols = plugin.getHiddenColumns() || [];
    const headers = hotGridInstance.getColHeader();
    
    let html = '';
    headers.forEach((header, index) => {
        if ([0, 1, 3, 4].includes(index)) return; 
        
        const isChecked = !hiddenCols.includes(index) ? 'checked' : '';
        html += `
            <label class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                <span class="truncate pr-2">${header}</span>
                <input type="checkbox" class="w-3.5 h-3.5 accent-primary rounded" ${isChecked} onchange="toggleGridColumn(${index}, this.checked)">
            </label>
        `;
    });
    listContainer.innerHTML = html;
}

window.toggleGridColumn = function(colIndex, isVisible) {
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    if (isVisible) plugin.showColumns([colIndex]); 
    else plugin.hideColumns([colIndex]);
    hotGridInstance.render();
};

window.resetColumns = function() {
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    plugin.showColumns(Array.from(Array(hotGridInstance.countCols()).keys()));
    hotGridInstance.render();
    buildColumnToggleList(); 
};

function applyRateDynamicallyInList(hot, row, rate, type, tripIdx, transIdx) {
    if(tripIdx < 0 || transIdx < 0) return;
    if(type === '6W') { hot.setDataAtCell(row, tripIdx, rate.trp6||''); hot.setDataAtCell(row, transIdx, rate.trn6||''); }
    else if(type === '10W') { hot.setDataAtCell(row, tripIdx, rate.trp10||''); hot.setDataAtCell(row, transIdx, rate.trn10||''); }
    else if(type === '12W*2') { hot.setDataAtCell(row, tripIdx, rate.trp12||''); hot.setDataAtCell(row, transIdx, rate.trn12||''); }
    else if(type === 'เงินสด') { hot.setDataAtCell(row, tripIdx, rate.trpCash||''); hot.setDataAtCell(row, transIdx, rate.trnCash||''); }
}

window.saveGridSettings = async function() {
    if (!hotGridInstance) return;
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    const colCount = hotGridInstance.countCols();
    const widths = []; for (let i = 0; i < colCount; i++) widths.push(hotGridInstance.getColWidth(i));
    const movePlugin = hotGridInstance.getPlugin('manualColumnMove');
    let positions = []; if (movePlugin && typeof movePlugin.columnsMapper !== 'undefined') { positions = movePlugin.columnsMapper.getIndexesSequence(); }

    try {
        const response = await fetch('/api/users/grid-settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'booking_list', settings: { columnWidths: widths, columnPositions: positions } })
        });
        alert('✅ บันทึกมุมมองตารางเรียบร้อยแล้ว!');
    } catch (err) {}
};

window.goToFormEdit = function(bookingNo) { window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`; };

window.renderClickableTimeCell = function(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    const rData = instance.getSourceDataAtRow(instance.toPhysicalRow(row));
    if(rData && rData._isChild) { td.innerHTML = ''; return; } // แถวลูกไม่ต้องโชว์เวลา
    
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full p-0.5" onclick="openDateTimeModal(${row}, ${prop})">
            ${value}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded px-1.5 py-0.5 shadow-md items-center justify-center transition-all z-10"><i class="fa-solid fa-pen text-[10px]"></i></div>
        </div>
    `;
};

function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).trim().replace('T', ' '); 
    const parts = cleanStr.split(' ');
    const dateParts = parts[0].split('-');
    
    if (dateParts.length === 3 && dateParts[0].length === 4) {
        const dd = dateParts[2].padStart(2, '0');
        const mm = dateParts[1].padStart(2, '0');
        const timePart = parts[1] ? parts[1].substring(0, 5) : '';
        return timePart ? `${dd}/${mm} ${timePart}` : `${dd}/${mm}`;
    }
    return cleanStr.length >= 16 ? cleanStr.substring(5, 16) : cleanStr; 
}

let currentModalRow = -1, currentModalProp = -1;

window.openDateTimeModal = function(row, prop) {
    currentModalRow = row; currentModalProp = prop;
    const rData = hotGridInstance.getSourceDataAtRow(row);
    if(rData && rData._isChild) return; 

    const bookingNo = rData[3]; 
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if (!item) return;
    const mode = item.mode ? String(item.mode).trim().toUpperCase() : 'EXPORT';

    let html = '', title = '';
    if (prop === 18) { 
        title = `เวลา PICK UP (${mode})`;
        html += createDatetimeInput('cy_date', 'CY Date & Time (วัน-เวลารับตู้)', item.cy_date);
        if (mode === 'EXPORT') {
            html += createDatetimeInput('vgm_cutoff', 'VGM Cutoff', item.vgm_cutoff);
            html += createDatetimeInput('cutoff_time', 'Cutoff Time', item.cutoff_time);
        } else if (mode === 'IMPORT') {
            html += createDatetimeInput('rent_cutoff', 'Rent Cutoff (คืนตู้ฟรีถึง)', item.rent_cutoff);
            html += createDatetimeInput('demurrage', 'DEMURRAGE (Time)', item.demurrage);
        } else if (mode === 'TRANSFER') {
            html += createDatetimeInput('demurrage', 'DEMURRAGE (Time)', item.demurrage);
        }
    } else if (prop === 19) { 
        title = `เวลา DELIVERY (${mode})`;
        if (mode === 'EXPORT') html += createDatetimeInput('load_date', 'Load Date & Time', item.load_date);
        else if (mode === 'IMPORT') html += createDatetimeInput('unload_date', 'Unload Date & Time', item.unload_date);
        else if (mode === 'TRANSFER') {
            html += createDatetimeInput('load_date', 'Load Date & Time (ขึ้นของ)', item.load_date);
            html += createDatetimeInput('unload_date', 'Unload Date & Time (ลงของ)', item.unload_date);
        }
    } else if (prop === 20) { 
        title = `เวลา RETURN (${mode})`;
        if (mode === 'EXPORT') {
            html += createDatetimeInput('open_gate', 'Open Gate & Time', item.open_gate);
            html += createDatetimeInput('cutoff_time', 'Cutoff Time (แก้ไขที่นี่ได้ด้วย)', item.cutoff_time);
        } else if (mode === 'IMPORT') html += createDatetimeInput('return_date', 'Return Date & Time', item.return_date);
        else if (mode === 'TRANSFER') html += createDatetimeInput('return_date', 'Return Date & Time', item.return_date);
    } else return;

    document.getElementById('modal-title').innerText = title; 
    document.getElementById('modal-body').innerHTML = html;
    const modal = document.getElementById('datetime-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); document.getElementById('datetime-modal-content').classList.remove('scale-95'); }, 10);
};

function createDatetimeInput(field, label, val) {
    let formattedVal = '';
    if (val && String(val).trim() !== 'NaN' && String(val).trim() !== 'null') {
        let clean = String(val).trim().replace(' ', 'T');
        if (clean.length === 10) clean += 'T00:00';
        formattedVal = clean.substring(0, 16);
    }
    return `<div>
                <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
                <input type="datetime-local" id="modal_input_${field}" value="${formattedVal}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
            </div>`;
}

window.closeDateTimeModal = function() {
    const modal = document.getElementById('datetime-modal');
    modal.classList.add('opacity-0'); document.getElementById('datetime-modal-content').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.saveDateTimeModal = function() {
    const rData = hotGridInstance.getSourceDataAtRow(currentModalRow);
    const bookingNo = rData[3]; 
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if(!item) return;

    const inputs = document.querySelectorAll('#modal-body input[type="datetime-local"]');
    inputs.forEach(input => { 
        const field = input.id.replace('modal_input_', ''); 
        item[field] = input.value ? input.value.replace('T', ' ') : null; 
    });

    editedRowIndices.add(currentModalRow);
    
    if (currentModalProp === 18) hotGridInstance.setDataAtRowProp(currentModalRow, 18, createTimeListHtml(item.mode, 'PICKUP', item));
    if (currentModalProp === 19) hotGridInstance.setDataAtRowProp(currentModalRow, 19, createTimeListHtml(item.mode, 'DELIVERY', item));
    if (currentModalProp === 20) hotGridInstance.setDataAtRowProp(currentModalRow, 20, createTimeListHtml(item.mode, 'RETURN', item));

    updateSaveStatusBadge(); closeDateTimeModal();
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
    let successCount = 0, savedRows = []; let lastError = "";

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex]; 
        if (!row[3]) continue; 
        const item = filteredList.find(i => i.booking_no === row[3]);
        
        const updateData = {
            booking_no: row[3], mode: row[5], run_date: row[6], customer_name: row[7], agent: row[8], job_name: row[9], job_type: row[10], origin: row[11], 
            destination: row[12], container_count: row[13], container_size: row[14], price_type: row[15], trip_fee: row[16], trans_fee: row[17],
            cy_date: item.cy_date, vgm_cutoff: item.vgm_cutoff, cutoff_time: item.cutoff_time, rent_cutoff: item.rent_cutoff, demurrage: item.demurrage,
            load_date: item.load_date, unload_date: item.unload_date, open_gate: item.open_gate, return_date: item.return_date
        };
        try {
            const res = await fetch(`/api/bookings/${row[2]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            const resData = await res.json();
            if (res.ok && resData.success) { successCount++; savedRows.push(rowIndex); } 
            else { lastError = resData.message; }
        } catch (err) { lastError = err.message; }
    }
    
    btn.innerHTML = orgText; btn.disabled = false;
    if (successCount > 0) {
        savedRows.forEach(row => editedRowIndices.delete(row));
        if (editedRowIndices.size) alert(`⚠️ บันทึกสำเร็จ ${successCount} รายการ ยังไม่สำเร็จ ${editedRowIndices.size} รายการ: ${lastError}`);
        else { alert(`✅ บันทึกข้อมูลสำเร็จ ${successCount} รายการ`); loadBookingGridData(); }
    } else alert('❌ ไม่สามารถบันทึกข้อมูลได้: ' + lastError);
};

window.deleteSelectedRows = async function() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = new Set();
    data.forEach((row, index) => {
        if (row[0] === true) {
            const rowData = hotGridInstance.getSourceDataAtRow(index);
            if (rowData && !rowData._isChild && rowData[2]) idsToDelete.add(rowData[2]);
        }
    });

    const idsArray = Array.from(idsToDelete);
    if (idsArray.length === 0) { alert('🖱️ กรุณาติ๊กถูกหน้าแถวที่ต้องการจะลบก่อนครับ (ห้ามลบแถวลูก)'); return; }
    if (!confirm(`⚠️ ยืนยันการลบทิ้ง ${idsArray.length} บุคกิ้ง?\n\n(ตู้ทั้งหมดที่อยู่ในบุคกิ้งเหล่านี้จะถูกลบทิ้งไปด้วยอัตโนมัติ)`)) return;

    let successCount = 0;
    for (let id of idsArray) { try { const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); if(res.ok) successCount++; } catch (err) {} }
    
    if (successCount > 0) {
        alert(`✅ ลบรายการสำเร็จ ${successCount} บุคกิ้ง`); 
        editedRowIndices.clear(); updateSaveStatusBadge(); loadBookingGridData();
    } else alert(`❌ ลบข้อมูลไม่ได้`);
};