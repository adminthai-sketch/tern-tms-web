// ==========================================
// 💸 MODULE: BILLING MASTER & DETAIL WORKFLOW
// ==========================================

let hotMasterInstance = null;
let hotDetailInstance = null;

let rawShipmentList = [];      // ตู้ทั้งหมด
let masterBookingList = [];    // สรุปราย Booking
let filteredMasterList = [];   
let activeBookingNo = null;

let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    await loadBillingMasterData();
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style');
        style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #cbd5e1; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #1e293b; font-weight: 700 !important; border-color: #94a3b8; font-size: 11px !important; }
            .zone-read { background-color: #f8fafc !important; color: #475569; }
            .zone-edit { background-color: #ffffff !important; color: #0f4c81; font-weight: 600; }
            
            .badge-pending { background-color: #fef2f2; color: #ef4444; border: 1px solid #fca5a5; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-billed { background-color: #f0fdf4; color: #10b981; border: 1px solid #6ee7b7; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
        `;
        document.head.appendChild(style);
    }
}

// สลับหน้าระหว่าง Master View (1) และ Detail View (2)
window.switchView = function(viewName) {
    const masterEl = document.getElementById('view-master-list');
    const detailEl = document.getElementById('view-booking-detail');

    if (viewName === 'master') {
        masterEl.classList.remove('hidden');
        detailEl.classList.add('hidden');
        loadBillingMasterData(); // รีเฟรชข้อมูลล่าสุด
    } else {
        masterEl.classList.add('hidden');
        detailEl.classList.remove('hidden');
    }
};

// 🌟 STEP 1: โหลดและจัดกลุ่มข้อมูลเป็นราย Booking
window.loadBillingMasterData = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    document.getElementById('master-loading-overlay').classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();

        if (result.success && result.data) {
            rawShipmentList = result.data;
            
            // Group by Booking No.
            const bkMap = {};
            rawShipmentList.forEach(item => {
                const bk = item.booking_no;
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk,
                        run_date: item.run_date ? item.run_date.split('T')[0] : '',
                        customer_name: item.customer_name || '',
                        origin: item.origin || '',
                        destination: item.destination || '',
                        container_count: 0,
                        total_amount: 0,
                        iv_no: item.iv_no || '',
                        ar_no: item.ar_no || '',
                        billing_status: (item.iv_no && item.iv_no.trim() !== '') ? 'วางบิลแล้ว' : 'รอวางบิล',
                        shipments: []
                    };
                }
                bkMap[bk].container_count += 1;
                const tripFee = Number(item.trip_fee) || 0;
                bkMap[bk].total_amount += tripFee;
                bkMap[bk].shipments.push(item);
            });

            masterBookingList = Object.values(bkMap);
            updateMasterFilterDropdowns();
            handleMasterFilter();
        } else {
            rawShipmentList = []; masterBookingList = []; handleMasterFilter();
        }
    } catch (err) {
        console.error(err);
        masterBookingList = []; handleMasterFilter();
    } finally {
        document.getElementById('master-loading-overlay').classList.add('hidden');
    }
};

function updateMasterFilterDropdowns() {
    const dates = new Set(), custs = new Set(), books = new Set();
    masterBookingList.forEach(i => {
        if (i.run_date) dates.add(i.run_date);
        if (i.customer_name) custs.add(i.customer_name.trim());
        if (i.booking_no) books.add(i.booking_no.trim());
    });
    
    const dlDate = document.getElementById('dl-run-date');
    const dlCust = document.getElementById('dl-customer');
    const dlBook = document.getElementById('dl-booking-no');
    
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleMasterFilter = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    filteredMasterList = masterBookingList.filter(item => {
        const matchD = !d || item.run_date === d; 
        const matchC = !c || (item.customer_name && item.customer_name.trim() === c); 
        const matchB = !b || (item.booking_no && item.booking_no.trim() === b);
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        return matchD && matchC && matchB && matchGlobal;
    });
    
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

window.clearMasterFilters = function() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = ''; 
    handleMasterFilter();
};

window.setQuickMasterFilter = function(type) {
    if (type === 'pending') {
        filteredMasterList = masterBookingList.filter(item => !item.iv_no || item.iv_no.trim() === '');
    } else {
        filteredMasterList = masterBookingList.filter(item => item.iv_no && item.iv_no.trim() !== '');
    }
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

function updateMasterKPI(dataList) {
    let pendingBk = 0, pendingCt = 0, pendingAmt = 0;
    let billedBk = 0, billedCt = 0, billedAmt = 0;
    
    dataList.forEach(item => {
        if (!item.iv_no || item.iv_no.trim() === '') {
            pendingBk++;
            pendingCt += item.container_count;
            pendingAmt += item.total_amount;
        } else {
            billedBk++;
            billedCt += item.container_count;
            billedAmt += item.total_amount;
        }
    });
    
    document.getElementById('stat-pending-bk').innerText = `${pendingBk} Booking`;
    document.getElementById('stat-pending-ct').innerText = `${pendingCt} ตู้`;
    document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    
    document.getElementById('stat-billed-bk').innerText = `${billedBk} Booking`;
    document.getElementById('stat-billed-ct').innerText = `${billedCt} ตู้`;
    document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

// ตาราง Master (ตารางราย Booking)
function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) { hotMasterInstance.destroy(); }

    const bookingLinkRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `
            <div class="flex items-center justify-between w-full h-full px-1">
                <span class="font-bold text-purple-700">${value || ''}</span>
                <button onclick="openBookingDetail('${value}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-2 py-0.5 rounded text-[10px] font-bold transition-colors shadow-sm">
                    เปิดวางบิล 🔍
                </button>
            </div>
        `;
    };

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.textAlign = 'center';
        if (value === 'วางบิลแล้ว') {
            td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> วางบิลแล้ว</span>`;
        } else {
            td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> รอวางบิล</span>`;
        }
    };

    hotMasterInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 30,
        fixedColumnsLeft: 2,

        colHeaders: [
            'Booking No.', 'สถานะ', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 
            'จำนวนตู้', 'รวมค่าบรรทุก (บาท)', 
            'เลขที่ IV (Invoice) ✏️', 'เลขที่ AR (คชจ.สำรอง) ✏️'
        ],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle zone-read', renderer: bookingLinkRenderer },
            { data: 'billing_status', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: statusRenderer },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle zone-read' },
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' },
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' },

            { data: 'container_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 zone-read' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 zone-read' },

            // บัญชีกรอกตรงนี้ได้เลย
            { data: 'iv_no', type: 'text', className: 'htCenter htMiddle font-bold text-emerald-800 uppercase zone-edit' },
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase zone-edit' }
        ],
        colWidths: [180, 90, 95, 140, 110, 110, 75, 130, 140, 140],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true,
        licenseKey: 'non-commercial-and-evaluation'
    });
}

// เซฟเลข IV / AR จากหน้า Master List
window.saveMasterBillingChanges = async function() {
    if (!hotMasterInstance) return;
    const masterData = hotMasterInstance.getSourceData();

    // ดึงตู้ทั้งหมดที่ตรงกับ Booking เพื่ออัปเดต IV/AR
    const dataToSave = [];
    masterData.forEach(bkRow => {
        const shipments = rawShipmentList.filter(s => s.booking_no === bkRow.booking_no);
        shipments.forEach(s => {
            s.iv_no = bkRow.iv_no || null;
            s.ar_no = bkRow.ar_no || null;
            dataToSave.push(s);
        });
    });

    try {
        const res = await fetch('/api/billing/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role })
        });
        const result = await res.json();
        if (result.success) {
            alert('✅ บันทึกเลข IV และ AR เรียบร้อยแล้ว!');
            loadBillingMasterData();
        } else {
            alert('❌ ข้อผิดพลาด: ' + result.message);
        }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};


// ==========================================
// 🌟 STEP 2: เปิดหน้าลงรายละเอียดตู้ราย BOOKING
// ==========================================
window.openBookingDetail = function(bookingNo) {
    activeBookingNo = bookingNo;
    document.getElementById('detail-header-booking-no').innerText = bookingNo;

    const shipments = rawShipmentList.filter(s => s.booking_no === bookingNo);
    if (shipments.length === 0) return;

    const first = shipments[0];

    // เติมข้อมูลหัวบิล
    document.getElementById('info-customer-name').innerText = first.customer_name || '-';
    document.getElementById('info-tax-id').innerText = first.tax_id || '-';
    document.getElementById('info-address').innerText = first.address || '-';
    document.getElementById('info-booking-no').innerText = first.booking_no || '-';

    document.getElementById('input-billing-date').value = first.billing_date ? first.billing_date.split('T')[0] : (first.run_date ? first.run_date.split('T')[0] : '');
    document.getElementById('input-iv-no').value = first.iv_no || '';
    document.getElementById('input-ar-no').value = first.ar_no || '';

    // สลับไปยัง View 2
    switchView('detail');

    // สร้างตารางรายละเอียดตู้
    initDetailGrid(shipments);
    calculateDetailSummary();
};

function calculateDetailSummary() {
    if (!hotDetailInstance) return;
    const count = hotDetailInstance.countRows();
    let totalTrip = 0;

    for (let r = 0; r < count; r++) {
        totalTrip += (Number(hotDetailInstance.getDataAtRowProp(r, 'trip_fee')) || 0);
    }

    const unitPrice = count > 0 ? (totalTrip / count) : 0;

    document.getElementById('sum-qty').innerText = count.toFixed(2);
    document.getElementById('sum-unit-price').innerText = unitPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-total-amount').innerText = totalTrip.toLocaleString('en-US', {minimumFractionDigits: 2});
}

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (!container) return;
    if (hotDetailInstance) { hotDetailInstance.destroy(); }

    hotDetailInstance = new Handsontable(container, {
        data: data,
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 26,
        fixedColumnsLeft: 2,

        colHeaders: [
            'Order ID', 'วันที่', 'ทะเบียนรถ', 'เบอร์ตู้', 'ขนาดตู้', 
            'จาก', 'ถึง', 'น้ำหนัก (KG) ✏️', 
            'ค่าบรรทุก ✏️', 'ค่าผ่านท่า ✏️', 'ค่าฝากตู้ ✏️', 'ค่ายกตู้ ✏️', 'ค่าชอร์ ✏️',
            'ภาษีผ่านท่า (7%)', 'ภาษีค่ายก (7%)', 'ภาษีชอร์ (7%)'
        ],
        columns: [
            { data: 'order_id', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: (i, td, r, c, p, v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'leg1_plate', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'container_1_no', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold text-blue-600' },
            { data: 'container_size', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            
            { data: 'origin', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'destination', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },

            // แก้ไขได้ในรายละเอียด
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit font-bold text-slate-800' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },

            // ภาษีคำนวณ 7%
            { 
                data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500',
                renderer: (i, td, r, c, p, v) => { const tax = (Number(v)||0) * 0.07; td.innerHTML = tax > 0 ? tax.toFixed(2) : '-'; }
            },
            { 
                data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500',
                renderer: (i, td, r, c, p, v) => { const tax = (Number(v)||0) * 0.07; td.innerHTML = tax > 0 ? tax.toFixed(2) : '-'; }
            },
            { 
                data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500',
                renderer: (i, td, r, c, p, v) => { const tax = (Number(v)||0) * 0.07; td.innerHTML = tax > 0 ? tax.toFixed(2) : '-'; }
            }
        ],
        colWidths: [100, 85, 90, 110, 65, 80, 80, 100, 100, 90, 90, 90, 90, 95, 95, 95],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true,
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            calculateDetailSummary();
        }
    });
}

// เซฟรายละเอียดตู้ใน View 2
window.saveDetailBillingChanges = async function() {
    if (!hotDetailInstance || !activeBookingNo) return;

    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const dataToSave = hotDetailInstance.getSourceData().map(row => {
        row.iv_no = ivNo;
        row.ar_no = arNo;
        row.billing_date = billingDate;
        return row;
    });

    try {
        const res = await fetch('/api/billing/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role })
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ บันทึกข้อมูลรายละเอียดของ Booking: ${activeBookingNo} สำเร็จ!`);
        } else {
            alert('❌ ข้อผิดพลาด: ' + result.message);
        }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};

// สั่งพิมพ์เอกสาร A4 แนวนอน
window.printCurrentInvoice = function() {
    if (!activeBookingNo) return;
    window.open(`/print-invoice.html?booking=${encodeURIComponent(activeBookingNo)}`, '_blank');
};