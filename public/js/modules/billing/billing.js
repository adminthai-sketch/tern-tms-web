// ==========================================
// 💸 MODULE: BILLING & INVOICING
// ==========================================

let hotGridInstance = null;
let rawBillingList = []; 
let filteredList = [];   
let editedRowIndices = new Set(); 
let currentUser = {};

window.addEventListener('DOMContentLoaded', async () => {
    applyBillingCSS();
    currentUser = JSON.parse(localStorage.getItem('tms_user') || '{}');
    
    const today = new Date();
    document.getElementById('filter-month').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    
    await loadBillingData();
});

function applyBillingCSS() {
    if (!document.getElementById('tms-billing-css')) {
        const style = document.createElement('style');
        style.id = 'tms-billing-css';
        style.innerHTML = `
            .handsontable td { vertical-align: middle !important; border-color: #e2e8f0; font-size: 11px !important; padding: 2px 4px !important; }
            .handsontable th { background-color: #f8fafc; color: #334155; font-weight: 700 !important; border-color: #cbd5e1; font-size: 11px !important; }
            
            .zone-read { background-color: #f8fafc !important; color: #64748b; }
            .zone-edit { background-color: #ffffff !important; color: #0f4c81; font-weight: 600; }
            .zone-locked { background-color: #f1f5f9 !important; color: #94a3b8 !important; pointer-events: none; }
            
            .ht-edited-row { border-left: 3px solid #8b5cf6 !important; } /* สีม่วงสำหรับบิลลิ่ง */
            
            .badge-pending { background-color: #fef2f2; color: #ef4444; border: 1px solid #fca5a5; padding: 1px 4px; border-radius: 4px; font-size: 9px; }
            .badge-billed { background-color: #f0fdf4; color: #10b981; border: 1px solid #6ee7b7; padding: 1px 4px; border-radius: 4px; font-size: 9px; }
            .badge-locked { background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: 800; }
        `;
        document.head.appendChild(style);
    }
}

function formatShortDate(dt) {
    if (!dt || String(dt).trim() === 'NaN' || String(dt).trim() === 'null') return '';
    return String(dt).split('T')[0]; // เอาแค่วันที่ (YYYY-MM-DD)
}

// 🌟 ดึงข้อมูล API หน้าบิลลิ่ง
window.loadBillingData = async function() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const response = await fetch(`/api/billing/shipments?year=${year}&month=${month}`);
        const result = await response.json();

        if (result.success && result.data) {
            rawBillingList = result.data.map(item => {
                item._disp_date = formatShortDate(item.run_date);
                // ดึงเบอร์ตู้ 1 มาโชว์เป็นหลัก
                item._disp_container = item.container_1_no || item.container_2_no || '';
                // ดึงทะเบียนรถขา 1 เป็นหลัก
                item._disp_plate = item.leg1_plate || item.leg2_plate || item.leg3_plate || '';
                item._checkbox = false;
                
                // คำนวณสถานะอัตโนมัติจากรหัส IV
                if (item.is_locked) {
                    item._calc_status = '🔒 ปิดจ๊อบ';
                } else if (item.iv_no && item.iv_no.trim() !== '') {
                    item._calc_status = '📄 วางบิลแล้ว';
                } else {
                    item._calc_status = '⏳ รอวางบิล';
                }
                
                // ยอดรวมต่อตู้ (ค่าบรรทุก + ค่าผ่านท่า + ค่าฝากตู้)
                item._total_amt = (Number(item.trip_fee)||0) + (Number(item.port_pass_fee)||0) + (Number(item.deposit_fee)||0);
                
                return item;
            });

            editedRowIndices.clear();
            updateFilterDropdowns();
            handleFilter();
        } else {
            rawBillingList = []; handleFilter();
        }
    } catch (err) {
        console.error(err);
        rawBillingList = []; handleFilter();
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
};

