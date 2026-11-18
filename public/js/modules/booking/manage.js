// ==========================================
// 📦 MODULE: DISPATCH & CONTAINER MANAGE (Phase 2 - Smart Dispatch)
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
let truckTypeMap = {}; 
let globalContainerSizes = ['20', '40', '40HC', '45HC'];
let isDropYardsHidden = true; 

const DROP_YARD_COLUMNS = [25, 26, 27, 28, 29, 36, 37, 38, 39, 40];
const DISPATCH_STEPS = ['leg1', 'drop1', 'leg2', 'drop2', 'leg3'];

// --- 🌟 ตัวแปรสำหรับ Dispatch Modal 🌟 ---
let currentDispatchRowIndex = -1; 
let currentJobMode = ''; // เก็บสถานะโหมดเพื่อนำไปคำนวณการปิดจ๊อบ

function getDispatchVehicleType(row, step) {
    const plate = String(row[step + '_plate'] || '').trim();
    if (!plate) return '';
    const savedType = row[step + '_vehicle_type'];
    if (row._savedPlates?.[step] === plate && savedType) return savedType;
    return Object.hasOwn(truckTypeMap, plate) ? truckTypeMap[plate] || '' : '';
}

function vehicleTypeColumn(step, zone) {
    return {
        data: step + '_vehicle_type',
        readOnly: true,
        className: 'htCenter htMiddle font-bold ' + zone,
        renderer(instance, td, row, col, prop, value, cellProperties) {
            const item = instance.getSourceDataAtRow(instance.toPhysicalRow(row)) || {};
            Handsontable.renderers.TextRenderer(
                instance, td, row, col, prop, getDispatchVehicleType(item, step), cellProperties
            );
        }
    };
}

