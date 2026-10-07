// ==========================================
// 📊 MODULE: BOOKING GRID (ส่วนที่ 3)
// ==========================================

let rateDataMap = {}; 
let hotBookingInstance = null;
let globalTruckList = [];
let globalDriverList = [];

const formatToGrid = (val) => val ? val.replace('T', ' ') : '';
const formatToForm = (val) => val ? val.replace(' ', 'T').substring(0, 16) : '';

const allHeaders = [
    'Order ID','MODE','วันที่Booking','วันที่วิ่งงาน','ชื่องาน','ลูกค้า','BOOKING NO.',
    'เบอร์ตู้1','เบอร์ตู้2','จำนวนตู้/ใบ','ขนาดตู้','ประเภทงาน','AGENT','POD','SEAL NO.',
    'TARE','MAX GROSS','น้ำหนักตู้',
    'CY DATE (EX/IM)',         
    '[EX] VGM CUTOFF',         
    '[EX] CUTOFF TIME',        
    '[EX] LODE DATE',          
    '[EX] OPEN GATE',          
    '[IM] RENT CUTOFF',        
    '[IM] Demurrage',          
    '[IM] UNLODE DATE',        
    '[IM] RETURN DATE',        
    'คนรับตู้','ทะเบียนรถคนรับตู้','ประเภทรถคนรับตู้','ลานตู้','✅ จบงาน PickUp',
    'คนไปรับตู้ฝาก1','ทะเบียนรถคนไปรับตู้ฝาก1','ประเภทรถไปรับตู้ฝาก1','ลานตู้ฝาก1','✅ จบงาน ฝาก1',
    'คนบรรจุ/ลงของ','ทะเบียนรถคนบรรจุ/ลงของ','ประเภทรถบรรจุ/ลงของ','โรงงาน','✅ จบงาน DELIVERY',
    'คนไปรับตู้ฝาก2','ทะเบียนรถคนไปรับตู้ฝาก2','ประเภทรถไปรับตู้ฝาก2','ลานตู้ฝาก2','✅ จบงาน ฝาก2',
    'คนลงท่า','ทะเบียนรถคนลงท่า','ประเภทรถคนลงท่า','ท่าเรือ','✅ จบงาน RETURN',
    'ป้ายทะเบียน(หลัก)','ประเภทรถ(หลัก)','คนขับ(หลัก)','ค่าเที่ยว','ค่าขนส่ง',
    'Customer No.','Customer Name','Billing Name','Phone Number','Address','Tax ID',
    'น้ำหนัก(บิล)','ภาษีค่าผ่านท่า','ภาษีค่ายกตู้','ภาษีชอร์','IV','AR','ค่าผ่านท่า','ค่าฝากตู้',
    'ค่ายกตู้','ค่าชอร์','สถานะวางบิล','Parent_ID','รายละเอียดประกอบใบแจ้งหนี้ เอกสาร','หมายเหตุ','สถานะรวม'
];

const basicCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 56, 57, 78];
const expCols = [20, 21, 22, 23]; 
const impCols = [24, 25, 26, 27]; 

const columnsConfig = allHeaders.map((h, i) => {
    const actualIndex = i + 1; 
    if (actualIndex === 1) return { readOnly: true }; 
    if ([3, 4].includes(actualIndex)) return { type: 'date', dateFormat: 'YYYY-MM-DD' };
    if ([19, 20, 21, 22, 23, 24, 25, 26, 27].includes(actualIndex)) return { type: 'date', dateFormat: 'YYYY-MM-DD HH:mm' };
    if ([56, 57].includes(actualIndex)) return { type: 'numeric', numericFormat: { pattern: '0,0.00' } };
    if (actualIndex === 78) return { type: 'dropdown', source: ['รอจัดรถ', 'กำลังวิ่งงาน', 'คืนตู้แล้ว', 'เสร็จสิ้น', 'ยกเลิก'] };
    
    if ([28, 33, 38, 43, 48, 55].includes(actualIndex)) {
        return { type: 'autocomplete', strict: false, source: function(query, process) { process(globalDriverList); } };
    }
    if ([29, 34, 39, 44, 49, 53].includes(actualIndex)) {
        return { type: 'autocomplete', strict: false, source: function(query, process) { process(globalTruckList); } };
    }
    if ([30, 35, 40, 45, 50, 54].includes(actualIndex)) {
        return { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] };
    }
    return { type: 'text' }; 
});

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    
    const user = JSON.parse(savedUser);
    document.getElementById('user-fullname').innerText = user.fullName;
    document.getElementById('user-role-badge').innerText = (user.role || 'USER').toUpperCase();

    loadFleetData();
    loadMasterRates(); 
    initBookingTable().then(() => loadShipments()); 
});

