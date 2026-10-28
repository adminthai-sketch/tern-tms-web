// ==========================================
// 📦 MODULE: DISPATCH & CONTAINER MANAGE
// ==========================================

let hotGridInstance = null;
let rawShipmentList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let userGridSettings = {}; 

let globalTruckList = [];
let globalDriverList = [];
let fleetAssignments = {}; 
let driverAssignments = {}; 
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
    setupGridControlButtons();
    await loadContainerGridData();
});

function setupGridControlButtons() {
    const btnContainer = document.querySelector('button[onclick="saveGridSettings()"]').parentElement;
    
    const resetBtn = document.createElement('button');
    resetBtn.className = "bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-lg shadow-sm border border-rose-200 transition-colors ml-2 flex items-center gap-1 text-[11px]";
    resetBtn.innerHTML = '<i class="fa-solid fa-broom"></i> รีเซ็ตมุมมอง';
    resetBtn.onclick = async () => {
        if(!confirm('⚠️ ต้องการล้างการตั้งค่าตารางที่เคยบันทึกไว้ และกลับไปใช้ค่าเริ่มต้นใช่หรือไม่?')) return;
        const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
        if (user.id) {
            await fetch('/api/users/grid-settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, gridName: 'container_manage', settings: {} })
            });
        }
        location.reload();
    };

    const freezeSelect = document.createElement('select');
    freezeSelect.className = "bg-blue-50 text-blue-700 font-bold px-2 py-1.5 rounded-lg shadow-sm border border-blue-200 ml-2 outline-none text-[11px] cursor-pointer";
    freezeSelect.innerHTML = `
        <option value="3" ${(!userGridSettings.fixedColumns || userGridSettings.fixedColumns == 3) ? 'selected' : ''}>📌 ตรึงแค่หัวบิล</option>
        <option value="10" ${(userGridSettings.fixedColumns == 10) ? 'selected' : ''}>📌 ตรึงจนถึง "เบอร์ตู้ 2"</option>
    `;
    freezeSelect.onchange = (e) => {
        if (hotGridInstance) {
            hotGridInstance.updateSettings({ fixedColumnsLeft: parseInt(e.target.value) });
        }
    };

    btnContainer.appendChild(freezeSelect);
    btnContainer.appendChild(resetBtn);
}

