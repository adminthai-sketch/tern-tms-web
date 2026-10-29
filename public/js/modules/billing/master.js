// ==========================================
// 💸 MODULE: MASTER BOOKING LIST
// ==========================================

let hotMasterInstance = null;
let rawShipmentList = [];      
let masterBookingList = [];    
let filteredMasterList = [];   
let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if(currentUser.fullname) document.getElementById('user-fullname').innerText = currentUser.fullname;
    if(currentUser.role) document.getElementById('user-role-badge').innerText = currentUser.role.toUpperCase();
    
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
            .badge-partial { background-color: #fffbebfb; color: #d97706; border: 1px solid #fcd34d; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .badge-billed { background-color: #f0fdf4; color: #10b981; border: 1px solid #6ee7b7; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: bold; }
        `;
        document.head.appendChild(style);
    }
}

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
            const bkMap = {};
            rawShipmentList.forEach(item => {
                const bk = item.booking_no;
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk, run_date: item.run_date ? item.run_date.split('T')[0] : '',
                        customer_name: item.customer_name || '', origin: item.origin || '', destination: item.destination || '',
                        total_count: 0, billed_count: 0, total_amount: 0,
                        iv_numbers: new Set(), ar_numbers: new Set(), shipments: []
                    };
                }
                bkMap[bk].total_count += 1;
                if (item.iv_no && item.iv_no.trim() !== '') {
                    bkMap[bk].billed_count += 1; bkMap[bk].iv_numbers.add(item.iv_no.trim());
                }
                if (item.ar_no && item.ar_no.trim() !== '') bkMap[bk].ar_numbers.add(item.ar_no.trim());
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
            updateMasterFilterDropdowns(); handleMasterFilter();
        }
    } catch (err) { console.error(err); } 
    finally { document.getElementById('master-loading-overlay').classList.add('hidden'); }
};

function updateMasterFilterDropdowns() {
    const dates = new Set(), custs = new Set(), books = new Set();
    masterBookingList.forEach(i => {
        if (i.run_date) dates.add(i.run_date);
        if (i.customer_name) custs.add(i.customer_name.trim());
        if (i.booking_no) books.add(i.booking_no.trim());
    });
    const dlDate = document.getElementById('dl-run-date'), dlCust = document.getElementById('dl-customer'), dlBook = document.getElementById('dl-booking-no');
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleMasterFilter = function() {
    const d = document.getElementById('filter-run-date').value, c = document.getElementById('filter-customer').value, b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();
    filteredMasterList = masterBookingList.filter(item => {
        return (!d || item.run_date === d) && (!c || (item.customer_name && item.customer_name.trim() === c)) && 
               (!b || (item.booking_no && item.booking_no.trim() === b)) && (!searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt));
    });
    updateMasterKPI(filteredMasterList); initMasterGrid(filteredMasterList);
};

window.clearMasterFilters = function() {
    document.getElementById('filter-run-date').value = ''; document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = ''; document.getElementById('global-search').value = ''; 
    handleMasterFilter();
};

window.setQuickMasterFilter = function(type) {
    filteredMasterList = type === 'pending' ? masterBookingList.filter(item => item.billed_count < item.total_count) : masterBookingList.filter(item => item.billed_count > 0);
    updateMasterKPI(filteredMasterList); initMasterGrid(filteredMasterList);
};

function updateMasterKPI(dataList) {
    let pendingBk = 0, pendingCt = 0, pendingAmt = 0, billedBk = 0, billedCt = 0, billedAmt = 0;
    dataList.forEach(item => {
        if (item.billed_count === 0) { pendingBk++; pendingCt += item.total_count; pendingAmt += item.total_amount; }
        else { billedBk++; billedCt += item.billed_count; billedAmt += item.total_amount; }
    });
    document.getElementById('stat-pending-bk').innerText = `${pendingBk} Booking`; document.getElementById('stat-pending-ct').innerText = `${pendingCt} ตู้`; document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    document.getElementById('stat-billed-bk').innerText = `${billedBk} Booking`; document.getElementById('stat-billed-ct').innerText = `${billedCt} ตู้`; document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

// 🌟 ส่งเลข Booking ข้ามไฟล์ไปหน้า Detail
window.openBookingDetail = function(bookingNo) {
    window.location.href = `/billing-detail.html?booking=${encodeURIComponent(bookingNo)}`;
};

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) { hotMasterInstance.destroy(); }

    hotMasterInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}], wordWrap: false, autoRowSize: false, rowHeights: 30, fixedColumnsLeft: 2,
        colHeaders: ['Booking No.', 'สถานะ', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุก (บาท)', 'เลขที่ IV ✏️', 'เลขที่ AR ✏️'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle zone-read', renderer: function(i, td, r, c, p, v) { Handsontable.renderers.HtmlRenderer.apply(this, arguments); td.innerHTML = `<div class="flex items-center justify-between w-full h-full px-1"><span class="font-bold text-purple-700">${v || ''}</span><button onclick="openBookingDetail('${v}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-2 py-0.5 rounded text-[10px] font-bold transition-colors shadow-sm">เปิดวางบิล 🔍</button></div>`; } },
            { data: 'billing_status', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: function(i, td, r, c, p, v) { Handsontable.renderers.HtmlRenderer.apply(this, arguments); td.style.textAlign = 'center'; if(v.includes('วางบิลครบ')) td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> ${v}</span>`; else if(v.includes('วางบิลแล้ว')) td.innerHTML = `<span class="badge-partial"><i class="fa-solid fa-clock-rotate-left"></i> ${v}</span>`; else td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> รอวางบิล</span>`; } },
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