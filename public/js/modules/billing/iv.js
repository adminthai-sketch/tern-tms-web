let hotIvInstance = null;
let allIvData = [];

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) {
        const u = JSON.parse(savedUser);
        document.getElementById('user-fullname').innerText = u.fullName || u.username || 'Admin';
    }

    const today = new Date();
    document.getElementById('filter-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    await loadIvData();
});

window.loadIvData = async function() {
    const [year, month] = document.getElementById('filter-month').value.split('-');
    const overlay = document.getElementById('iv-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const res = await fetch(`/api/billing/iv-summary?year=${year}&month=${month}&_t=${Date.now()}`);
        const result = await res.json();
        
        if (result.success && result.data) {
            allIvData = result.data.map(item => {
                // เซ็ตค่าเริ่มต้นถ้าฐานข้อมูลเป็น null
                if (!item.billing_status || item.billing_status === 'รอดำเนินการ') {
                    item.billing_status = item.billing_date ? 'วางบิลแล้ว' : 'รอวางบิล';
                }
                if (item.billing_date) item.billing_date = String(item.billing_date).split('T')[0];
                if (item.payment_date) item.payment_date = String(item.payment_date).split('T')[0];
                return item;
            });
            filterIvGrid();
        } else {
            allIvData = [];
            initIvGrid([]);
        }
    } catch(e) { 
        console.error("Load IV Error:", e); 
        initIvGrid([]);
    } finally { 
        if (overlay) overlay.classList.add('hidden'); 
    }
};

window.filterIvGrid = function() {
    const cust = (document.getElementById('filter-customer')?.value || '').toLowerCase();
    const stat = document.getElementById('filter-status')?.value || '';
    const book = (document.getElementById('filter-booking')?.value || '').toLowerCase(); // 🌟 ดึงค่า Booking

    const filtered = allIvData.filter(i => {
        const cName = String(i.customer_name || '').toLowerCase();
        // แปลง array ของ booking ให้เป็น string เพื่อเช็คคำค้นหา
        const bList = Array.isArray(i.booking_list) ? i.booking_list.join(',').toLowerCase() : '';

        const matchCust = !cust || cName.includes(cust);
        const matchStat = !stat || i.billing_status === stat;
        const matchBook = !book || bList.includes(book);

        return matchCust && matchStat && matchBook;
    });

    initIvGrid(filtered);
    calculateIvSummary(filtered);
};

// ... โค้ดส่วน calculateIvSummary ยังเหมือนเดิม ...

