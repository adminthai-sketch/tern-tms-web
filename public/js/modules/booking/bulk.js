// ==========================================
// 🚀 MODULE: BULK BOOKING UPLOAD (Sync with booking-bulk.html)
// ==========================================

let hotBulkInstance = null;
let currentUserSettings = {};
let rateDataMap = {};
let currentModalRow = -1;
let currentModalProp = -1;

window.addEventListener('DOMContentLoaded', async () => {
    // 🌟 1. ดึงเรทราคาจาก DB 🌟
    try {
        const res = await fetch('/api/rates');
        const d = await res.json();
        if (d.success && d.data) {
            d.data.forEach(r => {
                rateDataMap[r[0]] = {
                    customer: r[1], origin: r[2], dest: r[3], jobType: r[6],
                    trp6: r[7], trp10: r[8], trp12: r[9], trpCash: r[10],
                    trn6: r[11], trn10: r[12], trn12: r[13], trnCash: r[14]
                };
            });
        }
    } catch (err) { console.error("Error loading rates:", err); }

    window.loadUserGridSettingsAndInit();
});

// 💾 โหลดตั้งค่าคอลัมน์ของ User
window.loadUserGridSettingsAndInit = async function() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.classList.remove('hidden');
    
    const mode = document.getElementById('bulk-mode').value;
    const gridName = `bulk_booking_${mode.toLowerCase()}`; 
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');

    try {
        const res = await fetch(`/api/users/grid-settings?userId=${user.id}`);
        if (res.ok) {
            const data = await res.json();
            currentUserSettings = data.settings?.[gridName] || {};
        }
    } catch (err) {} 
    finally {
        initBulkTable(null, currentUserSettings);
        if (loader) loader.classList.add('hidden');
    }
};

// 💾 บันทึกตั้งค่าคอลัมน์ของ User
window.saveGridSettings = async function() {
    if (!hotBulkInstance) return;
    const mode = document.getElementById('bulk-mode').value;
    const gridName = `bulk_booking_${mode.toLowerCase()}`;
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');

    const colCount = hotBulkInstance.countCols();
    const widths = [];
    for (let i = 0; i < colCount; i++) { widths.push(hotBulkInstance.getColWidth(i)); }

    const movePlugin = hotBulkInstance.getPlugin('manualColumnMove');
    let positions = [];
    if (movePlugin && typeof movePlugin.columnsMapper !== 'undefined') {
        positions = movePlugin.columnsMapper.getIndexesSequence();
    }

    try {
        const res = await fetch('/api/users/grid-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: gridName, settings: { columnWidths: widths, columnPositions: positions } })
        });
        const result = await res.json();
        if (result.success) alert(`✅ บันทึกการตั้งค่าตารางโหมด ${mode} สำหรับคุณเรียบร้อยแล้ว!`);
    } catch (err) { alert("❌ บันทึกล้มเหลว"); }
};

// 🕒 Popup Modal สำหรับเวลา
window.openBulkDateTimeModal = function(row, prop, title) {
    currentModalRow = row; 
    currentModalProp = prop;
    
    document.getElementById('bulk-modal-title').innerText = title;
    const currentVal = hotBulkInstance.getDataAtCell(row, prop);
    const dateInput = document.getElementById('bulk_modal_date');
    const timeInput = document.getElementById('bulk_modal_time');
    
    if (currentVal && currentVal.includes(' ')) {
        const parts = currentVal.split(' ');
        dateInput.value = parts[0] || '';
        timeInput.value = parts[1] || '';
    } else {
        dateInput.value = ''; timeInput.value = '';
    }

    const modal = document.getElementById('bulk-datetime-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('bulk-datetime-modal-content').classList.remove('scale-95');
    }, 10);
};

