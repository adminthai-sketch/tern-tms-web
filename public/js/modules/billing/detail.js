// ==========================================
// 💸 MODULE: BOOKING DETAIL & INVOICE
// ==========================================

let hotDetailInstance = null;
let rawShipmentList = [];      
let activeBookingNo = null;
let activeCustomerId = null;
let currentUnbilledData = [];
let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if(currentUser.fullname) document.getElementById('user-fullname').innerText = currentUser.fullname;
    if(currentUser.role) document.getElementById('user-role-badge').innerText = currentUser.role.toUpperCase();

    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    await loadBookingsForDetail();

    // เช็คว่ามีส่ง Booking No มาทาง URL ไหม (เช่นมาจากแท็บ Master)
    const urlParams = new URLSearchParams(window.location.search);
    const bk = urlParams.get('booking');
    if (bk) {
        document.getElementById('select-booking-no').value = bk;
        onBookingSelected();
    }
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style'); style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #cbd5e1; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #1e293b; font-weight: 700 !important; border-color: #94a3b8; font-size: 11px !important; }
            .zone-read { background-color: #f8fafc !important; color: #475569; }
            .zone-edit { background-color: #ffffff !important; color: #0f4c81; font-weight: 600; }
        `; document.head.appendChild(style);
    }
}

window.loadBookingsForDetail = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();
        if (result.success && result.data) {
            rawShipmentList = result.data;
            const uniqueBks = Array.from(new Set(rawShipmentList.map(i => i.booking_no))).sort();
            const dl = document.getElementById('dl-booking-no');
            dl.innerHTML = '';
            uniqueBks.forEach(v => dl.innerHTML += `<option value="${v}">`);
        }
    } catch (err) { console.error(err); }
};

window.onBookingSelected = function() {
    activeBookingNo = document.getElementById('select-booking-no').value.trim();
    if (!activeBookingNo) return;

    const shipments = rawShipmentList.filter(s => s.booking_no === activeBookingNo);
    if (shipments.length === 0) {
        alert("ไม่พบข้อมูลตู้สำหรับ Booking นี้ในเดือนที่เลือก");
        return;
    }

    const first = shipments[0];
    activeCustomerId = first.customer_id;

    // เติมข้อมูลหัวบิลด้วยชื่อเต็ม
    document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name || '-';
    document.getElementById('info-tax-id').innerText = first.tax_id || '-';
    document.getElementById('info-address').innerText = first.address || '-';
    document.getElementById('info-booking-no').innerText = first.booking_no || '-';

    document.getElementById('input-billing-date').value = first.billing_date ? first.billing_date.split('T')[0] : (first.run_date ? first.run_date.split('T')[0] : '');
    
    // หาเลข IV/AR ที่ถูกใช้เยอะสุดในกลุ่ม หรือเอาอันแรกที่มี
    const filledIv = shipments.find(s => s.iv_no && s.iv_no.trim() !== '');
    document.getElementById('input-iv-no').value = filledIv ? filledIv.iv_no : '';
    document.getElementById('input-ar-no').value = filledIv ? filledIv.ar_no : '';

    shipments.forEach(s => s._selected = true);

    initDetailGrid(shipments);
    calculateDetailSummary();
};

function calculateDetailSummary() {
    if (!hotDetailInstance) return;
    const data = hotDetailInstance.getSourceData();
    let selectedCount = 0; let totalTrip = 0;
    data.forEach(row => {
        if (row._selected) { selectedCount++; totalTrip += (Number(row.trip_fee) || 0); }
    });
    const unitPrice = selectedCount > 0 ? (totalTrip / selectedCount) : 0;
    document.getElementById('sum-qty').innerText = selectedCount.toFixed(2);
    document.getElementById('sum-unit-price').innerText = unitPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-total-amount').innerText = totalTrip.toLocaleString('en-US', {minimumFractionDigits: 2});
}

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (!container) return;
    if (hotDetailInstance) hotDetailInstance.destroy();

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
        document.getElementById('detail-loading-overlay').classList.remove('hidden');
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role }) });
        const result = await res.json();
        if (result.success) alert(`✅ บันทึกข้อมูลรายละเอียดบิลสำเร็จ!`);
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
    finally { document.getElementById('detail-loading-overlay').classList.add('hidden'); }
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
    if (!activeCustomerId) { alert("⚠️ ไม่พบข้อมูลลูกค้า โปรดเลือก Booking ก่อน"); return; }
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
    const tbody = document.getElementById('unbilled-tbody'); tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">ไม่พบตู้ตกค้าง</td></tr>`; return; }

    data.forEach(row => {
        const tripFee = (Number(row.trip_fee) || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-2 text-center"><input type="checkbox" value="${row.order_id}" class="unbilled-cb w-4 h-4 text-amber-500 rounded" onchange="updateUnbilledCount()"></td>
                <td class="p-2 font-bold text-slate-700">${row.booking_no}</td>
                <td class="p-2 text-slate-500">${row.run_date ? row.run_date.split('T')[0] : ''}</td>
                <td class="p-2 font-bold text-blue-600">${row.container_1_no || row.container_2_no || '-'}</td>
                <td class="p-2 font-bold text-slate-600">${row.leg1_plate || '-'}</td>
                <td class="p-2 text-slate-500">${row.origin || ''} ➔ ${row.destination || ''}</td>
                <td class="p-2 text-right font-bold text-slate-800">${tripFee}</td>
            </tr>`;
    });
    updateUnbilledCount();
}

window.toggleSelectAllUnbilled = function(masterCb) {
    document.querySelectorAll('.unbilled-cb').forEach(cb => cb.checked = masterCb.checked);
    updateUnbilledCount();
};

window.updateUnbilledCount = function() {
    const selected = document.querySelectorAll('.unbilled-cb:checked');
    document.getElementById('unbilled-selected-count').innerText = `เลือกไว้ ${selected.length} รายการ`;
};

window.appendSelectedUnbilled = function() {
    const selectedCbs = document.querySelectorAll('.unbilled-cb:checked');
    if (selectedCbs.length === 0) { alert("⚠️ กรุณาติ๊กเลือกตู้อย่างน้อย 1 รายการ"); return; }

    const selectedIds = Array.from(selectedCbs).map(cb => Number(cb.value));
    const itemsToAdd = currentUnbilledData.filter(i => selectedIds.includes(i.order_id));

    const existingData = hotDetailInstance.getSourceData();
    itemsToAdd.forEach(item => { item._selected = true; existingData.push(item); });

    hotDetailInstance.loadData(existingData); calculateDetailSummary(); closeUnbilledModal();
    alert(`✅ เพิ่มตู้ตกค้าง ${itemsToAdd.length} รายการสำเร็จ!`);
};