function updateFilterDropdowns() {
    const dates = new Set(), custs = new Set(), books = new Set();
    rawBillingList.forEach(i => {
        if (i._disp_date) dates.add(i._disp_date);
        if (i.customer_name) custs.add(i.customer_name.trim());
        if (i.booking_no) books.add(i.booking_no.trim());
    });
    
    const dlDate = document.getElementById('dl-run-date');
    const dlCust = document.getElementById('dl-customer');
    const dlBook = document.getElementById('dl-booking-no');
    
    dlDate.innerHTML = ''; Array.from(dates).sort().forEach(v => dlDate.innerHTML += `<option value="${v}">`);
    dlCust.innerHTML = ''; Array.from(custs).sort().forEach(v => dlCust.innerHTML += `<option value="${v}">`);
    dlBook.innerHTML = ''; Array.from(books).sort().forEach(v => dlBook.innerHTML += `<option value="${v}">`);
}

window.handleFilter = function() {
    const d = document.getElementById('filter-run-date').value;
    const c = document.getElementById('filter-customer').value;
    const b = document.getElementById('filter-booking-no').value;
    const searchTxt = document.getElementById('global-search').value.toLowerCase().trim();

    filteredList = rawBillingList.filter(item => {
        const matchD = !d || item._disp_date === d; 
        const matchC = !c || (item.customer_name && item.customer_name.trim() === c); 
        const matchB = !b || (item.booking_no && item.booking_no.trim() === b);
        const matchGlobal = !searchTxt || JSON.stringify(item).toLowerCase().includes(searchTxt);
        return matchD && matchC && matchB && matchGlobal;
    });
    
    updateKPI(filteredList);
    initBillingGrid(filteredList);
};

window.clearAllFilters = function() { 
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = ''; 
    document.getElementById('global-search').value = ''; 
    handleFilter(); 
};

window.setQuickFilter = function(type) {
    if (type === 'pending') {
        filteredList = rawBillingList.filter(item => !item.iv_no || item.iv_no.trim() === '');
    } else {
        filteredList = rawBillingList.filter(item => item.iv_no && item.iv_no.trim() !== '');
    }
    updateKPI(filteredList);
    initBillingGrid(filteredList);
};

