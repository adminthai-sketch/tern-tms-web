let hotMasterInstance = null;
let rawShipmentList = [];      
let masterBookingList = [];    
let filteredMasterList = [];   

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName || 'Admin';
    
    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    await loadBillingMasterData();
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style');
        style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #cbd5e1; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #1e293b; font-weight: 700 !important; border-color: #94a3b8; font-size: 11px !important; }
            .badge-pending { background-color: #fef2f2; color: #ef4444; border: 1px solid #fca5a5; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-partial { background-color: #fffbeb; color: #d97706; border: 1px solid #fcd34d; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-billed { background-color: #f0fdf4; color: #10b981; border: 1px solid #6ee7b7; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .iv-pill { display: inline-block; background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 1px 4px; border-radius: 4px; font-weight: 700; margin: 1px; font-size: 10px; }
        `;
        document.head.appendChild(style);
    }
}

window.loadBillingMasterData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    if (!monthInput) return;
    const [year, month] = monthInput.split('-');
    
    document.getElementById('master-loading-overlay').classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            rawShipmentList = result.data;
            const bkMap = {};
            
            rawShipmentList.forEach(item => {
                const bk = item.booking_no;
                if (!bk) return;
                
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk, 
                        run_date: item.run_date ? String(item.run_date).split('T')[0] : '',
                        customer_name: item.customer_name || '-', 
                        origin: item.origin || '-', 
                        destination: item.destination || '-',
                        total_count: 0, 
                        billed_count: 0, 
                        total_amount: 0,
                        billed_amount: 0,
                        pending_amount: 0,
                        iv_map: {}, // { "IV2026-001": [ตู้1, ตู้2] }
                        ar_numbers: new Set(),
                        shipments: []
                    };
                }
                
                if (item.order_id) {
                    bkMap[bk].total_count += 1;
                    const fee = Number(item.trip_fee) || 0;
                    bkMap[bk].total_amount += fee;
                    
                    if (item.iv_no && item.iv_no.trim() !== '') {
                        const ivClean = item.iv_no.trim();
                        bkMap[bk].billed_count += 1;
                        bkMap[bk].billed_amount += fee;
                        if (!bkMap[bk].iv_map[ivClean]) bkMap[bk].iv_map[ivClean] = [];
                        bkMap[bk].iv_map[ivClean].push(item.container_1_no || item.order_id);
                    } else {
                        bkMap[bk].pending_amount += fee;
                    }
                    
                    if (item.ar_no && item.ar_no.trim() !== '') bkMap[bk].ar_numbers.add(item.ar_no.trim());
                }
                bkMap[bk].shipments.push(item);
            });

            masterBookingList = Object.values(bkMap).map(b => {
                const pendingCount = b.total_count - b.billed_count;
                b.pending_count = pendingCount;
                
                // คำนวณ Badge สถานะ
                if (b.total_count === 0) b.billing_status = 'ยังไม่จัดตู้';
                else if (b.billed_count === 0) b.billing_status = `รอวางบิล (${b.total_count} ตู้)`;
                else if (b.billed_count < b.total_count) b.billing_status = `วางบิลแล้ว ${b.billed_count}/${b.total_count} ตู้ (ค้าง ${pendingCount})`;
                else b.billing_status = `วางบิลครบแล้ว (${b.total_count} ตู้)`;

                // รวมชื่อ IV พร้อมบอกจำนวนตู้ในแต่ละ IV เช่น "IV-01 (2), IV-02 (1)"
                b.disp_iv = Object.keys(b.iv_map).map(iv => `${iv} (${b.iv_map[iv].length} ตู้)`).join(', ');
                b.disp_ar = Array.from(b.ar_numbers).join(', ');
                
                // กรณียังไม่มี order_id ให้ fallback ตาม booking_count
                if (b.total_count === 0 && b.shipments.length > 0) {
                    b.total_count = Number(b.shipments[0].booking_container_count) || 1;
                    b.total_amount = (Number(b.shipments[0].booking_trip_fee) || 0) * b.total_count;
                    b.pending_amount = b.total_amount;
                }
                return b;
            });

            updateMasterFilterDropdowns();
            handleMasterFilter();
        } else {
            initMasterGrid([]);
        }
    } catch (err) { 
        console.error(err); 
        initMasterGrid([]);
    } finally { 
        document.getElementById('master-loading-overlay').classList.add('hidden'); 
    }
};

// 🌟 Cross-Filtering สัมพันธ์กัน 3 ช่อง
window.handleCrossFilter = function() {
    updateMasterFilterDropdowns();
    handleMasterFilter();
};

function updateMasterFilterDropdowns() {
    const dVal = (document.getElementById('filter-run-date')?.value || '').trim();
    const cVal = (document.getElementById('filter-customer')?.value || '').trim();
    const bVal = (document.getElementById('filter-booking-no')?.value || '').trim();

    const dates = new Set(), custs = new Set(), books = new Set();

    masterBookingList.forEach(item => {
        const iD = item.run_date ? String(item.run_date).trim() : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';

        if ((!cVal || iC === cVal) && (!bVal || iB === bVal) && iD) dates.add(iD);
        if ((!dVal || iD === dVal) && (!bVal || iB === bVal) && iC && iC !== '-') custs.add(iC);
        if ((!dVal || iD === dVal) && (!cVal || iC === cVal) && iB) books.add(iB);
    });

    const dlDate = document.getElementById('dl-run-date');
    const dlCust = document.getElementById('dl-customer');
    const dlBook = document.getElementById('dl-booking-no');

    if (dlDate) { dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`); }
    if (dlCust) { dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`); }
    if (dlBook) { dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`); }
}

