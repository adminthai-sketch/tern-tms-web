// ==========================================
// 📋 MODULE: BOOKING LIST (Auto-Rate Fill, Vertical Times, Hide Columns)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 
let globalContainerSizes = ['20', '40', '40HC', '45HC']; 

// 🌟 ตัวแปรเก็บข้อมูลตารางราคา (เรท) สำหรับ Auto-Fill
let rateDataMap = {}; 

window.addEventListener('DOMContentLoaded', async () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    // 🌟 เช็คล็อกอินและแสดงชื่อ 🌟
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
        const szRes = await fetch('/api/bookings/container-sizes');
        const szResult = await szRes.json();
        if (szResult.success && szResult.data && szResult.data.length > 0) {
            globalContainerSizes = szResult.data.map(r => r.size_name);
        }
    } catch (err) {}

    try {
        const res = await fetch('/api/rates');
        const d = await res.json();
        if (d.success && d.data) {
            const datalist = document.getElementById('jobList');
            if (datalist) datalist.innerHTML = '';
            
            d.data.forEach(r => {
                // 🌟 ปรับ Index ใหม่: r[2] = job_name, r[1] = short_name
                rateDataMap[r[2]] = {
                    customer: r[1], origin: r[3], dest: r[4], jobType: r[7],
                    trp6: r[8], trp10: r[9], trp12: r[10], trpCash: r[11],
                    trn6: r[12], trn10: r[13], trn12: r[14], trnCash: r[15]
                };
                
                if (datalist) {
                    const opt = document.createElement('option');
                    opt.value = r[2]; // ใช้ชื่องานเป็น Value
                    datalist.appendChild(opt);
                }
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
            .handsontable td { 
                vertical-align: middle !important;
                border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; 
            }
            .handsontable th { background-color: #f1f5f9; color: #475569; font-weight: 700; border-color: #cbd5e1; font-size: 11px; padding: 4px !important; }
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr td.ht-edited-row { background-color: #fef9c3 !important; }
            .handsontable tbody tr:hover td { background-color: #f1f5f9 !important; }
            
            .time-row { display: flex; justify-content: space-between; align-items: center; background-color: #ffffff; border: 1px solid #f1f5f9; padding: 2px 4px; border-radius: 4px; margin-bottom: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
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

    try {
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawBookingList = result.data;
            filteredList = [...rawBookingList];
            editedRowIndices.clear();
            updateSaveStatusBadge(); updateDropdownOptions(); initBookingHandsontable(filteredList); updateSummaryFooter(filteredList);
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

    const dlDate = document.getElementById('dl-run-date'); const dlCust = document.getElementById('dl-customer'); const dlBook = document.getElementById('dl-booking-no');
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}
window.handleCrossFilter = function() { updateDropdownOptions(); applyFilters(); };
window.applyFilters = function() {
    const d = document.getElementById('filter-run-date').value, c = document.getElementById('filter-customer').value, b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();
    const isToday = document.getElementById('qf-today').classList.contains('bg-blue-50'), isTomorrow = document.getElementById('qf-tomorrow').classList.contains('bg-blue-50');
    const todayStr = new Date().toISOString().split('T')[0]; const tomDate = new Date(); tomDate.setDate(tomDate.getDate() + 1); const tomorrowStr = tomDate.toISOString().split('T')[0];

    filteredList = rawBookingList.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iJ = item.job_name ? String(item.job_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';
        
        const matchD = !d || iD === d; const matchC = !c || iC === c || iJ === c; const matchB = !b || iB === b;
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        let matchQF = true; if (isToday) matchQF = matchQF && (iD === todayStr); if (isTomorrow) matchQF = matchQF && (iD === tomorrowStr);
        return matchD && matchC && matchB && matchGlobal && matchQF;
    });
    initBookingHandsontable(filteredList); updateSummaryFooter(filteredList);
};
window.clearAllFilters = function() {
    document.getElementById('filter-run-date').value = ''; document.getElementById('filter-customer').value = ''; document.getElementById('filter-booking-no').value = ''; document.getElementById('global-search').value = '';
    ['today', 'tomorrow'].forEach(id => { const btn = document.getElementById('qf-' + id); btn.classList.remove('bg-blue-50', 'text-blue-600', 'border-blue-300'); btn.classList.add('bg-white', 'text-slate-600'); });
    updateDropdownOptions(); applyFilters();
};
window.setQuickFilter = function(type) {
    const btn = document.getElementById('qf-' + type);
    ['today', 'tomorrow'].forEach(id => { if (id !== type) { const b = document.getElementById('qf-' + id); b.classList.remove('bg-blue-50', 'text-blue-600', 'border-blue-300'); b.classList.add('bg-white', 'text-slate-600'); } });
    btn.classList.toggle('bg-blue-50'); btn.classList.toggle('text-blue-600'); btn.classList.toggle('border-blue-300'); btn.classList.toggle('bg-white'); btn.classList.toggle('text-slate-600');
    applyFilters();
};
function updateSummaryFooter(data) {
    let sumContainers = 0, sumTrans = 0, sumTrip = 0;
    data.forEach(item => {
        let count = parseInt(item.container_count) || 0; sumContainers += count; sumTrans += (parseFloat(item.trans_fee) || 0) * count; sumTrip += (parseFloat(item.trip_fee) || 0) * count;
    });
    document.getElementById('sum-count').innerText = data.length.toLocaleString(); document.getElementById('sum-container').innerText = sumContainers.toLocaleString(); document.getElementById('sum-trans').innerText = sumTrans.toLocaleString(); document.getElementById('sum-trip').innerText = sumTrip.toLocaleString();
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
        if (type === 'PICKUP') { addRow('CY DATE', item.cy_date, 'text-blue-600'); addRow('RENT CUT', item.rent_cutoff, 'text-red-500'); } 
        else if (type === 'DELIVERY') { addRow('UNLOAD', item.unload_date, 'text-amber-600'); } 
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
        const pickup = createTimeListHtml(item.mode, 'PICKUP', item);
        const delivery = createTimeListHtml(item.mode, 'DELIVERY', item);
        const ret = createTimeListHtml(item.mode, 'RETURN', item);

        return [
            false, item.booking_no, item.id, item.booking_no || '', item.mode || 'EXPORT', 
            item.run_date ? String(item.run_date).split('T')[0] : '', item.customer_name || '', 
            item.agent || '', jobNameDisplay, item.job_type || '', item.origin || '', item.destination || '', 
            item.container_count || 1, item.container_size || '', item.price_type || '', item.trip_fee || 0, item.trans_fee || 0, 
            pickup, delivery, ret
        ];
    });

    const colHeaders = [
        '✔', '⚙️ จัดการ', 'ID', 'Booking / BL', 'MODE', '📅 วันที่', 'ลูกค้า', 'AGENT', 'ชื่องาน', 'ประเภท', 
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
                    if (value) {
                        td.innerHTML = `
                            <div class="flex flex-col items-stretch justify-center gap-1 w-full p-0.5">
                                <button onclick="window.goToFormEdit('${value}')" title="แก้ไขหัวบิล" class="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-bold px-1 py-1 rounded text-[10px] shadow-sm flex items-center justify-center whitespace-nowrap">
                                    <i class="fa-solid fa-pen mr-1"></i> แก้
                                </button>
                                <button onclick="window.location.href='/booking-manage.html?select=${encodeURIComponent(value)}'" title="จัดรถและลงเบอร์ตู้" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-1 py-1 rounded text-[10px] shadow-sm flex items-center justify-center whitespace-nowrap">
                                    <i class="fa-solid fa-truck-fast mr-1"></i> รถ
                                </button>
                            </div>
                        `;
                    }
                } 
            },
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold bg-slate-50' }, 
            { type: 'text', className: 'font-bold text-primary htMiddle' }, 
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
        contextMenu: ['hidden_columns_hide', 'hidden_columns_show', '---------', 'alignment', 'copy'],

        colWidths: userGridSettings.columnWidths || [30, 50, 40, 100, 70, 75, 90, 70, 110, 70, 75, 75, 35, 55, 45, 55, 55, 130, 120, 130],
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) {
                    editedRowIndices.add(row);
                    
                    // 🌟 ระบบ Auto-Fill อัตโนมัติเมื่อแก้ชื่องาน หรือ ประเภทรถ 🌟
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
            if (editedRowIndices.has(row)) cp.className = (cp.className || '') + ' ht-edited-row';
            return cp;
        }
    });

    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === colHeaders.length) {
        try { hotGridInstance.getPlugin('manualColumnMove').moveColumns(userGridSettings.columnPositions, 0); } catch(e) {}
    }
}

