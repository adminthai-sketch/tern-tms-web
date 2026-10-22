// ==========================================
// 🚀 MODULE: BULK BOOKING UPLOAD (Dynamic Col & Popup Time)
// ==========================================

let hotBulkInstance = null;
let rateDataMap = {};
let currentModalRow = -1;
let currentModalProp = -1;

// 🌟 สร้าง HTML Popup (Modal) ฝังเข้าไปในหน้าจออัตโนมัติ
function injectDateTimeModal() {
    if (!document.getElementById('bulk-datetime-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="bulk-datetime-modal" class="hidden fixed inset-0 bg-slate-900/50 z-50 items-center justify-center backdrop-blur-sm transition-opacity">
                <div class="bg-white rounded-xl shadow-xl w-[320px] p-6 transform scale-95 transition-transform" id="bulk-datetime-modal-content">
                    <h3 id="bulk-modal-title" class="text-lg font-bold text-primary mb-4 border-b pb-2">เลือกวันและเวลา</h3>
                    <div class="space-y-4 mb-5">
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1">📅 วันที่ (Date)</label>
                            <input type="date" id="bulk_modal_date" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1">⏱️ เวลา (Time)</label>
                            <input type="time" id="bulk_modal_time" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-primary shadow-sm bg-slate-50">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2">
                        <button onclick="closeBulkDateTimeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-sm transition-colors">ยกเลิก</button>
                        <button onclick="saveBulkDateTimeModal()" class="px-4 py-2 bg-primary hover:bg-blue-900 text-white font-bold rounded-lg text-sm transition-colors shadow-sm"><i class="fa-solid fa-check"></i> ยืนยันเวลา</button>
                    </div>
                </div>
            </div>
        `);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    injectDateTimeModal();
    
    // โหลดเรทราคาเพื่อรอทำการ Auto-fill
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
    } catch (err) {}
    
    initBulkGrid();
});

// 🌟 ตัว Render ช่องเวลาให้กดคลิกได้ 🌟
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
    td.style.verticalAlign = 'middle';
    td.style.padding = '0';
}

function getColumnsConfig(mode) {
    const commonCols = [
        { title: 'สถานะเซฟ', readOnly: true, className: 'htCenter htMiddle font-bold text-lg' },
        { title: 'วันที่วิ่งงาน (YYYY-MM-DD)', type: 'date', dateFormat: 'YYYY-MM-DD' },
        { title: 'จำนวนตู้', type: 'numeric' },
        { title: 'ลูกค้า', type: 'text', readOnly: true, className: 'text-slate-500 font-bold bg-slate-50' },
        { title: 'ชื่องาน', type: 'text', className: 'font-bold text-primary' }, 
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
            { title: 'VGM Cutoff', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Cutoff Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Load Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Gate Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell }
        ];
    } else {
        timeCols = [
            { title: 'CY Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Rent Cutoff', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Demurrage', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Unload Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell },
            { title: 'Return Date & Time', readOnly: true, renderer: renderClickableBulkTimeCell }
        ];
    }

    return [...commonCols, ...timeCols];
}

window.initBulkGrid = function(dataRows = null) {
    const container = document.getElementById('bulk-grid');
    if (hotBulkInstance) hotBulkInstance.destroy();
    
    const mode = document.getElementById('bulkMode').value;
    const columnsConfig = getColumnsConfig(mode);
    const colHeaders = columnsConfig.map(c => c.title);
    
    let initialData = dataRows || Array.from({ length: 20 }, () => new Array(columnsConfig.length).fill(""));

    hotBulkInstance = new Handsontable(container, {
        data: initialData,
        colHeaders: colHeaders,
        columns: columnsConfig,
        rowHeaders: true,
        width: '100%', height: '100%',
        stretchH: 'all',
        minSpareRows: 1,
        manualColumnResize: true,
        manualColumnMove: true, // รองรับการย้ายคอลัมน์
        contextMenu: ['row_above', 'row_below', 'remove_row', 'undo', 'redo', 'copy', 'cut'],
        licenseKey: 'non-commercial-and-evaluation',
        
        // 🌟 ลอจิกความฉลาด: ใช้การดึงชื่อคอลัมน์แทน Index ตัวเลข 🌟
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal === newVal) return;
                
                const colName = this.getColHeader(prop); // ดึงชื่อหัวตารางมาเช็คเลย
                const headers = this.getColHeader(); // ดึง Header ทั้งหมดมาหา Index ใหม่
                
                const custIdx = headers.indexOf('ลูกค้า');
                const jobTypeIdx = headers.indexOf('Job Type');
                const originIdx = headers.indexOf('ต้นทาง');
                const destIdx = headers.indexOf('ปลายทาง');
                const carTypeIdx = headers.indexOf('ประเภทรถ');
                const tripIdx = headers.indexOf('ค่าเที่ยว');
                const transIdx = headers.indexOf('ค่าขนส่ง');
                const jobNameIdx = headers.indexOf('ชื่องาน');

                // 1. ถ้าแก้ "ชื่องาน" -> เติมลูกค้าและอื่นๆ
                if (colName === 'ชื่องาน' && newVal) {
                    const rate = rateDataMap[newVal.trim()];
                    if (rate) {
                        if(custIdx >= 0) this.setDataAtCell(row, custIdx, rate.customer || '', 'auto');
                        if(jobTypeIdx >= 0) this.setDataAtCell(row, jobTypeIdx, rate.jobType || '', 'auto');
                        if(originIdx >= 0) this.setDataAtCell(row, originIdx, rate.origin || '', 'auto');
                        if(destIdx >= 0) this.setDataAtCell(row, destIdx, rate.dest || '', 'auto');
                        
                        // ถ้ารถถูกเลือกไว้แล้ว ให้ดึงราคาด้วย
                        if(carTypeIdx >= 0) {
                            const carType = this.getDataAtCell(row, carTypeIdx);
                            if (carType) applyRateDynamically(this, row, rate, carType, tripIdx, transIdx);
                        }
                    }
                }
                
                // 2. ถ้าแก้ "ประเภทรถ" -> เติมราคา
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
};

function applyRateDynamically(hot, row, rate, type, tripIdx, transIdx) {
    if(tripIdx < 0 || transIdx < 0) return;
    if(type === '6W') { hot.setDataAtCell(row, tripIdx, rate.trp6||''); hot.setDataAtCell(row, transIdx, rate.trn6||''); }
    else if(type === '10W') { hot.setDataAtCell(row, tripIdx, rate.trp10||''); hot.setDataAtCell(row, transIdx, rate.trn10||''); }
    else if(type === '12W*2') { hot.setDataAtCell(row, tripIdx, rate.trp12||''); hot.setDataAtCell(row, transIdx, rate.trn12||''); }
    else if(type === 'เงินสด') { hot.setDataAtCell(row, tripIdx, rate.trpCash||''); hot.setDataAtCell(row, transIdx, rate.trnCash||''); }
}

// ==========================================
// 🕒 ระบบ Popup Modal (เลือกเวลา)
// ==========================================
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
    
    let result = '';
    if (dateVal) {
        result = `${dateVal} ${timeVal || '00:00'}`;
    }
    
    hotBulkInstance.setDataAtCell(currentModalRow, currentModalProp, result);
    closeBulkDateTimeModal();
};

// ==========================================
// 💾 ฟังก์ชันบันทึกข้อมูล (แบบหา Index อัตโนมัติ)
// ==========================================
window.saveBulkData = async function() {
    if (!hotBulkInstance) return;
    const btn = document.getElementById('btn-save-bulk');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotBulkInstance.getData();
    const mode = document.getElementById('bulkMode').value;
    const headers = hotBulkInstance.getColHeader();

    const getVal = (r, name) => {
        const idx = headers.indexOf(name);
        return idx >= 0 ? data[r][idx] : '';
    };

    let successCount = 0; let failCount = 0;

    for (let r = 0; r < data.length; r++) {
        const runDate = getVal(r, 'วันที่วิ่งงาน (YYYY-MM-DD)');
        const jobName = getVal(r, 'ชื่องาน');
        const customer = getVal(r, 'ลูกค้า');
        
        if (!runDate || !jobName) continue; // ต้องมีวันที่และชื่องาน

        let bData = {
            mode: mode,
            run_date: runDate,
            job_name: jobName, 
            container_count: parseInt(getVal(r, 'จำนวนตู้')) || 1, 
            customer_name: customer, 
            job_type: getVal(r, 'Job Type'),
            agent: getVal(r, 'Agent'),
            origin: getVal(r, 'ต้นทาง') || getVal(r, 'ต้นทาง (Origin)'),
            destination: getVal(r, 'ปลายทาง') || getVal(r, 'ปลายทาง (Dest)'),
            booking_no: getVal(r, 'Booking/BL No.') || getVal(r, 'Booking/BL') || `BK-BULK-${Date.now().toString().slice(-5)}${r}`,
            price_type: getVal(r, 'ประเภทรถ'),
            trip_fee: getVal(r, 'ค่าเที่ยว') || 0,
            trans_fee: getVal(r, 'ค่าขนส่ง') || 0
        };

        if (mode === 'EXPORT') {
            bData.cy_date = getVal(r, 'CY Date & Time');
            bData.vgm_cutoff = getVal(r, 'VGM Cutoff');
            bData.cutoff_time = getVal(r, 'Cutoff Time');
            bData.load_date = getVal(r, 'Load Date & Time');
            bData.open_gate = getVal(r, 'Gate Date & Time');
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
            
            const statusIdx = headers.indexOf('สถานะเซฟ') >= 0 ? headers.indexOf('สถานะเซฟ') : 0;

            if (result.success) {
                hotBulkInstance.setDataAtCell(r, statusIdx, '✅ สำเร็จ', 'auto');
                hotBulkInstance.getCellMeta(r, statusIdx).className = 'htCenter htMiddle font-bold text-green-600 bg-green-50';
                successCount++;
            } else {
                hotBulkInstance.setDataAtCell(r, statusIdx, '❌ พลาด', 'auto');
                hotBulkInstance.getCellMeta(r, statusIdx).className = 'htCenter htMiddle font-bold text-red-600 bg-red-50';
                failCount++;
            }
        } catch (err) {
            const statusIdx = headers.indexOf('สถานะเซฟ') >= 0 ? headers.indexOf('สถานะเซฟ') : 0;
            hotBulkInstance.setDataAtCell(r, statusIdx, '❌ เซิร์ฟเวอร์ล่ม', 'auto');
            hotBulkInstance.getCellMeta(r, statusIdx).className = 'htCenter htMiddle font-bold text-red-600 bg-red-50';
            failCount++;
        }
    }
    
    hotBulkInstance.render();
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูลเข้าตาราง Bookings';
    btn.disabled = false;
    alert(`สรุปผลการนำเข้า: \n✅ สำเร็จ ${successCount} บุคกิ้ง\n❌ ล้มเหลว ${failCount} บุคกิ้ง`);
};

// ==========================================
// 📥 EXCEL TEMPLATE & IMPORT
// ==========================================
window.downloadTemplate = function() {
    const mode = document.getElementById('bulkMode').value;
    const cols = getColumnsConfig(mode).map(c => c.title).slice(1); 
    const ws = XLSX.utils.aoa_to_sheet([cols]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode + "_Template");
    XLSX.writeFile(wb, `TMS_Booking_Template_${mode}.xlsx`);
};

window.importExcel = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});
        
        const rows = excelData.slice(1).map(r => {
            let newRow = new Array(hotBulkInstance.countCols()).fill("");
            for(let i=0; i<r.length; i++) { newRow[i+1] = r[i] || ''; }
            return newRow;
        });
        initBulkGrid(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; 
};