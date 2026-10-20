// ==========================================
// 📋 MODULE: BOOKING LIST (Cascade Filters, Complete Columns & Auto-Highlight)
// ==========================================

let hotGridInstance = null;
let rawBookingList = []; // ข้อมูลดิบในเดือนนั้น
let filteredList = [];   // ข้อมูลที่ผ่านการกรองแล้ว
let editedRowIndices = new Set(); // บันทึก Index ที่โดนแก้ไข

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

// 🔄 1. ดึงข้อมูลประจําเดือนจาก Database
async function loadBookingGridData() {
    const monthVal = document.getElementById('filter-month').value;
    if (!monthVal) return;

    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    try {
        const res = await fetch(`/api/bookings/search?start_date=${startDate}&end_date=${endDate}`);
        const result = await res.json();

        if (result.success && result.data) {
            rawBookingList = result.data;
            filteredList = [...rawBookingList];
            
            // รีเซ็ตการแก้ไข
            editedRowIndices.clear();
            updateSaveStatusBadge();

            // สร้าง Cascade Dropdown
            populateRunDateFilter(rawBookingList);
            populateCustomerFilter(rawBookingList);
            populateBookingNoFilter(rawBookingList);

            initBookingHandsontable(rawBookingList);
        } else {
            rawBookingList = [];
            filteredList = [];
            initBookingHandsontable([]);
        }
    } catch (err) {
        console.error('Error loading bookings:', err);
        initBookingHandsontable([]);
    }
}

// 🏢 2.1 Cascade Filters: เติมตัวเลือก Dropdowns
function populateRunDateFilter(data) {
    const sel = document.getElementById('filter-run-date');
    const curr = sel.value;
    sel.innerHTML = '<option value="">-- ทุกลักษณะวันที่ --</option>';
    const dates = new Set();
    data.forEach(i => { if (i.run_date) dates.add(i.run_date.split('T')[0]); });
    Array.from(dates).sort().forEach(d => {
        sel.innerHTML += `<option value="${d}" ${d === curr ? 'selected' : ''}>${d}</option>`;
    });
}

function populateCustomerFilter(data) {
    const sel = document.getElementById('filter-customer');
    const curr = sel.value;
    sel.innerHTML = '<option value="">-- ทุกลูกค้า (Customer) --</option>';
    const custs = new Set();
    data.forEach(i => { if (i.customer_name) custs.add(i.customer_name.trim()); });
    Array.from(custs).sort().forEach(c => {
        sel.innerHTML += `<option value="${c}" ${c === curr ? 'selected' : ''}>${c}</option>`;
    });
}

function populateBookingNoFilter(data) {
    const sel = document.getElementById('filter-booking-no');
    const curr = sel.value;
    sel.innerHTML = '<option value="">-- ทุก Booking / BL --</option>';
    const books = new Set();
    data.forEach(i => { if (i.booking_no) books.add(i.booking_no.trim()); });
    Array.from(books).sort().forEach(b => {
        sel.innerHTML += `<option value="${b}" ${b === curr ? 'selected' : ''}>${b}</option>`;
    });
}

// 🎯 2.2 ลอจิกการทำงานสัมพันธ์กัน (Cascade Trigger)
function onRunDateChange() {
    const selectedDate = document.getElementById('filter-run-date').value;
    let scoped = rawBookingList;
    if (selectedDate) {
        scoped = rawBookingList.filter(i => i.run_date && i.run_date.split('T')[0] === selectedDate);
    }
    // อัปเดต Dropdown ลูกค้าและ Booking ตามวันที่ที่เลือก
    populateCustomerFilter(scoped);
    populateBookingNoFilter(scoped);
    applyFilters();
}

function onCustomerChange() {
    const selectedDate = document.getElementById('filter-run-date').value;
    const selectedCust = document.getElementById('filter-customer').value;
    let scoped = rawBookingList;

    if (selectedDate) {
        scoped = scoped.filter(i => i.run_date && i.run_date.split('T')[0] === selectedDate);
    }
    if (selectedCust) {
        scoped = scoped.filter(i => i.customer_name && i.customer_name.trim() === selectedCust);
    }
    
    // อัปเดต Dropdown Booking สัมพันธ์ต่อ
    populateBookingNoFilter(scoped);
    applyFilters();
}

