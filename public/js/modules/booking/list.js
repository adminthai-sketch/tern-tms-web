// ==========================================
// 📋 MODULE: BOOKING LIST (Monthly Fetch, Quick Filters, Action Buttons)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; // เก็บ Data ของเดือนนั้นๆ ไว้เพื่อทำ Quick Filters
let editedRowIndices = new Set(); 

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    
    // ตั้งค่า Default เป็นเดือนปัจจุบัน (YYYY-MM)
    const today = new Date();
    const monthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    document.getElementById('filter-month').value = monthStr;

    loadBookingGridData();
});

// 🔄 1. ดึงข้อมูลรายเดือน (ยิง API ไปตาราง bookings)
async function loadBookingGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;

    // คำนวณวันแรก และวันสุดท้ายของเดือนที่เลือก
    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    try {
        // ยิง API ค้นหาตามช่วงวันที่
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();

        if (result.success && result.data) {
            rawBookingList = result.data;
            document.getElementById('total-count').innerText = `${rawBookingList.length} รายการ`;
            
            // อัปเดตตัวเลือกใน Dropdown ค้นหาด่วน
            populateQuickFilters(rawBookingList); 
            // วาดตาราง
            initBookingHandsontable(rawBookingList);
        } else {
            document.getElementById('total-count').innerText = `0 รายการ`;
            initBookingHandsontable([]);
        }
    } catch (err) {
        console.error('Error loading bookings:', err);
        initBookingHandsontable([]);
    }
}

// 🏢 2. เติมข้อมูลใส่ Quick Filters (ลูกค้า และ Booking No.)
function populateQuickFilters(data) {
    const selCust = document.getElementById('filter-customer');
    const selBook = document.getElementById('filter-booking-no');
    
    selCust.innerHTML = '<option value="">-- ลูกค้าทั้งหมด --</option>';
    selBook.innerHTML = '<option value="">-- ทุก Booking --</option>';

    const customers = new Set();
    const bookings = new Set();

    data.forEach(item => {
        if (item.customer_name) customers.add(item.customer_name.trim());
        if (item.booking_no) bookings.add(item.booking_no.trim());
    });

    Array.from(customers).sort().forEach(c => selCust.innerHTML += `<option value="${c}">${c}</option>`);
    Array.from(bookings).sort().forEach(b => selBook.innerHTML += `<option value="${b}">${b}</option>`);
}

// 📊 3. สร้างตารางแบบแก้ไขได้ (พร้อมปุ่ม Action ด้านขวาสุด)
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }

    // ปั้นข้อมูลเข้าตาราง (เพิ่มช่อง Action ท้ายสุด)
    const formattedTableData = data.map(item => [
        false, // 0: Checkbox
        item.id, // 1
        item.booking_no || '', // 2
        item.mode || 'EXPORT', // 3
        item.run_date ? item.run_date.split('T')[0] : '', // 4: วันที่วิ่งงาน
        item.customer_name || '', // 5
        item.job_name || '', // 6
        item.origin || '', // 7
        item.destination || '', // 8
        item.container_count || 1, // 9: จำนวนตู้
        item.booking_no // 10: ใช้สำหรับสร้างปุ่ม Action HTML
    ]);

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: ['✔', 'ID', 'Booking No.', 'MODE', 'วันที่วิ่งงาน', 'ลูกค้า', 'ชื่องาน', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้', 'การจัดการ (Actions)'],
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold' }, 
            { type: 'text', className: 'font-bold text-primary' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD' }, 
            { type: 'text', className: 'font-semibold text-slate-800' }, // ลูกค้า
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'numeric', className: 'htCenter font-bold text-blue-600 bg-blue-50/30' }, 
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value, cellProperties) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if(value) {
                        // 🌟 วาดปุ่มเชื่อมโยง (Gateway) ไปหน้าฟอร์ม / ตู้ / จัดรถ
                        td.innerHTML = `
                            <button onclick="goToFormEdit('${value}')" class="btn-grid btn-edit" title="กลับไปแก้ฟอร์ม"><i class="fa-solid fa-pen-to-square"></i> แก้ฟอร์ม</button>
                            <button onclick="goToContainerManage('${value}')" class="btn-grid btn-manage" title="ไปลงเบอร์ตู้"><i class="fa-solid fa-boxes-stacked"></i> ลงตู้</button>
                            <button onclick="goToDispatchMonitor('${value}')" class="btn-grid btn-dispatch" title="ไปจัดรถ"><i class="fa-solid fa-truck-fast"></i> จัดรถ</button>
                        `;
                        td.style.textAlign = 'center';
                    }
                } 
            }
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',
        
        colWidths: [40, 50, 150, 90, 100, 150, 150, 120, 120, 80, 220],

        // ดักจับการแก้ไข
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) {
                    editedRowIndices.add(row);
                }
            });
        }
    });
}

