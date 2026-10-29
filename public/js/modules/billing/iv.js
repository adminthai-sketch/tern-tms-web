let hotIvInstance = null;
let rawIvList = [];

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName || 'Admin';

    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    await loadIvSummaryData();
});

window.loadIvSummaryData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    if (!monthInput) return;
    const [year, month] = monthInput.split('-');

    document.getElementById('iv-loading-overlay').classList.remove('hidden');
    try {
        const response = await fetch(`/api/billing/iv-summary?year=${year}&month=${month}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            rawIvList = result.data.map(i => {
                i.booking_list_str = Array.isArray(i.booking_list) ? i.booking_list.join(', ') : i.booking_list;
                i.billing_date_str = i.billing_date ? String(i.billing_date).split('T')[0] : '';
                return i;
            });
            initIvGrid(rawIvList);
        } else {
            initIvGrid([]);
        }
    } catch (e) { initIvGrid([]); }
    finally { document.getElementById('iv-loading-overlay').classList.add('hidden'); }
};

window.filterIvGrid = function() {
    const search = document.getElementById('filter-iv-search').value.toLowerCase().trim();
    if (!search) { initIvGrid(rawIvList); return; }
    
    const filtered = rawIvList.filter(item => 
        (item.iv_no && item.iv_no.toLowerCase().includes(search)) || 
        (item.customer_name && item.customer_name.toLowerCase().includes(search)) ||
        (item.booking_list_str && item.booking_list_str.toLowerCase().includes(search))
    );
    initIvGrid(filtered);
};

window.printInvoiceFromIv = function(ivNo) {
    if(ivNo) window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
};

function initIvGrid(data) {
    const container = document.getElementById('iv-grid-container');
    if (hotIvInstance) hotIvInstance.destroy();

    const btnRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = value ? `<div class="flex items-center justify-between px-2 w-full"><span class="font-bold text-emerald-800">${value}</span><button onclick="printInvoiceFromIv('${value}')" class="bg-emerald-100 hover:bg-emerald-600 text-emerald-700 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold transition-colors shadow-sm">พิมพ์ใบแจ้งหนี้ <i class="fa-solid fa-print"></i></button></div>` : '';
    };

    hotIvInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 32, fixedColumnsLeft: 1,
        colHeaders: ['เลขที่ IV (Invoice)', 'วันที่วางบิล', 'ลูกค้า', 'จำนวนตู้', 'บุคกิ้งที่เกี่ยวข้อง (งานตกค้าง)', 'ค่าบรรทุกรวม (บาท)', 'ค่าอื่นๆรวม (บาท)', 'รวมเงินสุทธิ (บาท)', 'เลขที่ AR'],
        columns: [
            { data: 'iv_no', readOnly: true, className: 'htMiddle bg-slate-50', renderer: btnRenderer },
            { data: 'billing_date_str', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'customer_name', readOnly: true, className: 'font-bold text-slate-700 htMiddle bg-slate-50' },
            { data: 'total_containers', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700' },
            { data: 'booking_list_str', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle text-[10px]' },
            { data: 'total_trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700' },
            { data: 'total_other_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-amber-600' },
            { data: 'grand_total', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-purple-700 bg-purple-50' },
            { data: 'ar_no', readOnly: true, className: 'htCenter htMiddle font-bold text-red-700' }
        ],
        colWidths: [220, 100, 200, 80, 200, 120, 120, 130, 130],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}