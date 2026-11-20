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
        <option value="2" selected>📌 ตรึงเลือกเที่ยวและจัดรถ</option>
        <option value="4">📌 ตรึงเลขเที่ยวและ Booking ด้วย</option>
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
                document.getElementById('filter-customer').value = '';
                document.getElementById('filter-run-date').value = '';
                containerQuickFilter = ''; 
                // Keep Booking and month in the URL when refreshing.
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