async function loadFleetData() {
    try {
        const response = await fetch('/api/truck_assignments');
        const result = await response.json();
        if (result.success) {
            globalTruckList = result.truckList || [];
            globalDriverList = result.driverList || [];
        }
    } catch(e) {}
}

async function loadMasterRates() {
    try {
        const response = await fetch('/api/rates');
        const result = await response.json();
        const dl = document.getElementById('jobList'); dl.innerHTML = ''; rateDataMap = {};
        if (result.success && result.data) {
            result.data.forEach(r => {
                if(r[0]) {
                    rateDataMap[r[0]] = { customer: r[1], origin: r[2], dest: r[3], jobType: r[6], trp6: r[7], trp10: r[8], trp12: r[9], trpCash: r[10], trn6: r[11], trn10: r[12], trn12: r[13], trnCash: r[14] };
                    let opt = document.createElement('option'); opt.value = r[0]; dl.appendChild(opt);
                }
            });
        }
    } catch(e) {}
}

async function loadShipments() {
    const monthVal = document.getElementById('monthFilter').value;
    if(!monthVal || !hotBookingInstance) return;
    const [year, month] = monthVal.split('-');
    try {
        const res = await fetch(`/api/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        if(result.success) {
            hotBookingInstance.loadData(result.data);
            if (typeof buildSmartFilters === 'function') buildSmartFilters();
        }
    } catch(e) {}
}

function refreshTableColumnsByMode(mode) {
    if (!hotBookingInstance) return;
    const plugin = hotBookingInstance.getPlugin('hiddenColumns');
    
    let colsToShow = [0, ...basicCols];
    if (mode === 'EXPORT') colsToShow = [...colsToShow, ...expCols];
    else if (mode === 'IMPORT') colsToShow = [...colsToShow, ...impCols];
    
    const allIndices = [0, ...allHeaders.map((_, i) => i + 1)];
    const colsToHide = allIndices.filter(i => !colsToShow.includes(i));
    
    plugin.showColumns(colsToShow); 
    plugin.hideColumns(colsToHide);
    hotBookingInstance.render();
}

async function initBookingTable() {
    const user = JSON.parse(localStorage.getItem('tms_user'));
    const container = document.getElementById('hot-booking-container');
    container.id = 'hot-booking-grid-' + user.username; 
    
    let lastClickTime = 0;
    const uiState = JSON.parse(localStorage.getItem(`tms_ui_booking_grid_${user.username}`)) || {};

    hotBookingInstance = new Handsontable(container, {
        data: [], colHeaders: ['✔ เลือก', ...allHeaders], columns: [{ type: 'checkbox', className: 'htCenter htMiddle' }, ...columnsConfig],
        rowHeaders: true, minSpareRows: 0, width: '100%', height: '100%', 
        manualColumnResize: true, manualColumnMove: true, persistentState: true, 
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar', '---------', 'clear_column'],
        hiddenColumns: { columns: uiState.hiddenColumns || [], indicators: true }, 
        colWidths: uiState.colWidths || undefined,
        licenseKey: 'non-commercial-and-evaluation',
        
        cells: function(row, col) { 
            let cp = {}; 
            if (this.instance) {
                let isSelected = this.instance.getDataAtCell(row, 0) === true;
                let physicalRow = this.instance.toPhysicalRow(row);
                let rowData = this.instance.getSourceDataAtRow(physicalRow);
                
                if (isSelected) {
                    cp.className = (cp.className || '') + ' ht-row-selected';
                } else if (rowData && rowData._isUnsaved) {
                    cp.className = (cp.className || '') + ' ht-unsaved';
                }
            }
            return cp; 
        },
        afterChange: function(changes, source) { 
            if (source !== 'loadData' && changes) { 
                let updates = [];
                let needsRender = false;
                changes.forEach(([row, prop, oldValue, newValue]) => { 
                    if (oldValue !== newValue) {
                        if (prop !== 0) { 
                            let physicalRow = this.toPhysicalRow(row);
                            let rowData = this.getSourceDataAtRow(physicalRow);
                            if (rowData) rowData._isUnsaved = true;
                        }
                        needsRender = true;
                        
                        const col = this.propToCol(prop);
                        if (col === 8 || col === 9) { 
                            let t1 = this.getDataAtCell(row, 8); let t2 = this.getDataAtCell(row, 9);
                            let count = (t1 && String(t1).trim() !== "" ? 1 : 0) + (t2 && String(t2).trim() !== "" ? 1 : 0);
                            updates.push([row, 10, count > 0 ? count : ""]); 
                        }
                    }
                }); 
                if(updates.length > 0) {
                    this.setDataAtCell(updates, 'autoFill');
                } else if(needsRender) {
                    this.render();
                }
            } 
        },
        afterOnCellMouseDown: function(event, coords, td) {
            const now = new Date().getTime();
            if (now - lastClickTime < 300 && coords.row >= 0) { loadRowToForm(coords.row); }
            lastClickTime = now;
        }
    });
    refreshTableColumnsByMode(''); 
}

function loadRowToForm(physicalRow) {
    const data = hotBookingInstance.getDataAtRow(physicalRow);
    if (!data[1]) return; 

    document.getElementById('editingOrderId').value = physicalRow; 
    document.getElementById('form-title').innerText = "แก้ไขข้อมูลบุคกิ้ง (Edit Booking)";
    document.getElementById('editing-badge').classList.remove('hidden');
    document.getElementById('editing-order-text').innerText = data[1];
    document.getElementById('btn-submit-form').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข';
    document.getElementById('btn-submit-form').classList.replace('bg-primary', 'bg-emerald-600');
    document.getElementById('btn-submit-form').classList.replace('hover:bg-blue-900', 'hover:bg-emerald-700');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('box-row-count').classList.add('hidden'); 

    document.getElementById('pMode').value = data[2] || '';
    document.getElementById('runDate').value = data[4] || '';
    document.getElementById('jobNameInput').value = data[5] || '';
    document.getElementById('pCustomer').value = data[6] || '';
    
    let bkNo = data[7] || '';
    if (data[2] === 'EXPORT') document.getElementById('pBookingExp').value = bkNo;
    else if (data[2] === 'IMPORT') document.getElementById('pBookingImp').value = bkNo;
    else if (data[2] === 'TRANSFER') document.getElementById('pRefTrans').value = bkNo;

    document.getElementById('pJobType').value = data[12] || '';
    
    if (data[2] === 'EXPORT') {
        document.getElementById('pAgentExp').value = data[13] || ''; 
        document.getElementById('pCyExp').value = formatToForm(data[19]);    
        document.getElementById('pVgmExp').value = formatToForm(data[20]);
        document.getElementById('pCutoffExp').value = formatToForm(data[21]);
        document.getElementById('pLoadExp').value = formatToForm(data[22]);
        document.getElementById('pOpenGateExp').value = formatToForm(data[23]);
    } else if (data[2] === 'IMPORT') {
        document.getElementById('pAgentImp').value = data[13] || ''; 
        document.getElementById('pCyImp').value = formatToForm(data[19]);    
        document.getElementById('pRentImp').value = formatToForm(data[24]);
        document.getElementById('pDemImp').value = formatToForm(data[25]);
        document.getElementById('pUnloadImp').value = formatToForm(data[26]);
        document.getElementById('pReturnImp').value = formatToForm(data[27]);
    }

    document.getElementById('pTripFee').value = data[56] || '';
    document.getElementById('pTransFee').value = data[57] || '';

    toggleModeUI();
    document.getElementById('tab-content-form').scrollIntoView({ behavior: 'smooth' });
}

function deleteCheckedRows() {
    if (!hotBookingInstance) return;
    const data = hotBookingInstance.getData();
    let rowsToDelete = []; let orderIdsToDelete = [];
    
    for (let i = 0; i < data.length; i++) { 
        if (data[i][0] === true) { rowsToDelete.push(i); if(data[i][1]) orderIdsToDelete.push(data[i][1]); } 
    }
    if (rowsToDelete.length === 0) { alert('🖱️ กรุณาติ๊กช่องซ้ายสุดของแถวที่ต้องการลบก่อนครับ'); return; }
    if (confirm(`⚠️ ยืนยันการลบ ${rowsToDelete.length} รายการที่เลือกใช่หรือไม่?`)) {
        if(orderIdsToDelete.length > 0) {
            try { fetch('/api/shipments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_ids: orderIdsToDelete }) }); } catch(e) {}
        }
        rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => hotBookingInstance.alter('remove_row', rowIndex));
        alert('✅ ลบรายการสำเร็จ');
    }
}

async function saveShipments(isAutoSave = true) { 
    const btn = document.getElementById('btn-save-booking'); 
    const ot = btn ? btn.innerHTML : 'บันทึกตารางลงฐานข้อมูล';
    if(btn) { btn.innerHTML = '⏳ กำลังบันทึก...'; btn.disabled = true; }
    
    const cleanData = hotBookingInstance.getData().filter(r => r && r[1] && String(r[1]).trim() !== ""); 
    
    if (cleanData.length === 0) {
        if (!isAutoSave) alert('⚠️ ไม่พบข้อมูลสำหรับบันทึก กรุณารอให้ตารางสร้างข้อมูลเสร็จสิ้น');
        if (btn) { btn.innerHTML = ot; btn.disabled = false; }
        return;
    }
    
    try {
        const res = await fetch('/api/shipments', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: cleanData }) 
        });
        const result = await res.json();
        
        if (result.success) {
            if(!isAutoSave) alert('✅ ' + result.message);
            
            const physicalRows = hotBookingInstance.countRows();
            for(let i = 0; i < physicalRows; i++) {
                let rowData = hotBookingInstance.getSourceDataAtRow(i);
                if(rowData) rowData._isUnsaved = false;
            }
            hotBookingInstance.render();
        } else {
            alert('❌ เกิดข้อผิดพลาดจากฐานข้อมูล: ' + result.message);
        }
    } catch(e) { 
        alert('❌ เกิดข้อผิดพลาดจากเครือข่าย/ฐานข้อมูล: ' + e.message); 
    } finally { 
        if(btn) { btn.innerHTML = ot; btn.disabled = false; }
    }
}

function openColToggleModal() {
    const plugin = hotBookingInstance.getPlugin('hiddenColumns');
    const hiddenCols = plugin.getHiddenColumns() || [];
    let html = '';
    allHeaders.forEach((header, index) => {
        const actualIndex = index + 1; 
        const isChecked = !hiddenCols.includes(actualIndex) ? 'checked' : '';
        html += `<label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-blue-50 cursor-pointer transition-colors"><input type="checkbox" class="w-5 h-5 accent-primary rounded" ${isChecked} onchange="toggleMasterColumn(${actualIndex}, this.checked)"><span class="font-medium text-slate-700 text-sm">${header}</span></label>`;
    });
    document.getElementById('col-toggle-container').innerHTML = html;
    document.getElementById('col-toggle-modal').classList.remove('hidden');
}

