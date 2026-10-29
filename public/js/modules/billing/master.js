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
        `;
        document.head.appendChild(style);
    }
}

window.loadBillingMasterData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    if (!monthInput) return;
    const [year, month] = monthInput.split('-');
    
    const overlay = document.getElementById('master-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

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
                        customer_name: item.customer_name || item.full_customer_name || '-', 
                        origin: item.origin || '-', 
                        destination: item.destination || '-',
                        total_count: 0, 
                        billed_count: 0, 
                        total_amount: 0,
                        iv_numbers: new Set(), 
                        ar_numbers: new Set(), 
                        shipments: []
                    };
                }
                
                // ถ้ารายการมี order_id ถือว่าจัดตู้แล้ว
                if (item.order_id) {
                    bkMap[bk].total_count += 1;
                    bkMap[bk].total_amount += (Number(item.trip_fee) || 0);
                    
                    // นับตู้ที่มีเลข IV แล้ว
                    if (item.iv_no && item.iv_no.trim() !== '') {
                        bkMap[bk].billed_count += 1;
                        bkMap[bk].iv_numbers.add(item.iv_no.trim());
                    }
                    if (item.ar_no && item.ar_no.trim() !== '') {
                        bkMap[bk].ar_numbers.add(item.ar_no.trim());
                    }
                }
                bkMap[bk].shipments.push(item);
            });

            masterBookingList = Object.values(bkMap).map(b => {
                // คำนวณสถานะ
                if (b.total_count === 0) b.billing_status = 'ยังไม่จัดตู้';
                else if (b.billed_count === 0) b.billing_status = 'รอวางบิล';
                else if (b.billed_count < b.total_count) b.billing_status = `วางบิลแล้ว ${b.billed_count}/${b.total_count} ตู้`;
                else b.billing_status = `วางบิลครบ ${b.total_count}/${b.total_count} ตู้`;

                b.disp_iv = Array.from(b.iv_numbers).join(', ');
                b.disp_ar = Array.from(b.ar_numbers).join(', ');
                
                // กรณียังไม่มี order_id ให้ยึดตามหน้าสร้าง Booking ไปก่อน
                if (b.total_count === 0 && b.shipments.length > 0) {
                    b.total_count = Number(b.shipments[0].container_count) || 1;
                    b.total_amount = (Number(b.shipments[0].booking_trip_fee) || 0) * b.total_count;
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
        if (overlay) overlay.classList.add('hidden'); 
    }
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
    const d = document.getElementById('filter-run-date') ? document.getElementById('filter-run-date').value : '';
    const c = document.getElementById('filter-customer') ? document.getElementById('filter-customer').value : '';
    const b = document.getElementById('filter-booking-no') ? document.getElementById('filter-booking-no').value : '';
    const searchTxt = document.getElementById('global-search') ? document.getElementById('global-search').value.toLowerCase().trim() : '';

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
        if (document.getElementById(id)) document.getElementById(id).value = '';
    });
    handleMasterFilter();
};

window.setQuickMasterFilter = function(type) {
    if (type === 'all') {
        filteredMasterList = [...masterBookingList];
    } else if (type === 'pending') {
        filteredMasterList = masterBookingList.filter(item => item.billed_count < item.total_count || item.total_count === 0);
    } else if (type === 'billed') {
        filteredMasterList = masterBookingList.filter(item => item.billed_count > 0);
    }
    updateMasterKPI(filteredMasterList);
    initMasterGrid(filteredMasterList);
};

function updateMasterKPI(dataList) {
    let pendingBk = 0, pendingCt = 0, pendingAmt = 0;
    let billedBk = 0, billedCt = 0, billedAmt = 0;
    
    dataList.forEach(item => {
        if (item.billed_count === 0 || item.billed_count < item.total_count) { 
            pendingBk++; 
            pendingCt += (item.total_count - item.billed_count); 
            // ประมาณการเงินค้าง (เฉลี่ยต่อตู้)
            const unitPrice = item.total_count > 0 ? (item.total_amount / item.total_count) : 0;
            pendingAmt += (unitPrice * (item.total_count - item.billed_count)); 
        } 
        if (item.billed_count > 0) { 
            billedBk++; 
            billedCt += item.billed_count; 
            const unitPrice = item.total_count > 0 ? (item.total_amount / item.total_count) : 0;
            billedAmt += (unitPrice * item.billed_count); 
        }
    });
    
    if(document.getElementById('stat-pending-bk')) document.getElementById('stat-pending-bk').innerText = `${pendingBk} Booking`;
    if(document.getElementById('stat-pending-ct')) document.getElementById('stat-pending-ct').innerText = `${pendingCt} ตู้`;
    if(document.getElementById('stat-pending-amt')) document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    
    if(document.getElementById('stat-billed-bk')) document.getElementById('stat-billed-bk').innerText = `${billedBk} Booking`;
    if(document.getElementById('stat-billed-ct')) document.getElementById('stat-billed-ct').innerText = `${billedCt} ตู้`;
    if(document.getElementById('stat-billed-amt')) document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

window.openBookingDetail = function(bookingNo) {
    if (!bookingNo) return;
    window.location.href = `/billing-detail.html?booking=${encodeURIComponent(bookingNo)}`;
};

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) { hotMasterInstance.destroy(); }

    const bookingLinkRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const valStr = value ? String(value) : '';
        if (valStr.includes('ไม่พบ')) { td.innerHTML = `<span class="text-slate-400 italic">${valStr}</span>`; return; }
        
        td.innerHTML = valStr ? `
            <div class="flex items-center justify-between w-full h-full px-2">
                <span class="font-bold text-purple-700">${valStr}</span>
                <button onclick="openBookingDetail('${valStr}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-3 py-1 rounded text-[10px] font-bold transition-colors shadow-sm cursor-pointer">
                    เปิดวางบิล 🔍
                </button>
            </div>
        ` : '';
    };

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.textAlign = 'center'; 
        if (!value) return; 
        if(value.includes('วางบิลครบ')) td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> ${value}</span>`; 
        else if(value.includes('วางบิลแล้ว')) td.innerHTML = `<span class="badge-partial"><i class="fa-solid fa-clock-rotate-left"></i> ${value}</span>`; 
        else td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> ${value}</span>`; 
    };

    const tableData = data.length > 0 ? data : [
        { booking_no: 'ไม่พบรายการข้อมูล', billing_status: '-', run_date: '-', customer_name: '-', origin: '-', destination: '-', total_count: 0, total_amount: 0, disp_iv: '-', disp_ar: '-' }
    ];

    hotMasterInstance = new Handsontable(container, {
        data: tableData,
        wordWrap: false, autoRowSize: false, rowHeights: 36, fixedColumnsLeft: 1,
        colHeaders: ['Booking No. (กดปุ่มเพื่อเปิดบิล)', 'สถานะ', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุกรวม (บาท)', 'เลขที่ IV ✏️', 'เลขที่ AR ✏️'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle bg-slate-50', renderer: bookingLinkRenderer },
            { data: 'billing_status', type: 'text', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: statusRenderer },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle bg-slate-50' },
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle bg-slate-50' },
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle bg-slate-50' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 bg-slate-50' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 bg-slate-50' },
            { data: 'disp_iv', type: 'text', className: 'htCenter htMiddle font-bold text-emerald-800 uppercase bg-white' },
            { data: 'disp_ar', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase bg-white' }
        ],
        colWidths: [220, 110, 100, 180, 120, 120, 80, 140, 150, 150],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}

window.saveMasterBillingChanges = async function() {
    if (!hotMasterInstance) return;
    
    const masterData = hotMasterInstance.getSourceData();
    const dataToSave = [];
    
    masterData.forEach(bkRow => {
        if (!bkRow || !bkRow.booking_no || bkRow.booking_no.includes('ไม่พบรายการ')) return;
        const shipments = rawShipmentList.filter(s => s.booking_no === bkRow.booking_no);
        shipments.forEach(s => {
            if (bkRow.disp_iv !== undefined) s.iv_no = bkRow.disp_iv.trim();
            if (bkRow.disp_ar !== undefined) s.ar_no = bkRow.disp_ar.trim();
            dataToSave.push(s);
        });
    });

    if (dataToSave.length === 0) return;

    try {
        const res = await fetch('/api/billing/shipments', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: dataToSave }) 
        });
        const result = await res.json();
        if (result.success) { 
            alert('✅ บันทึกเลข IV และ AR เรียบร้อยแล้ว!'); 
            loadBillingMasterData(); 
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch (err) { 
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); 
    }
};