function applyFilters() {
    const dateVal = document.getElementById('filter-run-date').value;
    const custVal = document.getElementById('filter-customer').value;
    const bookVal = document.getElementById('filter-booking-no').value;

    filteredList = rawBookingList.filter(item => {
        const itemDate = item.run_date ? item.run_date.split('T')[0] : '';
        const itemCust = item.customer_name ? item.customer_name.trim() : '';
        const itemBook = item.booking_no ? item.booking_no.trim() : '';

        const matchDate = !dateVal || itemDate === dateVal;
        const matchCust = !custVal || itemCust === custVal;
        const matchBook = !bookVal || itemBook === bookVal;

        return matchDate && matchCust && matchBook;
    });

    initBookingHandsontable(filteredList);
}

function clearQuickFilters() {
    document.getElementById('filter-run-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking-no').value = '';
    
    populateCustomerFilter(rawBookingList);
    populateBookingNoFilter(rawBookingList);
    applyFilters();
}

// 📊 3. วาดตาราง Handsontable และจัดเรียงคอลัมน์
function initBookingHandsontable(data) {
    const container = document.getElementById('booking-grid-container');
    if (hotGridInstance) { hotGridInstance.destroy(); }

    document.getElementById('total-count').innerText = `${data.length} รายการ`;

    const formattedTableData = data.map(item => {
        // 🌟 ประมวลผลข้อความวันเวลาสำหรับ 3 คอลัมน์สำคัญ
        let pickupInfo = [];
        if (item.cy_date) pickupInfo.push(`CY: ${formatDateTime(item.cy_date)}`);
        if (item.vgm_cutoff) pickupInfo.push(`VGM: ${formatDateTime(item.vgm_cutoff)}`);
        if (item.cutoff_time) pickupInfo.push(`CUTOFF: ${formatDateTime(item.cutoff_time)}`);
        if (item.rent_cutoff) pickupInfo.push(`RENT: ${formatDateTime(item.rent_cutoff)}`);

        let deliveryInfo = [];
        if (item.load_date) deliveryInfo.push(`LOAD: ${formatDateTime(item.load_date)}`);
        if (item.unload_date) deliveryInfo.push(`UNLOAD: ${formatDateTime(item.unload_date)}`);

        let returnInfo = [];
        if (item.open_gate) returnInfo.push(`GATE: ${formatDateTime(item.open_gate)}`);
        if (item.return_date) returnInfo.push(`RETURN: ${formatDateTime(item.return_date)}`);

        return [
            false, // 0: Checkbox
            item.id, // 1: ID
            item.booking_no || '', // 2: Booking No
            item.mode || 'EXPORT', // 3: Mode
            item.run_date ? item.run_date.split('T')[0] : '', // 4: วันที่วิ่งงาน
            item.customer_name || '', // 5: ลูกค้า
            item.job_name || item.job_title || '-', // 🌟 6: ชื่องาน (ดึงแสดงผลแน่นอน)
            item.origin || '', // 7: ต้นทาง
            item.destination || '', // 8: ปลายทาง
            item.container_count || 1, // 9: จำนวนตู้
            pickupInfo.join('\n') || '-', // 🌟 10: 📦 PICK UP
            deliveryInfo.join('\n') || '-', // 🌟 11: 🚚 DELIVERY
            returnInfo.join('\n') || '-', // 🌟 12: 🔄 RETURN
            item.booking_no // 13: Actions
        ];
    });

    const colHeaders = [
        '✔', 'ID', 'Booking / BL', 'MODE', 'วันที่วิ่งงาน', 'ลูกค้า (Customer)', 'ชื่องาน (Job Name)', 
        'ต้นทาง', 'ปลายทาง', 'ตู้', '📦 PICK UP', '🚚 DELIVERY', '🔄 RETURN', 'การจัดการ (Actions)'
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
            { type: 'text', className: 'font-medium text-slate-700' }, // 🌟 6: ชื่องาน
            { type: 'text' }, 
            { type: 'text' }, 
            { type: 'numeric', className: 'htCenter font-bold text-blue-600 bg-blue-50/20' }, 
            { type: 'text', renderer: renderMultilineCell }, // 10: PICK UP
            { type: 'text', renderer: renderMultilineCell }, // 11: DELIVERY
            { type: 'text', renderer: renderMultilineCell }, // 12: RETURN
            { 
                readOnly: true, 
                renderer: function(instance, td, row, col, prop, value) {
                    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                    if (value) {
                        td.innerHTML = `
                            <button onclick="goToContainerManage('${value}')" class="btn-grid btn-manage" title="ลงเบอร์ตู้"><i class="fa-solid fa-boxes-stacked"></i> ลงตู้</button>
                            <button onclick="goToDispatchMonitor('${value}')" class="btn-grid btn-dispatch" title="จัดรถ"><i class="fa-solid fa-truck-fast"></i> จัดรถ</button>
                        `;
                        td.style.textAlign = 'center';
                    }
                } 
            }
        ],
        rowHeaders: true,
        width: '100%',
        height: '100%',
        stretchH: 'all',
        manualColumnResize: true,
        manualColumnMove: true,
        filters: true,
        dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
        licenseKey: 'non-commercial-and-evaluation',
        colWidths: [30, 45, 120, 75, 85, 130, 140, 90, 90, 40, 150, 140, 140, 130],

        // 🌟 ไฮไลต์แถวเมื่อมีการปรับแก้ไขเซลล์
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes) return;
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== 0) {
                    editedRowIndices.add(row);
                }
            });
            updateSaveStatusBadge();
            this.render(); // สั่งเรนเดอร์ใหม่เพื่ออัปเดตสีพื้นหลัง
        },

        // 🎨 กำหนด CSS class พิเศษให้กับแถวที่แก้ไข
        cells: function(row, col) {
            const cellProperties = {};
            if (editedRowIndices.has(row)) {
                cellProperties.className = (cellProperties.className || '') + ' ht-edited-row';
            }
            return cellProperties;
        }
    });
}