function initIvGrid(data) {
    const container = document.getElementById('iv-grid-container');
    if (!container) return;
    if (hotIvInstance) hotIvInstance.destroy();

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.DropdownRenderer.apply(this, arguments);
        td.style.fontWeight = 'bold';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        
        if (value === 'รอวางบิล') { td.style.color = '#ca8a04'; td.style.backgroundColor = '#fefce8'; }
        else if (value === 'วางบิลแล้ว') { td.style.color = '#2563eb'; td.style.backgroundColor = '#eff6ff'; }
        else if (value === 'รับชำระแล้ว') { td.style.color = '#16a34a'; td.style.backgroundColor = '#f0fdf4'; }
        else if (value === 'ยกเลิก') { td.style.color = '#dc2626'; td.style.backgroundColor = '#fef2f2'; td.style.textDecoration = 'line-through'; }
    };

    // 🌟 ปุ่มเปิดดูรายละเอียดหน้า 4 (ทำให้เห็นชัดๆ)
    const actionRenderer = function(instance, td, row, col, prop, value) {
        td.innerHTML = '';
        const ivNo = instance.getDataAtRowProp(row, 'iv_no');
        if (ivNo) {
            const btn = document.createElement('button');
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> รายละเอียด';
            btn.className = 'bg-purple-600 hover:bg-purple-700 text-white font-bold px-2 py-1.5 rounded text-[11px] transition-colors w-full shadow-sm';
            btn.onclick = () => window.location.href = `/billing-iv-detail.html?iv=${encodeURIComponent(ivNo)}`;
            td.appendChild(btn);
        }
        td.style.padding = '3px';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
    };

    // ปุ่มพิมพ์ด่วน
    const printRenderer = function(instance, td, row, col, prop, value) {
        td.innerHTML = '';
        const ivNo = instance.getDataAtRowProp(row, 'iv_no');
        if (ivNo) {
            const btn = document.createElement('button');
            btn.innerHTML = '<i class="fa-solid fa-print"></i>';
            btn.className = 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1.5 rounded text-xs transition-colors border border-slate-300 w-full';
            btn.title = 'พิมพ์ใบแนบ A4 ทันที';
            btn.onclick = () => window.open(`/print-invoice.html?iv=${encodeURIComponent(ivNo)}`, '_blank');
            td.appendChild(btn);
        }
        td.style.padding = '3px';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
    };

    hotIvInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false, autoRowSize: false, rowHeights: 36, fixedColumnsLeft: 2, // 🌟 ขยายความสูงแถวให้ปุ่มสวยขึ้น
        colHeaders: [
            'จัดการ', 'พิมพ์', 'เลขที่ IV (Invoice)', 'ลูกค้า', 'รวมตู้', 'ยอดรวมสุทธิ (บาท)', 
            'สถานะบิล', 'วันที่วางบิล', 'วันที่รับเงิน (Paid)', 'เลขที่ใบเสร็จ (RV)', 'หมายเหตุบัญชี'
        ],
        columns: [
            { data: 'action_btn', renderer: actionRenderer, readOnly: true },
            { data: 'print_btn', renderer: printRenderer, readOnly: true },
            { data: 'iv_no', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 bg-slate-50' },
            { data: 'customer_name', readOnly: true, className: 'htLeft htMiddle font-bold bg-slate-50' },
            { data: 'total_containers', readOnly: true, className: 'htCenter htMiddle bg-slate-50' },
            { data: 'grand_total', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-slate-800 bg-slate-100' },
            { 
                data: 'billing_status', type: 'dropdown', 
                source: ['รอวางบิล', 'วางบิลแล้ว', 'รับชำระแล้ว', 'ยกเลิก'], 
                renderer: statusRenderer 
            },
            { data: 'billing_date', type: 'date', dateFormat: 'YYYY-MM-DD', correctFormat: true, className: 'htCenter htMiddle' },
            { data: 'payment_date', type: 'date', dateFormat: 'YYYY-MM-DD', correctFormat: true, className: 'htCenter htMiddle text-emerald-700 font-bold bg-emerald-50/30' },
            { data: 'receipt_no', type: 'text', className: 'htCenter htMiddle uppercase' },
            { data: 'account_remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [100, 45, 130, 180, 55, 120, 110, 100, 110, 110, 180], // ปรับความกว้างให้ปุ่ม "จัดการ"
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all', manualColumnResize: true, licenseKey: 'non-commercial-and-evaluation',
        afterChange: function(changes, src) {
            if (src !== 'loadData' && changes) {
                changes.forEach(([row, prop, oldVal, newVal]) => {
                    const rowData = this.getSourceDataAtRow(row);
                    if (prop === 'billing_date' && newVal && rowData.billing_status === 'รอวางบิล') {
                        this.setDataAtRowProp(row, 'billing_status', 'วางบิลแล้ว', 'auto');
                    }
                    if (prop === 'payment_date' && newVal && rowData.billing_status !== 'รับชำระแล้ว') {
                        this.setDataAtRowProp(row, 'billing_status', 'รับชำระแล้ว', 'auto');
                    }
                });
                calculateIvSummary(this.getSourceData());
            }
        }
    });
}

window.saveIvChanges = async function() {
    if (!hotIvInstance) return;
    const sourceData = hotIvInstance.getSourceData().filter(r => r.iv_no);

    if (sourceData.length === 0) {
        alert('⚠️ ไม่มีข้อมูลให้บันทึก'); return;
    }

    const overlay = document.getElementById('iv-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const res = await fetch('/api/billing/update-iv', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: sourceData }) 
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ บันทึกสถานะบัญชีเรียบร้อย!`);
            await loadIvData(); 
        } else {
            alert('❌ บันทึกล้มเหลว: ' + (result.message || 'Server error'));
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้: ' + err.message);
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};