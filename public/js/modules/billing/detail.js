let hotDetailInstance = null;
let rawShipmentList = [];
let activeCustomerId = null;
let activeBookingNo = null;
let currentUnbilledData = [];

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName || 'Admin';

    const urlParams = new URLSearchParams(window.location.search);
    activeBookingNo = urlParams.get('booking');

    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    await loadInitialData();
    if (activeBookingNo) {
        document.getElementById('select-booking-no').value = activeBookingNo;
        onBookingSelected();
    }
});

async function loadInitialData() {
    const [year, month] = document.getElementById('filter-month').value.split('-');
    try {
        const res = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawShipmentList = result.data.filter(i => i.order_id); // เอาเฉพาะที่จัดตู้แล้ว
            const bkSet = new Set(rawShipmentList.map(i => i.booking_no));
            const dl = document.getElementById('dl-booking-no');
            dl.innerHTML = '';
            Array.from(bkSet).sort().forEach(b => dl.innerHTML += `<option value="${b}">`);
        }
    } catch(e) {}
}

window.loadBookingsForDetail = async function() {
    await loadInitialData();
    document.getElementById('select-booking-no').value = '';
    if(hotDetailInstance) hotDetailInstance.loadData([]);
};

window.onBookingSelected = function() {
    activeBookingNo = document.getElementById('select-booking-no').value.trim();
    if(!activeBookingNo) return;

    document.getElementById('detail-loading-overlay').classList.remove('hidden');
    setTimeout(() => {
        const shipments = rawShipmentList.filter(s => s.booking_no === activeBookingNo);
        if (shipments.length > 0) {
            const first = shipments[0];
            activeCustomerId = first.customer_id;
            document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name;
            document.getElementById('info-booking-no').innerText = first.booking_no;
            document.getElementById('info-tax-id').innerText = first.tax_id || '-';
            document.getElementById('info-address').innerText = first.address || '-';
            
            const filledIv = shipments.find(s => s.iv_no);
            document.getElementById('input-iv-no').value = filledIv ? filledIv.iv_no : '';
            document.getElementById('input-ar-no').value = filledIv ? filledIv.ar_no : '';
            if (filledIv && filledIv.billing_date) {
                document.getElementById('input-billing-date').value = String(filledIv.billing_date).split('T')[0];
            } else {
                document.getElementById('input-billing-date').value = new Date().toISOString().split('T')[0];
            }

            shipments.forEach(s => s._selected = true);
            initDetailGrid(shipments);
            calculateDetailSummary();
        } else {
            initDetailGrid([]);
        }
        document.getElementById('detail-loading-overlay').classList.add('hidden');
    }, 100);
};

window.calculateDetailSummary = function() {
    if (!hotDetailInstance) return;
    let totalQty = 0, totalPrice = 0;
    hotDetailInstance.getSourceData().forEach(row => {
        if (row._selected) { 
            totalQty += 1; 
            totalPrice += (Number(row.trip_fee) || 0); 
        }
    });
    document.getElementById('sum-qty').innerText = totalQty.toLocaleString();
    document.getElementById('sum-total-amount').innerText = totalPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('sum-unit-price').innerText = (totalQty > 0 ? (totalPrice/totalQty) : 0).toLocaleString('en-US', {minimumFractionDigits: 2});
};

function initDetailGrid(data) {
    const container = document.getElementById('detail-grid-container');
    if (hotDetailInstance) hotDetailInstance.destroy();

    hotDetailInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 28, fixedColumnsLeft: 2,
        colHeaders: ['เลือก', 'Order ID', 'วันที่', 'เบอร์ตู้', 'ขนาด', 'ต้นทาง', 'ปลายทาง', 'น้ำหนัก', 'ค่าบรรทุก', 'ผ่านท่า', 'ฝากตู้', 'ยกตู้', 'ชอร์', 'หมายเหตุบัญชี'],
        columns: [
            { data: '_selected', type: 'checkbox', className: 'htCenter htMiddle bg-slate-50' },
            { data: 'order_id', readOnly: true, className: 'htCenter htMiddle font-bold bg-slate-50 text-slate-400' },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'container_1_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 bg-slate-50' },
            { data: 'container_size', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'origin', readOnly: true, className: 'htCenter htMiddle bg-slate-50 text-[10px]' },
            { data: 'destination', readOnly: true, className: 'htCenter htMiddle bg-slate-50 text-[10px]' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle font-bold' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'billing_remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [45, 110, 80, 100, 50, 100, 100, 70, 90, 70, 70, 70, 70, 150],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) { if(src !== 'loadData') calculateDetailSummary(); }
    });
}

