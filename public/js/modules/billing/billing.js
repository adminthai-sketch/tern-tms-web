// ==========================================
// 💸 MODULE: BILLING WORKFLOW (COMBINED SPA)
// ==========================================

let hotMasterInstance = null;
let hotDetailInstance = null;
let hotIvInstance = null;

let rawShipmentList = [];      
let masterBookingList = [];    
let filteredMasterList = [];   
let rawIvList = [];

let activeBookingNo = null;
let activeCustomerId = null;
let currentUnbilledData = [];

let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    
    // 🌟 1. โหลดข้อมูลผู้ใช้งาน (แก้ไข fullName ป้องกันการค้าง)
    try {
        const savedUser = localStorage.getItem('tms_user');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            const nameToDisplay = currentUser.fullName || currentUser.username || 'ผู้ดูแลระบบ';
            if(document.getElementById('user-fullname')) document.getElementById('user-fullname').innerText = nameToDisplay;
            if(document.getElementById('user-role-badge')) document.getElementById('user-role-badge').innerText = (currentUser.role || 'ADMIN').toUpperCase();
        } else {
            window.location.href = '/login.html';
            return;
        }
    } catch (e) {
        console.error("User info load error:", e);
    }
    
    // 🌟 2. ตั้งค่าเดือนปัจจุบัน
    const today = new Date();
    const monthInput = document.getElementById('filter-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    }
    
    // 🌟 3. โหลดข้อมูล Master
    await loadBillingMasterData();

    // 🌟 4. เช็คกรณีข้ามมาจากหน้าอื่นด้วย URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bk = urlParams.get('booking');
    if (bk) {
        openBookingDetail(bk);
    }
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
            .badge-partial { background-color: #fffbebfb; color: #d97706; border: 1px solid #fcd34d; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-billed { background-color: #f0fdf4; color: #10b981; border: 1px solid #6ee7b7; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
        `;
        document.head.appendChild(style);
    }
}

// ==========================================
// 📌 TAB NAVIGATION
// ==========================================
window.switchMainTab = function(tabName) {
    const vMaster = document.getElementById('view-tab-master');
    const vDetail = document.getElementById('view-tab-detail');
    const vIv = document.getElementById('view-tab-iv');

    const btnMaster = document.getElementById('tab-btn-master');
    const btnDetail = document.getElementById('tab-btn-detail');
    const btnIv = document.getElementById('tab-btn-iv');

    [btnMaster, btnDetail, btnIv].forEach(btn => {
        if(btn) btn.className = "tab-btn-inactive px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5";
    });

    [vMaster, vDetail, vIv].forEach(v => {
        if(v) v.classList.add('hidden');
    });

    if (tabName === 'master') {
        if(vMaster) vMaster.classList.remove('hidden');
        if(btnMaster) btnMaster.className = "tab-btn-active px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5";
        loadBillingMasterData();
    } else if (tabName === 'detail') {
        if(vDetail) vDetail.classList.remove('hidden');
        if(btnDetail) btnDetail.className = "tab-btn-active px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5";
    } else if (tabName === 'iv') {
        if(vIv) vIv.classList.remove('hidden');
        if(btnIv) btnIv.className = "tab-btn-active px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5";
        loadIvSummaryData();
    }
};

// ==========================================
// 📌 TAB 1: MASTER BOOKING LIST
// ==========================================
window.loadBillingMasterData = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    const overlay = document.getElementById('master-loading-overlay');
    if(overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();

        if (result.success && result.data) {
            rawShipmentList = result.data;
            const bkMap = {};
            
            rawShipmentList.forEach(item => {
                const bk = item.booking_no;
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk, customer_id: item.customer_id,
                        run_date: item.run_date ? item.run_date.split('T')[0] : '',
                        customer_name: item.customer_name || '', origin: item.origin || '', destination: item.destination || '',
                        total_count: 0, billed_count: 0, total_amount: 0,
                        iv_numbers: new Set(), ar_numbers: new Set(), shipments: []
                    };
                }
                bkMap[bk].total_count += 1;
                if (item.iv_no && item.iv_no.trim() !== '') {
                    bkMap[bk].billed_count += 1;
                    bkMap[bk].iv_numbers.add(item.iv_no.trim());
                }
                if (item.ar_no && item.ar_no.trim() !== '') {
                    bkMap[bk].ar_numbers.add(item.ar_no.trim());
                }
                bkMap[bk].total_amount += (Number(item.trip_fee) || 0);
                bkMap[bk].shipments.push(item);
            });

            masterBookingList = Object.values(bkMap).map(b => {
                if (b.billed_count === 0) b.billing_status = 'รอวางบิล';
                else if (b.billed_count < b.total_count) b.billing_status = `วางบิลแล้ว ${b.billed_count}/${b.total_count} ตู้`;
                else b.billing_status = `วางบิลครบ ${b.total_count}/${b.total_count} ตู้`;

                b.disp_iv = Array.from(b.iv_numbers).join(', ');
                b.disp_ar = Array.from(b.ar_numbers).join(', ');
                return b;
            });

            updateMasterFilterDropdowns();
            handleMasterFilter();
        }
    } catch (err) { console.error(err); } 
    finally { if(overlay) overlay.classList.add('hidden'); }
};

function updateMasterFilterDropdowns() {
    const dates = new Set(), custs = new Set(), books = new Set();
    masterBookingList.forEach(i => {
        if (i.run_date) dates.add(i.run_date);
        if (i.customer_name) custs.add(i.customer_name.trim());
        if (i.booking_no) books.add(i.booking_no.trim());
    });
    
    const dlDate = document.getElementById('dl-run-date'), dlCust = document.getElementById('dl-customer'), dlBook = document.getElementById('dl-booking-no');
    if(dlDate) { dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`); }
    if(dlCust) { dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`); }
    if(dlBook) { dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`); }
}