// 🌟 ฟังก์ชันช่วยคำนวณราคาย่อย 🌟
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
        await fetch('/api/users/grid-settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'booking_list', settings: { columnWidths: widths, columnPositions: positions } })
        });
        alert('✅ บันทึกมุมมองตารางเรียบร้อยแล้ว!');
    } catch (err) {}
};

window.goToFormEdit = function(bookingNo) { window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`; };

window.renderClickableTimeCell = function(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full p-0.5" onclick="openDateTimeModal(${row}, ${prop})">
            ${value}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded px-1.5 py-0.5 shadow-md items-center justify-center transition-all z-10"><i class="fa-solid fa-pen text-[10px]"></i></div>
        </div>
    `;
};

function formatDateTime(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    const cleanStr = String(dtStr).replace('T', ' '); 
    return cleanStr.length >= 16 ? cleanStr.substring(5, 16) : cleanStr; 
}

let currentModalRow = -1; let currentModalProp = -1;

window.openDateTimeModal = function(row, prop) {
    currentModalRow = row; 
    currentModalProp = prop;
    const rData = hotGridInstance.getSourceDataAtRow(row);
    const bookingNo = rData[3]; 
    const item = filteredList.find(i => i.booking_no === bookingNo);
    if (!item) return;
    const mode = item.mode ? String(item.mode).trim().toUpperCase() : 'EXPORT';

    let html = '', title = '';
    if (prop === 17) { 
        title = `เวลา PICK UP (${mode})`;
        html += createDatetimeInput('cy_date', 'CY Date & Time', item.cy_date);
        if (mode === 'EXPORT') {
            html += createDatetimeInput('vgm_cutoff', 'VGM Cutoff', item.vgm_cutoff);
            html += createDatetimeInput('cutoff_time', 'Cutoff Time', item.cutoff_time);
        } else if (mode === 'IMPORT') {
            html += createDatetimeInput('rent_cutoff', 'Rent Cutoff (คืนตู้ฟรีถึง)', item.rent_cutoff);
        }
    } else if (prop === 18) { 
        title = `เวลา DELIVERY (${mode})`;
        if (mode === 'EXPORT') {
            html += createDatetimeInput('load_date', 'Load Date & Time (โหลดของ)', item.load_date);
        } else if (mode === 'IMPORT') {
            html += createDatetimeInput('unload_date', 'Unload Date & Time (ลงของ)', item.unload_date);
        }
    } else if (prop === 19) { 
        title = `เวลา RETURN (${mode})`;
        if (mode === 'EXPORT') {
            html += createDatetimeInput('open_gate', 'Open Gate & Time', item.open_gate);
            html += createDatetimeInput('cutoff_time', 'Cutoff Time (แก้ไขที่นี่ได้ด้วย)', item.cutoff_time);
        } else if (mode === 'IMPORT') {
            html += createDatetimeInput('return_date', 'Return Date & Time (เวลาที่คืนตู้จริง)', item.return_date);
        }
    } else { return; }

    document.getElementById('modal-title').innerText = title; document.getElementById('modal-body').innerHTML = html;
    const modal = document.getElementById('datetime-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); document.getElementById('datetime-modal-content').classList.remove('scale-95'); }, 10);
};

function createDatetimeInput(field, label, val) {
    let formattedVal = '';
    if (val && String(val).trim() !== 'NaN' && String(val).trim() !== 'null') formattedVal = String(val).replace(' ', 'T').substring(0, 16);
    return `
        <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
            <input type="datetime-local" id="modal_input_${field}" value="${formattedVal}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
        </div>
    `;
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
    inputs.forEach(input => { const field = input.id.replace('modal_input_', ''); item[field] = input.value ? input.value.replace('T', ' ') : null; });

    editedRowIndices.add(currentModalRow);
    
    const pickup = createTimeListHtml(item.mode, 'PICKUP', item);
    const delivery = createTimeListHtml(item.mode, 'DELIVERY', item);
    const ret = createTimeListHtml(item.mode, 'RETURN', item);

    if (currentModalProp === 17) hotGridInstance.setDataAtRowProp(currentModalRow, 17, pickup);
    if (currentModalProp === 18) hotGridInstance.setDataAtRowProp(currentModalRow, 18, delivery);
    if (currentModalProp === 19) hotGridInstance.setDataAtRowProp(currentModalRow, 19, ret);

    updateSaveStatusBadge(); closeDateTimeModal();
};

function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge'); if(!badge) return; const count = editedRowIndices.size;
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
    const btn = document.getElementById('btn-save-grid'); const orgText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;
    const data = hotGridInstance.getData(); let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex]; if (!row[3]) continue; const item = filteredList.find(i => i.booking_no === row[3]);
        const updateData = {
            booking_no: row[3], mode: row[4], run_date: row[5], customer_name: row[6], agent: row[7], job_name: row[8], job_type: row[9], origin: row[10], 
            destination: row[11], container_count: row[12], container_size: row[13], price_type: row[14], trip_fee: row[15], trans_fee: row[16],
            cy_date: item.cy_date, vgm_cutoff: item.vgm_cutoff, cutoff_time: item.cutoff_time, rent_cutoff: item.rent_cutoff, demurrage: item.demurrage,
            load_date: item.load_date, unload_date: item.unload_date, open_gate: item.open_gate, return_date: item.return_date
        };
        try {
            const res = await fetch(`/api/bookings/${row[2]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            if (res.ok) successCount++;
        } catch (err) {}
    }
    btn.innerHTML = orgText; btn.disabled = false;
    if (successCount > 0) { alert(`✅ บันทึกข้อมูลสำเร็จ ${successCount} รายการ`); editedRowIndices.clear(); loadBookingGridData(); }
};

window.deleteSelectedRows = async function() {
    if (!hotGridInstance) return; const data = hotGridInstance.getData(); const idsToDelete = new Set();
    data.forEach((row, index) => { if (row[0] === true) { const rowData = hotGridInstance.getSourceDataAtRow(index); if (rowData && rowData[2]) idsToDelete.add(rowData[2]); } });
    const idsArray = Array.from(idsToDelete);
    if (idsArray.length === 0) { alert('🖱️ กรุณาติ๊กถูกหน้าแถว ที่ต้องการจะลบก่อนครับ'); return; }
    if (!confirm(`⚠️ ยืนยันการลบทิ้ง ${idsArray.length} บุคกิ้ง?\n\n(ตู้ทั้งหมดที่อยู่ในบุคกิ้งเหล่านี้จะถูกลบทิ้งไปด้วยอัตโนมัติ)`)) return;
    let successCount = 0;
    for (let id of idsArray) { try { const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); if(res.ok) successCount++; } catch (err) {} }
    if (successCount > 0) { alert(`✅ ลบรายการสำเร็จ ${successCount} บุคกิ้ง`); editedRowIndices.clear(); updateSaveStatusBadge(); loadBookingGridData(); } else { alert(`❌ ไม่สามารถลบข้อมูลได้ หรือเชื่อมต่อเซิร์ฟเวอร์ไม่ได้`); }
};