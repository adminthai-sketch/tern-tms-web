// ==========================================
// 🚀 MODULE: BULK BOOKING UPLOAD (Added Container Size & Premium UI)
// ==========================================

let hotBulkInstance = null;
const bulkResults = new WeakMap();

function bulkRowSource(table, row) {
    return table.getSourceDataAtRow(table.toPhysicalRow(row));
}
let currentUserSettings = {};
let rateDataMap = {};
let currentModalRow = -1;
let currentModalProp = -1;
let globalContainerSizes = ['20', '40', '40HC', '45HC']; // 🌟 ค่าเริ่มต้น

window.addEventListener('DOMContentLoaded', async () => {
    applyBulkZebraStripingCSS(); // 🌟 ใส่ CSS ตกแต่งตาราง
    
    // ดึงเรทราคา
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

    // 🌟 ดึงข้อมูลขนาดตู้จากฐานข้อมูล
    try {
        const szRes = await fetch('/api/container-sizes');
        const szResult = await szRes.json();
        if (szResult.success && szResult.data && szResult.data.length > 0) {
            globalContainerSizes = szResult.data.map(r => r.size_name);
        }
    } catch (err) {}

    window.loadUserGridSettingsAndInit();
});

// 🌟 สไตล์ตารางให้สวยเหมือนหน้า Booking List
function applyBulkZebraStripingCSS() {
    if (!document.getElementById('tms-bulk-zebra-css')) {
        const style = document.createElement('style');
        style.id = 'tms-bulk-zebra-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f1f5f9; color: #475569; font-weight: 700; border-color: #cbd5e1; font-size: 11px; padding: 4px !important; }
            .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc; }
            .handsontable tbody tr:nth-child(odd) td { background-color: #ffffff; }
            .handsontable tbody tr:hover td { background-color: #f1f5f9 !important; }
        `;
        document.head.appendChild(style);
    }
}

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

window.saveGridSettings = async function() {
    if (!hotBulkInstance) return;
    const mode = document.getElementById('bulk-mode').value;
    const gridName = `bulk_booking_${mode.toLowerCase()}`;
    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    const colCount = hotBulkInstance.countCols();
    const widths = [];
    for (let i = 0; i < colCount; i++) widths.push(hotBulkInstance.getColWidth(i));
    const movePlugin = hotBulkInstance.getPlugin('manualColumnMove');
    let positions = [];
    if (movePlugin && typeof movePlugin.columnsMapper !== 'undefined') {
        positions = movePlugin.columnsMapper.getIndexesSequence();
    }
    try {
        const response = await fetch('/api/users/grid-settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, gridName: gridName, settings: { columnWidths: widths, columnPositions: positions } })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกมุมมองไม่สำเร็จ');
        alert(`✅ บันทึกการตั้งค่าตารางโหมด ${mode} เรียบร้อยแล้ว!`);
    } catch (err) { alert('❌ ' + err.message); }
};

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
    setTimeout(() => { modal.classList.remove('opacity-0'); document.getElementById('bulk-datetime-modal-content').classList.remove('scale-95'); }, 10);
};

window.closeBulkDateTimeModal = function() {
    const modal = document.getElementById('bulk-datetime-modal');
    modal.classList.add('opacity-0'); document.getElementById('bulk-datetime-modal-content').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.saveBulkDateTimeModal = function() {
    const dateVal = document.getElementById('bulk_modal_date').value;
    const timeVal = document.getElementById('bulk_modal_time').value;
    let result = dateVal ? `${dateVal} ${timeVal || '00:00'}` : '';
    hotBulkInstance.setDataAtCell(currentModalRow, currentModalProp, result);
    closeBulkDateTimeModal();
};

function renderClickableBulkTimeCell(instance, td, row, col, prop, value) {
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    const headerTitle = instance.getColHeader(col);
    let content = value ? `<span class="font-bold text-blue-700">${value}</span>` : '<span class="text-slate-400 italic font-medium">+ เพิ่มเวลา</span>';
    td.innerHTML = `
        <div class="relative group cursor-pointer w-full h-full min-h-[25px] flex items-center justify-center transition-colors hover:bg-blue-50 px-1" onclick="openBulkDateTimeModal(${row}, ${col}, '${headerTitle}')">
            ${content}
            <div class="absolute top-0 right-0 hidden group-hover:flex bg-white border border-blue-200 text-blue-500 rounded p-1 shadow-sm items-center justify-center"><i class="fa-solid fa-clock text-[10px]"></i></div>
        </div>
    `;
    td.style.verticalAlign = 'middle'; td.style.padding = '0';
}

function getBulkHeaders(mode) {
    const commonCols = [
        { title: 'สถานะ', readOnly: true, width: 230, className: 'htMiddle htNoWrap' },
        { title: 'วันที่วิ่งงาน\n(YYYY-MM-DD)', type: 'date', dateFormat: 'YYYY-MM-DD', className: 'htCenter htMiddle text-slate-700 font-bold bg-slate-50' },
        { title: 'ชื่องาน', type: 'text', className: 'font-bold text-primary htMiddle' }, 
        { title: 'จำนวนตู้', type: 'numeric', className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/40' },
        
        // 🌟 เพิ่มคอลัมน์ขนาดตู้ 🌟
        { title: 'ขนาดตู้', type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/20' },
        
        { title: 'ลูกค้า', type: 'text', className: 'text-slate-600 font-bold bg-slate-50 htMiddle' },
        { title: 'Job Type', type: 'dropdown', source: ['Domestic', 'CONTAINER'], className: 'htCenter htMiddle' },
        { title: 'Agent', type: 'text', className: 'font-bold text-purple-700 htMiddle' },
        { title: 'ต้นทาง', type: 'text', className: 'htMiddle' },
        { title: 'ปลายทาง', type: 'text', className: 'htMiddle' },
        { title: 'Booking/BL', type: 'text', className: 'htMiddle font-bold text-slate-700' },
        { title: 'ประเภทรถ', type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'], className: 'htCenter htMiddle text-slate-700 font-medium' },
        { title: 'ค่าเที่ยว', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold htRight htMiddle' },
        { title: 'ค่าขนส่ง', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold htRight htMiddle' }
    ];

    let timeCols = [];
    if (mode === 'EXPORT') {
        timeCols = [
            { title: 'CY Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'VGM Cutoff (Time)\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Cutoff Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Load Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Open Gate Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell }
        ];
    } else if (mode === 'IMPORT') {
        timeCols = [
            { title: 'CY Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Rent Cutoff (Time)\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Demurrage (Time)\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Unload Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Return Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell }
        ];
    } else {
        timeCols = [
            { title: 'Load Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell },
            { title: 'Unload Date & Time\n(YYYY-MM-DD HH:mm)', renderer: renderClickableBulkTimeCell }
        ];
    }
    return [...commonCols, ...timeCols];
}

window.initBulkTable = function(dataToLoad = null, userSettings = {}) {
    const container = document.getElementById('hot-bulk-container');
    if (!container) return; 
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
        fixedColumnsStart: 3,
        stretchH: 'all',
        minSpareRows: 3,
        autoRowSize: false,
        rowHeights: 30, // 🌟 ล็อกความสูงแถวให้เรียบร้อย
        
        manualColumnResize: true,
        manualColumnMove: true,
        colWidths: (userSettings.columnWidths && userSettings.columnWidths.length === headers.length) ? userSettings.columnWidths : undefined, 
        
        contextMenu: ['row_above', 'row_below', 'remove_row', 'undo', 'redo', 'copy', 'cut'],
        licenseKey: 'non-commercial-and-evaluation',

        beforeChange: function(changes, source) {
            if (source === 'auto' || !changes) return;
            for (let i = changes.length - 1; i >= 0; i--) {
                if (bulkResults.get(bulkRowSource(this, changes[i][0]))?.saved) changes.splice(i, 1);
            }
        },

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal === newVal) return;
                const colName = this.getColHeader(this.propToCol(prop));
                const headersNow = this.getColHeader(); 
                
                const custIdx = headersNow.indexOf('ลูกค้า');
                const jobTypeIdx = headersNow.indexOf('Job Type');
                const originIdx = headersNow.indexOf('ต้นทาง');
                const destIdx = headersNow.indexOf('ปลายทาง');
                const carTypeIdx = headersNow.indexOf('ประเภทรถ');
                const tripIdx = headersNow.indexOf('ค่าเที่ยว');
                const transIdx = headersNow.indexOf('ค่าขนส่ง');

                if (colName === 'ชื่องาน' && newVal) {
                    const rate = rateDataMap[String(newVal).trim()];
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
                if (colName === 'ประเภทรถ' && newVal) {
                    const jobNameIdx = headersNow.indexOf('ชื่องาน');
                    if(jobNameIdx >= 0) {
                        const jobName = this.getDataAtCell(row, jobNameIdx); 
                        if (jobName && rateDataMap[String(jobName).trim()]) {
                            applyRateDynamically(this, row, rateDataMap[String(jobName).trim()], newVal, tripIdx, transIdx);
                        }
                    }
                }
            });
        }
    });
    
    if (userSettings.columnPositions && userSettings.columnPositions.length === headers.length) {
        try { hotBulkInstance.getPlugin('manualColumnMove').moveColumns(userSettings.columnPositions, 0); } catch(e) {}
    }
};

function applyRateDynamically(hot, row, rate, type, tripIdx, transIdx) {
    if(tripIdx < 0 || transIdx < 0) return;
    if(type === '6W') { hot.setDataAtCell(row, tripIdx, rate.trp6||''); hot.setDataAtCell(row, transIdx, rate.trn6||''); }
    else if(type === '10W') { hot.setDataAtCell(row, tripIdx, rate.trp10||''); hot.setDataAtCell(row, transIdx, rate.trn10||''); }
    else if(type === '12W*2') { hot.setDataAtCell(row, tripIdx, rate.trp12||''); hot.setDataAtCell(row, transIdx, rate.trn12||''); }
    else if(type === 'เงินสด') { hot.setDataAtCell(row, tripIdx, rate.trpCash||''); hot.setDataAtCell(row, transIdx, rate.trnCash||''); }
}

window.downloadExcelTemplate = function() {
    const mode = document.getElementById('bulk-mode').value;
    const headers = getBulkHeaders(mode).map(c => c.title.replace('\n', ' ')).slice(1);
    
    let sampleRow1 = new Array(headers.length).fill('');
    const setVal = (rowArr, name, val) => { 
        const idx = headers.findIndex(h => h.includes(name));
        if(idx >= 0) rowArr[idx] = val; 
    };

    const today = new Date().toISOString().slice(0, 10);
    
    setVal(sampleRow1, 'วันที่วิ่งงาน', today);
    setVal(sampleRow1, 'ชื่องาน', 'ตัวอย่างงานที่ 1');
    setVal(sampleRow1, 'จำนวนตู้', 1);
    
    // 🌟 ใส่ข้อมูลตัวอย่างขนาดตู้
    setVal(sampleRow1, 'ขนาดตู้', '40HC');
    
    setVal(sampleRow1, 'ลูกค้า', 'ระบบเติมอัตโนมัติ');
    setVal(sampleRow1, 'ประเภทรถ', '10W');
    
    if (mode === 'EXPORT') {
        setVal(sampleRow1, 'CY Date & Time', `${today} 08:30`);
        setVal(sampleRow1, 'VGM Cutoff', `${today} 12:00`);
        setVal(sampleRow1, 'Cutoff Time', `${today} 17:00`);
    } else if (mode === 'IMPORT') {
        setVal(sampleRow1, 'CY Date & Time', `${today} 08:30`);
        setVal(sampleRow1, 'Rent Cutoff', `${today} 12:00`);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Template_${mode}`);
    XLSX.writeFile(wb, `TMS_Bulk_Template_${mode}.xlsx`);
};

function formatExcelDate(val) {
    if (val === null || val === undefined || val === '') return '';
    const num = Number(val);
    if (!isNaN(num) && num > 20000 && num < 80000) {
        const adjustedNum = num > 59 ? num - 1 : num;
        const dateObj = new Date((adjustedNum - 25568) * 86400 * 1000);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const hours = String(dateObj.getUTCHours()).padStart(2, '0');
        const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
        if (num % 1 !== 0) { return `${year}-${month}-${day} ${hours}:${minutes}`; }
        return `${year}-${month}-${day}`;
    }
    return String(val).trim();
}

window.uploadExcelFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true });
        if (rawJson.length <= 1) return;
        
        const mode = document.getElementById('bulk-mode').value;
        const headers = getBulkHeaders(mode).map(c => c.title);

        const dateCols = [];
        headers.forEach((h, idx) => {
            if (h.includes('วันที่วิ่งงาน') || h.includes('Date & Time') || h.includes('Cutoff') || h.includes('Demurrage') || h.includes('Gate')) {
                dateCols.push(idx);
            }
        });

        const formattedRows = rawJson.slice(1).map(row => {
            let newRow = ["", ...row];
            dateCols.forEach(colIdx => {
                if (newRow[colIdx] !== undefined && newRow[colIdx] !== null) {
                    newRow[colIdx] = formatExcelDate(newRow[colIdx]);
                }
            });
            return newRow;
        });

        initBulkTable(formattedRows, currentUserSettings);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
};

