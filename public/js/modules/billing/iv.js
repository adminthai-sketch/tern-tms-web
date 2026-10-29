let hotIvInstance = null;
let rawIvList = [];

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    await loadIvSummaryData();
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style'); style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #cbd5e1; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #1e293b; font-weight: 700 !important; border-color: #94a3b8; font-size: 11px !important; }
            .zone-read { background-color: #f8fafc !important; color: #475569; }
        `; document.head.appendChild(style);
    }
}

window.loadIvSummaryData = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    document.getElementById('iv-loading-overlay').classList.remove('hidden');

    try {
        const res = await fetch(`/api/billing/iv-summary?year=${year}&month=${month}`);
        const result = await res.json();
        if (result.success && result.data) {
            rawIvList = result.data.map(i => { i.disp_bookings = (i.booking_list || []).join(', '); return i; });
            initIvGrid(rawIvList);
        }
    } catch (err) { console.error(err); } finally { document.getElementById('iv-loading-overlay').classList.add('hidden'); }
};

function initIvGrid(data) {
    const container = document.getElementById('iv-grid-container');
    if (!container) return;
    if (hotIvInstance) hotIvInstance.destroy();

    hotIvInstance = new Handsontable(container, {
        data: data, wordWrap: false, autoRowSize: false, rowHeights: 30,
        colHeaders: ['เลขที่ IV (Invoice)', 'เลขที่ AR', 'ชื่อลูกค้า', 'รายการ Booking ที่รวม', 'จำนวนตู้', 'ค่าบรรทุกรวม (บาท)', 'ค่าใช้จ่ายอื่นรวม', 'ยอดเงินรวม (บาท)'],
        columns: [
            { data: 'iv_no', readOnly: true, className: 'htMiddle zone-read', renderer: function(i,td,r,c,p,v) { Handsontable.renderers.HtmlRenderer.apply(this,arguments); td.innerHTML = `<div class="flex items-center justify-between w-full h-full px-1"><span class="font-bold text-emerald-800">${v||''}</span><button onclick="window.open('/print-invoice.html?iv=${encodeURIComponent(v)}', '_blank')" class="bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-300 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">🖨️ พิมพ์ใบแนบ A4</button></div>`; } },
            { data: 'ar_no', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-red-700 zone-read' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle zone-read' },
            { data: 'disp_bookings', type: 'text', readOnly: true, className: 'text-slate-600 htMiddle zone-read' },
            { data: 'total_containers', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 zone-read' },
            { data: 'total_trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read' },
            { data: 'total_other_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle zone-read' },
            { data: 'grand_total', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 zone-read' }
        ],
        colWidths: [180, 120, 150, 220, 80, 120, 110, 140],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation'
    });
}
window.filterIvGrid = function() {
    const search = document.getElementById('filter-iv-search').value.toLowerCase().trim();
    initIvGrid(rawIvList.filter(i => JSON.stringify(i).toLowerCase().includes(search)));
};