// 🎯 4. ระบบ Quick Filters ประมวลผลจากหน้าจอ
function applyQuickFilters() {
    if (!hotGridInstance) return;
    const runDate = document.getElementById('filter-run-date').value;
    const cust = document.getElementById('filter-customer').value;
    const bookNo = document.getElementById('filter-booking-no').value;

    const plugin = hotGridInstance.getPlugin('filters');
    plugin.clearConditions();

    if (runDate) plugin.addCondition(4, 'eq', [runDate]); // Col 4: run_date
    if (cust) plugin.addCondition(5, 'eq', [cust]); // Col 5: ลูกค้า
    if (bookNo) plugin.addCondition(2, 'eq', [bookNo]); // Col 2: Booking No.

    plugin.filter();
}

function clearQuickFilters() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    applyQuickFilters();
}

// 🚀 5. ฟังก์ชันปุ่ม Action ข้ามหน้า (Gateway Routing)
function goToFormEdit(bookingNo) {
    window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`;
}

function goToContainerManage(bookingNo) {
    // พาไปหน้าจัดการตู้ พร้อมโยน Booking No ไปให้ระบบ Auto-Select
    window.location.href = `/booking-manage.html?select=${encodeURIComponent(bookingNo)}`;
}

function goToDispatchMonitor(bookingNo) {
    // พาไปหน้าจัดรถ พร้อมโยน Booking No ไปให้ระบบ Auto-Select
    window.location.href = `/booking-monitor.html?select=${encodeURIComponent(bookingNo)}`;
}

// 💾 6. บันทึกข้อมูลแบบ Quick Edit กลับลง DB (ตาราง bookings)
async function saveGridChanges() {
    if (!hotGridInstance || editedRowIndices.size === 0) { alert('ℹ️ ไม่มีข้อมูลการแก้ไขใหม่ในตาราง'); return; }

    const btn = document.getElementById('btn-save-grid');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotGridInstance.getData();
    let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex];
        if (!row[1]) continue; 

        // จัดเตรียมข้อมูลที่แก้ไขส่งไปอัปเดต
        const updateData = {
            booking_no: row[2], mode: row[3], run_date: row[4],
            customer_name: row[5], job_name: row[6], origin: row[7], 
            destination: row[8], container_count: row[9]
        };

        try {
            const res = await fetch(`/api/bookings/${row[1]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            if (res.ok) successCount++;
        } catch (err) {}
    }

    btn.innerHTML = originalText; btn.disabled = false;
    if (successCount > 0) { 
        alert(`✅ บันทึกสำเร็จ ${successCount} รายการ!`); 
        editedRowIndices.clear(); 
        loadBookingGridData(); // โหลดข้อมูลใหม่เพื่อให้ UI รีเฟรช
    }
}

// 🗑️ 7. ลบแถว (ยิง API DELETE)
async function deleteSelectedRows() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = [];

    data.forEach(row => { if (row[0] === true && row[1]) idsToDelete.push(row[1]); });
    if (idsToDelete.length === 0) return;
    if (!confirm(`⚠️ ยืนยันการลบ ${idsToDelete.length} รายการ? (ตู้/ออเดอร์ลูก ทั้งหมดจะถูกลบไปด้วย)`)) return;

    for (let id of idsToDelete) {
        try { await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); } catch (err) {}
    }
    alert('✅ ลบสำเร็จ'); loadBookingGridData();
}