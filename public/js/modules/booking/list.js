// ==========================================
// 📋 MODULE: BOOKING LIST (Monthly Fetch, Quick Filters, Custom Columns)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; 
let editedRowIndices = new Set(); 

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName;
    
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
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();

        if (result.success && result.data) {
            rawBookingList = result.data;
            document.getElementById('total-count').innerText = `${rawBookingList.length} รายการ`;
            
            // อัปเดตตัวเลือกใน Dropdown ค้นหาด่วน (อิงจากเดือนนี้เท่านั้น)
            populateQuickFilters(rawBookingList); 
            // วาดตาราง
            initBookingHandsontable(rawBookingList);
        } else {
            document.getElementById('total-count').innerText = `0 รายการ`;
            populateQuickFilters([]);
            initBookingHandsontable([]);
        }
    } catch (err) {
        console.error('Error loading bookings:', err);
        initBookingHandsontable([]);
    }
}

// 🏢 2. เติมข้อมูลใส่ Quick Filters (กรองเอาเฉพาะข้อมูลของเดือนนี้)
function populateQuickFilters(data) {
    const selDate = document.getElementById('filter-run-date');
    const selCust = document.getElementById('filter-customer');
    const selBook = document.getElementById('filter-booking-no');
    
    selDate.innerHTML = '<option value="">-- วันที่วิ่งงาน --</option>';
    selCust.innerHTML = '<option value="">-- ลูกค้า (customer_name) --</option>';
    selBook.innerHTML = '<option value="">-- รายการ Booking --</option>';

    const dates = new Set(), customers = new Set(), bookings = new Set();

    data.forEach(item => {
        if (item.run_date) dates.add(item.run_date.split('T')[0]);
        if (item.customer_name) customers.add(item.customer_name.trim());
        if (item.booking_no) bookings.add(item.booking_no.trim());
    });

    Array.from(dates).sort().forEach(d => selDate.innerHTML += `<option value="${d}">${d}</option>`);
    Array.from(customers).sort().forEach(c => selCust.innerHTML += `<option value="${c}">${c}</option>`);
    Array.from(bookings).sort().forEach(b => selBook.innerHTML += `<option value="${b}">${b}</option>`);
}