window.handleMasterFilter = function() {
    const dEl = document.getElementById('filter-run-date'), cEl = document.getElementById('filter-customer');
    const bEl = document.getElementById('filter-booking-no'), sEl = document.getElementById('global-search');

    const d = dEl ? dEl.value : '', c = cEl ? cEl.value : '', b = bEl ? bEl.value : '', searchTxt = sEl ? sEl.value.toLowerCase().trim() : '';

    filteredMasterList = masterBookingList.filter(item => {
        return (!d || item.run_date === d) && 
               (!c || (item.customer_name && item.customer_name.trim() === c)) && 
               (!b || (item.booking_no && item.booking_no.trim() === b)) && 
               (!searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt));
    });
    
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

window.clearMasterFilters = function() {
    if(document.getElementById('filter-run-date')) document.getElementById('filter-run-date').value = '';
    if(document.getElementById('filter-customer')) document.getElementById('filter-customer').value = '';
    if(document.getElementById('filter-booking-no')) document.getElementById('filter-booking-no').value = ''; 
    if(document.getElementById('global-search')) document.getElementById('global-search').value = ''; 
    handleMasterFilter();
};

window.setQuickMasterFilter = function(type) {
    filteredMasterList = type === 'pending' 
        ? masterBookingList.filter(item => item.billed_count < item.total_count) 
        : masterBookingList.filter(item => item.billed_count > 0);
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

function updateMasterKPI(dataList) {
    let pendingBk = 0, pendingCt = 0, pendingAmt = 0, billedBk = 0, billedCt = 0, billedAmt = 0;
    
    dataList.forEach(item => {
        if (item.billed_count === 0) { pendingBk++; pendingCt += item.total_count; pendingAmt += item.total_amount; } 
        else { billedBk++; billedCt += item.billed_count; billedAmt += item.total_amount; }
    });
    
    if(document.getElementById('stat-pending-bk')) document.getElementById('stat-pending-bk').innerText = `${pendingBk} Booking`;
    if(document.getElementById('stat-pending-ct')) document.getElementById('stat-pending-ct').innerText = `${pendingCt} ตู้`;
    if(document.getElementById('stat-pending-amt')) document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    
    if(document.getElementById('stat-billed-bk')) document.getElementById('stat-billed-bk').innerText = `${billedBk} Booking`;
    if(document.getElementById('stat-billed-ct')) document.getElementById('stat-billed-ct').innerText = `${billedCt} ตู้`;
    if(document.getElementById('stat-billed-amt')) document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) { hotMasterInstance.destroy(); }

    hotMasterInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 30, fixedColumnsLeft: 2,
        colHeaders: ['Booking No.', 'สถานะ', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุก (บาท)', 'เลขที่ IV ✏️', 'เลขที่ AR ✏️'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle zone-read', renderer: function(i, td, r, c, p, v) { Handsontable.renderers.HtmlRenderer.apply(this, arguments); td.innerHTML = `<div class="flex items-center justify-between w-full h-full px-1"><span class="font-bold text-purple-700">${v || ''}</span><button onclick="openBookingDetail('${v}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-2 py-0.5 rounded text-[10px] font-bold transition-colors shadow-sm">เปิดวางบิล 🔍</button></div>`; } },
            { data: 'billing_status', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: function(i, td, r, c, p, v) { Handsontable.renderers.HtmlRenderer.apply(this, arguments); td.style.textAlign = 'center'; if (!v) return; if(v.includes('วางบิลครบ')) td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> ${v}</span>`; else if(v.includes('วางบิลแล้ว')) td.innerHTML = `<span class="badge-partial"><i class="fa-solid fa-clock-rotate-left"></i> ${v}</span>`; else td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> รอวางบิล</span>`; } },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle zone-read' },
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' },
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 zone-read' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 zone-read' },
            { data: 'disp_iv', type: 'text', className: 'htCenter htMiddle font-bold text-emerald-800 uppercase zone-edit' },
            { data: 'disp_ar', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase zone-edit' }
        ],
        colWidths: [180, 110, 95, 140, 110, 110, 75, 130, 150, 150],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}