async function loadFleetData() {
    try {
        const response = await fetch('/api/truck_assignments');
        const result = await response.json();
        if (result.success) {
            globalTruckList = result.truckList || [];
            globalDriverList = result.driverList || [];
            if (result.data) {
                result.data.forEach(item => {
                    if (item[1] && item[3]) {
                        fleetAssignments[item[1]] = item[3]; 
                        driverAssignments[item[3]] = item[1]; 
                    }
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

            /* 🌟 อนิเมชั่นไฟกระพริบที่ตัวหนังสือเวลา 🌟 */
            @keyframes vgm-text-blink {
                0% { opacity: 1; color: #ef4444; }
                50% { opacity: 0.3; color: #991b1b; transform: scale(1.05); }
                100% { opacity: 1; color: #ef4444; }
            }
            .vgm-text-blink { animation: vgm-text-blink 1s infinite; font-weight: 800 !important; }
        `;
        document.head.appendChild(style);
    }
}

function formatShortDate(dt) {
    if (!dt || String(dt).trim() === 'NaN' || String(dt).trim() === 'null') return '';
    return String(dt).replace('T', ' ').substring(5, 16); 
}

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const resShipments = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await resShipments.json();

        if (result.success && result.data) {
            rawShipmentList = result.data.map(item => {
                item._disp_cy_date = formatShortDate(item.cy_date); 
                item._disp_load_date = formatShortDate(item.mode === 'IMPORT' ? item.unload_date : item.load_date);
                item._disp_return_date = formatShortDate(item.mode === 'IMPORT' ? item.return_date : item.open_gate);
                
                if (item.leg1_plate && !item.leg1_driver) item.leg1_driver = fleetAssignments[item.leg1_plate] || '';
                if (item.drop1_plate && !item.drop1_driver) item.drop1_driver = fleetAssignments[item.drop1_plate] || '';
                if (item.leg2_plate && !item.leg2_driver) item.leg2_driver = fleetAssignments[item.leg2_plate] || '';
                if (item.drop2_plate && !item.drop2_driver) item.drop2_driver = fleetAssignments[item.drop2_plate] || '';
                if (item.leg3_plate && !item.leg3_driver) item.leg3_driver = fleetAssignments[item.leg3_plate] || '';
                
                item._checkbox = false;
                return item;
            });

            editedRowIndices.clear();
            updateDropdownOptions(); 

            const urlParams = new URLSearchParams(window.location.search);
            const selectBooking = urlParams.get('select');
            if (selectBooking) {
                document.getElementById('filter-booking-no').value = selectBooking;
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            applyFilters();
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
        const iD = i.run_date ? String(i.run_date).split('T')[0] : '';
        const iC = i.customer_name ? String(i.customer_name).trim() : ''; 
        const iB = i.booking_no ? String(i.booking_no).trim() : ''; 
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
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : ''; 
        const iB = item.booking_no ? String(item.booking_no).trim() : ''; 
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
        filteredList = rawShipmentList.filter(item => !item.container_1_no || item.container_1_no.trim() === '');
    } else {
        btnFilled.classList.add('bg-blue-50', 'text-blue-600');
        filteredList = rawShipmentList.filter(item => item.container_1_no && item.container_1_no.trim() !== '');
    }
    initContainerHandsontable(filteredList);
};

function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const routeRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const isDrop = (value === true || value === 'true');
        const btnClass = isDrop ? 'bg-purple-200 text-purple-800 border-purple-400' : 'bg-white text-slate-500 border-slate-300 hover:bg-purple-50 hover:text-purple-600';
        const icon = isDrop ? '<i class="fa-solid fa-anchor"></i> แวะลานพัก' : '<i class="fa-solid fa-route"></i> ตรงไปที่หมาย';
        td.innerHTML = `<div class="p-1 w-full h-full"><button onclick="toggleDropRow(${row}, '${prop}')" class="w-full h-full text-[10px] font-bold border rounded shadow-sm flex items-center justify-center gap-1 transition-colors ${btnClass}">${icon}</button></div>`;
    };

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const isCompleted = (value === true || value === 'true');
        const btnClass = isCompleted 
            ? 'bg-emerald-500 text-white shadow-inner border-emerald-600' 
            : 'bg-slate-100 text-slate-300 border-slate-200 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-200';
        const icon = isCompleted ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-check"></i>';
        td.innerHTML = `<div class="p-0.5 w-full h-full"><button onclick="toggleStatusRow(${row}, '${prop}')" class="w-full h-full text-[11px] font-bold border rounded flex items-center justify-center transition-all ${btnClass}">${icon}</button></div>`;
    };

    const orderIdRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `
            <div class="flex items-center justify-between w-full h-full px-1 overflow-hidden">
                <span class="truncate pr-1 text-[10px]">${value || ''}</span>
            </div>
        `;
    };

    const leg1TimeRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `
            <div class="flex items-center justify-between w-full h-full px-1 overflow-hidden">
                <span class="truncate text-[10px] pr-1">${value || ''}</span>
                <button onclick="copyDriverToAllLegs(${row})" title="ดึงทะเบียนรถและคนขับจากขา 1 ส่งให้ทุกขา" class="shrink-0 bg-blue-100 hover:bg-blue-500 text-blue-600 hover:text-white border border-blue-200 w-5 h-5 rounded flex items-center justify-center shadow-sm transition-colors">
                    <i class="fa-solid fa-truck-fast text-[9px]"></i>
                </button>
            </div>
        `;
    };

    const feeRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.NumericRenderer.apply(this, arguments);
        const mode = instance.getDataAtRowProp(row, 'mode');
        td.style.fontWeight = '700'; td.style.verticalAlign = 'middle';
        
        if (mode === 'IMPORT') {
            if (prop === 'port_pass_fee') { td.style.backgroundColor = '#e0f2fe'; td.style.color = '#0369a1'; td.title = 'เก็บตอนเริ่มรับตู้ที่ท่าเรือ (IMPORT)'; }
            else if (prop === 'deposit_fee' || prop === 'lift_fee') { td.style.backgroundColor = '#e0f2fe'; td.style.color = '#0369a1'; td.title = 'เก็บตอนจบคืนตู้ที่ลานตู้ (IMPORT)'; }
            else { td.style.backgroundColor = '#f1f5f9'; td.style.color = '#cbd5e1'; }
        } else if (mode === 'EXPORT') {
            if (prop === 'shore_fee' || prop === 'port_pass_fee') { td.style.backgroundColor = '#fef3c7'; td.style.color = '#b45309'; td.title = 'เก็บตอนจบคืนตู้โหลดลงเรือ (EXPORT)'; }
            else if (prop === 'lift_fee') { td.style.backgroundColor = '#fef3c7'; td.style.color = '#b45309'; td.title = 'เก็บตอนเริ่มรับตู้เปล่าที่ลาน (EXPORT)'; }
            else { td.style.backgroundColor = '#f1f5f9'; td.style.color = '#cbd5e1'; }
        } else {
            td.style.backgroundColor = '#f8fafc';
        }
    };

    // 🌟 ระบบกระพริบเตือนลงเบอร์ตู้ เป็นตัวหนังสือ HTML 🌟
    const vgmWarningRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        // ใช้ HtmlRenderer เพื่อให้ใส่ Tag HTML ตัวหนังสือเล็กๆ ได้
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.fontWeight = '700';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        td.style.textTransform = 'uppercase';
        
        const srcData = instance.getSourceDataAtRow(row);
        const mode = srcData.mode;
        const vgmCutoff = srcData.vgm_cutoff;
        
        if (mode === 'EXPORT' && !value && vgmCutoff) {
            const now = new Date();
            const vgmDate = new Date(vgmCutoff);
            const diffHours = (vgmDate - now) / (1000 * 60 * 60);
            
            // เตือนล่วงหน้า 24 ชั่วโมง หรือเลยเวลาไปแล้ว
            if (diffHours < 24) {
                td.style.backgroundColor = '#fef2f2'; // พื้นหลังแดงอ่อนๆ
                // ใส่เวลาเข้าไปเป็น HTML ในช่องที่ยังว่างอยู่
                td.innerHTML = `<div class="vgm-text-blink text-[9px] text-red-500 leading-[1.1]"><i class="fa-solid fa-clock"></i> CUTOFF<br>${formatShortDate(vgmCutoff)}</div>`;
                td.title = `🚨 ใกล้ถึงหรือเลยเวลา VGM Cutoff (${formatShortDate(vgmCutoff)}) รีบใส่เบอร์ตู้ด่วน!`;
            } else {
                td.style.backgroundColor = '';
                td.innerHTML = '';
            }
        } else {
            // ถ้ากรอกเบอร์ตู้แล้ว หรือไม่เข้าเงื่อนไข ก็โชว์เบอร์ตู้ปกติสีน้ำเงิน
            td.style.backgroundColor = '';
            td.innerHTML = value ? value : '';
            td.style.color = '#1d4ed8'; 
        }
    };

    hotGridInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 28,
        
        fixedColumnsLeft: userGridSettings.fixedColumns !== undefined ? parseInt(userGridSettings.fixedColumns) : 3,
        manualColumnFreeze: false, 

        nestedHeaders: [
            [
                { label: '📋 ข้อมูลงาน', colspan: 7 }, 
                { label: '📦 ข้อมูลตู้', colspan: 7 }, 
                { label: '🚚 ขา 1: PICK UP (รับตู้)', colspan: 5 }, 
                { label: '🅿️ ขาฝาก 1 (DROP 1)', colspan: 4 },
                { label: '🏭 ขา 2: DELIVERY (เข้าบรรจุ) <button onclick="copyLegToAllRows(\'leg1\', \'leg2\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 1 มาใส่ ขา 2 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 1</button>', colspan: 5 }, 
                { label: '🅿️ ขาฝาก 2 (DROP 2)', colspan: 4 }, 
                { label: '🚢 ขา 3: RETURN (คืนตู้) <button onclick="copyLegToAllRows(\'leg2\', \'leg3\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 2 มาใส่ ขา 3 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 2</button>', colspan: 4 }, 
                { label: '💵 ค่าจ้างขนส่ง', colspan: 2 },
                { label: '💸 เบิกจ่ายหน้าท่า/ลาน และอื่นๆ', colspan: 6 }, 
                { label: '📝 หมายเหตุ', colspan: 1 } 
            ],
            [
                '✔', 'Order ID', 'Booking', 'MODE', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 
                'ขนาดตู้', 'เบอร์ตู้ 1', 'เบอร์ตู้ 2', 'SEAL NO', 'POP', 'TARE', 'MAX GROSS', 
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด (🚚 Auto-Fill)', 'เส้นทาง', '✅',
                'ทะเบียนรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅', 
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด', 'เส้นทาง', '✅', 
                'ทะเบียนรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'คนขับ', '📅 เวลานัด', '✅', 
                'ค่าเที่ยว', 'ค่าขนส่ง',
                'ค่าผ่านท่า', 'ค่าชอร์', 'ค่ายกตู้', 'ค่าฝากลาน', 'เบิกค่าใช้จ่าย', 'ค่าใช้จ่ายอื่นๆ',
                'หมายเหตุ'
            ]
        ],
        columns: [
            { data: '_checkbox', type: 'checkbox', className: 'htCenter htMiddle zone-info' }, 
            { data: 'order_id', type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter htMiddle zone-info', renderer: orderIdRenderer }, 
            { data: 'booking_no', type: 'text', readOnly: true, className: 'font-bold text-primary htCenter htMiddle zone-info' }, 
            { data: 'mode', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-slate-500 zone-info' }, 
            { data: 'customer_name', type: 'text', readOnly: true, className: 'text-slate-700 font-bold htMiddle zone-info' }, 
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            
            { data: 'container_size', type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700 zone-container' }, 
            
            // 🚨 ติดตั้ง Renderer ไฟกระพริบ ตรงช่องเบอร์ตู้ 1 และ 2 🚨
            { data: 'container_1_no', type: 'text', renderer: vgmWarningRenderer },
            { data: 'container_2_no', type: 'text', renderer: vgmWarningRenderer },
            
            { data: 'seal_no', type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 'pop_no', type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },
            { data: 'tare', type: 'numeric', className: 'htCenter htMiddle text-blue-700 zone-container' },
            { data: 'max_gross', type: 'numeric', className: 'htCenter htMiddle text-blue-700 zone-container' },

            { data: 'leg1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg1 font-bold htCenter htMiddle text-emerald-700' },
            { data: 'leg1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg1 htMiddle font-bold text-emerald-700' },
            { data: '_disp_cy_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell bg-slate-50', renderer: leg1TimeRenderer }, 
            { data: 'leg1_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer }, 
            { data: 'leg1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg1', renderer: statusRenderer }, 

            { data: 'drop1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            { data: 'drop1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop1_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg2 font-bold htCenter htMiddle text-amber-700' },
            { data: 'leg2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg2 htMiddle font-bold text-amber-700' },
            { data: '_disp_load_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 'leg2_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer },
            { data: 'leg2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg2', renderer: statusRenderer },

            { data: 'drop2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            { data: 'drop2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop2_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg3_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg3 font-bold htCenter htMiddle text-slate-700' },
            { data: 'leg3_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg3 htMiddle font-bold text-slate-700' },
            { data: '_disp_return_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 'leg3_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg3', renderer: statusRenderer },

            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold bg-green-50 htRight htMiddle' }, 
            { data: 'trans_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50 htRight htMiddle' },

            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer },
            { data: 'advance_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-rose-600 font-bold bg-rose-50 htRight htMiddle' },
            { data: 'other_expense', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-rose-600 font-bold bg-rose-50 htRight htMiddle' },
            
            { data: 'remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [
            30, 110, 100, 75, 100, 80, 80, 
            60, 100, 100, 100, 90, 80, 70, 
            90, 110, 120, 110, 45, 
            90, 110, 110, 45, 
            90, 110, 110, 110, 45, 
            90, 110, 110, 45, 
            90, 110, 110, 45, 
            70, 70, 
            75, 75, 75, 75, 80, 85, 
            130 
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        
        hiddenColumns: {
            columns: isDropYardsHidden ? [19, 20, 21, 22, 28, 29, 30, 31] : [], 
            indicators: true
        },
        
        contextMenu: {
            items: {
                "alignment": { name: 'จัดตำแหน่งข้อความ' },
                "hidden_columns_hide": { name: 'ซ่อนคอลัมน์' },
                "hidden_columns_show": { name: 'แสดงคอลัมน์ที่ซ่อน' },
                "copy": { name: 'คัดลอก (Copy)' }
            }
        },
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== '_checkbox') editedRowIndices.add(row);
                
                if (['container_1_no', 'container_2_no', 'seal_no', 'pop_no'].includes(prop) && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) {
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, prop, cleanVal, 'auto'), 10);
                    }
                }

                if (['leg1_plate', 'drop1_plate', 'leg2_plate', 'drop2_plate', 'leg3_plate'].includes(prop) && newVal) {
                    if (fleetAssignments[newVal]) {
                        const driverCol = prop.replace('_plate', '_driver');
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, driverCol, fleetAssignments[newVal], 'auto'), 10);
                    }
                }
                
                if (['leg1_driver', 'drop1_driver', 'leg2_driver', 'drop2_driver', 'leg3_driver'].includes(prop) && newVal) {
                    if (driverAssignments[newVal]) {
                        const plateCol = prop.replace('_driver', '_plate');
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, plateCol, driverAssignments[newVal], 'auto'), 10);
                    }
                }
            });
            updateSaveStatusBadge();
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

window.copyLegToAllRows = function(fromPrefix, toPrefix) {
    if (!hotGridInstance) return;
    const count = hotGridInstance.countRows();
    let copied = false;
    for (let r = 0; r < count; r++) {
        const p = hotGridInstance.getDataAtRowProp(r, `${fromPrefix}_plate`);
        const d = hotGridInstance.getDataAtRowProp(r, `${fromPrefix}_driver`);
        if (p || d) {
            hotGridInstance.setDataAtRowProp(r, `${toPrefix}_plate`, p || '', 'auto');
            hotGridInstance.setDataAtRowProp(r, `${toPrefix}_driver`, d || '', 'auto');
            copied = true;
            editedRowIndices.add(r);
        }
    }
    if (copied) {
        updateSaveStatusBadge();
        alert(`✅ ดึงป้ายทะเบียนและคนขับจาก ${fromPrefix.toUpperCase()} มาใส่ ${toPrefix.toUpperCase()} ครบทุกบรรทัดแล้วครับ!`);
    }
};

window.copyDriverToAllLegs = function(row) {
    const plate = hotGridInstance.getDataAtRowProp(row, 'leg1_plate');
    const driver = hotGridInstance.getDataAtRowProp(row, 'leg1_driver');
    
    if (!plate && !driver) {
        alert("⚠️ กรุณาเลือกทะเบียนรถในช่อง 'ขา 1' ก่อนกดก๊อปปี้ครับ");
        return;
    }
    
    const isDrop1 = hotGridInstance.getDataAtRowProp(row, 'leg1_is_drop');
    const isDrop2 = hotGridInstance.getDataAtRowProp(row, 'leg2_is_drop');
    
    if (isDrop1 === true || isDrop1 === 'true') {
        hotGridInstance.setDataAtRowProp(row, 'drop1_plate', plate, 'auto');
        hotGridInstance.setDataAtRowProp(row, 'drop1_driver', driver, 'auto');
    }
    
    hotGridInstance.setDataAtRowProp(row, 'leg2_plate', plate, 'auto');
    hotGridInstance.setDataAtRowProp(row, 'leg2_driver', driver, 'auto');
    
    if (isDrop2 === true || isDrop2 === 'true') {
        hotGridInstance.setDataAtRowProp(row, 'drop2_plate', plate, 'auto');
        hotGridInstance.setDataAtRowProp(row, 'drop2_driver', driver, 'auto');
    }
    
    hotGridInstance.setDataAtRowProp(row, 'leg3_plate', plate, 'auto');
    hotGridInstance.setDataAtRowProp(row, 'leg3_driver', driver, 'auto');
    
    editedRowIndices.add(row);
    updateSaveStatusBadge();
};

window.toggleStatusRow = function(row, prop) {
    let isCompleted = hotGridInstance.getDataAtRowProp(row, prop);
    if (typeof isCompleted === 'string') isCompleted = (isCompleted === 'true');
    hotGridInstance.setDataAtRowProp(row, prop, !isCompleted);
    editedRowIndices.add(row);
    updateSaveStatusBadge();
};

window.toggleDropRow = function(row, prop) {
    let isDrop = hotGridInstance.getDataAtRowProp(row, prop);
    if (typeof isDrop === 'string') isDrop = (isDrop === 'true');
    const newIsDrop = !isDrop;
    
    hotGridInstance.setDataAtRowProp(row, prop, newIsDrop);
    
    if (newIsDrop) {
        if (prop === 'leg1_is_drop') { 
            const p = hotGridInstance.getDataAtRowProp(row, 'leg1_plate');
            const d = hotGridInstance.getDataAtRowProp(row, 'leg1_driver');
            if(p) hotGridInstance.setDataAtRowProp(row, 'drop1_plate', p, 'auto');
            if(d) hotGridInstance.setDataAtRowProp(row, 'drop1_driver', d, 'auto');
        }
        if (prop === 'leg2_is_drop') { 
            const p = hotGridInstance.getDataAtRowProp(row, 'leg2_plate');
            const d = hotGridInstance.getDataAtRowProp(row, 'leg2_driver');
            if(p) hotGridInstance.setDataAtRowProp(row, 'drop2_plate', p, 'auto');
            if(d) hotGridInstance.setDataAtRowProp(row, 'drop2_driver', d, 'auto');
        }
        if (isDropYardsHidden) toggleDropYards();
    }

    editedRowIndices.add(row);
    updateSaveStatusBadge();
};

window.toggleDropYards = function() {
    isDropYardsHidden = !isDropYardsHidden;
    const btn = document.getElementById('btn-toggle-drops');
    
    if (isDropYardsHidden) {
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> แสดงลานฝากตู้`;
        btn.classList.replace('bg-purple-600', 'bg-purple-50');
        btn.classList.replace('text-white', 'text-purple-700');
        hotGridInstance.getPlugin('hiddenColumns').hideColumns([19, 20, 21, 22, 28, 29, 30, 31]);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> ซ่อนลานฝากตู้`;
        btn.classList.replace('bg-purple-50', 'bg-purple-600');
        btn.classList.replace('text-purple-700', 'text-white');
        hotGridInstance.getPlugin('hiddenColumns').showColumns([19, 20, 21, 22, 28, 29, 30, 31]);
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
    
    const fixedCols = hotGridInstance.getSettings().fixedColumnsLeft || 0;

    try {
        await fetch('/api/users/grid-settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'container_manage', settings: { columnWidths: widths, columnPositions: positions, fixedColumns: fixedCols } })
        });
        alert('✅ บันทึกมุมมองตาราง (ขนาด, ตำแหน่ง, และการตรึงคอลัมน์) เรียบร้อยแล้ว!');
    } catch (err) {}
};

window.addNewContainerRow = function() {
    const filterBooking = document.getElementById('filter-booking-no').value;
    if (!filterBooking) { alert("⚠️ กรุณากรองเลือกเลข Booking ที่ต้องการเพิ่มตู้ในช่องค้นหาด้านบนก่อนครับ!"); return; }

    const templateRow = rawShipmentList.find(r => r.booking_no === filterBooking);
    if (!templateRow) { alert("❌ ไม่พบข้อมูล Booking นี้ในตารางครับ"); return; }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = {
        _checkbox: false,
        order_id: timestampID,
        booking_no: filterBooking,
        mode: templateRow.mode,
        customer_name: templateRow.customer_name,
        origin: templateRow.origin,
        destination: templateRow.destination,
        container_size: templateRow.container_size,
        _disp_cy_date: templateRow._disp_cy_date,
        _disp_load_date: templateRow._disp_load_date,
        _disp_return_date: templateRow._disp_return_date,
        trip_fee: templateRow.trip_fee,
        trans_fee: templateRow.trans_fee,
        port_pass_fee: 0,
        shore_fee: 0,
        lift_fee: 0,
        deposit_fee: 0,
        advance_fee: 0,
        other_expense: 0,
        remark: '',
        overall_status: 'รอจัดรถ'
    };

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
        if (src._checkbox === true || src._checkbox === 'true') { 
            rowsToDelete.push(index);
            if (src.order_id && !src.order_id.includes('ORD-ADD')) idsToDelete.push(src.order_id); 
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
        const result = await res.json();
        if (result.success) {
            alert('✅ บันทึกข้อมูลตู้และค่าใช้จ่ายสำเร็จ!');
            editedRowIndices.clear();
            loadContainerGridData(); 
        } else {
            alert('❌ ข้อผิดพลาด: ' + result.message);
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
    }
};