function inspectBulkRows(table) {
    const headers = table.getColHeader();
    const statusCol = table.propToCol(0);
    const rows = [];
    const references = new Map();
    table.getData().forEach((cells, row) => {
        if (!cells.some((value, col) => col !== statusCol && String(value ?? '').trim())) return;
        const source = bulkRowSource(table, row);
        const get = name => cells[headers.findIndex(header => header.includes(name))];
        const reference = String(get('Booking/BL') ?? '').trim();
        const date = String(formatExcelDate(get('วันที่วิ่งงาน')) ?? '');
        const parsed = new Date(date);
        const count = get('จำนวนตู้');
        const errors = [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date) errors.push('ตรวจวันที่วิ่งงาน');
        if (!String(get('ชื่องาน') ?? '').trim()) errors.push('ระบุชื่องาน');
        if (String(count ?? '').trim() && (!Number.isSafeInteger(Number(count)) || Number(count) < 1)) {
            errors.push('จำนวนตู้ต้องเป็นจำนวนเต็มตั้งแต่ 1');
        }
        const entry = { row, source, reference, errors, saved: bulkResults.get(source)?.saved };
        rows.push(entry);
        if (reference) {
            if (!references.has(reference)) references.set(reference, []);
            references.get(reference).push(entry);
        }
    });
    for (const matches of references.values()) {
        if (matches.length > 1) matches.forEach(entry => entry.errors.push('Booking/BL ซ้ำในตาราง'));
    }
    return rows;
}