window.saveMasterBillingChanges = async function() {
    if (!hotMasterInstance) return;
    const masterData = hotMasterInstance.getSourceData();
    const dataToSave = [];
    masterData.forEach(bkRow => {
        const shipments = rawShipmentList.filter(s => s.booking_no === bkRow.booking_no);
        shipments.forEach(s => {
            if(bkRow.disp_iv) s.iv_no = bkRow.disp_iv.trim();
            if(bkRow.disp_ar) s.ar_no = bkRow.disp_ar.trim();
            dataToSave.push(s);
        });
    });

    try {
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role }) });
        const result = await res.json();
        if (result.success) { alert('✅ บันทึกเลข IV และ AR เรียบร้อยแล้ว!'); loadBillingMasterData(); }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};

// ==========================================
// 📌 TAB 2: BOOKING DETAIL VIEW
// ==========================================
window.openBookingDetail = function(bookingNo) {
    activeBookingNo = bookingNo;
    const shipments = rawShipmentList.filter(s => s.booking_no === bookingNo);
    if (shipments.length === 0) return;

    const first = shipments[0];
    activeCustomerId = first.customer_id;

    if(document.getElementById('info-customer-name')) document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name || '-';
    if(document.getElementById('info-tax-id')) document.getElementById('info-tax-id').innerText = first.tax_id || '-';
    if(document.getElementById('info-address')) document.getElementById('info-address').innerText = first.address || '-';
    if(document.getElementById('info-booking-no')) document.getElementById('info-booking-no').innerText = first.booking_no || '-';

    if(document.getElementById('input-billing-date')) document.getElementById('input-billing-date').value = first.billing_date ? first.billing_date.split('T')[0] : (first.run_date ? first.run_date.split('T')[0] : '');
    
    const filledIv = shipments.find(s => s.iv_no && s.iv_no.trim() !== '');
    if(document.getElementById('input-iv-no')) document.getElementById('input-iv-no').value = filledIv ? filledIv.iv_no : '';
    if(document.getElementById('input-ar-no')) document.getElementById('input-ar-no').value = filledIv ? filledIv.ar_no : '';

    shipments.forEach(s => s._selected = true);

    switchMainTab('detail');
    initDetailGrid(shipments);
    calculateDetailSummary();
};

