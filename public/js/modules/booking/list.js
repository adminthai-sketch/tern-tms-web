// ==========================================
// 📋 MODULE: EDITABLE BOOKING LIST (ตาราง Bookings จริง)
// ==========================================

let hotGridInstance = null;
let editedRowIndices = new Set(); 

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    document.getElementById('user-fullname').innerText = JSON.parse(savedUser).fullName;

    loadBookingGridData();
});

function logout() { localStorage.removeItem('tms_user'); window.location.href = '/login.html'; }

// 🔄 1. ดึงข้อมูลจากฐานข้อมูลจริง (ตาราง bookings)
async function loadBookingGridData() {
    try {
        const res = await fetch('/api/bookings/search?start_date=2020-01-01&end_date=2030-12-31');
        const result = await res.json();

        if (result.success && result.data) {
            populateCustomerDropdown(result.data); 
            initBookingHandsontable(result.data);
        } else {
            initBookingHandsontable([]);
        }
    } catch (err) {
        console.error('Error loading bookings:', err);
        initBookingHandsontable([]);
    }
}

// 🏢 2. เติมรายชื่อลูกค้าใน Dropdown โดยดึงจาก "customer_name"
function populateCustomerDropdown(data) {
    const select = document.getElementById('filter-customer');
    select.innerHTML = '<option value="">-- แสดงลูกค้าทั้งหมด --</option>';

    const customers = new Set();
    data.forEach(item => {
        if (item.customer_name && item.customer_name.trim() !== '') {
            customers.add(item.customer_name.trim());
        }
    });

    Array.from(customers).sort().forEach(cust => {
        const opt = document.createElement('option');
        opt.value = cust;
        opt.textContent = cust;
        select.appendChild(opt);
    });
}

// 📊 3. สร้างตาราง Excel (Handsontable)
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const headers = [
        '✔', 'ID', 'Booking No.', 'MODE', 'วันที่วิ่งงาน', 
        'ลูกค้า (customer_name)', 'ชื่องาน', 'ต้นทาง', 'ปลายทาง', 'จำนวนตู้',
        'ค่าเที่ยว', 'ค่าขนส่ง'
    ];

    const formattedTableData = data.map(item => [
        false, 
        item.id,
        item.booking_no || '',
        item.mode || 'EXPORT',
        item.run_date ? item.run_date.split('T')[0] : '',
        item.customer_name || '', // 👈 [5] คอลัมน์ลูกค้า
        item.job_name || '',
        item.origin || '',
        item.destination || '',
        item.container_count || 1,
        item.trip_fee || 0,
        item.trans_fee || 0
    ]);

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: headers,
        columns: [
            { type: 'checkbox', className: 'htCenter htMiddle' }, 
            { readOnly: true, className: 'htCenter htMiddle text-slate-400 font-bold' }, 
            { type: 'text', className: 'font-bold text-primary' }, 
            { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, 
            { type: 'date', dateFormat: 'YYYY-MM-DD' }, 
            { type: 'text', className: 'font-semibold text-slate-800' }, // customer_name
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'numeric' }, 
            { type: 'numeric', numericFormat: { pattern: '0,0.00' } }, 
            { type: 'numeric', numericFormat: { pattern: '0,0.00' } }  
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        filters: true, dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',

        // 🚨 ตรวจจับการแก้ข้อมูล
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal) editedRowIndices.add(row);
            });
        }
    });
}

// 🎯 4. ฟังก์ชันกรองตาม "customer_name" (คอลัมน์ Index 5 ในตาราง)
function filterByCustomerName() {
    if (!hotGridInstance) return;
    const selectedCustomer = document.getElementById('filter-customer').value;
    const plugin = hotGridInstance.getPlugin('filters');

    plugin.clearConditions();
    if (selectedCustomer) {
        plugin.addCondition(5, 'eq', [selectedCustomer]); 
    }
    plugin.filter();
}

// 💾 5. บันทึกข้อมูลที่ถูกแก้กลับลง DB (ยิง API ไปตาราง bookings)
async function saveGridChanges() {
    if (!hotGridInstance || editedRowIndices.size === 0) {
        alert('ℹ️ ยังไม่มีการแก้ไขข้อมูลในตาราง'); return;
    }

    const btn = document.getElementById('btn-save-grid');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotGridInstance.getData();
    let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex];
        if (!row[1]) continue; 

        const updateData = {
            booking_no: row[2],
            mode: row[3],
            run_date: row[4],
            customer_name: row[5], // 👈 เซฟกลับเป็น customer_name
            job_name: row[6],
            origin: row[7],
            destination: row[8],
            container_count: row[9],
            trip_fee: row[10],
            trans_fee: row[11]
        };

        try {
            const res = await fetch(`/api/bookings/${row[1]}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (res.ok) successCount++;
        } catch (err) { console.error('Error updating:', err); }
    }

    btn.innerHTML = originalText; btn.disabled = false;

    if (successCount > 0) {
        alert(`✅ บันทึกสำเร็จ ${successCount} รายการ!`);
        editedRowIndices.clear();
        loadBookingGridData();
    } else {
        alert('❌ บันทึกไม่สำเร็จ');
    }
}

// 🗑️ 6. ลบแถว (ยิง API DELETE)
async function deleteSelectedRows() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = [];

    data.forEach(row => { if (row[0] === true && row[1]) idsToDelete.push(row[1]); });

    if (idsToDelete.length === 0) { alert('กรุณาติ๊กเลือกช่อง ✔ หน้าแถวก่อนครับ'); return; }
    if (!confirm(`⚠️ ยืนยันการลบ Booking ${idsToDelete.length} รายการ?`)) return;

    let successCount = 0;
    for (let id of idsToDelete) {
        try {
            const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
            if (res.ok) successCount++;
        } catch (err) {}
    }

    alert(`✅ ลบสำเร็จ ${successCount} รายการ`);
    loadBookingGridData();
}