window.addEventListener('DOMContentLoaded', async () => {
    applyZebraStripingCSS(); 
    const today = new Date();
    document.getElementById('filter-month').value = /^\d{4}-(0[1-9]|1[0-2])$/.test(new URLSearchParams(location.search).get('month') || '')
        ? new URLSearchParams(location.search).get('month')
        : today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
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
        const szRes = await fetch('/api/container-sizes');
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
        <option value="12" ${([11, 12].includes(Number(userGridSettings.fixedColumns))) ? 'selected' : ''}>📌 ตรึงจนถึง "เบอร์ตู้ 2"</option>
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
            truckTypeMap = result.truckTypes || {};
            if (result.data) {
                result.data.forEach(item => {
                    const plate = item[1] || item.plate;
                    const vType = item[2] || item.vehicle_type || item.type;
                    const driver = item[3] || item.driver;

                    if (plate && plate !== 'ทะเบียนรถ') {
                        if (driver && driver !== 'ชื่อ.พนง.') {
                            fleetAssignments[plate] = driver; 
                            driverAssignments[driver] = plate; 
                        }
                        if (vType && vType !== 'ประเภทรถ') {
                            truckTypeMap[plate] = vType;
                        }
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

function formatDateOnly(dt) {
    if (!dt || String(dt).trim() === 'NaN' || String(dt).trim() === 'null') return '';
    const dateStr = String(dt).split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`; 
    return dateStr;
}

let loadedDispatchMonth = '';
window.changeDispatchMonth = function(input) {
    if (editedRowIndices.size) {
        input.value = loadedDispatchMonth;
        alert('กรุณาบันทึกตารางก่อนเปลี่ยนเดือน');
        return;
    }
    loadContainerGridData();
};

async function loadContainerGridData() {
    const monthVal = document.getElementById('filter-month').value;
    loadedDispatchMonth = monthVal;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const resShipments = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await resShipments.json();

        if (result.success && result.data) {
            rawShipmentList = result.data.map(item => {
                item._disp_run_date = formatDateOnly(item.run_date);
                item._disp_cy_date = formatShortDate(item.leg1_appointment || item.cy_date);
                item._disp_load_date = formatShortDate(item.leg2_appointment || (item.mode === 'IMPORT' ? item.unload_date : item.load_date));
                item._disp_return_date = formatShortDate(item.leg3_appointment || item.return_date);
                
                if (item.leg1_plate && !item.leg1_driver) item.leg1_driver = fleetAssignments[item.leg1_plate] || '';
                if (item.drop1_plate && !item.drop1_driver) item.drop1_driver = fleetAssignments[item.drop1_plate] || '';
                if (item.leg2_plate && !item.leg2_driver) item.leg2_driver = fleetAssignments[item.leg2_plate] || '';
                if (item.drop2_plate && !item.drop2_driver) item.drop2_driver = fleetAssignments[item.drop2_plate] || '';
                if (item.leg3_plate && !item.leg3_driver) item.leg3_driver = fleetAssignments[item.leg3_plate] || '';
                
                item._savedPlates = Object.fromEntries(DISPATCH_STEPS.map(step =>
                    [step, String(item[step + '_plate'] || '').trim()]
                ));

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
            
            if (selectBooking) {
                const match = rawShipmentList.find(r => r.booking_no === selectBooking);
                if (match) {
                    const cInput = document.getElementById('filter-customer');
                    const dInput = document.getElementById('filter-run-date');
                    if (!cInput.value) cInput.value = match.customer_name || '';
                    if (!dInput.value && match.run_date) dInput.value = String(match.run_date).split('T')[0];
                }
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

window.handleCrossFilter = function() { 
    const b = document.getElementById('filter-booking-no').value;
    if (b) {
        const match = rawShipmentList.find(r => r.booking_no === b);
        if (match) {
            const cInput = document.getElementById('filter-customer');
            const dInput = document.getElementById('filter-run-date');
            if (!cInput.value) cInput.value = match.customer_name || '';
            if (!dInput.value && match.run_date) dInput.value = String(match.run_date).split('T')[0];
        }
    }
    applyFilters(); 
};

let dispatchStage = 'all';
let dispatchBooking = '';
let containerQuickFilter = '';

function getDispatchStage(row) {
    if (['รอวางบิล', 'ปิดงาน', 'คืนตู้แล้ว'].includes(row.overall_status)) return 'done';
    if (row.is_drop_only && row.actual_drop_date) return 'done';
    if (!row.is_drop_only && row.actual_return_date) return 'done';
    if (!row.leg1_completed && !row.actual_load_date && !row.leg2_completed && !row.leg3_completed) return 'pickup';
    const domestic = String(row.job_type || '').toUpperCase() === 'DOMESTIC';
    if (!domestic && !String(row.container_1_no || '').trim()) return 'container';
    if (row.is_drop_only || (!row.leg2_completed && !row.actual_load_date)) return 'factory';
    return row.mode === 'TRANSFER' || domestic ? 'done' : 'return';
}

function renderDispatchStages(booking, rows) {
    const tabs = document.getElementById('dispatch-stage-tabs');
    const summary = document.getElementById('dispatch-booking-summary');
    tabs.replaceChildren();
    const help = document.getElementById('dispatch-stage-help');
    help.textContent = '';
    const first = rows[0];
    summary.textContent = first && booking
        ? [booking, first.customer_name, first.mode, String(first.run_date || '').slice(0, 10)].filter(Boolean).join(' · ')
        : 'เลือกเลข Booking เพื่อจัดเที่ยวตามขั้นตอน';
    if (!booking) return;
    const imports = first?.mode === 'IMPORT';
    const labels = {
        all: 'ทุกเที่ยว', pickup: imports ? '1. รับตู้จากท่าเรือ' : '1. ไปรับตู้',
        container: '2. ลงเบอร์ตู้', factory: imports ? '3. ไปโรงงานลงของ' : '3. ไปโรงงานบรรจุ',
        return: imports ? '4. คืนตู้ที่ลาน' : '4. ไปลงตู้ที่ท่าเรือ'
    };
    for (const [key, label] of Object.entries(labels)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rounded-lg border px-3 py-1.5 text-xs font-bold ' +
            (dispatchStage === key ? 'bg-blue-800 text-white' : 'bg-slate-50 text-slate-700 hover:bg-blue-50');
        button.setAttribute('aria-pressed', String(dispatchStage === key));
        button.textContent = label + ' ' + (key === 'all' ? rows.length : rows.filter(row => getDispatchStage(row) === key).length);
        button.onclick = () => {
            if (editedRowIndices.size) return alert('กรุณาบันทึกตารางก่อนเปลี่ยนขั้นตอน');
            dispatchStage = key;
            containerQuickFilter = '';
            applyFilters();
        };
        tabs.append(button);
    }
    for (const [section, label] of [['revenue', '5. รายได้อื่น ๆ'], ['costs', '6. ลงค่าใช้จ่าย']]) {
        const link = document.createElement('a');
        link.href = '/billing-detail.html?' + new URLSearchParams({ booking, month: loadedDispatchMonth, section });
        link.className = 'rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100';
        link.textContent = label;
        link.onclick = event => {
            if (!editedRowIndices.size) return;
            event.preventDefault();
            alert('กรุณาบันทึกตารางก่อนเปิดหน้าวางบิล');
        };
        tabs.append(link);
    }
    help.textContent = rows.filter(row => getDispatchStage(row) === 'done').length + ' เที่ยวจบงาน · รายได้อื่น ๆ และค่าใช้จ่ายบันทึกในหน้าวางบิล';
}

window.applyFilters = function() {
    if (editedRowIndices.size) return;
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    if (dispatchBooking !== b) { dispatchBooking = b; dispatchStage = 'all'; containerQuickFilter = ''; }
    const bookingRows = rawShipmentList.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : ''; 
        const iB = item.booking_no ? String(item.booking_no).trim() : ''; 
        const matchD = !d || iD === d; 
        const matchC = !c || iC === c; 
        const matchB = !b || iB === b;
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        return matchD && matchC && matchB && matchGlobal;
    });
    renderDispatchStages(b, bookingRows);
    filteredList = bookingRows.filter(row =>
        (dispatchStage === 'all' || getDispatchStage(row) === dispatchStage) &&
        (!containerQuickFilter || Boolean(String(row.container_1_no || '').trim()) === (containerQuickFilter === 'filled')));
    initContainerHandsontable(filteredList);
    focusDispatchColumns();
};

window.clearAllFilters = function() { 
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = ''; 
    applyFilters(); 
};

window.setQuickFilter = function(type) {
    if (editedRowIndices.size) return alert('กรุณาบันทึกตารางก่อนเปลี่ยนตัวกรอง');
    dispatchStage = 'all';
    containerQuickFilter = containerQuickFilter === type ? '' : type;
    applyFilters();
};

function focusDispatchColumns() {
    for (const [id, key] of [['qf-pending', 'pending'], ['qf-filled', 'filled']]) {
        const button = document.getElementById(id);
        button.classList.toggle('bg-blue-50', containerQuickFilter === key);
        button.setAttribute('aria-pressed', String(containerQuickFilter === key));
    }
    if (!hotGridInstance || dispatchStage === 'all') return;
    const common = ['_checkbox', 'order_id', 'booking_no', 'container_1_no', 'container_2_no'];
    const props = {
        pickup: ['origin', '_disp_cy_date'],
        container: ['container_size', 'seal_1_no', 'tare_1', 'max_gross_1', 'seal_2_no', 'tare_2', 'max_gross_2'],
        factory: ['_disp_load_date'],
        return: ['destination', '_disp_return_date'],
        done: ['destination', '_disp_return_date', 'remark']
    }[dispatchStage];
    const prefixes = { pickup: ['leg1_'], factory: ['leg2_', 'drop1_'], return: ['leg3_', 'drop2_'] }[dispatchStage] || [];
    const hidden = [];
    for (let col = 0; col < hotGridInstance.countCols(); col++) {
        const prop = hotGridInstance.colToProp(col);
        if (![...common, ...props].includes(prop) && !prefixes.some(prefix => String(prop).startsWith(prefix))) hidden.push(col);
    }
    const plugin = hotGridInstance.getPlugin('hiddenColumns');
    plugin.showColumns(plugin.getHiddenColumns());
    plugin.hideColumns(hidden);
    hotGridInstance.render();
}

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
        const icon = '<i class="fa-solid fa-check"></i>';
        td.innerHTML = `<div class="p-0.5 w-full h-full"><button onclick="toggleStatusRow(${row}, '${prop}')" class="w-full h-full text-[11px] font-bold border rounded flex items-center justify-center transition-all ${btnClass}">${icon}</button></div>`;
    };

    const orderIdRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `
            <div class="flex flex-col items-center justify-center w-full h-full p-0.5 gap-0.5">
                <span class="truncate pr-1 text-[10px] font-bold">${value || ''}</span>
                <button onclick="openDispatchModal(${row})" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded shadow-sm text-[9px] flex items-center gap-1">
                    <i class="fa-solid fa-truck-fast"></i> จัดรถ
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

    const vgmWarningRenderer = function(instance, td, row, col, prop, value, cellProperties) {
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
            
            if (diffHours < 24) {
                td.style.backgroundColor = '#fef2f2';
                td.innerHTML = `<div class="vgm-text-blink text-[9px] text-red-500 leading-[1.1]"><i class="fa-solid fa-clock"></i> CUTOFF<br>${formatShortDate(vgmCutoff)}</div>`;
                td.title = `🚨 ใกล้ถึงหรือเลยเวลา VGM Cutoff (${formatShortDate(vgmCutoff)}) รีบใส่เบอร์ตู้ด่วน!`;
            } else {
                td.style.backgroundColor = '';
                td.innerHTML = '';
            }
        } else {
            td.style.backgroundColor = '';
            td.innerHTML = value ? value : '';
            td.style.color = '#1d4ed8'; 
        }
    };

    hotGridInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 36,
        
        fixedColumnsLeft: userGridSettings.fixedColumns !== undefined ? (Number(userGridSettings.fixedColumns) === 11 ? 12 : Number(userGridSettings.fixedColumns)) : 3,
        manualColumnFreeze: false, 

        nestedHeaders: [
            [
                { label: '📋 ข้อมูลงาน', colspan: 8 }, 
                { label: '📦 ข้อมูลตู้', colspan: 11 },
                { label: '🚚 ขา 1: PICK UP (รับตู้)', colspan: 6 },
                { label: '🅿️ ขาฝาก 1 (DROP 1)', colspan: 5 },
                { label: '🏭 ขา 2: DELIVERY (เข้าบรรจุ) <button onclick="copyLegToAllRows(\'leg1\', \'leg2\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 1 มาใส่ ขา 2 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 1</button>', colspan: 6 },
                { label: '🅿️ ขาฝาก 2 (DROP 2)', colspan: 5 },
                { label: '🚢 ขา 3: RETURN (คืนตู้) <button onclick="copyLegToAllRows(\'leg2\', \'leg3\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 2 มาใส่ ขา 3 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 2</button>', colspan: 5 },
                { label: '💵 ค่าจ้างขนส่ง', colspan: 2 },
                { label: '💸 เบิกจ่ายหน้าท่า/ลาน และอื่นๆ', colspan: 6 }, 
                { label: '📝 หมายเหตุ', colspan: 1 } 
            ],
            [
                '✔', '⚙️ จัดรถ', 'Booking', 'MODE', 'ลูกค้า', 'ชื่องาน', 'ต้นทาง', 'ปลายทาง', 
                'ขนาดตู้', '📅 วันที่วิ่งงาน', 'เบอร์ตู้ 1', 'เบอร์ตู้ 2', 'ซีลตู้ 1', 'TARE ตู้ 1', 'MAX GROSS ตู้ 1',
                'ซีลตู้ 2', 'TARE ตู้ 2', 'MAX GROSS ตู้ 2', 'POP',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด (🚚 Auto-Fill)', 'เส้นทาง', '✅', 
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด', 'เส้นทาง', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด', '✅',
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
            { data: 'job_name', type: 'text', readOnly: true, className: 'htMiddle zone-info' },
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            
            { data: 'container_size', type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700 zone-container' }, 
            { data: '_disp_run_date', type: 'text', readOnly: true, className: 'font-bold text-blue-800 htCenter htMiddle zone-container bg-blue-50/50' }, 
            { data: 'container_1_no', type: 'text', renderer: vgmWarningRenderer },
            { data: 'container_2_no', type: 'text', renderer: vgmWarningRenderer },
            { data: 'seal_1_no', type: 'text', className: 'htCenter htMiddle font-bold uppercase zone-container' },
            { data: 'tare_1', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'max_gross_1', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'seal_2_no', type: 'text', className: 'htCenter htMiddle font-bold uppercase zone-container' },
            { data: 'tare_2', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'max_gross_2', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'pop_no', type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },

            { data: 'leg1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg1 font-bold htCenter htMiddle text-emerald-700' },
            vehicleTypeColumn('leg1', 'zone-leg1'),
            { data: 'leg1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg1 htMiddle font-bold text-emerald-700' },
            { data: '_disp_cy_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell bg-slate-50' }, 
            { data: 'leg1_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer }, 
            { data: 'leg1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg1', renderer: statusRenderer }, 

            { data: 'drop1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            vehicleTypeColumn('drop1', 'zone-legdrop'),
            { data: 'drop1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop1_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg2 font-bold htCenter htMiddle text-amber-700' },
            vehicleTypeColumn('leg2', 'zone-leg2'),
            { data: 'leg2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg2 htMiddle font-bold text-amber-700' },
            { data: '_disp_load_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 'leg2_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer },
            { data: 'leg2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg2', renderer: statusRenderer },

            { data: 'drop2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            vehicleTypeColumn('drop2', 'zone-legdrop'),
            { data: 'drop2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop2_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg3_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg3 font-bold htCenter htMiddle text-slate-700' },
            vehicleTypeColumn('leg3', 'zone-leg3'),
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
            30, 90, 100, 75, 100, 160, 80, 80, 
            60, 80, 100, 100, 100, 90, 110, 100, 90, 110, 90, 
            90, 80, 110, 120, 110, 45, 
            90, 80, 110, 110, 45,
            90, 80, 110, 110, 110, 45,
            90, 80, 110, 110, 45,
            90, 80, 110, 110, 45,
            70, 70, 
            75, 75, 75, 75, 80, 85, 
            130 
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        
        hiddenColumns: {
            columns: isDropYardsHidden ? DROP_YARD_COLUMNS : [], 
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
                
                if (['container_1_no', 'container_2_no', 'seal_1_no', 'seal_2_no', 'pop_no'].includes(prop) && newVal && typeof newVal === 'string') {
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
                        const matchedPlate = driverAssignments[newVal];
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, plateCol, matchedPlate, 'auto'), 10);
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

window.copyLegToAllRows = function(fromPrefix, toPrefix) {
    if (!hotGridInstance) return;
    const selectedOnly = Boolean(dispatchBooking);
    if (selectedOnly && !hotGridInstance.getSourceData().some(row => row._checkbox === true)) {
        alert('ติ๊กเลือกเที่ยวที่ต้องการใช้รถและคนขับจากขาก่อน');
        return;
    }
    const count = hotGridInstance.countRows();
    let copied = false;
    for (let r = 0; r < count; r++) {
        if (selectedOnly && !hotGridInstance.getDataAtRowProp(r, '_checkbox')) continue;
        const drop = toPrefix === 'leg2' ? 'drop1' : 'drop2';
        const useDrop = hotGridInstance.getDataAtRowProp(r, drop + '_completed') === true &&
            (hotGridInstance.getDataAtRowProp(r, drop + '_plate') || hotGridInstance.getDataAtRowProp(r, drop + '_driver'));
        const source = useDrop ? drop : fromPrefix;
        const p = hotGridInstance.getDataAtRowProp(r, `${source}_plate`);
        const d = hotGridInstance.getDataAtRowProp(r, `${source}_driver`);
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
        btn.classList.replace('text-purple-700', 'text-purple-700');
        hotGridInstance.getPlugin('hiddenColumns').hideColumns(DROP_YARD_COLUMNS);
    } else {
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> ซ่อนลานฝากตู้`;
        btn.classList.replace('bg-purple-50', 'bg-purple-600');
        btn.classList.replace('text-purple-700', 'text-white');
        hotGridInstance.getPlugin('hiddenColumns').showColumns(DROP_YARD_COLUMNS);
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
        const response = await fetch('/api/users/grid-settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: 'container_manage', settings: { columnWidths: widths, columnPositions: positions, fixedColumns: fixedCols } })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกมุมมองไม่สำเร็จ');
        alert('✅ บันทึกมุมมองตาราง (ขนาด, ตำแหน่ง, และการตรึงคอลัมน์) เรียบร้อยแล้ว!');
    } catch (err) { alert('❌ ' + err.message); }
};

window.addNewContainerRow = function() {
    if (editedRowIndices.size) return alert('กรุณาบันทึกตารางก่อนเพิ่มเที่ยว');
    const filterBooking = document.getElementById('filter-booking-no').value;
    if (!filterBooking) { alert("⚠️ กรุณากรองเลือกเลข Booking ที่ต้องการเพิ่มตู้ในช่องค้นหาด้านบนก่อนครับ!"); return; }

    const templateRow = rawShipmentList.find(r => r.booking_no === filterBooking && (!r.order_id || !r.order_id.includes('ORD-ADD')));
    if (!templateRow) { alert("❌ ไม่พบข้อมูลตั้งต้นของ Booking นี้ กรุณารีเฟรชหรือติดต่อแอดมินครับ"); return; }

    const timestampID = `ORD-ADD-${Date.now().toString().slice(-4)}`;
    
    const newRow = {
        _checkbox: false,
        order_id: timestampID,
        booking_no: filterBooking,
        
        run_date: templateRow.run_date,
        _disp_run_date: templateRow._disp_run_date, 
        job_name: templateRow.job_name,
        mode: templateRow.mode,
        customer_name: templateRow.customer_name,
        origin: templateRow.origin,
        destination: templateRow.destination,
        container_size: templateRow.container_size,
        price_type: templateRow.price_type,
        
        cy_date: templateRow.cy_date,
        vgm_cutoff: templateRow.vgm_cutoff,
        cutoff_time: templateRow.cutoff_time,
        rent_cutoff: templateRow.rent_cutoff,
        demurrage: templateRow.demurrage,
        load_date: templateRow.load_date,
        unload_date: templateRow.unload_date,
        open_gate: templateRow.open_gate,
        return_date: templateRow.return_date,

        _disp_cy_date: templateRow._disp_cy_date,
        _disp_load_date: templateRow._disp_load_date,
        _disp_return_date: templateRow._disp_return_date,

        vehicle_type: '',
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
    dispatchStage = 'all';
    containerQuickFilter = '';
    document.getElementById('global-search').value = '';
    applyFilters(); 
    editedRowIndices.add(0);
    updateSaveStatusBadge();
    alert(`✅ สร้างเที่ยววิ่งเพิ่มให้ Booking: ${filterBooking} เรียบร้อยแล้วครับ!`);
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
            if(!res.ok || !result.success) { alert('❌ ลบในฐานข้อมูลไม่สำเร็จ: ' + result.message); return; }
        } catch (e) { alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์'); return; }
    }
    
    alert(`✅ ลบตู้เสร็จสิ้น!`);
    loadContainerGridData(); 
};


// ==========================================
// 🌟 SMART DISPATCH MODAL LOGIC (ฉบับอัปเกรด: บันทึกตรงเข้า DB)
// ==========================================

let currentDispatchOrder = null; // 🌟 เก็บ Object ของ Order แทนการจำ Index แถว

const dispatchContainerFields = [
    ['container', 'เบอร์ตู้'], ['seal', 'SEAL'], ['tare', 'TARE'],
    ['max_gross', 'MAX GROSS'], ['pop', 'POP']
];
const dispatchContainerKey = (field, position) => field + '_' + position +
    (['container', 'seal', 'pop'].includes(field) ? '_no' : '');

function addDispatchContainer(position) {
    const card = document.createElement('fieldset');
    card.dataset.position = position;
    card.className = 'grid grid-cols-2 sm:grid-cols-5 gap-2 border rounded-lg p-3';
    const legend = document.createElement('legend');
    legend.textContent = 'ตู้ ' + position;
    card.append(legend);
    for (const [field, caption] of dispatchContainerFields) {
        const label = document.createElement('label');
        label.className = 'text-xs font-semibold';
        label.textContent = caption;
        const input = document.createElement('input');
        const key = dispatchContainerKey(field, position);
        input.name = key;
        input.value = currentDispatchOrder[key] ?? '';
        input.className = 'block w-full border rounded px-2 py-1';
        if (field === 'tare' || field === 'max_gross') {
            input.type = 'number'; input.step = 'any'; input.min = '0';
        }
        label.append(input);
        card.append(label);
    }
    document.getElementById('dispatch-containers').append(card);
}

window.addDispatchSecondContainer = function() {
    if (document.querySelector('#dispatch-containers [data-position="2"]')) return;
    addDispatchContainer(2);
    document.getElementById('dispatch-add-container').hidden = true;
};

window.openDispatchModal = function(rowVisualIndex) {
    if (!hotGridInstance) return;
    if (editedRowIndices.size) {
        alert('กรุณาบันทึกข้อมูลในตารางก่อนเปิดหน้าจัดรถ');
        return;
    }
    
    const physicalRow = hotGridInstance.toPhysicalRow(rowVisualIndex);
    const rData = hotGridInstance.getSourceDataAtRow(physicalRow);
    if (!rData) return;

    currentDispatchOrder = rData; // จำ Order ปัจจุบันไว้
    document.getElementById('dispatch-copy-source').textContent = '';
    document.getElementById('dispatch-containers').replaceChildren();
    document.getElementById('dispatch-add-container').hidden = false;
    addDispatchContainer(1);
    if (dispatchContainerFields.some(([field]) => rData[dispatchContainerKey(field, 2)] != null && rData[dispatchContainerKey(field, 2)] !== '')) {
        addDispatchSecondContainer();
    }

    const orderId = rData.order_id || 'Order';
    const bookingNo = rData.booking_no || '';
    const customer = rData.customer_name || 'ไม่ระบุลูกค้า';
    document.getElementById('modal-row-display').innerText = `${orderId} (${bookingNo} - ${customer})`;

    // โหลดรายชื่อรถและคนขับ
    ['leg1', 'leg2', 'leg3'].forEach(leg => {
        const plateSel = document.getElementById(`modal-${leg}-plate`);
        const driverSel = document.getElementById(`modal-${leg}-driver`);
        
        plateSel.innerHTML = '<option value="">-- เลือกรถ --</option>';
        globalTruckList.forEach(t => { plateSel.innerHTML += `<option value="${t}">${t}</option>`; });
        
        driverSel.innerHTML = '<option value="">-- เลือกคนขับ --</option>';
        globalDriverList.forEach(d => { driverSel.innerHTML += `<option value="${d}">${d}</option>`; });
    });

    const parentRow = rawShipmentList.find(r => r.booking_no === bookingNo && r.order_id && !String(r.order_id).includes('ORD-ADD'));
    
    // 🌟 โหลดเวลาจาก Order ตัวเองก่อน ถ้าไม่มีค่อยไปดึงจากหัว Booking (Plan Time) 🌟
    const planCy = rData.leg1_appointment || rData.cy_date;
    const planVgm = rData.order_vgm_cutoff || rData.vgm_cutoff;
    const planLoad = rData.leg2_appointment || rData.load_date;
    const planReturn = rData.leg3_appointment || rData.return_date;
    const planCutoff = rData.order_return_cutoff || rData.cutoff_time;

    // แสดงแจ้งเตือนเวลาอ้างอิงบนหัว Modal
    document.getElementById('ref-vgm-time').innerText = formatDateTimeForModal(parentRow?.vgm_cutoff) || '-';
    document.getElementById('ref-cutoff-time').innerText = formatDateTimeForModal(parentRow?.cutoff_time) || '-';

    // ถมข้อมูลลงฟอร์ม
    document.getElementById('modal-leg1-plate').value = rData.leg1_plate || '';
    document.getElementById('modal-leg1-driver').value = rData.leg1_driver || '';
    document.getElementById('modal-leg1-time').value = convertToDatetimeLocal(planCy); 
    document.getElementById('modal-leg1-actual').value = convertToDatetimeLocal(rData.actual_drop_date);
    document.getElementById('modal-leg1-vgm').value = convertToDatetimeLocal(planVgm); 

    document.getElementById('modal-leg2-plate').value = rData.leg2_plate || '';
    document.getElementById('modal-leg2-driver').value = rData.leg2_driver || '';
    document.getElementById('modal-leg2-time').value = convertToDatetimeLocal(planLoad); 
    document.getElementById('modal-leg2-actual').value = convertToDatetimeLocal(rData.actual_load_date); // เวลาจริง

    document.getElementById('modal-leg3-plate').value = rData.leg3_plate || '';
    document.getElementById('modal-leg3-driver').value = rData.leg3_driver || '';
    document.getElementById('modal-leg3-time').value = convertToDatetimeLocal(planReturn); 
    document.getElementById('modal-leg3-actual').value = convertToDatetimeLocal(rData.actual_return_date); // เวลาจริง
    document.getElementById('modal-leg3-cutoff').value = convertToDatetimeLocal(planCutoff); 

    // ดึงโหมดงานเพื่อจัดการ UI
    currentJobMode = rData.mode ? String(rData.mode).trim().toUpperCase() : 'EXPORT';
    const jobType = rData.job_type ? String(rData.job_type).trim().toUpperCase() : '';
    
    // ตั้งค่าเริ่มต้น UI
    document.getElementById('endpoint-leg1').classList.add('hidden');
    document.getElementById('endpoint-leg2').classList.add('hidden');
    document.getElementById('endpoint-leg3').classList.add('hidden');
    document.getElementById('overlay-leg3').classList.add('hidden');
    document.getElementById('is-drop-only').checked = (rData.is_drop_only === true || rData.is_drop_only === 'true');

    renderDispatchEndpoint(currentJobMode, jobType);
    const modal = document.getElementById('dispatch-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    checkVGMAlert();
};

function renderDispatchEndpoint(mode, jobType) {
    for (const id of ['endpoint-leg1', 'endpoint-leg2', 'endpoint-leg3', 'overlay-leg3']) {
        document.getElementById(id).classList.add('hidden');
    }
    const badge = document.getElementById('endpoint-badge');
    
    // ลอจิกอ่านใจจุดปิดจ๊อบ
    if (document.getElementById('is-drop-only').checked) {
        badge.innerHTML = `<i class="fa-solid fa-anchor"></i> <span>ฝากลาน (Drop Only)</span>`;
        badge.className = "bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-amber-300";
        document.getElementById('endpoint-leg1').classList.remove('hidden');
        document.getElementById('overlay-leg3').classList.remove('hidden'); 
    } else if (mode === 'TRANSFER' || jobType === 'DOMESTIC') {
        badge.innerHTML = `<i class="fa-solid fa-industry"></i> <span>ส่งมอบ (DELIVERY)</span>`;
        badge.className = "bg-orange-100 text-orange-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-orange-300";
        document.getElementById('endpoint-leg2').classList.remove('hidden');
        document.getElementById('overlay-leg3').classList.remove('hidden'); 
    } else {
        badge.innerHTML = `<i class="fa-solid fa-ship"></i> <span>คืนตู้ (RETURN)</span>`;
        badge.className = "bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-purple-300";
        document.getElementById('endpoint-leg3').classList.remove('hidden');
    }

}

window.toggleDropOnlyMode = function() {
    if (currentDispatchOrder) renderDispatchEndpoint(currentJobMode, String(currentDispatchOrder.job_type || '').trim().toUpperCase());
};

window.stampCurrentTime = function(inputId) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById(inputId).value = now.toISOString().slice(0,16);
};

// 🌟 ระบบแจ้งเตือนเวลา VGM 🌟
function checkVGMAlert() {
    const vgmInput = document.getElementById('modal-leg1-vgm');
    const message = document.getElementById('vgm-alert-msg');
    message.classList.add('hidden');
    vgmInput.classList.remove('bg-rose-100', 'text-rose-700', 'bg-red-100', 'text-red-700', 'vgm-text-blink', 'bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-red-500', 'ring-yellow-500', 'ring-rose-500');
    if (!vgmInput.value) return;
    
    const vgmTime = new Date(vgmInput.value + '+07:00');
    const now = new Date();
    const diffHours = (vgmTime - now) / (1000 * 60 * 60);
    if (diffHours <= 3) {
        message.textContent = diffHours <= 0 ? 'เลย VGM Cutoff' : diffHours <= 2 ? 'เหลือไม่เกิน 2 ชม.' : 'เหลือไม่เกิน 3 ชม.';
        message.classList.remove('hidden');
    }
    
    if (diffHours < 0) {
        vgmInput.classList.add('bg-rose-100', 'text-rose-700', 'ring-2', 'ring-rose-500');
        // เพิ่มข้อความ "เลยเวลา VGM แล้ว" (คุณสามารถเพิ่ม label ข้างๆ input ได้)
    } else if (diffHours <= 2) {
        vgmInput.classList.add('bg-red-100', 'text-red-700', 'vgm-text-blink', 'ring-2', 'ring-red-500');
    } else if (diffHours <= 3) {
        vgmInput.classList.add('bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-yellow-500');
    } else {
        vgmInput.classList.remove('bg-rose-100', 'text-rose-700', 'bg-red-100', 'text-red-700', 'vgm-text-blink', 'bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-red-500', 'ring-yellow-500');
    }
}

// 🌟 ก๊อปปี้รถ (ระบุให้ชัดเจนว่าดึงจากขารับตู้ หรือ ฝากลาน) 🌟
window.copyTruck = function(fromLegStr, toLegNum) {
    // fromLegStr สามารถรับเป็น 'leg1' (รับตู้) หรือ 'drop1' (ฝากลาน) ได้
    // แต่เพื่อความง่ายในเวอร์ชันนี้ สมมติว่าดึงจาก leg ตรงๆ ไปก่อน เดี๋ยวค่อยไปปรับหน้า HTML ใส่ปุ่มดึง Drop
    const drop = 'drop' + (toLegNum - 1);
    const useDrop = currentDispatchOrder?.[drop + '_completed'] === true &&
        (currentDispatchOrder[drop + '_plate'] || currentDispatchOrder[drop + '_driver']);
    const plate = useDrop ? currentDispatchOrder[drop + '_plate'] : document.getElementById(`modal-${fromLegStr}-plate`).value;
    const driver = useDrop ? currentDispatchOrder[drop + '_driver'] : document.getElementById(`modal-${fromLegStr}-driver`).value;
    
    document.getElementById(`modal-leg${toLegNum}-plate`).value = plate || '';
    document.getElementById(`modal-leg${toLegNum}-driver`).value = driver || '';
    document.getElementById('dispatch-copy-source').textContent = useDrop ? 'ใช้ข้อมูลจากขาฝากตู้' : 'ใช้ข้อมูลจากขาก่อน';
};

window.saveDispatchModal = async function(btnElement) {
    if (!currentDispatchOrder) return;
    
    const orgText = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...';
    btnElement.disabled = true;

    // 1. ดึงข้อมูลจากฟอร์ม
    const updateData = {
        order_id: currentDispatchOrder.order_id,
        booking_no: currentDispatchOrder.booking_no,
        is_drop_only: document.getElementById('is-drop-only').checked,
        
        leg1_plate: document.getElementById('modal-leg1-plate').value,
        leg1_driver: document.getElementById('modal-leg1-driver').value,
        leg1_appointment: formatDatetimeForDB(document.getElementById('modal-leg1-time').value),
        actual_drop_date: formatDatetimeForDB(document.getElementById('modal-leg1-actual').value),
        order_vgm_cutoff: formatDatetimeForDB(document.getElementById('modal-leg1-vgm').value),

        leg2_plate: document.getElementById('modal-leg2-plate').value,
        leg2_driver: document.getElementById('modal-leg2-driver').value,
        leg2_appointment: formatDatetimeForDB(document.getElementById('modal-leg2-time').value),
        actual_load_date: formatDatetimeForDB(document.getElementById('modal-leg2-actual').value),

        leg3_plate: document.getElementById('modal-leg3-plate').value,
        leg3_driver: document.getElementById('modal-leg3-driver').value,
        leg3_appointment: formatDatetimeForDB(document.getElementById('modal-leg3-time').value),
        actual_return_date: formatDatetimeForDB(document.getElementById('modal-leg3-actual').value),
        order_return_cutoff: formatDatetimeForDB(document.getElementById('modal-leg3-cutoff').value),
    };

    for (const input of document.querySelectorAll('#dispatch-containers input')) {
        if (!input.reportValidity()) {
            btnElement.innerHTML = orgText;
            btnElement.disabled = false;
            return;
        }
        if (input.value !== String(currentDispatchOrder[input.name] ?? '')) updateData[input.name] = input.value;
    }

    // 3. ยิง API บันทึกรายออร์เดอร์ (สมมติว่า backend รองรับการอัปเดตจาก Array)
    try {
        const res = await fetch('/api/shipments', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dispatch_patch: true, data: [updateData] })
        });
        
        const result = await res.json();
        
        if (res.ok && result.success) {
            // ปิด Modal
            document.getElementById('dispatch-modal').classList.add('hidden');
            alert(`✅ บันทึกและจัดรถสำเร็จ! (สถานะ: ${result.overall_status})`);
            
            // รีโหลดข้อมูลทั้งหมดใหม่ เพื่อให้ตารางอัปเดต (วิธีที่ชัวร์ที่สุดว่า DB กับ หน้าจอตรงกัน)
            loadContainerGridData();
        } else {
            alert('❌ ข้อผิดพลาดจากระบบ: ' + result.message);
        }
    } catch (err) {
        alert('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
        btnElement.innerHTML = orgText;
        btnElement.disabled = false;
    }
};

window.saveGridChanges = async function() {
    if (!hotGridInstance || !editedRowIndices.size) return;
    const button = document.getElementById('btn-save-grid');
    button.disabled = true;
    try {
        const data = [...editedRowIndices].map(index => {
            const { seal_no, tare, max_gross, _savedPlates, ...row } = hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(index));
            return row;
        });
        const response = await fetch('/api/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกตารางไม่สำเร็จ');
        editedRowIndices.clear();
        await loadContainerGridData();
        alert('บันทึกตารางสำเร็จ');
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
};

// --- ฟังก์ชันช่วยเหลือ (แปลงฟอร์แมตวันที่) ---
function convertToDatetimeLocal(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    let clean = String(dtStr).trim().replace(' ', 'T');
    if (clean.length === 10) clean += 'T00:00';
    return clean.substring(0, 16);
}
function formatDatetimeForDB(dtStr) {
    if (!dtStr) return null;
    return dtStr.replace('T', ' ') + ':00'; 
}
function formatDateTimeForModal(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    return String(dtStr).replace('T', ' ').substring(0, 16);
}