// 🌟 ฟังก์ชันคำนวณ KPI อัตโนมัติ (นับตู้, รวมเงิน)
function updateKPI(dataList) {
    let pendingCount = 0, pendingAmt = 0;
    let billedCount = 0, billedAmt = 0;
    
    dataList.forEach(item => {
        if (!item.iv_no || item.iv_no.trim() === '') {
            pendingCount++;
            pendingAmt += item._total_amt;
        } else {
            billedCount++;
            billedAmt += item._total_amt;
        }
    });
    
    document.getElementById('stat-pending-count').innerText = `${pendingCount} ตู้`;
    document.getElementById('stat-pending-amt').innerText = `${pendingAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
    
    document.getElementById('stat-billed-count').innerText = `${billedCount} ตู้`;
    document.getElementById('stat-billed-amt').innerText = `${billedAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`;
}

function initBillingGrid(data) {
    const container = document.getElementById('billing-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const statusRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.textAlign = 'center';
        if (value.includes('ปิดจ๊อบ')) {
            td.innerHTML = `<span class="badge-locked"><i class="fa-solid fa-lock"></i> ปิดจ๊อบ</span>`;
        } else if (value.includes('วางบิลแล้ว')) {
            td.innerHTML = `<span class="badge-billed"><i class="fa-solid fa-check"></i> มี IV แล้ว</span>`;
        } else {
            td.innerHTML = `<span class="badge-pending"><i class="fa-regular fa-clock"></i> รอวางบิล</span>`;
        }
    };

    hotGridInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 28,
        fixedColumnsLeft: 3,
        
        colHeaders: [
            '✔', 'Order ID', 'สถานะ', 'วันที่', 'Booking', 'ลูกค้า', 'ต้นทาง', 'ปลายทาง', 
            'ทะเบียนรถ', 'เบอร์ตู้', 'ขนาด', 
            'น้ำหนัก (KG) ✏️', 'ค่าบรรทุก', 'ค่าผ่านท่า', 'ค่าฝาก/คืนตู้',
            'เลขที่ คชจ.สำรอง (AR) ✏️', 'เลขที่ใบแจ้งหนี้ (IV) ✏️', 'หมายเหตุบัญชี ✏️'
        ],
        columns: [
            { data: '_checkbox', type: 'checkbox', className: 'htCenter htMiddle zone-read' }, 
            { data: 'order_id', type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter htMiddle zone-read' }, 
            { data: '_calc_status', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read', renderer: statusRenderer }, 
            { data: '_disp_date', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-read' },
            { 
    data: 'booking_no', 
    readOnly: true, 
    className: 'htCenter htMiddle zone-read',
    renderer: function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `<a href="/print-invoice.html?booking=${value}" target="_blank" title="คลิกเพื่อพิมพ์ใบแจ้งหนี้" class="text-blue-600 font-bold underline hover:text-blue-800 transition-colors">${value || ''}</a>`;
    } 
},
            { data: 'customer_name', type: 'text', readOnly: true, className: 'text-slate-700 font-bold htMiddle zone-read' }, 
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' }, 
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-500 htMiddle zone-read' }, 
            
            { data: '_disp_plate', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-slate-600 zone-read' },
            { data: '_disp_container', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-blue-600 zone-read' },
            { data: 'container_size', type: 'text', readOnly: true, className: 'htCenter htMiddle text-slate-500 zone-read' },
            
            // Editable Zone (บัญชีกรอก)
            { data: 'gross_weight', type: 'numeric', numericFormat: { pattern: '0,0.00' }, className: 'htRight htMiddle zone-edit' },
            
            // Fees (Read only)
            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle font-bold text-slate-700 zone-read' },
            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle text-slate-600 zone-read' },
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0.00' }, readOnly: true, className: 'htRight htMiddle text-slate-600 zone-read' },
            
            // AR, IV, Remark (Editable)
            { data: 'ar_no', type: 'text', className: 'htCenter htMiddle font-bold text-purple-700 uppercase zone-edit' },
            { data: 'iv_no', type: 'text', className: 'htCenter htMiddle font-bold text-emerald-700 uppercase zone-edit' },
            { data: 'billing_remark', type: 'text', className: 'htLeft htMiddle zone-edit' }
        ],
        colWidths: [
            30, 110, 80, 80, 100, 120, 100, 100,
            90, 100, 60,
            100, 90, 80, 80,
            140, 140, 180
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        
        // 🌟 เพิ่มเมนูคลิกขวา (Context Menu) สำหรับบัญชี 🌟
        contextMenu: {
            items: {
                "copy_down": {
                    name: '⬇️ ก๊อปปี้ AR/IV ลงแถวด้านล่างทั้งหมด (Auto-fill)',
                    callback: function(key, selection) {
                        const startRow = selection[0].start.row;
                        const arVal = this.getDataAtRowProp(startRow, 'ar_no');
                        const ivVal = this.getDataAtRowProp(startRow, 'iv_no');
                        const totalRows = this.countRows();
                        for (let r = startRow + 1; r < totalRows; r++) {
                            // ข้ามแถวที่ปิดจ๊อบแล้ว
                            if (this.getDataAtRowProp(r, 'is_locked')) continue;
                            if (arVal) this.setDataAtRowProp(r, 'ar_no', arVal);
                            if (ivVal) this.setDataAtRowProp(r, 'iv_no', ivVal);
                        }
                    }
                },
                "hsep1": "---------",
                "lock_job": {
                    name: '🔒 ปิดจ๊อบ (ล็อคข้อมูลห้ามแก้)',
                    callback: function(key, selection) { toggleAdminLock(selection, true); }
                },
                "unlock_job": {
                    name: '🔓 ปลดล็อคจ๊อบ (Admin Only)',
                    callback: function(key, selection) { toggleAdminLock(selection, false); },
                    disabled: function() {
                        const role = (currentUser.role || '').toUpperCase();
                        return role !== 'ADMIN'; // ปิดการกดถ้าไม่ใช่ Admin
                    }
                },
                "hsep2": "---------",
                "copy": { name: 'คัดลอก (Copy)' }
            }
        },
        licenseKey: 'non-commercial-and-evaluation',

        // 🌟 ฟังก์ชันล็อคเซลล์ ถ้าสถานะ = is_locked 🌟
        cells: function(row, col) {
            const cp = {};
            const src = this.instance.getSourceDataAtRow(row);
            
            // ถ้าแถวนี้มีการแก้ไข ให้ขึ้นขอบสีม่วง
            if (editedRowIndices.has(row)) { cp.className = (cp.className || '') + ' ht-edited-row'; }
            
            // ถ้าโดนล็อคปิดจ๊อบไปแล้ว
            if (src && (src.is_locked === true || src.is_locked === 'true')) {
                cp.readOnly = true;
                cp.className = (cp.className || '') + ' zone-locked';
            }
            return cp;
        },

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== '_checkbox') editedRowIndices.add(row);
            });
            updateSaveBadge();
        }
    });
}

// 🌟 ฟังก์ชัน สั่งล็อค/ปลดล็อค ยิง API ไปหลังบ้าน
async function toggleAdminLock(selection, isLocked) {
    if (!hotGridInstance) return;
    const role = (currentUser.role || '').toUpperCase();
    if (!isLocked && role !== 'ADMIN') { alert("❌ เฉพาะ Admin เท่านั้นที่สามารถปลดล็อคบิลได้!"); return; }

    const startRow = selection[0].start.row;
    const endRow = selection[0].end.row;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);

    const promises = [];
    for (let r = minRow; r <= maxRow; r++) {
        const orderId = hotGridInstance.getDataAtRowProp(r, 'order_id');
        if (orderId) {
            promises.push(
                fetch('/api/billing/toggle-lock', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: orderId, is_locked: isLocked, username: currentUser.username, role: role })
                })
            );
        }
    }
    
    await Promise.all(promises);
    alert(isLocked ? "🔒 ปิดจ๊อบสำเร็จ ข้อมูลถูกล็อคแล้ว!" : "🔓 ปลดล็อคสำเร็จ กลับไปแก้ไขได้แล้ว!");
    loadBillingData(); // รีเฟรชตาราง
}

function updateSaveBadge() {
    const badge = document.getElementById('save-status-badge');
    if(!badge) return;
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "text-[11px] font-bold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> ${count} รายการรอเซฟ`;
    } else {
        badge.className = "hidden";
    }
}