// ระบบดึงตู้ตกค้าง
window.openUnbilledModal = async function() {
    if (!activeCustomerId) { alert('กรุณาเลือก Booking ก่อน เพื่อให้ระบบรู้ว่าต้องดึงตู้ตกค้างของลูกค้าคนไหน'); return; }
    document.getElementById('unbilled-modal').classList.remove('hidden');
    document.getElementById('unbilled-tbody').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-slate-500">กำลังค้นหา...</td></tr>';
    
    try {
        const res = await fetch(`/api/billing/unbilled-containers?customer_id=${activeCustomerId}`);
        const result = await res.json();
        if (result.success && result.data) {
            currentUnbilledData = result.data.filter(d => d.booking_no !== activeBookingNo);
            renderUnbilledTable();
        }
    } catch (err) {}
};

window.closeUnbilledModal = function() { document.getElementById('unbilled-modal').classList.add('hidden'); };

function renderUnbilledTable() {
    const tbody = document.getElementById('unbilled-tbody');
    tbody.innerHTML = '';
    if (currentUnbilledData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-slate-500">ไม่มีตู้ตกค้างของลูกค้ารายนี้</td></tr>'; return;
    }
    currentUnbilledData.forEach((item, idx) => {
        tbody.innerHTML += `
            <tr class="hover:bg-amber-50 cursor-pointer" onclick="toggleUnbilledRow(${idx})">
                <td class="p-2 text-center border-r"><input type="checkbox" id="cb-unbilled-${idx}" value="${idx}" onclick="event.stopPropagation(); updateUnbilledCount()"></td>
                <td class="p-2 border-r font-bold text-purple-700">${item.booking_no}</td>
                <td class="p-2 border-r">${item.run_date ? String(item.run_date).split('T')[0] : ''}</td>
                <td class="p-2 border-r font-bold text-blue-600">${item.container_1_no || '-'}</td>
                <td class="p-2 border-r text-slate-500">${item.origin || ''} <i class="fa-solid fa-arrow-right text-[8px] mx-1"></i> ${item.destination || ''}</td>
                <td class="p-2 text-right font-bold text-emerald-600">${(Number(item.trip_fee)||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
            </tr>
        `;
    });
    updateUnbilledCount();
}

window.toggleUnbilledRow = function(idx) {
    const cb = document.getElementById(`cb-unbilled-${idx}`);
    if (cb) { cb.checked = !cb.checked; updateUnbilledCount(); }
};
window.toggleSelectAllUnbilled = function(masterCb) {
    const cbs = document.querySelectorAll('#unbilled-tbody input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = masterCb.checked);
    updateUnbilledCount();
};
window.updateUnbilledCount = function() {
    const count = document.querySelectorAll('#unbilled-tbody input[type="checkbox"]:checked').length;
    document.getElementById('unbilled-selected-count').innerText = `เลือกไว้ ${count} รายการ`;
};

window.appendSelectedUnbilled = function() {
    const cbs = document.querySelectorAll('#unbilled-tbody input[type="checkbox"]:checked');
    if (cbs.length === 0) { alert('กรุณาเลือกตู้อย่างน้อย 1 รายการ'); return; }
    
    const selectedData = Array.from(cbs).map(cb => {
        const item = currentUnbilledData[cb.value];
        item._selected = true;
        return item;
    });

    const currentData = hotDetailInstance.getSourceData().filter(d => d.order_id);
    const newData = [...currentData, ...selectedData];
    hotDetailInstance.loadData(newData);
    calculateDetailSummary();
    closeUnbilledModal();
};

window.saveDetailBillingChanges = async function() {
    if(!hotDetailInstance) return;
    const ivNo = document.getElementById('input-iv-no').value.trim();
    const arNo = document.getElementById('input-ar-no').value.trim();
    const billingDate = document.getElementById('input-billing-date').value;

    const dataToSave = hotDetailInstance.getSourceData().filter(r => r.order_id).map(row => {
        if (row._selected) { row.iv_no = ivNo; row.ar_no = arNo; row.billing_date = billingDate; } 
        return row;
    });
    if(dataToSave.length === 0) return;

    try {
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave }) });
        const result = await res.json();
        if (result.success) { alert(`✅ บันทึกข้อมูลใบแจ้งหนี้เรียบร้อย!`); }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); }
};

window.printCurrentInvoice = function() {
    const ivNo = document.getElementById('input-iv-no').value.trim();
    if (ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
    else if (activeBookingNo) window.open(`/print-invoice.html?booking=${encodeURIComponent(activeBookingNo)}`, '_blank');
    else alert('ระบุเลข Booking หรือ IV ก่อนสั่งพิมพ์ครับ');
};