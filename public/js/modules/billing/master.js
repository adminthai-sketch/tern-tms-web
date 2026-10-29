// ==========================================
// 💸 MODULE: MASTER BOOKING LIST (CLEAN & SMART FALLBACK)
// ==========================================

let hotMasterInstance = null;
let rawShipmentList = [];      
let masterBookingList = [];    

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    
    // 1. ดึงข้อมูลผู้ใช้งาน
    const savedUser = localStorage.getItem('tms_user');
    if (savedUser) {
        const currentUser = JSON.parse(savedUser);
        const nameToDisplay = currentUser.fullName || currentUser.username || 'ผู้ดูแลระบบ';
        document.getElementById('user-fullname').innerText = nameToDisplay;
        document.getElementById('user-role-badge').innerText = (currentUser.role || 'ADMIN').toUpperCase();
    } else {
        window.location.href = '/login.html';
        return;
    }
    
    // 2. ตั้งค่าเดือนปัจจุบัน
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    // 3. โหลดข้อมูล
    await loadBillingMasterData();
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style');
        style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #cbd5e1; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #1e293b; font-weight: 700 !important; border-color: #94a3b8; font-size: 11px !important; }
            .zone-read { background-color: #f8fafc !important; color: #475569; }
            .zone-edit { background-color: #ffffff !important; color: #0f4c81; font-weight: 600; }
        `;
        document.head.appendChild(style);
    }
}

// 📌 ฟังก์ชันโหลดข้อมูลจาก API
window.loadBillingMasterData = async function() {
    const monthInput = document.getElementById('filter-month').value;
    const [year, month] = monthInput ? monthInput.split('-') : ['', ''];
    
    const overlay = document.getElementById('master-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();
        
        if (result.success && Array.isArray(result.data)) {
            rawShipmentList = result.data;
            
            if (rawShipmentList.length === 0) {
                initMasterGrid([]);
                return;
            }

            const bkMap = {};
            
            // จับกลุ่มข้อมูลตาม Booking No
            rawShipmentList.forEach(item => {
                const bk = item.booking_no;
                if (!bk) return;
                
                if (!bkMap[bk]) {
                    bkMap[bk] = {
                        booking_no: bk, 
                        run_date: item.run_date ? String(item.run_date).split('T')[0] : '',
                        customer_name: item.customer_name || item.full_customer_name || '', 
                        total_count: 0, 
                        total_amount: 0,
                        disp_iv: item.iv_no || '',
                        disp_ar: item.ar_no || ''
                    };
                }
                
                // ถ้ารายการมีตู้ย่อย ให้นับตู้และรวมค่าบรรทุก
                if (item.order_id) {
                    bkMap[bk].total_count += 1;
                    bkMap[bk].total_amount += (Number(item.trip_fee) || 0);
                }
                
                if (item.iv_no && String(item.iv_no).trim() !== '') bkMap[bk].disp_iv = String(item.iv_no).trim();
                if (item.ar_no && String(item.ar_no).trim() !== '') bkMap[bk].disp_ar = String(item.ar_no).trim();
            });

            masterBookingList = Object.values(bkMap);

            // 🌟 หากเป็นข้อมูล Fallback (ไม่เจอเดือนที่เลือกแต่ดึงรายการที่มีมาแทน) ให้ปรับปุ่มเลือกเดือนตามรายการแรกอัตโนมัติ
            if (result.is_fallback && masterBookingList.length > 0 && masterBookingList[0].run_date) {
                const firstDate = masterBookingList[0].run_date;
                const [fYear, fMonth] = firstDate.split('-');
                if (fYear && fMonth) {
                    const monthEl = document.getElementById('filter-month');
                    if (monthEl) monthEl.value = `${fYear}-${fMonth}`;
                }
            }

            initMasterGrid(masterBookingList);
        } else {
            console.error("API error message:", result.message);
            initMasterGrid([]);
        }
    } catch (err) { 
        console.error("Fetch error:", err); 
        initMasterGrid([]);
    } finally { 
        if (overlay) overlay.classList.add('hidden'); 
    }
};

// 📌 ค้นหาข้อมูล
window.handleMasterFilter = function() {
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();
    if (!searchTxt) {
        initMasterGrid(masterBookingList);
        return;
    }
    
    const filteredList = masterBookingList.filter(item => {
        return (item.booking_no && item.booking_no.toLowerCase().includes(searchTxt)) ||
               (item.customer_name && item.customer_name.toLowerCase().includes(searchTxt)) ||
               (item.disp_iv && item.disp_iv.toLowerCase().includes(searchTxt));
    });
    
    initMasterGrid(filteredList);
};

// 📌 กดปุ่มไปหน้า Detail
window.openBookingDetail = function(bookingNo) {
    if (!bookingNo) return;
    window.location.href = `/billing-detail.html?booking=${encodeURIComponent(bookingNo)}`;
};

// 📌 วาดตาราง Handsontable
function initMasterGrid(data) {
    const container = document.getElementById('master-grid-container');
    if (!container) return;
    if (hotMasterInstance) { hotMasterInstance.destroy(); }

    const bookingLinkRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const valStr = value ? String(value) : '';
        if (valStr.includes('ไม่พบรายการ')) {
            td.innerHTML = `<span class="text-slate-400 italic">${valStr}</span>`;
            return;
        }
        td.innerHTML = valStr ? `
            <div class="flex items-center justify-between w-full h-full px-2">
                <span class="font-bold text-purple-700">${valStr}</span>
                <button onclick="openBookingDetail('${valStr}')" class="bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-300 px-3 py-1 rounded text-xs font-bold transition-colors shadow-sm cursor-pointer">
                    เปิดวางบิล 🔍
                </button>
            </div>
        ` : '';
    };

    // 🌟 หากไม่พบข้อมูล ให้โชว์ข้อความที่อ่านง่าย ชัดเจน ไม่ขึ้นแถวว่าง
    const tableData = data.length > 0 ? data : [
        { booking_no: 'ไม่พบรายการ Booking', run_date: '-', customer_name: 'ไม่มีข้อมูลในฐานข้อมูล', total_count: 0, total_amount: 0, disp_iv: '-', disp_ar: '-' }
    ];

    hotMasterInstance = new Handsontable(container, {
        data: tableData,
        wordWrap: false, 
        autoRowSize: false, 
        rowHeights: 36, 
        fixedColumnsLeft: 1,
        colHeaders: ['Booking No. (กดปุ่มเพื่อเปิดบิล)', 'วันที่วิ่งงาน', 'ลูกค้า', 'จำนวนตู้', 'ค่าบรรทุกรวม (บาท)', 'เลขที่ IV ✏️', 'เลขที่ AR ✏️'],
        columns: [
            { data: 'booking_no', readOnly: true, className: 'htMiddle zone-read', renderer: bookingLinkRenderer },
            { data: 'run_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { data: 'customer_name', type: 'text', readOnly: true, className: 'font-bold text-slate-700 htMiddle zone-read' },
            { data: 'total_count', type: 'numeric', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-700 zone-read' },
            { data: 'total_amount', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-emerald-700 zone-read' },
            { data: 'disp_iv', type: 'text', className: 'htCenter htMiddle font-bold text-emerald-800 uppercase zone-edit' },
            { data: 'disp_ar', type: 'text', className: 'htCenter htMiddle font-bold text-red-700 uppercase zone-edit' }
        ],
        colWidths: [260, 100, 200, 80, 150, 160, 160],
        rowHeaders: true, 
        width: '100%', 
        height: '100%', 
        stretchH: 'all', 
        manualColumnResize: true, 
        licenseKey: 'non-commercial-and-evaluation'
    });
}

// 📌 บันทึกข้อมูลเลข IV / AR
window.saveMasterBillingChanges = async function() {
    if (!hotMasterInstance) return;
    
    const currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if (!currentUser.id) {
        alert("กรุณาล็อกอินใหม่"); return;
    }

    const masterData = hotMasterInstance.getSourceData();
    const dataToSave = [];
    
    masterData.forEach(bkRow => {
        if (!bkRow || !bkRow.booking_no || bkRow.booking_no.includes('ไม่พบรายการ')) return;
        const shipments = rawShipmentList.filter(s => s.booking_no === bkRow.booking_no);
        shipments.forEach(s => {
            if (bkRow.disp_iv !== undefined) s.iv_no = bkRow.disp_iv.trim();
            if (bkRow.disp_ar !== undefined) s.ar_no = bkRow.disp_ar.trim();
            dataToSave.push(s);
        });
    });

    if (dataToSave.length === 0) return;

    try {
        const res = await fetch('/api/billing/shipments', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role }) 
        });
        const result = await res.json();
        if (result.success) { 
            alert('✅ บันทึกเลข IV และ AR เรียบร้อยแล้ว!'); 
            loadBillingMasterData(); 
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch (err) { 
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); 
    }
};