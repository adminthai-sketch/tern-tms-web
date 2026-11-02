let hotDetailInstance = null;
let allRawShipments = [];       
let filteredShipments = [];     

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) {
        const u = JSON.parse(savedUser);
        document.getElementById('user-fullname').innerText = u.fullName || u.username || 'Admin';
    }

    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('input-billing-date').value = today.toISOString().split('T')[0];

    // 🌟 1. ดึง Booking จาก URL หรือที่เคยเลือกไว้ล่าสุด
    const urlParams = new URLSearchParams(window.location.search);
    const initialBooking = urlParams.get('booking') || localStorage.getItem('billing_active_booking');

    await loadDetailData();

    if (initialBooking) {
        document.getElementById('select-booking-no').value = initialBooking;
        handleCrossFilterDetail();
    }
});

// 🌟 2. ดึงข้อมูลสดใหม่ ป้องกัน Cache
window.loadDetailData = async function() {
    const [year, month] = document.getElementById('filter-month').value.split('-');
    const overlay = document.getElementById('detail-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const res = await fetch(`/api/billing/shipments?year=${year}&month=${month}&_t=${Date.now()}`);
        const result = await res.json();
        
        if (result.success && result.data) {
            allRawShipments = result.data.filter(i => i.order_id).map(item => {
                item._selected = item._selected !== undefined ? item._selected : true; 
                return item;
            });
            updateDetailFilterDropdowns();
            handleCrossFilterDetail();
        } else {
            allRawShipments = [];
            initDetailGrid([]);
        }
    } catch(e) { 
        console.error("LoadDetailData Error:", e); 
        initDetailGrid([]);
    } finally { 
        if (overlay) overlay.classList.add('hidden'); 
    }
};

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

    if (b) {
        localStorage.setItem('billing_active_booking', b);
        window.history.replaceState(null, '', `?booking=${encodeURIComponent(b)}`);
    }

    filteredShipments = allRawShipments.filter(item => {
        const iD = item.run_date ? String(item.run_date).split('T')[0] : '';
        const iC = item.customer_name ? String(item.customer_name).trim() : '';
        const iB = item.booking_no ? String(item.booking_no).trim() : '';
        return (!d || iD === d) && (!c || iC === c) && (!b || iB === b);
    });

    if (filteredShipments.length > 0) {
        const first = filteredShipments[0];
        document.getElementById('info-customer-name').innerText = first.full_customer_name || first.customer_name || '-';
        document.getElementById('info-tax-id').innerText = first.tax_id || '-';
        document.getElementById('info-address').innerText = first.address || '-';
        
        const hasIv = filteredShipments.find(s => s.iv_no && String(s.iv_no).trim() !== '');
        if (hasIv) {
            document.getElementById('input-iv-no').value = hasIv.iv_no;
            document.getElementById('input-ar-no').value = hasIv.ar_no || '';
            if (hasIv.billing_date) document.getElementById('input-billing-date').value = String(hasIv.billing_date).split('T')[0];
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
    localStorage.removeItem('billing_active_booking');
    window.history.replaceState(null, '', window.location.pathname);
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

window.calculateDetailSummary = function() {
    if (!hotDetailInstance) return;
    let selectedCount = 0;
    let sumTrip = 0;
    let sumOther = 0;

    hotDetailInstance.getSourceData().forEach(row => {
        if (row._selected === true || row._selected === 'true' || row._selected == 1) { 
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

    const elBadge = document.getElementById('selected-containers-badge');
    if (elBadge) elBadge.innerText = `เลือกอยู่ ${selectedCount} ตู้`;

    const elQty = document.getElementById('sum-qty');
    if (elQty) elQty.innerText = selectedCount.toLocaleString();

    const elTrip = document.getElementById('sum-trip-fee');
    if (elTrip) elTrip.innerText = sumTrip.toLocaleString('en-US', {minimumFractionDigits: 2});

    const elOther = document.getElementById('sum-other-fee');
    if (elOther) elOther.innerText = sumOther.toLocaleString('en-US', {minimumFractionDigits: 2});

    const elGrand = document.getElementById('sum-grand-total');
    if (elGrand) elGrand.innerText = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2});
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
        if (value && String(value).trim() !== '') {
            td.style.backgroundColor = '#ecfdf5';
            td.style.color = '#065f46';
            td.innerText = value;
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
            { data: 'iv_no', type: 'text', renderer: ivRenderer },
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase bg-white' },
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

// 🌟 3. ปรับฟังก์ชันบันทึก ให้ยอมรับค่าว่างเพื่อลบข้อมูลได้
window.applyBatchIvToSelected = window.saveDetailBillingChanges = async function() {
    if (!hotDetailInstance) {
        alert('⚠️ ไม่พบข้อมูลตารางตู้');
        return;
    }
    const ivNo = document.getElementById('input-iv-no')?.value.trim();
    const arNo = document.getElementById('input-ar-no')?.value.trim();
    const billingDate = document.getElementById('input-billing-date')?.value || '';

    const sourceData = hotDetailInstance.getSourceData() || [];
    const selectedRows = sourceData.filter(r => (r._selected === true || r._selected === 'true' || r._selected == 1) && r.order_id);

    if (selectedRows.length === 0) {
        alert('⚠️ กรุณาติ๊กเลือกตู้อย่างน้อย 1 ตู้ที่ต้องการวางบิลครับ');
        return;
    }

    if (ivNo === '') {
        if (!confirm('คุณได้ลบเลข IV ออก ตู้ที่ถูกเลือกจะถูกเคลียร์ค่า IV เป็นค่าว่าง (รอดำเนินการ) ยืนยันหรือไม่?')) return;
    }

    selectedRows.forEach(row => {
        row.iv_no = ivNo;
        row.ar_no = arNo;
        row.billing_date = billingDate;
    });

    const overlay = document.getElementById('detail-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const res = await fetch('/api/billing/shipments', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: selectedRows }) 
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ บันทึกข้อมูล ${selectedRows.length} ตู้เรียบร้อย!`);
            await loadDetailData(); 
        } else {
            alert('❌ บันทึกล้มเหลว: ' + (result.message || 'Server error'));
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้: ' + err.message);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

// ==========================================
// 📌 MODAL: ดึงตู้ตกค้างข้าม Booking
// ==========================================
let currentUnbilledData = [];

window.openUnbilledModal = async function() {
    const activeCustId = allRawShipments.length > 0 ? allRawShipments[0].customer_id : null;
    if (!activeCustId) { 
        alert("⚠️ ไม่พบข้อมูลลูกค้า โปรดเลือก Booking หลักด้านบนก่อน เพื่อให้ระบบรู้ว่าต้องดึงตู้ตกค้างของใคร"); 
        return; 
    }
    
    document.getElementById('modal-filter-booking').value = '';
    document.getElementById('modal-filter-date').value = '';
    document.getElementById('unbilled-modal').classList.remove('hidden');
    document.getElementById('unbilled-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-5 text-slate-500">กำลังค้นหา...</td></tr>';
    
    await fetchUnbilledContainers(activeCustId);
};

window.closeUnbilledModal = function() { document.getElementById('unbilled-modal').classList.add('hidden'); };

window.fetchUnbilledContainers = async function(custId) {
    if(!custId && allRawShipments.length > 0) custId = allRawShipments[0].customer_id;
    if(!custId) return;

    try {
        const res = await fetch(`/api/billing/unbilled-containers?customer_id=${custId}&_t=${Date.now()}`);
        const result = await res.json();
        if (result.success) {
            const existingIds = hotDetailInstance.getSourceData().map(r => r.order_id);
            currentUnbilledData = result.data.filter(d => !existingIds.includes(d.order_id));
            filterUnbilledTable();
        }
    } catch(e) { console.error(e); }
};

window.filterUnbilledTable = function() {
    const b = document.getElementById('modal-filter-booking').value.toLowerCase().trim();
    const d = document.getElementById('modal-filter-date').value;

    const filtered = currentUnbilledData.filter(i => {
        const matchBk = !b || (i.booking_no && i.booking_no.toLowerCase().includes(b));
        const matchDt = !d || (i.run_date && i.run_date.split('T')[0] === d);
        return matchBk && matchDt;
    });

    renderUnbilledTable(filtered);
};

function renderUnbilledTable(data) {
    const tbody = document.getElementById('unbilled-tbody'); 
    tbody.innerHTML = '';
    if (data.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">ไม่มีตู้ตกค้างของลูกค้ารายนี้</td></tr>`; 
        return; 
    }

    data.forEach((row, idx) => {
        const tripFee = (Number(row.trip_fee) || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
        const dateStr = row.run_date ? row.run_date.split('T')[0] : '';
        tbody.innerHTML += `
            <tr class="hover:bg-amber-50 cursor-pointer" onclick="document.getElementById('cb-ub-${idx}').click()">
                <td class="p-2 text-center border-r"><input type="checkbox" id="cb-ub-${idx}" value="${row.order_id}" class="unbilled-cb w-4 h-4 text-amber-500 rounded" onclick="event.stopPropagation(); updateUnbilledCount()"></td>
                <td class="p-2 border-r font-bold text-purple-700">${row.booking_no}</td>
                <td class="p-2 border-r text-slate-500">${dateStr}</td>
                <td class="p-2 border-r font-bold text-blue-600">${row.container_1_no || row.container_2_no || '-'}</td>
                <td class="p-2 border-r font-bold text-slate-600">${row.leg1_plate || '-'}</td>
                <td class="p-2 border-r text-slate-500 text-[10px]">${row.origin || ''} ➔ ${row.destination || ''}</td>
                <td class="p-2 text-right font-bold text-emerald-600">${tripFee}</td>
            </tr>`;
    });
    updateUnbilledCount();
}

window.toggleSelectAllUnbilled = function(masterCb) {
    document.querySelectorAll('.unbilled-cb').forEach(cb => cb.checked = masterCb.checked);
    updateUnbilledCount();
};

window.updateUnbilledCount = function() {
    const count = document.querySelectorAll('.unbilled-cb:checked').length;
    document.getElementById('unbilled-selected-count').innerText = `เลือกไว้ ${count} รายการ`;
};

window.appendSelectedUnbilled = function() {
    const selectedCbs = document.querySelectorAll('.unbilled-cb:checked');
    if (selectedCbs.length === 0) { alert("⚠️ กรุณาติ๊กเลือกตู้อย่างน้อย 1 รายการ"); return; }

    const selectedIds = Array.from(selectedCbs).map(cb => Number(cb.value));
    const itemsToAdd = currentUnbilledData.filter(i => selectedIds.includes(i.order_id));

    const existingData = hotDetailInstance.getSourceData();
    itemsToAdd.forEach(item => { 
        item._selected = true; 
        existingData.push(item); 
    });

    hotDetailInstance.loadData(existingData); 
    calculateDetailSummary(); 
    closeUnbilledModal();
    alert(`✅ ดึงตู้ข้าม Booking เข้ามา ${itemsToAdd.length} รายการแล้ว! (อย่าลืมกดปุ่มบันทึก IV ลงตู้)`);
};

window.printCurrentInvoice = function() {
    const ivNo = document.getElementById('input-iv-no')?.value.trim();
    const bookingNo = document.getElementById('select-booking-no')?.value.trim();

    if (ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
    else if (bookingNo) window.open(`/print-invoice.html?booking=${encodeURIComponent(bookingNo)}`, '_blank');
    else alert('กรุณาระบุเลข IV หรือเลือก Booking เพื่อพิมพ์ใบแนบครับ');
};