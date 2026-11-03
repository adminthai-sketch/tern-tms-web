let hotIvDetailInstance = null;
let currentIvNo = '';
let currentIvContainers = [];

window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentIvNo = (urlParams.get('iv') || urlParams.get('iv_no') || '').trim();

    if (!currentIvNo) {
        alert('⚠️ ไม่พบเลข IV ที่ต้องการเปิด');
        window.location.href = '/billing-iv.html';
        return;
    }

    document.getElementById('header-iv-no').innerText = currentIvNo;
    await loadIvDetailData();
});

async function loadIvDetailData() {
    const overlay = document.getElementById('iv-detail-loading');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const res = await fetch(`/api/billing/iv-detail?iv=${encodeURIComponent(currentIvNo)}&_t=${Date.now()}`);
        const result = await res.json();

        if (!result.success) {
            alert('❌ เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: ' + (result.message || 'Server error'));
            return;
        }

        if (result.data && result.data.length > 0) {
            currentIvContainers = result.data;
            const first = currentIvContainers[0];

            // แสดงข้อมูลลูกค้า
            document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name || '-';
            document.getElementById('info-tax-id').innerText = first.tax_id || '-';
            document.getElementById('info-address').innerText = first.address || '-';

            // แสดงข้อมูล Header
            document.getElementById('input-billing-status').value = first.billing_status || 'รอวางบิล';
            if (first.billing_date) document.getElementById('input-billing-date').value = String(first.billing_date).split('T')[0];
            if (first.payment_date) document.getElementById('input-payment-date').value = String(first.payment_date).split('T')[0];
            document.getElementById('input-receipt-no').value = first.receipt_no || '';

            updateBadgeStatus(first.billing_status);
            initIvDetailGrid(currentIvContainers);
            calculateIvDetailSummary();
        } else {
            alert(`❌ ไม่พบรายการตู้ในใบแจ้งหนี้เลขที่ ${currentIvNo}`);
            window.location.href = '/billing-iv.html';
        }
    } catch (e) {
        console.error("Load IV Detail Error:", e);
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้: ' + e.message);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
}

function updateBadgeStatus(status) {
    const badge = document.getElementById('badge-status');
    if (!badge) return;
    badge.innerText = status || 'รอวางบิล';
    badge.className = 'font-bold px-2 py-0.5 rounded text-[11px]';
    if (status === 'รอวางบิล') badge.classList.add('bg-amber-100', 'text-amber-700');
    else if (status === 'วางบิลแล้ว') badge.classList.add('bg-blue-100', 'text-blue-700');
    else if (status === 'รับชำระแล้ว') badge.classList.add('bg-emerald-100', 'text-emerald-700');
    else if (status === 'ยกเลิก') badge.classList.add('bg-red-100', 'text-red-700');
    else badge.classList.add('bg-slate-200', 'text-slate-700');
}

function calculateIvDetailSummary() {
    if (!hotIvDetailInstance) return;
    const data = hotIvDetailInstance.getSourceData();

    let sumTrip = 0;
    let sumOther = 0;

    data.forEach(r => {
        sumTrip += (Number(r.trip_fee) || 0);
        sumOther += (Number(r.port_pass_fee) || 0) + 
                    (Number(r.deposit_fee) || 0) + 
                    (Number(r.lift_fee) || 0) + 
                    (Number(r.shore_fee) || 0) +
                    (Number(r.other_expense) || 0);
    });

    const grandTotal = sumTrip + sumOther;

    document.getElementById('sum-qty').innerText = data.length.toLocaleString();
    document.getElementById('sum-trip-fee').innerText = sumTrip.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-other-fee').innerText = sumOther.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-grand-total').innerText = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2});
}

function initIvDetailGrid(data) {
    const container = document.getElementById('iv-detail-grid');
    if (!container) return;
    if (hotIvDetailInstance) hotIvDetailInstance.destroy();

    hotIvDetailInstance = new Handsontable(container, {
        data: data,
        wordWrap: false, autoRowSize: false, rowHeights: 30, fixedColumnsLeft: 2,
        colHeaders: [
            'Order ID', 'Booking', 'วันที่วิ่ง', 'เบอร์ตู้', 'ขนาด', 'ทะเบียน', 
            'เลขที่ AR', 'ค่าบรรทุก (บาท)', 'ค่าผ่านท่า', 'ค่าฝากตู้', 
            'ค่ายกตู้', 'ค่าชอร์', 'น้ำหนัก (กก.)', 'หมายเหตุตู้'
        ],
        columns: [
            { data: 'order_id', readOnly: true, className: 'htCenter htMiddle font-bold bg-slate-50 text-slate-400' },
            { data: 'booking_no', readOnly: true, className: 'htCenter htMiddle font-bold text-purple-700 bg-slate-50' },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'container_1_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 bg-slate-50' },
            { data: 'container_size', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'leg1_plate', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle uppercase font-bold text-red-600' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'billing_remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [110, 120, 85, 105, 50, 80, 110, 100, 75, 75, 75, 75, 80, 150],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) {
            if (src !== 'loadData' && changes) {
                calculateIvDetailSummary();
            }
        }
    });
}

window.saveAllIvDetails = async function() {
    if (!hotIvDetailInstance) return;

    const overlay = document.getElementById('iv-detail-loading');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const status = document.getElementById('input-billing-status').value;
        const bDate = document.getElementById('input-billing-date').value || null;
        const pDate = document.getElementById('input-payment-date').value || null;
        const rNo = (document.getElementById('input-receipt-no').value || '').trim() || null;

        await fetch('/api/billing/update-iv-header', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                iv_no: currentIvNo,
                billing_status: status,
                billing_date: bDate,
                payment_date: pDate,
                receipt_no: rNo
            })
        });

        const containersData = hotIvDetailInstance.getSourceData();
        await fetch('/api/billing/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: containersData })
        });

        alert('✅ บันทึกข้อมูลใบแจ้งหนี้เรียบร้อย!');
        await loadIvDetailData();
    } catch (err) {
        alert('❌ บันทึกล้มเหลว: ' + err.message);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

window.printInvoiceA4 = function() {
    if (!currentIvNo) return;
    window.open(`/print-invoice.html?iv=${encodeURIComponent(currentIvNo)}`, '_blank');
};