window.calculateDetailSummary = function() {
    if (!hotDetailInstance) return;
    const data = hotDetailInstance.getSourceData();
    let totalQty = 0;
    let totalPrice = 0;

    data.forEach(row => { if (row._selected) { totalQty += 1; totalPrice += (Number(row.trip_fee) || 0); } });

    if(document.getElementById('sum-qty')) document.getElementById('sum-qty').innerText = totalQty.toLocaleString();
    if(document.getElementById('sum-unit-price')) document.getElementById('sum-unit-price').innerText = (totalQty > 0 ? (totalPrice/totalQty) : 0).toLocaleString('en-US', {minimumFractionDigits: 2});
    if(document.getElementById('sum-total-amount')) document.getElementById('sum-total-amount').innerText = totalPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
};

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (!container) return;
    if (hotDetailInstance) { hotDetailInstance.destroy(); }

    hotDetailInstance = new Handsontable(container, {
        data: data, wordWrap: false, autoRowSize: false, rowHeights: 26, fixedColumnsLeft: 2,
        colHeaders: ['เลือก', 'Order ID', 'วันที่', 'ทะเบียนรถ', 'เบอร์ตู้', 'ขนาด', 'จาก', 'ถึง', 'น้ำหนัก ✏️', 'ค่าบรรทุก ✏️', 'ผ่านท่า ✏️', 'ฝากตู้ ✏️', 'ยกตู้ ✏️', 'ชอร์ ✏️', 'ภาษีผ่านท่า', 'ภาษีค่ายก', 'ภาษีชอร์'],
        columns: [
            { data: '_selected', type: 'checkbox', className: 'htCenter htMiddle zone-read' },
            { data: 'order_id', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'leg1_plate', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'container_1_no', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold text-blue-600' },
            { data: 'container_size', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'origin', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'destination', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit font-bold text-slate-800' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500', renderer: (i,td,r,c,p,v) => { td.innerHTML = ((Number(v)||0)*0.07).toFixed(2); } },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500', renderer: (i,td,r,c,p,v) => { td.innerHTML = ((Number(v)||0)*0.07).toFixed(2); } },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read text-slate-500', renderer: (i,td,r,c,p,v) => { td.innerHTML = ((Number(v)||0)*0.07).toFixed(2); } }
        ],
        colWidths: [45, 100, 85, 90, 110, 50, 80, 80, 80, 90, 80, 80, 80, 80, 80, 80, 80],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) { if(src !== 'loadData') calculateDetailSummary(); }
    });
}

window.saveDetailBillingChanges = async function() {
    if (!hotDetailInstance) return;

    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const dataToSave = hotDetailInstance.getSourceData().map(row => {
        if (row._selected) { row.iv_no = ivNo; row.ar_no = arNo; row.billing_date = billingDate; } 
        else { row.iv_no = null; }
        return row;
    });

    try {
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role }) });
        const result = await res.json();
        if (result.success) { alert(`✅ บันทึกข้อมูลรายละเอียดบิลสำเร็จ!`); loadBillingMasterData(); }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};

