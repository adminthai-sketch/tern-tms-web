let hotDetailInstance = null;
let rawShipmentList = [];
let activeCustomerId = null;
let activeBookingNo = null;

window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    activeBookingNo = urlParams.get('booking');
    if (activeBookingNo) {
        document.getElementById('select-booking-no').value = activeBookingNo;
        loadBookingsForDetail(activeBookingNo);
    }
});

async function loadBookingsForDetail(targetBooking) {
    document.getElementById('detail-loading-overlay').classList.remove('hidden');
    const today = new Date();
    const [year, month] = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0')];

    try {
        const res = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        
        if (result.success && result.data) {
            const shipments = result.data.filter(s => s.booking_no === targetBooking);
            if (shipments.length > 0) {
                const first = shipments[0];
                activeCustomerId = first.customer_id;
                document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name;
                document.getElementById('info-booking-no').innerText = first.booking_no;
                
                const filledIv = shipments.find(s => s.iv_no);
                document.getElementById('input-iv-no').value = filledIv ? filledIv.iv_no : '';
                document.getElementById('input-ar-no').value = filledIv ? filledIv.ar_no : '';
                
                shipments.forEach(s => s._selected = true);
                initDetailGrid(shipments);
                calculateDetailSummary();
            }
        }
    } catch (e) { console.error(e); } 
    finally { document.getElementById('detail-loading-overlay').classList.add('hidden'); }
}

window.calculateDetailSummary = function() {
    if (!hotDetailInstance) return;
    let totalQty = 0, totalPrice = 0;
    hotDetailInstance.getSourceData().forEach(row => {
        if (row._selected) { totalQty += 1; totalPrice += (Number(row.trip_fee) || 0); }
    });
    document.getElementById('sum-qty').innerText = totalQty.toLocaleString();
    document.getElementById('sum-total-amount').innerText = totalPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-unit-price').innerText = (totalQty > 0 ? (totalPrice/totalQty) : 0).toLocaleString('en-US', {minimumFractionDigits: 2});
};

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (hotDetailInstance) hotDetailInstance.destroy();

    hotDetailInstance = new Handsontable(container, {
        data: data, wordWrap: false, autoRowSize: false, rowHeights: 28, fixedColumnsLeft: 2,
        colHeaders: ['เลือก', 'Order ID', 'วันที่', 'เบอร์ตู้', 'ขนาด', 'ต้นทาง', 'ปลายทาง', 'น้ำหนัก', 'ค่าบรรทุก', 'ผ่านท่า', 'ฝากตู้', 'ยกตู้', 'ชอร์'],
        columns: [
            { data: '_selected', type: 'checkbox', className: 'htCenter htMiddle bg-slate-50' },
            { data: 'order_id', readOnly: true, className: 'htCenter htMiddle font-bold bg-slate-50' },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'container_1_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 bg-slate-50' },
            { data: 'container_size', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'origin', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'destination', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle font-bold' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle font-bold text-emerald-700' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' }
        ],
        colWidths: [45, 110, 90, 110, 60, 100, 100, 80, 100, 80, 80, 80, 80],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) { if(src !== 'loadData') calculateDetailSummary(); }
    });
}

window.saveDetailBillingChanges = async function() {
    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const dataToSave = hotDetailInstance.getSourceData().map(row => {
        if (row._selected) { row.iv_no = ivNo; row.ar_no = arNo; row.billing_date = billingDate; } 
        return row;
    });

    try {
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave }) });
        const result = await res.json();
        if (result.success) { alert(`✅ บันทึกข้อมูลตู้สำเร็จ!`); }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};

window.printCurrentInvoice = function() {
    const ivNo = document.getElementById('input-iv-no').value.trim();
    if (ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
    else if (activeBookingNo) window.open(`/print-invoice.html?booking=${encodeURIComponent(activeBookingNo)}`, '_blank');
};