// ฟังก์ชันช่วยจัดรูปแบบการขึ้นบรรทัดใหม่ในตาราง (\n ➔ <br>)
function renderMultilineCell(instance, td, row, col, prop, value) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    if (value) {
        td.innerHTML = String(value).replace(/\n/g, '<br>');
        td.style.fontSize = '11px';
        td.style.lineHeight = '1.3';
    }
}

function formatDateTime(dtStr) {
    if (!dtStr) return '';
    return dtStr.replace('T', ' ').substring(0, 16);
}

// 🏷️ อัปเดต Badge สถิติต่างๆ ใน Toolbar
function updateSaveStatusBadge() {
    const badge = document.getElementById('save-status-badge');
    const count = editedRowIndices.size;
    if (count > 0) {
        badge.className = "text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1 animate-pulse";
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> มี ${count} รายการยังไม่ได้บันทึก`;
    } else {
        badge.className = "text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1";
        badge.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600"></i> บันทึกข้อมูลแล้ว`;
    }
}

// 🚀 4. ฟังก์ชันปุ่ม Action ข้ามหน้า
function goToContainerManage(bookingNo) {
    window.location.href = `/booking-manage.html?select=${encodeURIComponent(bookingNo)}`;
}
function goToDispatchMonitor(bookingNo) {
    window.location.href = `/booking-monitor.html?select=${encodeURIComponent(bookingNo)}`;
}

// 💾 5. บันทึกข้อมูลที่แก้ไขกลับลง DB
async function saveGridChanges() {
    if (!hotGridInstance || editedRowIndices.size === 0) {
        alert('ℹ️ ไม่มีรายการข้อมูลที่ถูกแก้ไข');
        return;
    }

    const btn = document.getElementById('btn-save-grid');
    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเซฟ...';
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
            customer_name: row[5], 
            job_name: row[6], 
            origin: row[7], 
            destination: row[8], 
            container_count: row[9]
        };

        try {
            const res = await fetch(`/api/bookings/${row[1]}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (res.ok) successCount++;
        } catch (err) {
            console.error('Error updating:', err);
        }
    }

    btn.innerHTML = orgText;
    btn.disabled = false;

    if (successCount > 0) { 
        alert(`✅ บันทึกข้อมูลสำเร็จ ${successCount} รายการ`); 
        editedRowIndices.clear(); 
        loadBookingGridData(); 
    } else {
        alert('❌ ไม่สามารถบันทึกข้อมูลได้');
    }
}

// 🗑️ 6. ลบแถว
async function deleteSelectedRows() {
    if (!hotGridInstance) return;
    const data = hotGridInstance.getData();
    const idsToDelete = [];

    data.forEach(row => { if (row[0] === true && row[1]) idsToDelete.push(row[1]); });
    if (idsToDelete.length === 0) {
        alert('🖱️ กรุณาติ๊กเลือกช่อง ✔ หน้าแถวที่ต้องการลบก่อนครับ');
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบ Booking จำนวน ${idsToDelete.length} รายการ?`)) return;

    for (let id of idsToDelete) {
        try { await fetch(`/api/bookings/${id}`, { method: 'DELETE' }); } catch (err) {}
    }
    alert('✅ ลบรายการสำเร็จ'); 
    loadBookingGridData();
}