window.printCurrentInvoice = function() {
    const ivNo = document.getElementById('input-iv-no').value.trim();
    if (ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
    else if (activeBookingNo) window.open(`/print-invoice.html?booking=${encodeURIComponent(activeBookingNo)}`, '_blank');
};

// ==========================================
// 📌 MODAL: ดึงตู้ตกค้างเข้า IV
// ==========================================
window.openUnbilledModal = async function() {
    if (!activeCustomerId) { alert("⚠️ ไม่พบข้อมูลลูกค้า กรุณาเลือก Booking ก่อน"); return; }
    document.getElementById('modal-cust-name').value = document.getElementById('info-customer-name').innerText;
    document.getElementById('modal-filter-date').value = '';
    document.getElementById('unbilled-modal').classList.remove('hidden');
    await fetchUnbilledContainers();
};

window.closeUnbilledModal = function() { document.getElementById('unbilled-modal').classList.add('hidden'); };

window.fetchUnbilledContainers = async function() {
    const runDate = document.getElementById('modal-filter-date').value;
    try {
        const res = await fetch(`/api/billing/unbilled-containers?customer_id=${activeCustomerId}&run_date=${runDate}`);
        const result = await res.json();

        if (result.success) {
            currentUnbilledData = result.data;
            const bookingSelect = document.getElementById('modal-filter-booking');
            const uniqueBookings = Array.from(new Set(currentUnbilledData.map(i => i.booking_no))).sort();
            bookingSelect.innerHTML = '<option value="">-- แสดงทุก Booking --</option>';
            uniqueBookings.forEach(bk => bookingSelect.innerHTML += `<option value="${bk}">${bk}</option>`);
            filterUnbilledTable();
        }
    } catch(e) { console.error(e); }
};

window.filterUnbilledTable = function() {
    const selectedBk = document.getElementById('modal-filter-booking').value;
    const filteredData = selectedBk ? currentUnbilledData.filter(i => i.booking_no === selectedBk) : currentUnbilledData;
    renderUnbilledTable(filteredData);
};

function renderUnbilledTable(data) {
    const tbody = document.getElementById('unbilled-tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">ไม่พบตู้ตกค้าง</td></tr>`; return; }

    data.forEach(row => {
        const tripFee = (Number(row.trip_fee) || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-2 text-center"><input type="checkbox" value="${row.order_id}" class="unbilled-cb w-4 h-4 text-amber-500 rounded" onchange="updateUnbilledCount()"></td>
                <td class="p-2 font-bold text-slate-700">${row.booking_no}</td>
                <td class="p-2 text-slate-500">${row.run_date ? row.run_date.split('T')[0] : ''}</td>
                <td class="p-2 font-bold text-blue-600">${row.container_1_no || row.container_2_no || '-'}</td>
                <td class="p-2 font-bold text-slate-600">${row.leg1_plate || '-'}</td>
                <td class="p-2 text-slate-500">${row.origin || ''} ➔ ${row.destination || ''}</td>
                <td class="p-2 text-right font-bold text-slate-800">${tripFee}</td>
            </tr>
        `;
    });
    updateUnbilledCount();
}

window.toggleSelectAllUnbilled = function(masterCb) {
    document.querySelectorAll('.unbilled-cb').forEach(cb => cb.checked = masterCb.checked);
    updateUnbilledCount();
};

window.updateUnbilledCount = function() {
    const selected = document.querySelectorAll('.unbilled-cb:checked');
    if(document.getElementById('unbilled-selected-count')) document.getElementById('unbilled-selected-count').innerText = `เลือกไว้ ${selected.length} รายการ`;
};

window.appendSelectedUnbilled = function() {
    const selectedCbs = document.querySelectorAll('.unbilled-cb:checked');
    if (selectedCbs.length === 0) { alert("⚠️ กรุณาติ๊กเลือกตู้อย่างน้อย 1 รายการ"); return; }
    const selectedOrderIds = Array.from(selectedCbs).map(cb => Number(cb.value));
    const itemsToAdd = currentUnbilledData.filter(i => selectedOrderIds.includes(i.order_id));
    const existingData = hotDetailInstance.getSourceData();
    itemsToAdd.forEach(item => { item._selected = true; existingData.push(item); });
    hotDetailInstance.loadData(existingData); calculateDetailSummary(); closeUnbilledModal();
    alert(`✅ เพิ่มตู้ตกค้าง ${itemsToAdd.length} รายการสำเร็จ!`);
};

// ==========================================
// 📌 TAB 3: IV LIST VIEW
// ==========================================
window.loadIvSummaryData = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    const overlay = document.getElementById('iv-loading-overlay');
    if(overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/iv-summary?year=${year}&month=${month}`);
        const result = await response.json();
        if (result.success && result.data) {
            rawIvList = result.data.map(i => { i.disp_bookings = (i.booking_list || []).join(', '); return i; });
            initIvGrid(rawIvList);
        }
    } catch (err) { console.error(err); } 
    finally { if(overlay) overlay.classList.add('hidden'); }
};

function initIvGrid(data) {
    const container = document.getElementById('iv-grid-container');
    if (!container) return;
    if (hotIvInstance) { hotIvInstance.destroy(); }

    hotIvInstance = new Handsontable(container, {
        data: data, wordWrap: false, autoRowSize: false, rowHeights: 30,
        colHeaders: ['เลขที่ IV (Invoice)', 'เลขที่ AR', 'ชื่อลูกค้า', 'รายการ Booking ที่รวม', 'จำนวนตู้', 'ค่าบรรทุกรวม (บาท)', 'ค่าใช้จ่ายอื่นรวม', 'ยอดเงินรวม (บาท)'],
        columns: [
            { data: 'iv_no', readOnly: true, className: 'htMiddle zone-read', renderer: function(i,td,r,c,p,v) { Handsontable.renderers.HtmlRenderer.apply(this,arguments); td.innerHTML = `<div class="flex items-center justify-between w-full h-full px-1"><span class="font-bold text-emerald-800">${v||''}</span><button onclick="window.open('/print-invoice.html?iv=${encodeURIComponent(v)}', '_blank')" class="bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-300 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">🖨️ พิมพ์ใบแนบ A4</button></div>`; } },
            { data: 'ar_no', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-red-700 zone-read' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle zone-read' },
            { data: 'disp_bookings', type: 'text', readOnly: true, className: 'text-slate-600 htMiddle zone-read' },
            { data: 'total_containers', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 zone-read' },
            { data: 'total_trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read' },
            { data: 'total_other_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read' },
            { data: 'grand_total', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 zone-read' }
        ],
        colWidths: [180, 120, 150, 220, 80, 120, 110, 140],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}

window.filterIvGrid = function() {
    const searchTxt = document.getElementById('filter-iv-search').value.toLowerCase().trim();
    initIvGrid(rawIvList.filter(i => JSON.stringify(i).toLowerCase().includes(searchTxt)));
};