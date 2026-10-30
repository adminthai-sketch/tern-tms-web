let hotDetailInstance = null;
let allRawShipments = [];       // ข้อมูลตู้ทั้งหมดในเดือน
let filteredShipments = [];     // ข้อมูลตู้ที่ผ่านการกรอง

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName || 'Admin';

    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('input-billing-date').value = today.toISOString().split('T')[0];

    const urlParams = new URLSearchParams(window.location.search);
    const initialBooking = urlParams.get('booking');

    await loadDetailData();

    if (initialBooking) {
        document.getElementById('select-booking-no').value = initialBooking;
        handleCrossFilterDetail();
    }
});

window.loadDetailData = async function() {
    const [year, month] = document.getElementById('filter-month').value.split('-');
    document.getElementById('detail-loading-overlay').classList.remove('hidden');

    try {
        const res = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        
        if (result.success && result.data) {
            allRawShipments = result.data.filter(i => i.order_id).map(item => {
                item._selected = true; // ติ๊กเป็นค่าเริ่มต้น
                return item;
            });
            updateDetailFilterDropdowns();
            handleCrossFilterDetail();
        } else {
            allRawShipments = [];
            initDetailGrid([]);
        }
    } catch(e) { 
        console.error(e); 
        initDetailGrid([]);
    } finally { 
        document.getElementById('detail-loading-overlay').classList.add('hidden'); 
    }
};

// 🌟 Cross-Filtering สำหรับหน้า Detail
window.handleCrossFilterDetail = function() {
    updateDetailFilterDropdowns();
    applyDetailFilter();
};

function updateDetailFilterDropdowns() {
    const dVal = (document.getElementById('filter-run-date')?.value || '').trim();
    const cVal = (document.getElementById('filter-customer')?.value || '').trim();
    const bVal = (document.getElementById('select-booking-no')?.value || '').trim();

    const dates = new Set(), custs = new Set(), books = new Set();

    allRawShipments.forEach(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
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

function applyDetailFilter() {
    const d = document.getElementById('filter-run-date')?.value || '';
    const c = document.getElementById('filter-customer')?.value || '';
    const b = document.getElementById('select-booking-no')?.value || '';

    filteredShipments = allRawShipments.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';
        return (!d || iD === d) && (!c || iC === c) && (!b || iB === b);
    });

    if (filteredShipments.length > 0) {
        const first = filteredShipments[0];
        document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name;
        document.getElementById('info-tax-id').innerText = first.tax_id || '-';
        document.getElementById('info-address').innerText = first.address || '-';
        
        // ถ้ากรองเหลือ 1 Booking ดึงค่า IV/AR มาหยอดใส่ฟอร์ม
        if (b) {
            const hasIv = filteredShipments.find(s => s.iv_no);
            if (hasIv) {
                document.getElementById('input-iv-no').value = hasIv.iv_no;
                document.getElementById('input-ar-no').value = hasIv.ar_no || '';
            }
        }
    }

    initDetailGrid(filteredShipments);
    calculateDetailSummary();
}