function closeColToggleModal() { document.getElementById('col-toggle-modal').classList.add('hidden'); }

function toggleMasterColumn(colIndex, isVisible) {
    const plugin = hotBookingInstance.getPlugin('hiddenColumns');
    const user = JSON.parse(localStorage.getItem('tms_user'));
    const state = JSON.parse(localStorage.getItem(`tms_ui_booking_grid_${user.username}`)) || {};
    
    if (isVisible) plugin.showColumns([colIndex]); else plugin.hideColumns([colIndex]);
    hotBookingInstance.render();
    
    state.hiddenColumns = plugin.getHiddenColumns() || [];
    localStorage.setItem(`tms_ui_booking_grid_${user.username}`, JSON.stringify(state));
}

function exportToExcel() {
    if (!hotBookingInstance) return;
    const exportPlugin = hotBookingInstance.getPlugin('exportFile');
    const monthVal = document.getElementById('monthFilter').value || 'All';
    exportPlugin.downloadFile('csv', {
        bom: true, 
        columnDelimiter: ',',
        columnHeaders: true,
        exportHiddenColumns: false, 
        exportHiddenRows: false,
        filename: 'TMS_Operation_Report_' + monthVal + '_[YYYY]-[MM]-[DD]',
        mimeType: 'text/csv'
    });
}