window.closeBulkDateTimeModal = function() {
    const modal = document.getElementById('bulk-datetime-modal');
    modal.classList.add('opacity-0');
    document.getElementById('bulk-datetime-modal-content').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.saveBulkDateTimeModal = function() {
    const dateVal = document.getElementById('bulk_modal_date').value;
    const timeVal = document.getElementById('bulk_modal_time').value;
    let result = dateVal ? `${dateVal} ${timeVal || '00:00'}` : '';
    hotBulkInstance.setDataAtCell(currentModalRow, currentModalProp, result);
    closeBulkDateTimeModal();
};

// Render ช่องเวลาให้คลิกได้
function renderClickableBulkTimeCell(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    const headerTitle = instance.getColHeader(col);
    let content = value ? `<span class="font-bold text-blue-700">${value}</span>` : '<span class="text-slate-400 italic">-- คลิกเลือกเวลา --</span>';
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[30px] flex items-center justify-center transition-colors hover:bg-blue-50" onclick="openBulkDateTimeModal(${row}, ${col}, '${headerTitle}')">
            ${content}
            <div class="absolute top-1 right-1 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-sm items-center justify-center"><i class="fa-solid fa-clock text-[10px]"></i></div>
        </div>
    `;
    td.style.verticalAlign = 'middle'; td.style.padding = '0';
}

function getBulkHeaders(mode) {
    const commonCols = [
        { title: 'สถานะเซฟ', readOnly: true, className: 'htCenter htMiddle font-bold text-lg' },
        { title: 'วันที่วิ่งงาน\n(YYYY-MM-DD)', type: 'date', dateFormat: 'YYYY-MM-DD' },
        { title: 'ชื่องาน', type: 'text', className: 'font-bold text-primary' }, 
        { title: 'จำนวนตู้', type: 'numeric' },
        { title: 'ลูกค้า', type: 'text', readOnly: true, className: 'text-slate-500 font-bold bg-slate-50' },
        { title: 'Job Type', type: 'dropdown', source: ['Domestic', 'CONTAINER'] },
        { title: 'Agent', type: 'text' },
        { title: 'ต้นทาง', type: 'text' },
        { title: 'ปลายทาง', type: 'text' },
        { title: 'Booking/BL', type: 'text' },
        { title: 'ประเภทรถ', type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] },
        { title: 'ค่าเที่ยว', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-green-700 font-bold bg-green-50/30' },
        { title: 'ค่าขนส่ง', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50/30' }
    ];

    let timeCols = [];
    if (mode === 'EXPORT') {
        timeCols = [
            { title: 'CY Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'VGM Cutoff (Time)', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Cutoff Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Load Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Open Gate Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell }
        ];
    } else if (mode === 'IMPORT') {
        timeCols = [
            { title: 'CY Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Rent Cutoff (Time)', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Demurrage (Time)', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Unload Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Return Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell }
        ];
    }
    return [...commonCols, ...timeCols];
}

window.initBulkTable = function(dataToLoad = null, userSettings = {}) {
    const container = document.getElementById('hot-bulk-container');
    if (!container) return; // ป้องกัน Error ถ้าหาตารางไม่เจอ
    if (hotBulkInstance) { hotBulkInstance.destroy(); }
    
    const mode = document.getElementById('bulk-mode').value;
    const columnsConfig = getBulkHeaders(mode);
    const headers = columnsConfig.map(c => c.title);

    const initialData = dataToLoad || Array.from({ length: 15 }, () => new Array(headers.length).fill(""));

    hotBulkInstance = new Handsontable(container, {
        data: initialData,
        colHeaders: headers,
        columns: columnsConfig,
        rowHeaders: true,
        width: '100%',
        height: '100%',
        stretchH: 'all',
        minSpareRows: 3,
        
        manualColumnResize: true,
        manualColumnMove: true,
        colWidths: userSettings.columnWidths || undefined, 
        
        contextMenu: ['row_above', 'row_below', 'remove_row', 'undo', 'redo', 'copy', 'cut'],
        licenseKey: 'non-commercial-and-evaluation',

        // 🌟 AI ค้นหาชื่อหัวตารางและเติมข้อมูล 🌟
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal === newVal) return;
                
                const colName = this.getColHeader(prop);
                const headersNow = this.getColHeader(); 
                
                const custIdx = headersNow.indexOf('ลูกค้า');
                const jobTypeIdx = headersNow.indexOf('Job Type');
                const originIdx = headersNow.indexOf('ต้นทาง');
                const destIdx = headersNow.indexOf('ปลายทาง');
                const carTypeIdx = headersNow.indexOf('ประเภทรถ');
                const tripIdx = headersNow.indexOf('ค่าเที่ยว');
                const transIdx = headersNow.indexOf('ค่าขนส่ง');
                const jobNameIdx = headersNow.indexOf('ชื่องาน');

                // 1. ถ้าพิมพ์ "ชื่องาน"
                if (colName === 'ชื่องาน' && newVal) {
                    const rate = rateDataMap[newVal.trim()];
                    if (rate) {
                        if(custIdx >= 0) this.setDataAtCell(row, custIdx, rate.customer || '', 'auto');
                        if(jobTypeIdx >= 0) this.setDataAtCell(row, jobTypeIdx, rate.jobType || '', 'auto');
                        if(originIdx >= 0) this.setDataAtCell(row, originIdx, rate.origin || '', 'auto');
                        if(destIdx >= 0) this.setDataAtCell(row, destIdx, rate.dest || '', 'auto');
                        
                        if(carTypeIdx >= 0) {
                            const carType = this.getDataAtCell(row, carTypeIdx);
                            if (carType) applyRateDynamically(this, row, rate, carType, tripIdx, transIdx);
                        }
                    }
                }
                
                // 2. ถ้าเลือก "ประเภทรถ"
                if (colName === 'ประเภทรถ' && newVal) {
                    if(jobNameIdx >= 0) {
                        const jobName = this.getDataAtCell(row, jobNameIdx); 
                        if (jobName && rateDataMap[jobName.trim()]) {
                            applyRateDynamically(this, row, rateDataMap[jobName.trim()], newVal, tripIdx, transIdx);
                        }
                    }
                }
            });
        }
    });
    
    // บังคับจัดเรียงคอลัมน์ตามที่ผู้ใช้เคยเซฟไว้
    if (userSettings.columnPositions && userSettings.columnPositions.length > 0) {
        const movePlugin = hotBulkInstance.getPlugin('manualColumnMove');
        try { movePlugin.moveColumns(userSettings.columnPositions, 0); } catch(e) {}
    }
};

function applyRateDynamically(hot, row, rate, type, tripIdx, transIdx) {
    if(tripIdx < 0 || transIdx < 0) return;
    if(type === '6W') { hot.setDataAtCell(row, tripIdx, rate.trp6||''); hot.setDataAtCell(row, transIdx, rate.trn6||''); }
    else if(type === '10W') { hot.setDataAtCell(row, tripIdx, rate.trp10||''); hot.setDataAtCell(row, transIdx, rate.trn10||''); }
    else if(type === '12W*2') { hot.setDataAtCell(row, tripIdx, rate.trp12||''); hot.setDataAtCell(row, transIdx, rate.trn12||''); }
    else if(type === 'เงินสด') { hot.setDataAtCell(row, tripIdx, rate.trpCash||''); hot.setDataAtCell(row, transIdx, rate.trnCash||''); }
}

// 📥 Download Template
window.downloadExcelTemplate = function() {
    const mode = document.getElementById('bulk-mode').value;
    const headers = getBulkHeaders(mode).map(c => c.title).slice(1);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Template_${mode}`);
    XLSX.writeFile(wb, `TMS_Bulk_Template_${mode}.xlsx`);
};

