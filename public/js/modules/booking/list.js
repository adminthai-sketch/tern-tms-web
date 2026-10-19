// ==========================================
// 📋 MODULE: EDITABLE BOOKING GRID (Handsontable)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; // เก็บ Raw Data ทั้งหมดจาก DB
let editedRowIndices = new Set(); // เก็บ Index ของแถวที่มีการแก้ไข

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }

    loadBookingGridData();
});

// 🔄 1. ดึงข้อมูล Booking ทั้งหมดจาก DB
async function loadBookingGridData() {
    try {
        const res = await fetch('/api/bookings/search?start_date=2020-01-01&end_date=2030-12-31');
        const result = await res.json();

        if (result.success && result.data) {
            rawBookingList = result.data;
            populateCustomerDropdown(rawBookingList);
            initBookingHandsontable(rawBookingList);
        } else {
            initBookingHandsontable([]);
        }
    } catch (err) {
        console.error('Error loading bookings:', err);
        initBookingHandsontable([]);
    }
}

// 🏢 2. เติมรายชื่อลูกค้าใน Dropdown กรอง customer_name
function populateCustomerDropdown(data) {
    const select = document.getElementById('filter-customer');
    select.innerHTML = '<option value="">-- ลูกค้าทั้งหมด (Show All) --</option>';

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

// 📊 3. สร้างตาราง Handsontable ที่แก้ไขได้ทุกคอลัมน์
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }

    // หัวตารางครอบคลุมตาม DB Schema
    const headers = [
        '✔', 'ID', 'Booking No.', 'MODE', 'วันที่เปิดบิล', 'วันที่วิ่งงาน (run_date)', 
        'ชื่องาน (job_name)', 'Job Type', 'ลูกค้า (customer_name)', 'Agent', 'ต้นทาง (origin)', 
        'ปลายทาง (destination)', 'จำนวนตู้', 'CY Date', 'VGM Cutoff', 'Cutoff Time', 
        'Load Date', 'Open Gate', 'Rent Cutoff', 'Demurrage', 'Unload Date', 
        'Return Date', 'ประเภทรถ', 'ค่าเที่ยว', 'ค่าขนส่ง'
    ];

    // แปลงโครงสร้าง Object DB ให้อยู่ในรูปแบบ Array
    const formattedTableData = data.map(item => [
        false, // [0] Checkbox สำหรับลบ
        item.id,
        item.booking_no || '',
        item.mode || 'EXPORT',
        item.booking_date ? item.booking_date.split('T')[0] : '',
        item.run_date ? item.run_date.split('T')[0] : '',
        item.job_name || '',
        item.job_type || '',
        item.customer_name || '',
        item.agent || '',
        item.origin || '',
        item.destination || '',
        item.container_count || 1,
        item.cy_date || '',
        item.vgm_cutoff || '',
        item.cutoff_time || '',
        item.load_date || '',
        item.open_gate || '',
        item.rent_cutoff || '',
        item.demurrage || '',
        item.unload_date || '',
        item.return_date || '',
        item.price_type || '',
        item.trip_fee || 0,
        item.trans_fee || 0
    ]);

    let colsConfig = [
        { type: 'checkbox', className: 'htCenter htMiddle' }, // [0]
        { readOnly: true, className: 'htCenter htMiddle font-bold text-slate-400' }, // [1] ID
        { type: 'text', className: 'font-bold text-primary' }, // [2] Booking No
        { type: 'dropdown', source: ['EXPORT', 'IMPORT', 'TRANSFER'] }, // [3]
        { type: 'date', dateFormat: 'YYYY-MM-DD' }, // [4]
        { type: 'date', dateFormat: 'YYYY-MM-DD' }, // [5] run_date
        { type: 'text' }, // [6]
        { type: 'dropdown', source: ['Domestic', 'CONTAINER'] }, // [7]
        { type: 'text', className: 'font-semibold' }, // [8] customer_name
        { type: 'text' }, // [9]
        { type: 'text' }, // [10]
        { type: 'text' }, // [11]
        { type: 'numeric' }, // [12]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [13]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [14]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [15]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [16]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [17]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [18]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [19]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [20]
        { type: 'text', placeholder: 'YYYY-MM-DD HH:mm' }, // [21]
        { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] }, // [22]
        { type: 'numeric', numericFormat: { pattern: '0,0' } }, // [23]
        { type: 'numeric', numericFormat: { pattern: '0,0' } }  // [24]
    ];

    hotGridInstance = new Handsontable(container, {
        data: formattedTableData,
        colHeaders: headers,
        columns: colsConfig,
        rowHeaders: true,
        width: '100%',
        height: '100%',
        stretchH: 'all',
        manualColumnResize: true,
        manualColumnMove: true,
        
        // 🔍 เปิดโหมด Excel Filtering (สามารถคลิกหัวตารางกรองได้)
        filters: true,
        dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        
        licenseKey: 'non-commercial-and-evaluation',

        // ตรวจจับการแก้ไขข้อมูลเพื่อระบุแถวที่เปลี่ยน
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal) {
                    editedRowIndices.add(row);
                }
            });
        }
    });
}

