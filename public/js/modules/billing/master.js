let hotMasterInstance = null;

window.addEventListener('DOMContentLoaded', async () => {
    // 1. ตรวจสอบ User
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) {
        const currentUser = JSON.parse(savedUser);
        const userEl = document.getElementById('user-fullname');
        if (userEl) userEl.innerText = currentUser.fullName || currentUser.username || 'ผู้ดูแลระบบ';
    }

    // 2. ตั้งค่าเดือนปัจจุบัน
    const today = new Date();
    const monthEl = document.getElementById('filter-month');
    if (monthEl && !monthEl.value) {
        monthEl.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }

    // 3. โหลดข้อมูล
    await loadBillingMasterData();
});

window.loadBillingMasterData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    if (!monthInput) return;
    const [year, month] = monthInput.split('-');
    
    const overlay = document.getElementById('master-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();
        
        if (result.success && Array.isArray(result.data)) {
            const bkMap = {};
            result.data.forEach(item => {
                const bk = item.booking_no;
                if (!bk) return;
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk,
                        run_date: item.run_date ? String(item.run_date).split('T')[0] : '-',
                        customer_name: item.customer_name || '-',
                        origin: item.origin || '-',
                        destination: item.destination || '-',
                        container_count: Number(item.container_count) || 1,
                        trip_fee: Number(item.trip_fee) || 0,
                        iv_no: item.iv_no || '-',
                        ar_no: item.ar_no || '-'
                    };
                }
            });

            initMasterGrid(Object.values(bkMap));
        } else {
            initMasterGrid([]);
        }
    } catch (err) {
        console.error("Load Billing Error:", err);
        initMasterGrid([]);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    
    if (hotMasterInstance) {
        hotMasterInstance.destroy();
    }

    const tableData = data.length > 0 ? data : [
        { booking_no: 'ไม่พบรายการข้อมูล', run_date: '-', customer_name: '-', origin: '-', destination: '-', container_count: 0, trip_fee: 0, iv_no: '-', ar_no: '-' }
    ];

    hotMasterInstance = new Handsontable(container, {
        data: tableData,
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 34,
        colHeaders: ['Booking No.', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุก (บาท)', 'เลข IV', 'เลข AR'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle font-bold text-purple-700' },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'htMiddle font-bold text-slate-700' },
            { data: 'origin', type: 'text', readOnly: true, className: 'htMiddle text-slate-500' },
            { data: 'destination', type: 'text', readOnly: true, className: 'htMiddle text-slate-500' },
            { data: 'container_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700' },
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700' },
            { data: 'iv_no', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-emerald-800' },
            { data: 'ar_no', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-red-700' }
        ],
        colWidths: [200, 110, 200, 120, 120, 90, 140, 140, 140],
        rowHeaders: true,
        width: '100%',
        height: '100%',
        stretchH: 'all',
        licenseKey: 'non-commercial-and-evaluation'
    });
}