// 📤 Upload Excel
window.uploadExcelFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        if (rawJson.length <= 1) return;
        const formattedRows = rawJson.slice(1).map(row => ["", ...row]);
        window.initBulkTable(formattedRows, currentUserSettings);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
};

// 🚀 บันทึกข้อมูล Bulk เข้า DB
window.processBulkSave = async function() {
    if (!hotBulkInstance) return;
    const btn = document.getElementById('btn-save-bulk');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotBulkInstance.getData();
    const mode = document.getElementById('bulk-mode').value;
    const headers = hotBulkInstance.getColHeader();

    const getVal = (r, name) => {
        const idx = headers.findIndex(h => h.includes(name));
        return idx >= 0 ? data[r][idx] : '';
    };

    let successCount = 0; let failCount = 0;

    for (let r = 0; r < data.length; r++) {
        const runDate = getVal(r, 'วันที่วิ่งงาน');
        const jobName = getVal(r, 'ชื่องาน');
        const customer = getVal(r, 'ลูกค้า');
        
        if (!runDate || !jobName) continue; 

        let bData = {
            mode: mode,
            run_date: runDate,
            job_name: jobName, 
            container_count: parseInt(getVal(r, 'จำนวนตู้')) || 1, 
            customer_name: customer, 
            job_type: getVal(r, 'Job Type'),
            agent: getVal(r, 'Agent'),
            origin: getVal(r, 'ต้นทาง'),
            destination: getVal(r, 'ปลายทาง'),
            booking_no: getVal(r, 'Booking/BL') || `BK-BULK-${Date.now().toString().slice(-5)}${r}`,
            price_type: getVal(r, 'ประเภทรถ'),
            trip_fee: getVal(r, 'ค่าเที่ยว') || 0,
            trans_fee: getVal(r, 'ค่าขนส่ง') || 0
        };

        if (mode === 'EXPORT') {
            bData.cy_date = getVal(r, 'CY Date & Time');
            bData.vgm_cutoff = getVal(r, 'VGM Cutoff');
            bData.cutoff_time = getVal(r, 'Cutoff Time');
            bData.load_date = getVal(r, 'Load Date & Time');
            bData.open_gate = getVal(r, 'Open Gate') || getVal(r, 'Gate Date & Time');
        } else {
            bData.cy_date = getVal(r, 'CY Date & Time');
            bData.rent_cutoff = getVal(r, 'Rent Cutoff');
            bData.demurrage = getVal(r, 'Demurrage');
            bData.unload_date = getVal(r, 'Unload Date & Time');
            bData.return_date = getVal(r, 'Return Date & Time');
        }

        try {
            const res = await fetch('/api/bookings/header', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bData)
            });
            const result = await res.json();
            
            if (result.success) {
                hotBulkInstance.setDataAtCell(r, 0, '✅ สำเร็จ', 'auto');
                hotBulkInstance.getCellMeta(r, 0).className = 'htCenter htMiddle font-bold text-green-600 bg-green-50';
                successCount++;
            } else {
                hotBulkInstance.setDataAtCell(r, 0, '❌ พลาด', 'auto');
                hotBulkInstance.getCellMeta(r, 0).className = 'htCenter htMiddle font-bold text-red-600 bg-red-50';
                failCount++;
            }
        } catch (err) {
            hotBulkInstance.setDataAtCell(r, 0, '❌ ล้มเหลว', 'auto');
            hotBulkInstance.getCellMeta(r, 0).className = 'htCenter htMiddle font-bold text-red-600 bg-red-50';
            failCount++;
        }
    }
    
    hotBulkInstance.render();
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> บันทึกข้อมูลทุก Job';
    btn.disabled = false;
    alert(`สรุปผลการนำเข้า: \n✅ สำเร็จ ${successCount} บุคกิ้ง\n❌ ล้มเหลว ${failCount} บุคกิ้ง`);
};