let hotMasterInstance = null;

window.addEventListener('DOMContentLoaded', async () => {
    // 1. ตรวจสอบข้อมูลผู้ใช้
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) {
        const currentUser = JSON.parse(savedUser);
        const userEl = document.getElementById('user-fullname');
        const roleEl = document.getElementById('user-role-badge');
        if (userEl) userEl.innerText = currentUser.fullName || currentUser.username || 'ผู้ดูแลระบบ';
        if (roleEl) roleEl.innerText = (currentUser.role || 'ADMIN').toUpperCase();
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

// ฟังก์ชันโหลดข้อมูลจาก API
window.loadBillingMasterData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    const [year, month] = monthInput ? monthInput.split('-') : ['', ''];
    
    const overlay = document.getElementById('master-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();
        
        if (result.success && Array.isArray(result.data)) {
            const mappedData = result.data.map(item => ({
                booking_no: item.booking_no || '-',
                run_date: item.run_date ? String(item.run_date).split('T')[0] : '-',
                customer_name: item.customer_name || '-',
                total_count: Number(item.container_count) || 1,
                total_amount: (Number(item.trip_fee) || 0) * (Number(item.container_count) || 1),
                origin: item.origin || '-',
                destination: item.destination || '-'
            }));

            initMasterGrid(mappedData);
        } else {
            initMasterGrid([]);
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        initMasterGrid([]);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

// วาดตาราง Handsontable
function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    
    if (hotMasterInstance) {
        hotMasterInstance.destroy();
    }

    const tableData = data.length > 0 ? data : [
        { booking_no: 'ไม่พบข้อมูลในเดือนที่เลือก', run_date: '-', customer_name: '-', total_count: 0, total_amount: 0, origin: '-', destination: '-' }
    ];

    hotMasterInstance = new Handsontable(container, {
        data: tableData,
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 32,
        colHeaders: ['Booking No.', 'วันที่วิ่งงาน', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'ค่าบรรทุกรวม (บาท)'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle font-bold text-purple-700' },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'htMiddle font-bold text-slate-700' },
            { data: 'origin', type: 'text', readOnly: true, className: 'htMiddle text-slate-500' },
            { data: 'destination', type: 'text', readOnly: true, className: 'htMiddle text-slate-500' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700' }
        ],
        colWidths: [200, 110, 200, 130, 130, 90, 150],
        rowHeaders: true,
        width: '100%',
        height: '100%',
        stretchH: 'all',
        licenseKey: 'non-commercial-and-evaluation'
    });
}