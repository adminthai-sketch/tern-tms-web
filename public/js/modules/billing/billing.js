// ==========================================
// 💸 MODULE: BILLING & INVOICING WORKFLOW
// ==========================================

let hotGridInstance = null;
let allBookingsList = []; 
let currentBookingShipments = []; 
let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    await loadBookingOptions();
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
        `;
        document.head.appendChild(style);
    }
}

// 1. โหลดตัวเลือก Booking ทั้งหมดประจำเดือน
async function loadBookingOptions() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();

        if (result.success && result.data) {
            allBookingsList = result.data;
            const bookingSet = new Set();
            allBookingsList.forEach(i => { if (i.booking_no) bookingSet.add(i.booking_no.trim()); });

            const dlBook = document.getElementById('dl-booking-no');
            dlBook.innerHTML = ''; 
            Array.from(bookingSet).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);

            // ถ้ามีพารามิเตอร์ select ใน URL หรือมีรายการ ให้เลือกรายการแรกอัตโนมัติ
            const urlParams = new URLSearchParams(window.location.search);
            const selectBooking = urlParams.get('select') || Array.from(bookingSet)[0];
            
            if (selectBooking) {
                document.getElementById('select-booking-no').value = selectBooking;
                onBookingSelected();
            }
        }
    } catch (err) {
        console.error("Load bookings failed", err);
    }
}

// 2. เมื่อกดเลือก Booking ให้ดึงข้อมูลตู้และเติมหัวบิลอัตโนมัติ
window.onBookingSelected = function() {
    const selectedBooking = document.getElementById('select-booking-no').value.trim();
    if (!selectedBooking) return;

    currentBookingShipments = allBookingsList.filter(i => i.booking_no === selectedBooking);

    if (currentBookingShipments.length > 0) {
        const first = currentBookingShipments[0];

        // เติมข้อมูลหัวบิล
        document.getElementById('info-customer-name').innerText = first.customer_name || '-';
        document.getElementById('info-tax-id').innerText = first.tax_id || '-';
        document.getElementById('info-address').innerText = first.address || '-';
        document.getElementById('info-booking-no').innerText = first.booking_no || '-';

        document.getElementById('input-billing-date').value = first.billing_date ? first.billing_date.split('T')[0] : (first.run_date ? first.run_date.split('T')[0] : '');
        document.getElementById('input-iv-no').value = first.iv_no || '';
        document.getElementById('input-ar-no').value = first.ar_no || '';

        // สร้างตาราง Handsontable
        initContainerGrid(currentBookingShipments);
        calculateSummaryBox();
    }
};

// 3. คำนวณยอดสรุปรวมในกล่อง Summary Box
function calculateSummaryBox() {
    if (!hotGridInstance) return;

    const rowCount = hotGridInstance.countRows();
    let totalTripFee = 0;

    for (let r = 0; r < rowCount; r++) {
        const fee = Number(hotGridInstance.getDataAtRowProp(r, 'trip_fee')) || 0;
        totalTripFee += fee;
    }

    const unitPrice = rowCount > 0 ? (totalTripFee / rowCount) : 0;

    document.getElementById('sum-qty').innerText = rowCount.toFixed(2);
    document.getElementById('sum-unit-price').innerText = unitPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('sum-total-amount').innerText = totalTripFee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// 4. สร้างตาราง Handsontable คอลัมน์ครบถ้วนตามแบบ Excel
function initContainerGrid(data) {
    const container = document.getElementById('billing-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    hotGridInstance = new Handsontable(container, {
        data: data,
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 26,
        fixedColumnsLeft: 2,

        colHeaders: [
            'ลำดับที่', 'วันที่', 'ทะเบียนรถ', 'เบอร์ตู้', 'ขนาดตู้', 
            'จาก', 'ถึง', 'น้ำหนัก (KG) ✏️', 
            'ค่าบรรทุก ✏️', 'ค่าผ่านท่า ✏️', 'ค่าฝากตู้ ✏️', 'ค่ายกตู้ ✏️', 'ค่าชอร์ ✏️',
            'ภาษีค่าผ่านท่า', 'ภาษีค่ายกตู้', 'ภาษีชอร์'
        ],
        columns: [
            { data: 'order_id', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: (i, td, r, c, p, v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'leg1_plate', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold' },
            { data: 'container_1_no', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read font-bold text-blue-600' },
            { data: 'container_size', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            
            { data: 'origin', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'destination', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },

            // แก้ไขได้ (Editable)
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit font-bold text-slate-800' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },

            // ภาษี (คำนวณอัตโนมัติ 7%)
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
        colWidths: [100, 85, 90, 110, 65, 80, 80, 100, 100, 90, 90, 90, 90, 90, 90, 90],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true,
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            calculateSummaryBox();
        }
    });
}

// 5. บันทึกข้อมูลกลับไปยังเซิร์ฟเวอร์
window.saveBillingChanges = async function() {
    if (!hotGridInstance) return;
    const bookingNo = document.getElementById('select-booking-no').value.trim();
    if (!bookingNo) { alert("⚠️ กรุณาเลือก Booking ก่อนบันทึกครับ"); return; }

    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const dataToSave = hotGridInstance.getSourceData().map(row => {
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
            alert(`✅ บันทึกข้อมูลวางบิลของ Booking: ${bookingNo} เรียบร้อยแล้ว!`);
        } else {
            alert('❌ ข้อผิดพลาด: ' + result.message);
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    }
};

// 6. กดพิมพ์ใบแนบวางบิล A4 แนวนอน
window.printCurrentInvoice = function() {
    const bookingNo = document.getElementById('select-booking-no').value.trim();
    if (!bookingNo) { alert("⚠️ กรุณาเลือก Booking ที่ต้องการพิมพ์ก่อนครับ"); return; }
    window.open(`/print-invoice.html?booking=${encodeURIComponent(bookingNo)}`, '_blank');
};