// 🌟 ฟังก์ชันบันทึกข้อมูล (Save)
window.saveBillingChanges = async function() {
    if (!hotGridInstance || editedRowIndices.size === 0) return;
    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...'; btn.disabled = true;

    const dataToSave = [];
    editedRowIndices.forEach(idx => { dataToSave.push(hotGridInstance.getSourceDataAtRow(idx)); });

    try {
        const res = await fetch('/api/billing/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave, user_id: currentUser.id, user_role: currentUser.role }) 
        });
        const result = await res.json();
        if (result.success) {
            alert('✅ บันทึกข้อมูลใบแจ้งหนี้สำเร็จ!');
            editedRowIndices.clear();
            loadBillingData(); 
        } else {
            alert('❌ ข้อผิดพลาด: ' + result.message);
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText; btn.disabled = false;
        updateSaveBadge();
    }
};

// ฟังก์ชัน พิมพ์เอกสาร (เดี๋ยวเราทำไฟล์ print-invoice.html ต่อครับ)
window.printInvoice = function() {
    // หากลุ่มแถวที่ผู้ใช้ติ๊ก Checkbox ไว้
    const data = hotGridInstance.getData();
    const selectedIVs = new Set();
    
    data.forEach((row, index) => {
        const src = hotGridInstance.getSourceDataAtRow(index);
        if ((src._checkbox === true || src._checkbox === 'true') && src.iv_no) {
            selectedIVs.add(src.iv_no.trim());
        }
    });

    if (selectedIVs.size === 0) {
        alert("⚠️ กรุณาติ๊กถูกหน้ารายการที่มี 'เลขที่ใบแจ้งหนี้ (IV)' อย่างน้อย 1 รายการเพื่อพิมพ์ครับ");
        return;
    }
    
    if (selectedIVs.size > 1) {
        alert("⚠️ กรุณาติ๊กเลือกรายการที่เป็นเลขใบแจ้งหนี้ (IV) เดียวกันเท่านั้นครับ");
        return;
    }
    
    // เปิดแท็บใหม่ไปหน้าปริ้นท์ พร้อมแนบเลข IV ไปทาง URL
    const targetIV = Array.from(selectedIVs)[0];
    window.open(`/print-invoice.html?iv=${encodeURIComponent(targetIV)}`, '_blank');
};