// 📊 3. สร้างตารางแบบแก้ไขได้ (เพิ่มคอลัมน์ PICK UP, DELIVERY, RETURN)
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }

    // แปลงข้อมูลให้อยู่ในรูป Array สำหรับ Handsontable
    const formattedTableData = data.map(item => {
        // ประมวลผลเวลาให้อ่านง่าย
        const cyOrPort = item.cy_date ? `CY: ${item.cy_date}` : '';
        const vgmOrRent = item.vgm_cutoff ? `VGM: ${item.vgm_cutoff}` : (item.rent_cutoff ? `RENT: ${item.rent_cutoff}` : '');
        const pickupStr = `${cyOrPort}\n${vgmOrRent}`.trim();

        const loadOrUnload = item.load_date ? `LOAD: ${item.load_date}` : (item.unload_date ? `UNLOAD: ${item.unload_date}` : '');
        
        const returnStr = item.return_date ? `RETURN: ${item.return_date}` : (item.open_gate ? `GATE: ${item.open_gate}` : '');

        return [
            false, // 0: Checkbox
            item.id, // 1
            item.booking_no || '', // 2
            item.mode || 'EXPORT', // 3
            item.run_date ? item.run_date.split('T')[0] : '', // 4
            item.customer_name || '', // 5
            item.job_name || item.job_title || '', // 6
            item.origin || '', // 7
            item.destination || '', // 8
            item.container_count || 1, // 9
            pickupStr, // 10: 📦 PICK UP (รวมข้อมูล)
            loadOrUnload, // 11: 🚚 DELIVERY (รวมข้อมูล)
            returnStr, // 12: 🔄 RETURN (รวมข้อมูล)
            item.booking_no // 13: Action Buttons
        ];
    });

    const colHeaders = [
        '✔', 'ID', 'Booking No.', 'MODE', 'วันที่วิ่งงาน', 'ลูกค้า', 'ชื่องาน', 
        'ต้นทาง', 'ปลายทาง', 'ตู้', '📦 PICK UP (CY/VGM)', '🚚 DELIVERY (LOAD/UNLOAD)', '🔄 RETURN (GATE/RETURN)', 'การจัดการ (Actions)'
    ];

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: colHeaders,
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold' }, 
            { type: 'text', className: 'font-bold text-primary' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD' }, 
            { type: 'text', className: 'font-semibold text-slate-800' }, 
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'numeric', className: 'htCenter font-bold text-blue-600 bg-blue-50/30' }, 
            { type: 'text', renderer: renderMultiline }, // 10: PICK UP
            { type: 'text', renderer: renderMultiline }, // 11: DELIVERY
            { type: 'text', renderer: renderMultiline }, // 12: RETURN
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value, cellProperties) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if(value) {
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
        
        colWidths: [30, 40, 110, 70, 80, 110, 110, 80, 80, 40, 130, 130, 130, 160],

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

// ทำให้ช่อง Text ธรรมดารองรับการขึ้นบรรทัดใหม่ (\n) ได้สวยๆ
function renderMultiline(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    if(value) {
        td.innerHTML = String(value).replace(/\n/g, '<br>');
    }
}

// 🎯 4. ระบบ Quick Filters
function applyQuickFilters() {
    if (!hotGridInstance) return;
    const runDate = document.getElementById('filter-run-date').value;
    const cust = document.getElementById('filter-customer').value;
    const bookNo = document.getElementById('filter-booking-no').value;

    const plugin = hotGridInstance.getPlugin('filters');
    plugin.clearConditions();

    if (runDate) plugin.addCondition(4, 'eq', [runDate]); 
    if (cust) plugin.addCondition(5, 'eq', [cust]); 
    if (bookNo) plugin.addCondition(2, 'eq', [bookNo]); 

    plugin.filter();
}

function clearQuickFilters() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    applyQuickFilters();
}

// 🚀 5. ฟังก์ชันปุ่ม Action ข้ามหน้า
function goToFormEdit(bookingNo) { window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`; }
function goToContainerManage(bookingNo) { window.location.href = `/booking-manage.html?select=${encodeURIComponent(bookingNo)}`; }
function goToDispatchMonitor(bookingNo) { window.location.href = `/booking-monitor.html?select=${encodeURIComponent(bookingNo)}`; }

// 💾 6. บันทึกข้อมูลที่แก้ไขในตาราง
async function saveGridChanges() {
    if (!hotGridInstance || editedRowIndices.size === 0) { alert('ℹ️ ไม่มีข้อมูลการแก้ไขใหม่ในตาราง'); return; }

    const btn = document.getElementById('btn-save-grid');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...';
    btn.disabled = true;

    const data = hotGridInstance.getData();
    let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex];
        if (!row[1]) continue; 

        // ในอนาคตคุณสามารถเขียนฟังก์ชัน Parse ข้อมูลจากช่อง PICK UP/DELIVERY กลับไปเป็น Field ย่อยๆ ได้
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

    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกในตาราง'; btn.disabled = false;
    if (successCount > 0) { 
        alert(`✅ บันทึกสำเร็จ ${successCount} รายการ!`); 
        editedRowIndices.clear(); 
        loadBookingGridData(); 
    }
}

// 🗑️ 7. ลบแถว
async function deleteSelectedRows() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = [];

    data.forEach(row => { if (row[0] === true && row[1]) idsToDelete.push(row[1]); });
    if (idsToDelete.length === 0) return;
    if (!confirm(`⚠️ ยืนยันการลบ ${idsToDelete.length} รายการ? (ตู้ที่ผูกกับ Booking จะถูกลบไปด้วย)`)) return;

    for (let id of idsToDelete) {
        try { await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); } catch (err) {}
    }
    alert('✅ ลบสำเร็จ'); loadBookingGridData();
}