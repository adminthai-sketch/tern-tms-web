let hotIvDetailInstance = null;
let currentIvNo = '';
let currentIvContainers = [];
let currentCustomerId = null;
let cachedCustomerLayout = {};

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
            currentCustomerId = first.customer_id; 

            if (first.invoice_layout) {
                try {
                    cachedCustomerLayout = typeof first.invoice_layout === 'string' ? JSON.parse(first.invoice_layout) : first.invoice_layout;
                    applyCustomerLayout(cachedCustomerLayout);
                } catch(e) {}
            }
            const btnSaveLayout = document.getElementById('btn-save-layout');
            if (btnSaveLayout) btnSaveLayout.classList.remove('hidden');

            const custNameEl = document.getElementById('info-customer-name');
            if (custNameEl) custNameEl.innerText = first.full_customer_name || first.customer_name || '-';
            
            const taxEl = document.getElementById('info-tax-id');
            if (taxEl) taxEl.innerText = first.tax_id || '-';
            
            const addrEl = document.getElementById('info-address');
            if (addrEl) addrEl.innerText = first.address || '-';

            const statEl = document.getElementById('input-billing-status');
            if (statEl) statEl.value = first.billing_status || 'รอวางบิล';
            
            const bDateEl = document.getElementById('input-billing-date');
            if (bDateEl && first.billing_date) bDateEl.value = String(first.billing_date).split('T')[0];
            
            const pDateEl = document.getElementById('input-payment-date');
            if (pDateEl && first.payment_date) pDateEl.value = String(first.payment_date).split('T')[0];
            
            const rNoEl = document.getElementById('input-receipt-no');
            if (rNoEl) rNoEl.value = first.receipt_no || '';

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

function applyCustomerLayout(layout) {
    Object.keys(layout).forEach(chkId => {
        const el = document.getElementById(chkId);
        if(el) el.checked = layout[chkId];
    });
}

window.toggleIvDetailColumns = function() {
    if (!hotIvDetailInstance) return;
    const hiddenCols = [];
    
    // อ้างอิงตามลำดับคอลัมน์ใน Handsontable ด้านล่าง
    const colMap = {
        'chk-jobname': 3,
        'chk-cartype': 4,
        'chk-driver': 6,
        'chk-origin': 9,
        'chk-dest': 10,
        'chk-trip': 12,
        'chk-port': 13,
        'chk-deposit': 14,
        'chk-lift': 15,
        'chk-shore': 16,
        'chk-weight': 17
    };

    for (const [id, colIdx] of Object.entries(colMap)) {
        const el = document.getElementById(id);
        if (el && !el.checked) hiddenCols.push(colIdx);
    }

    hotIvDetailInstance.updateSettings({
        hiddenColumns: {
            columns: hiddenCols,
            indicators: false
        }
    });
};

window.saveLayoutToCustomer = async function() {
    if(!currentCustomerId) return;
    
    // รวมค่าจากหน้า IV Detail และรักษาค่าของชุดภาษี (chk-tax) จากหน้าพิมพ์ไว้
    const layout = {
        ...cachedCustomerLayout,
        'chk-jobname': document.getElementById('chk-jobname')?.checked ?? true,
        'chk-origin': document.getElementById('chk-origin')?.checked ?? true,
        'chk-dest': document.getElementById('chk-dest')?.checked ?? true,
        'chk-cartype': document.getElementById('chk-cartype')?.checked ?? true,
        'chk-driver': document.getElementById('chk-driver')?.checked ?? true,
        'chk-weight': document.getElementById('chk-weight')?.checked ?? true,
        'chk-trip': document.getElementById('chk-trip')?.checked ?? true,
        'chk-port': document.getElementById('chk-port')?.checked ?? true,
        'chk-deposit': document.getElementById('chk-deposit')?.checked ?? true,
        'chk-lift': document.getElementById('chk-lift')?.checked ?? true,
        'chk-shore': document.getElementById('chk-shore')?.checked ?? true
    };

    const btn = document.getElementById('btn-save-layout');
    if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังบันทึก...';

    try {
        const res = await fetch('/api/billing/save-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: currentCustomerId, layout: layout })
        });
        const data = await res.json();
        if(data.success && btn) {
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> บันทึกสำเร็จ!';
            btn.classList.replace('bg-emerald-600', 'bg-blue-600');
            cachedCustomerLayout = layout; // อัปเดตแคช
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกฟอร์มให้ลูกค้ารายนี้';
                btn.classList.replace('bg-blue-600', 'bg-emerald-600');
            }, 2500);
        }
    } catch(e) {
        alert("เกิดข้อผิดพลาดในการบันทึก");
        if(btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกฟอร์มให้ลูกค้ารายนี้';
    }
};

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
        hiddenColumns: { columns: [], indicators: false }, // 🌟 เปิดฟีเจอร์ซ่อนคอลัมน์
        colHeaders: [
            'Order ID', 'Booking', 'วันที่วิ่ง', 
            'ชื่องาน', 'ประเภทรถ', 'ทะเบียน', 'ชื่อคนขับ', 
            'เบอร์ตู้', 'ขนาด', 'จาก (ต้นทาง)', 'ถึง (ปลายทาง)', 
            'เลขที่ AR', 'ค่าบรรทุก', 'ค่าผ่านท่า', 'ค่าฝากตู้', 
            'ค่ายกตู้', 'ค่าชอร์', 'น้ำหนัก (กก.)', 'หมายเหตุตู้'
        ],
        columns: [
            { data: 'order_id', readOnly: true, className: 'htCenter htMiddle font-bold bg-slate-50 text-slate-400' },
            { data: 'booking_no', readOnly: true, className: 'htCenter htMiddle font-bold text-purple-700 bg-slate-50' },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v ? String(v).split('T')[0] : ''; } },
            { data: 'job_name', readOnly: true, className: 'htLeft htMiddle bg-slate-50 text-blue-800 truncate', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || ''; td.title = v || ''; } },
            { data: 'price_type', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || i.getDataAtRowProp(r, 'mode') || '-'; } },
            { data: 'leg1_plate', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'leg1_driver', readOnly: true, className: 'htLeft htMiddle bg-slate-50 truncate', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || '-'; td.title = v || '-'; } },
            { data: 'container_1_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 bg-slate-50', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || i.getDataAtRowProp(r, 'container_2_no') || '-'; } },
            { data: 'container_size', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'origin', readOnly: true, className: 'htLeft htMiddle bg-slate-50 truncate', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || ''; td.title = v || ''; } },
            { data: 'destination', readOnly: true, className: 'htLeft htMiddle bg-slate-50 truncate', renderer: (i,td,r,c,p,v) => { td.innerHTML = v || ''; td.title = v || ''; } },
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle uppercase font-bold text-red-600' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle' },
            { data: 'billing_remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [100, 110, 85, 120, 70, 70, 100, 90, 50, 100, 100, 90, 85, 75, 75, 75, 75, 80, 150],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) {
            if (src !== 'loadData' && changes) {
                calculateIvDetailSummary();
            }
        }
    });

    // 🌟 สั่งซ่อนคอลัมน์ทันทีหลังจากสร้างตารางเสร็จ
    toggleIvDetailColumns();
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

        const containersData = hotIvDetailInstance.getSourceData();
        await fetch('/api/billing/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: containersData })
        });

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