function showBulkReview(table, rows, message = '') {
    const statusCol = table.propToCol(0);
    let ready = 0;
    let invalid = 0;
    let saved = 0;
    rows.forEach(entry => {
        if (entry.saved) { saved++; return; }
        const previous = bulkResults.get(entry.source);
        if (entry.errors.length) invalid++;
        else ready++;
        table.setDataAtCell(entry.row, statusCol,
            entry.errors.join(' · ') || previous?.error || 'พร้อมบันทึก', 'auto');
    });
    document.getElementById('bulk-summary').textContent =
        'ทั้งหมด ' + rows.length + ' · พร้อมส่ง ' + ready + ' · ต้องแก้ ' + invalid + ' · สำเร็จ ' + saved +
        (message ? ' · ' + message : '');
}

window.reviewBulkRows = function() {
    if (!hotBulkInstance) return;
    const rows = inspectBulkRows(hotBulkInstance);
    showBulkReview(hotBulkInstance, rows);
    const first = rows.find(entry => !entry.saved && entry.errors.length);
    if (first) hotBulkInstance.selectCell(first.row, hotBulkInstance.propToCol(0));
};

window.processBulkSave = async function() {
    if (!hotBulkInstance) return;
    const btn = document.getElementById('btn-save-bulk');
    if (btn.disabled) return;
    const table = hotBulkInstance;
    const rows = inspectBulkRows(table);
    showBulkReview(table, rows);
    const pending = rows.filter(entry => !entry.saved && !entry.errors.length);
    if (!pending.length || !window.confirm('บันทึก ' + pending.length + ' รายการที่ผ่านการตรวจสอบ?')) return;
    const panel = document.getElementById('bulk-workspace');
    panel.inert = true;
    const statusCol = table.propToCol(0);
    try {
        btn.textContent = 'กำลังบันทึก...';
        btn.disabled = true;

        const data = hotBulkInstance.getData();
        const mode = document.getElementById('bulk-mode').value;
        const headers = hotBulkInstance.getColHeader();

        const getVal = (r, name) => {
            const idx = headers.findIndex(h => h.includes(name));
            return idx >= 0 ? data[r][idx] : '';
        };

        let successCount = 0; let failCount = 0;

        for (const entry of pending) {
            const r = entry.row;
            const state = bulkResults.get(entry.source) || {};
            if (!state.key) state.key = 'BK-BULK-' + Array.from(crypto.getRandomValues(new Uint32Array(3)), value => value.toString(36)).join('-');
            bulkResults.set(entry.source, state);
            const runDate = getVal(r, 'วันที่วิ่งงาน');
            const jobName = getVal(r, 'ชื่องาน');
            const customer = getVal(r, 'ลูกค้า');

            if (!runDate || !jobName) continue;

            let bData = {
                mode: mode,
                run_date: formatExcelDate(runDate),
                job_name: String(jobName).trim(),
                container_count: Number(getVal(r, 'จำนวนตู้')) || 1,

                // 🌟 ดึงข้อมูลขนาดตู้ไปบันทึก
                container_size: getVal(r, 'ขนาดตู้'),

                customer_name: customer,
                job_type: getVal(r, 'Job Type'),
                agent: getVal(r, 'Agent'),
                origin: getVal(r, 'ต้นทาง'),
                destination: getVal(r, 'ปลายทาง'),
                booking_no: entry.reference || state.key,
                price_type: getVal(r, 'ประเภทรถ'),
                trip_fee: getVal(r, 'ค่าเที่ยว') || 0,
                trans_fee: getVal(r, 'ค่าขนส่ง') || 0
            };

            if (mode === 'EXPORT') {
                bData.cy_date = formatExcelDate(getVal(r, 'CY Date & Time'));
                bData.vgm_cutoff = formatExcelDate(getVal(r, 'VGM Cutoff'));
                bData.cutoff_time = formatExcelDate(getVal(r, 'Cutoff Time'));
                bData.load_date = formatExcelDate(getVal(r, 'Load Date & Time'));
                bData.open_gate = formatExcelDate(getVal(r, 'Open Gate') || getVal(r, 'Gate Date & Time'));
            } else if (mode === 'IMPORT') {
                bData.cy_date = formatExcelDate(getVal(r, 'CY Date & Time'));
                bData.rent_cutoff = formatExcelDate(getVal(r, 'Rent Cutoff'));
                bData.demurrage = formatExcelDate(getVal(r, 'Demurrage'));
                bData.unload_date = formatExcelDate(getVal(r, 'Unload Date & Time'));
                bData.return_date = formatExcelDate(getVal(r, 'Return Date & Time'));
            } else {
                bData.load_date = formatExcelDate(getVal(r, 'Load Date & Time'));
                bData.unload_date = formatExcelDate(getVal(r, 'Unload Date & Time'));
            }

            try {
                const res = await fetch('/api/bookings/header', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bData)
                });
                const result = await res.json();

                if (res.ok && result.success) {
                    state.saved = true;
                    table.setDataAtCell(r, statusCol, 'สำเร็จ · ' + bData.booking_no, 'auto');
                    successCount++;
                } else {
                    state.error = result.message || 'บันทึกไม่สำเร็จ';
                    failCount++;
                }
            } catch (err) {
                state.error = 'ไม่ได้รับผลตอบกลับ ลองบันทึกอีกครั้ง';
                failCount++;
            }
        }

        showBulkReview(table, inspectBulkRows(table), 'รอบนี้สำเร็จ ' + successCount + ' · ส่งไม่สำเร็จ ' + failCount);
    } finally {
        panel.inert = false;
        btn.textContent = 'บันทึกรายการที่พร้อม';
        btn.disabled = false;
    }
};
