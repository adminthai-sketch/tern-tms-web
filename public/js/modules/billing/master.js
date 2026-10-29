let hotMasterInstance = null;
let rawShipmentList = [];      

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName || 'Admin';
    
    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    await loadBillingMasterData();
});

window.loadBillingMasterData = async function() {
    const [year, month] = document.getElementById('filter-month').value.split('-');
    document.getElementById('master-loading-overlay').classList.remove('hidden');

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
                    const fee = Number(item.trip_fee) || Number(item.booking_trip_fee) || 0;
                    bkMap[bk] = {
                        booking_no: bk, 
                        run_date: item.run_date ? String(item.run_date).split('T')[0] : '-',
                        customer_name: item.customer_name || '-', 
                        total_count: 0, 
                        total_amount: 0,
                        disp_iv: item.iv_no || '',
                        disp_ar: item.ar_no || '',
                        origin: item.origin || '-',
                        destination: item.destination || '-'
                    };
                }
                
                if (item.order_id) {
                    bkMap[bk].total_count += 1;
                    bkMap[bk].total_amount += (Number(item.trip_fee) || 0);
                }
                if (item.iv_no) bkMap[bk].disp_iv = item.iv_no;
                if (item.ar_no) bkMap[bk].disp_ar = item.ar_no;
            });

            initMasterGrid(Object.values(bkMap));
        }
    } catch (err) { console.error(err); } 
    finally { document.getElementById('master-loading-overlay').classList.add('hidden'); }
};

window.openBookingDetail = function(bookingNo) {
    window.location.href = `/billing-detail.html?booking=${encodeURIComponent(bookingNo)}`;
};

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (hotMasterInstance) hotMasterInstance.destroy();

    const btnRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = value ? `<div class="flex items-center justify-between px-2 w-full"><span class="font-bold text-purple-700">${value}</span><button onclick="openBookingDetail('${value}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white px-2 py-0.5 rounded text-xs font-bold transition-colors">เปิดวางบิล 🔍</button></div>` : '';
    };

    hotMasterInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 32, fixedColumnsLeft: 1,
        colHeaders: ['Booking No.', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุก (บาท)', 'เลขที่ IV ✏️', 'เลขที่ AR ✏️'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle bg-slate-50', renderer: btnRenderer },
            { data: 'run_date', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'customer_name', readOnly: true, className: 'font-bold text-slate-700 htMiddle bg-slate-50' },
            { data: 'origin', readOnly: true, className: 'text-slate-500 htMiddle bg-slate-50' },
            { data: 'destination', readOnly: true, className: 'text-slate-500 htMiddle bg-slate-50' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 bg-blue-50/30' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 bg-emerald-50/30' },
            { data: 'disp_iv', className: 'htCenter htMiddle font-bold text-emerald-800 uppercase' },
            { data: 'disp_ar', className: 'htCenter htMiddle font-bold text-red-700 uppercase' }
        ],
        colWidths: [220, 100, 180, 120, 120, 80, 120, 140, 140],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', licenseKey: 'non-commercial-and-evaluation'
    });
}

window.saveMasterBillingChanges = async function() {
    const dataToSave = [];
    hotMasterInstance.getSourceData().forEach(bkRow => {
        if (!bkRow.booking_no) return;
        const shipments = rawShipmentList.filter(s => s.booking_no === bkRow.booking_no);
        shipments.forEach(s => {
            if (bkRow.disp_iv !== undefined) s.iv_no = bkRow.disp_iv.trim();
            if (bkRow.disp_ar !== undefined) s.ar_no = bkRow.disp_ar.trim();
            dataToSave.push(s);
        });
    });

    if (dataToSave.length === 0) return;
    try {
        const res = await fetch('/api/billing/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataToSave }) });
        const result = await res.json();
        if (result.success) { alert('✅ บันทึกเลข IV และ AR เรียบร้อย!'); loadBillingMasterData(); }
    } catch (err) { alert('❌ เกิดข้อผิดพลาด'); }
};