// 🎯 4. ฟังก์ชันกรองตามคอลัมน์ customer_name
function filterByCustomerName() {
    if (!hotGridInstance) return;
    const selectedCustomer = document.getElementById('filter-customer').value;
    const plugin = hotGridInstance.getPlugin('filters');

    plugin.clearConditions();
    if (selectedCustomer) {
        // Index 8 คือ คอลัมน์ customer_name
        plugin.addCondition(8, 'eq', [selectedCustomer]);
    }
    plugin.filter();
}

// 💾 5. บันทึกการแก้ไขข้อมูลทั้งหมดเข้า DB
async function saveGridChanges() {
    if (!hotGridInstance || editedRowIndices.size === 0) {
        alert('ℹ️ ยังไม่มีการแก้ไขข้อมูลในตาราง');
        return;
    }

    const btn = document.getElementById('btn-save-grid');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    const data = hotGridInstance.getData();
    let successCount = 0;

    for (let rowIndex of editedRowIndices) {
        const row = data[rowIndex];
        if (!row[1]) continue; // ถ้าไม่มี ID ให้ข้าม

        const updateData = {
            id: row[1],
            booking_no: row[2],
            mode: row[3],
            booking_date: row[4],
            run_date: row[5],
            job_name: row[6],
            job_type: row[7],
            customer_name: row[8],
            agent: row[9],
            origin: row[10],
            destination: row[11],
            container_count: row[12],
            cy_date: row[13],
            vgm_cutoff: row[14],
            cutoff_time: row[15],
            load_date: row[16],
            open_gate: row[17],
            rent_cutoff: row[18],
            demurrage: row[19],
            unload_date: row[20],
            return_date: row[21],
            price_type: row[22],
            trip_fee: row[23],
            trans_fee: row[24]
        };

        try {
            const res = await fetch(`/api/bookings/${row[1]}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (res.ok) successCount++;
        } catch (err) {
            console.error(`Error updating row ${row[1]}:`, err);
        }
    }

    btn.innerHTML = originalText;
    btn.disabled = false;

    if (successCount > 0) {
        alert(`✅ บันทึกการแก้ไขสำเร็จ ${successCount} รายการ!`);
        editedRowIndices.clear();
        loadBookingGridData();
    } else {
        alert('❌ ไม่สามารถบันทึกการแก้ไขได้');
    }
}

// 🗑️ 6. ลบแถวที่เลือก (Checkbox)
async function deleteSelectedRows() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = [];

    data.forEach(row => {
        if (row[0] === true && row[1]) {
            idsToDelete.push(row[1]);
        }
    });

    if (idsToDelete.length === 0) {
        alert('🖱️ กรุณาติ๊กเลือกช่อง ✔ ซ้ายสุดของรายการที่ต้องการลบก่อนครับ');
        return;
    }

    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ที่จะลบรายการ Booking จำนวน ${idsToDelete.length} รายการ?`)) return;

    let deleteSuccessCount = 0;
    for (let id of idsToDelete) {
        try {
            const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
            if (res.ok) deleteSuccessCount++;
        } catch (err) {
            console.error(`Error deleting ID ${id}:`, err);
        }
    }

    if (deleteSuccessCount > 0) {
        alert(`✅ ลบรายการสำเร็จ ${deleteSuccessCount} รายการ`);
        loadBookingGridData();
    } else {
        alert('❌ ลบรายการไม่สำเร็จ');
    }
}

// 📥 7. ส่งออกตารางเป็นไฟล์ Excel
function exportGridToExcel() {
    if (!hotGridInstance) return;
    const headers = hotGridInstance.getColHeader().slice(1); // ตัดช่อง checkbox ออก
    const data = hotGridInstance.getData().map(r => r.slice(1));

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings_Export");
    XLSX.writeFile(wb, `TMS_Bookings_Grid_${new Date().toISOString().split('T')[0]}.xlsx`);
}