// ==========================================
// 🚀 MODULE: BULK BOOKING UPLOAD (1 Row = 1 Booking)
// ==========================================

let hotBulkInstance = null;
let rateDataMap = {};

window.addEventListener('DOMContentLoaded', async () => {
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

// กำหนดคอลัมน์ให้ตรงตามโหมด (แยก Date กับ Time ออกจากกันอย่างชัดเจน)
function getColumnsConfig(mode) {
    const commonCols = [
        { title: 'สถานะ', readOnly: true, className: 'htCenter htMiddle font-bold text-lg' },
        { title: 'วันที่วิ่งงาน (YYYY-MM-DD)', type: 'date', dateFormat: 'YYYY-MM-DD' },
        { title: 'จำนวนตู้', type: 'numeric' },
        { title: 'ชื่องาน', type: 'text' },
        { title: 'ลูกค้า', type: 'text' },
        { title: 'Booking/BL No.', type: 'text' },
        { title: 'ประเภทรถ', type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] },
        { title: 'ค่าเที่ยว', type: 'numeric', numericFormat: { pattern: '0,0' } },
        { title: 'ค่าขนส่ง', type: 'numeric', numericFormat: { pattern: '0,0' } },
        { title: 'ประเภทงาน', type: 'dropdown', source: ['Domestic', 'CONTAINER'] },
        { title: 'ต้นทาง (Origin)', type: 'text' },
        { title: 'ปลายทาง (Dest)', type: 'text' },
        { title: 'Agent', type: 'text' }
    ]; // 13 คอลัมน์แรก (Index 0-12)

    let timeCols = [];
    if (mode === 'EXPORT') {
        timeCols = [
            { title: 'CY Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'CY Time (HH:mm)', type: 'text' },
            { title: 'VGM Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'VGM Time (HH:mm)', type: 'text' },
            { title: 'Cutoff Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Cutoff Time (HH:mm)', type: 'text' },
            { title: 'Load Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Load Time (HH:mm)', type: 'text' },
            { title: 'Gate Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Gate Time (HH:mm)', type: 'text' }
        ];
    } else {
        timeCols = [
            { title: 'CY Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'CY Time (HH:mm)', type: 'text' },
            { title: 'Rent Cutoff Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Rent Cutoff Time (HH:mm)', type: 'text' },
            { title: 'Demurrage Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Demurrage Time (HH:mm)', type: 'text' },
            { title: 'Unload Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Unload Time (HH:mm)', type: 'text' },
            { title: 'Return Date', type: 'date', dateFormat: 'YYYY-MM-DD' }, { title: 'Return Time (HH:mm)', type: 'text' }
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
    
    let initialData = dataRows;
    if (!initialData) {
        initialData = Array.from({ length: 20 }, () => new Array(columnsConfig.length).fill(""));
    }

    hotBulkInstance = new Handsontable(container, {
        data: initialData,
        colHeaders: colHeaders,
        columns: columnsConfig,
        rowHeaders: true,
        width: '100%', height: '100%',
        stretchH: 'all',
        minSpareRows: 1,
        manualColumnResize: true,
        contextMenu: ['row_above', 'row_below', 'remove_row', 'undo', 'redo', 'copy', 'cut'],
        licenseKey: 'non-commercial-and-evaluation',
        
        // 🌟 ลอจิกความฉลาด: เติมข้อมูลอัตโนมัติเมื่อพิมพ์ชื่องาน และเลือกรถ 🌟
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal === newVal) return;
                
                // 1. ถ้าพิมพ์ชื่องาน (Index 3) -> เติมลูกค้า, ต้นทาง, ปลายทาง
                if (prop === 3 && newVal) {
                    const rate = rateDataMap[newVal.trim()];
                    if (rate) {
                        this.setDataAtCell(row, 4, rate.customer || '', 'auto');
                        this.setDataAtCell(row, 9, rate.jobType || '', 'auto');
                        this.setDataAtCell(row, 10, rate.origin || '', 'auto');
                        this.setDataAtCell(row, 11, rate.dest || '', 'auto');
                        // ดึงราคาต่อเลยถ้ารถเลือกไว้แล้ว
                        const carType = this.getDataAtCell(row, 6);
                        if (carType) applyRateToGrid(this, row, rate, carType);
                    }
                }
                
                // 2. ถ้าเลือกรถ (Index 6) -> เติมราคา
                if (prop === 6 && newVal) {
                    const jobName = this.getDataAtCell(row, 3);
                    if (jobName && rateDataMap[jobName.trim()]) {
                        applyRateToGrid(this, row, rateDataMap[jobName.trim()], newVal);
                    }
                }
            });
        }
    });
};

function applyRateToGrid(hot, row, rate, type) {
    if(type === '6W') { hot.setDataAtCell(row, 7, rate.trp6||''); hot.setDataAtCell(row, 8, rate.trn6||''); }
    else if(type === '10W') { hot.setDataAtCell(row, 7, rate.trp10||''); hot.setDataAtCell(row, 8, rate.trn10||''); }
    else if(type === '12W*2') { hot.setDataAtCell(row, 7, rate.trp12||''); hot.setDataAtCell(row, 8, rate.trn12||''); }
    else if(type === 'เงินสด') { hot.setDataAtCell(row, 7, rate.trpCash||''); hot.setDataAtCell(row, 8, rate.trnCash||''); }
}

// ==========================================
// 💾 ฟังก์ชันบันทึกข้อมูล (ส่งเข้า Backend ทีละบรรทัด)
// ==========================================
window.saveBulkData = async function() {
    if (!hotBulkInstance) return;
    const btn = document.getElementById('btn-save-bulk');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotBulkInstance.getData();
    const mode = document.getElementById('bulkMode').value;
    let successCount = 0;
    let failCount = 0;

    for (let r = 0; r < data.length; r++) {
        const row = data[r];
        // ตรวจสอบว่าแถวนี้มีข้อมูล "วันที่วิ่งงาน" และ "ลูกค้า" ถึงจะยอมบันทึก
        if (!row[1] || !row[4]) continue;

        // จัดการรวบ Date และ Time เข้าด้วยกัน
        const combineDT = (d, t) => (d && String(d).trim() !== '') ? `${d} ${t || '00:00'}` : null;

        let bData = {
            mode: mode,
            run_date: row[1],
            container_count: row[2] || 1,
            job_name: row[3] || '',
            customer_name: row[4] || '',
            booking_no: row[5] || `BK-BULK-${Date.now().toString().slice(-5)}${r}`,
            price_type: row[6] || '',
            trip_fee: row[7] || 0,
            trans_fee: row[8] || 0,
            job_type: row[9] || '',
            origin: row[10] || '',
            destination: row[11] || '',
            agent: row[12] || ''
        };

        if (mode === 'EXPORT') {
            bData.cy_date = combineDT(row[13], row[14]);
            bData.vgm_cutoff = combineDT(row[15], row[16]);
            bData.cutoff_time = combineDT(row[17], row[18]);
            bData.load_date = combineDT(row[19], row[20]);
            bData.open_gate = combineDT(row[21], row[22]);
        } else {
            bData.cy_date = combineDT(row[13], row[14]);
            bData.rent_cutoff = combineDT(row[15], row[16]);
            bData.demurrage = combineDT(row[17], row[18]);
            bData.unload_date = combineDT(row[19], row[20]);
            bData.return_date = combineDT(row[21], row[22]);
        }

        try {
            const res = await fetch('/api/bookings/header', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bData)
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
            hotBulkInstance.setDataAtCell(r, 0, '❌ ติดต่อเซิร์ฟไม่ได้', 'auto');
            hotBulkInstance.getCellMeta(r, 0).className = 'htCenter htMiddle font-bold text-red-600 bg-red-50';
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
    const cols = getColumnsConfig(mode).map(c => c.title).slice(1); // หักคอลัมน์สถานะทิ้งตอนทำ Excel
    
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
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const excelData = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});
        
        // ตัดแถว Header ทิ้ง
        const rows = excelData.slice(1).map(r => {
            let newRow = new Array(getColumnsConfig(document.getElementById('bulkMode').value).length).fill("");
            newRow[0] = ''; // เว้นช่องสถานะ
            // เติมข้อมูล Excel ใส่ช่องอื่นๆ
            for(let i=0; i<r.length; i++) { newRow[i+1] = r[i] || ''; }
            return newRow;
        });
        initBulkGrid(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; 
};