window.clearDetailFilters = function() {
    ['filter-run-date', 'filter-customer', 'select-booking-no'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    updateDetailFilterDropdowns();
    applyDetailFilter();
};

window.toggleSelectAll = function(isChecked) {
    if (!hotDetailInstance) return;
    const data = hotDetailInstance.getSourceData();
    data.forEach(r => r._selected = isChecked);
    hotDetailInstance.render();
    calculateDetailSummary();
};

// 🌟 คำนวณสรุปยอดรวม ค่าขนส่ง + ค่าผ่านท่า/ฝาก/ยก/ชอร์
window.calculateDetailSummary = function() {
    if (!hotDetailInstance) return;
    let selectedCount = 0;
    let sumTrip = 0;
    let sumOther = 0;

    hotDetailInstance.getSourceData().forEach(row => {
        if (row._selected) { 
            selectedCount += 1; 
            sumTrip += (Number(row.trip_fee) || 0);
            sumOther += (Number(row.port_pass_fee) || 0) + 
                        (Number(row.deposit_fee) || 0) + 
                        (Number(row.lift_fee) || 0) + 
                        (Number(row.shore_fee) || 0) +
                        (Number(row.other_expense) || 0);
        }
    });

    const grandTotal = sumTrip + sumOther;

    document.getElementById('selected-containers-badge').innerText = `เลือกอยู่ ${selectedCount} ตู้`;
    document.getElementById('sum-qty').innerText = selectedCount.toLocaleString();
    document.getElementById('sum-trip-fee').innerText = sumTrip.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-other-fee').innerText = sumOther.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-grand-total').innerText = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2});
};

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (!container) return;
    if (hotDetailInstance) hotDetailInstance.destroy();

    const ivRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.TextRenderer.apply(this, arguments);
        td.style.fontWeight = 'bold';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        if (value) {
            td.style.backgroundColor = '#ecfdf5';
            td.style.color = '#065f46';
        } else {
            td.style.backgroundColor = '#fff1f2';
            td.style.color = '#be123c';
            td.innerText = 'รอออก IV';
        }
    };

    hotDetailInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 30, fixedColumnsLeft: 2,
        colHeaders: [
            'เลือก', 'Order ID', 'Booking', 'วันที่วิ่ง', 'เบอร์ตู้', 'ขนาด', 'ทะเบียน', 
            'เลขที่ IV (Invoice)', 'เลขที่ AR', 'ค่าบรรทุก (บาท)', 
            'ค่าผ่านท่า', 'ค่าฝากตู้', 'ค่ายกตู้', 'ค่าชอร์', 'น้ำหนัก (กก.)', 'หมายเหตุ'
        ],
        columns: [
            { data: '_selected', type: 'checkbox', className: 'htCenter htMiddle bg-slate-50' },
            { data: 'order_id', readOnly: true, className: 'htCenter htMiddle font-bold bg-slate-50 text-slate-400' },
            { data: 'booking_no', readOnly: true, className: 'htCenter htMiddle font-bold text-purple-700 bg-slate-50' },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'container_1_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 bg-slate-50' },
            { data: 'container_size', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'leg1_plate', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            
            // เลข IV / AR แก้ไขได้เฉพาะแถว
            { data: 'iv_no', type: 'text', renderer: ivRenderer },
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase bg-white' },
            
            // การเงินและค่าใช้จ่ายสำรอง
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50/30' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'billing_remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [45, 110, 120, 85, 105, 50, 80, 130, 110, 100, 75, 75, 75, 75, 80, 120],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) {
            if (src !== 'loadData') calculateDetailSummary();
        }
    });
}

// 🌟 บันทึกเลข IV / AR ลงเฉพาะตู้ที่ติ๊กเลือก [✔]
window.applyBatchIvToSelected = async function() {
    if (!hotDetailInstance) return;
    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const sourceData = hotDetailInstance.getSourceData();
    const selectedRows = sourceData.filter(r => r._selected && r.order_id);

    if (selectedRows.length === 0) {
        alert('กรุณาติ๊กเลือกตู้อย่างน้อย 1 ตู้ที่ต้องการวางบิลครับ');
        return;
    }

    if (!ivNo) {
        if (!confirm('คุณไม่ได้ระบุเลขที่ IV ต้องการบันทึกเป็นตู้รอวางบิล (ล้างเลข IV) ใช่หรือไม่?')) return;
    }

    selectedRows.forEach(row => {
        row.iv_no = ivNo;
        row.ar_no = arNo;
        row.billing_date = billingDate;
    });

    try {
        const res = await fetch('/api/billing/shipments', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: selectedRows }) 
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ บันทึกเลข IV: ${ivNo || 'ล้างเลข'} ให้กับตู้ที่เลือกจำนวน ${selectedRows.length} ตู้เรียบร้อย!`);
            hotDetailInstance.render();
            calculateDetailSummary();
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    }
};

window.printCurrentInvoice = function() {
    const ivNo = document.getElementById('input-iv-no').value.trim();
    const bookingNo = document.getElementById('select-booking-no').value.trim();

    if (ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
    else if (bookingNo) window.open(`/print-invoice.html?booking=${encodeURIComponent(bookingNo)}`, '_blank');
    else alert('กรุณาระบุเลข IV หรือเลือก Booking เพื่อพิมพ์ใบแนบครับ');
};