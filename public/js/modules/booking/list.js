// ==========================================
// 📋 MODULE: BOOKING LIST (ดึงข้อมูล, กรอง, แก้ไข, ลบ)
// ==========================================

// เริ่มทำงานทันทีเมื่อโหลดหน้าจอเสร็จ
window.addEventListener('DOMContentLoaded', () => {
    // เช็คสิทธิ์ User
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) { window.location.href = '/login.html'; return; }
    
    loadCustomers();
    loadBookings();
});

// 🔄 โหลดรายชื่อลูกค้าใส่ Dropdown
async function loadCustomers() {
    try {
        const res = await fetch('/api/customers');
        const result = await res.json();
        if (result.success && result.data) {
            const select = document.getElementById('filter-customer');
            result.data.forEach(c => {
                if (c[1]) select.innerHTML += `<option value="${c[1]}">${c[1]}</option>`;
            });
        }
    } catch (err) {
        console.error('Failed to load customers');
    }
}

// 🔄 โหลดรายการ Booking ตาม Filter
async function loadBookings() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-500"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 text-primary"></i><br>กำลังค้นหา...</td></tr>';
    
    const date = document.getElementById('filter-date').value;
    const customer = document.getElementById('filter-customer').value;
    const booking = document.getElementById('filter-booking').value;

    try {
        // สร้าง Query String
        let url = '/api/bookings/search?';
        if (date) url += `start_date=${date}&end_date=${date}&`;
        if (customer) url += `customer=${encodeURIComponent(customer)}&`;
        if (booking) url += `search=${encodeURIComponent(booking)}`;

        const res = await fetch(url);
        const result = await res.json();

        tbody.innerHTML = '';
        document.getElementById('total-count').innerText = `${result.data ? result.data.length : 0} รายการ`;

        if (result.success && result.data && result.data.length > 0) {
            result.data.forEach(item => {
                // ป้ายสีบอก Mode
                let modeBadge = 'bg-slate-100 text-slate-600';
                if (item.mode === 'EXPORT') modeBadge = 'bg-amber-100 text-amber-700';
                else if (item.mode === 'IMPORT') modeBadge = 'bg-blue-100 text-blue-700';
                else if (item.mode === 'TRANSFER') modeBadge = 'bg-orange-100 text-orange-700';

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';
                tr.innerHTML = `
                    <td class="px-4 py-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${modeBadge}">${item.mode || 'N/A'}</span></td>
                    <td class="px-4 py-3 font-medium">${item.run_date ? item.run_date.split('T')[0] : '-'}</td>
                    <td class="px-4 py-3 font-bold text-primary">${item.booking_no || '-'}</td>
                    <td class="px-4 py-3">
                        <div class="font-bold text-slate-700">${item.customer_name || '-'}</div>
                        <div class="text-[11px] text-slate-500">${item.job_name || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-xs">
                        <span class="bg-slate-100 px-2 py-0.5 rounded text-slate-600">${item.origin || '-'}</span> 
                        <i class="fa-solid fa-arrow-right text-[10px] text-slate-400 mx-1"></i> 
                        <span class="bg-slate-100 px-2 py-0.5 rounded text-slate-600">${item.destination || '-'}</span>
                    </td>
                    <td class="px-4 py-3 text-center font-bold text-slate-700">${item.container_count || 1}</td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex justify-center gap-2">
                            <button onclick="editBooking('${item.booking_no}')" class="w-8 h-8 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center justify-center shadow-sm" title="แก้ไข">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="deleteBooking('${item.booking_no}')" class="w-8 h-8 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors flex items-center justify-center shadow-sm" title="ลบ">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-500"><i class="fa-solid fa-inbox text-3xl mb-2 text-slate-300"></i><br>ไม่พบข้อมูลบุคกิ้งตามเงื่อนไขที่ค้นหา</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-red-500">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

// ✏️ ส่งไปหน้าแก้ไข
function editBooking(bookingNo) {
    // แนบค่าเลข Booking ไปกับ URL เพื่อให้หน้าฟอร์มรู้ว่าต้องดึงข้อมูลตัวไหนมาแก้ไข
    window.location.href = `/booking.html?edit=${encodeURIComponent(bookingNo)}`;
}

// 🗑️ ลบข้อมูล
async function deleteBooking(bookingNo) {
    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ที่จะลบ Booking: ${bookingNo} ?\nข้อมูลตู้ที่จัดรถไว้จะถูกลบทั้งหมดและไม่สามารถกู้คืนได้`)) return;

    try {
        const res = await fetch(`/api/bookings/by-no/${encodeURIComponent(bookingNo)}`, {
            method: 'DELETE'
        });
        
        const result = await res.json();
        if (result.success) {
            alert('✅ ลบรายการสำเร็จ');
            loadBookings(); // รีเฟรชตาราง
        } else {
            alert('❌ ไม่สามารถลบได้: ' + result.message);
        }
    } catch (err) {
        alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
}

// 🧹 ล้างค่า Filter
function clearFilters() {
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-booking').value = '';
    loadBookings();
}