window.handleMasterFilter = function() {
    const d = document.getElementById('filter-run-date')?.value || '';
    const c = document.getElementById('filter-customer')?.value || '';
    const b = document.getElementById('filter-booking-no')?.value || '';
    const searchTxt = document.getElementById('global-search')?.value.toLowerCase().trim() || '';

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
    ['filter-run-date', 'filter-customer', 'filter-booking-no', 'global-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    updateMasterFilterDropdowns();
    handleMasterFilter();
};

window.setQuickMasterFilter = function(type) {
    if (type === 'all') filteredMasterList = [...masterBookingList];
    else if (type === 'pending') filteredMasterList = masterBookingList.filter(item => item.pending_count > 0 || item.total_count === 0);
    else if (type === 'billed') filteredMasterList = masterBookingList.filter(item => item.billed_count > 0);
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

function updateMasterKPI(dataList) {
    let pendingBk = 0, pendingCt = 0, pendingAmt = 0;
    let billedBk = 0, billedCt = 0, billedAmt = 0;
    
    dataList.forEach(item => {
        if (item.pending_count > 0) { 
            pendingBk++; 
            pendingCt += item.pending_count; 
            pendingAmt += item.pending_amount; 
        } 
        if (item.billed_count > 0) { 
            billedBk++; 
            billedCt += item.billed_count; 
            billedAmt += item.billed_amount; 
        }
    });
    
    document.getElementById('stat-pending-bk').innerText = `${pendingBk} Booking`;
    document.getElementById('stat-pending-ct').innerText = `${pendingCt} ตู้`;
    document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    
    document.getElementById('stat-billed-bk').innerText = `${billedBk} Booking`;
    document.getElementById('stat-billed-ct').innerText = `${billedCt} ตู้`;
    document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

window.openBookingDetail = function(bookingNo) {
    if (!bookingNo) return;
    window.location.href = `/billing-detail.html?booking=${encodeURIComponent(bookingNo)}`;
};

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) hotMasterInstance.destroy();

    const bookingLinkRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const valStr = value ? String(value) : '';
        if (valStr.includes('ไม่พบ')) { td.innerHTML = `<span class="text-slate-400 italic">${valStr}</span>`; return; }
        
        td.innerHTML = `
            <div class="flex items-center justify-between w-full h-full px-2">
                <span class="font-bold text-purple-700">${valStr}</span>
                <button onclick="openBookingDetail('${valStr}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-2 py-0.5 rounded text-[10px] font-bold transition-colors shadow-sm cursor-pointer">
                    เปิดวางบิล 🔍
                </button>
            </div>
        `;
    };

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.textAlign = 'center'; 
        if (!value) return; 
        if(value.includes('วางบิลครบ')) td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> ${value}</span>`; 
        else if(value.includes('วางบิลแล้ว')) td.innerHTML = `<span class="badge-partial"><i class="fa-solid fa-clock-rotate-left"></i> ${value}</span>`; 
        else td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> ${value}</span>`; 
    };

    const ivListRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        if (!value || value === '-') { td.innerHTML = '<span class="text-slate-300 italic text-[10px]">-</span>'; return; }
        const ivs = String(value).split(', ');
        td.innerHTML = ivs.map(iv => `<span class="iv-pill">${iv}</span>`).join(' ');
    };

    const tableData = data.length > 0 ? data : [
        { booking_no: 'ไม่พบรายการข้อมูล', billing_status: '-', run_date: '-', customer_name: '-', total_count: 0, pending_count: 0, disp_iv: '-', total_amount: 0, billed_amount: 0, pending_amount: 0 }
    ];

    hotMasterInstance = new Handsontable(container, {
        data: tableData,
        wordWrap: false, autoRowSize: false, rowHeights: 36, fixedColumnsLeft: 1,
        colHeaders: [
            'Booking No.', 'สถานะการวางบิล', 'วันที่วิ่งงาน', 'ลูกค้า', 
            'จำนวนตู้ทั้งหมด', 'ตู้ที่ยังค้าง', 'เลขที่ IV ที่ออกแล้ว (แยกตู้)', 
            'ยอดรวมสุทธิ (บาท)', 'วางบิลแล้ว (บาท)', 'ยอดเงินคงค้าง (บาท)'
        ],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle bg-slate-50', renderer: bookingLinkRenderer },
            { data: 'billing_status', type: 'text', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: statusRenderer },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle bg-slate-50' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/20' },
            { data: 'pending_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-red-600 bg-red-50/30' },
            { data: 'disp_iv', readOnly: true, className: 'htLeft htMiddle bg-white', renderer: ivListRenderer },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-slate-800' },
            { data: 'billed_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50/20' },
            { data: 'pending_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-red-600 bg-red-50/20' }
        ],
        colWidths: [220, 150, 95, 160, 85, 80, 200, 110, 110, 110],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}