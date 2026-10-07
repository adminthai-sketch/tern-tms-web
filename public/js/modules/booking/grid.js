// อัปเดต columnsConfig คอลัมน์ "ประเภทงาน" (คอลัมน์ที่ 12)
const columnsConfig = allHeaders.map((h, i) => {
    const actualIndex = i + 1; 
    if (actualIndex === 1) return { readOnly: true }; 
    if ([3, 4].includes(actualIndex)) return { type: 'date', dateFormat: 'YYYY-MM-DD' };
    if ([19, 20, 21, 22, 23, 24, 25, 26, 27].includes(actualIndex)) return { type: 'date', dateFormat: 'YYYY-MM-DD HH:mm' };
    if ([56, 57].includes(actualIndex)) return { type: 'numeric', numericFormat: { pattern: '0,0.00' } };
    if (actualIndex === 78) return { type: 'dropdown', source: ['รอจัดรถ', 'กำลังวิ่งงาน', 'คืนตู้แล้ว', 'เสร็จสิ้น', 'ยกเลิก'] };
    
    // ENUM สำหรับประเภทงาน (Job Type)
    if (actualIndex === 12) {
        return { type: 'dropdown', source: ['SUB-นอก', 'SUB-10', 'TERN-10', 'Stock RSL', 'TERN-6', 'SUB-สด', 'SUB-6', 'TERN-12'] };
    }
    
    // Autocomplete สำหรับพนักงานและทะเบียนรถ
    if ([28, 33, 38, 43, 48, 55].includes(actualIndex)) {
        return { type: 'autocomplete', strict: false, source: function(query, process) { process(globalDriverList); } };
    }
    if ([29, 34, 39, 44, 49, 53].includes(actualIndex)) {
        return { type: 'autocomplete', strict: false, source: function(query, process) { process(globalTruckList); } };
    }
    
    // Dropdown ประเภทรถ
    if ([30, 35, 40, 45, 50, 54].includes(actualIndex)) {
        return { type: 'dropdown', source: ['6W', '10W', '12W*2', 'เงินสด'] };
    }
    return { type: 'text' }; 
});

// ==========================================
// 📥 ฟังก์ชัน Import Excel นำเข้าตาราง
// ==========================================
async function importExcelToGrid(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/import-excel', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            if (typeof hotBookingInstance !== 'undefined' && hotBookingInstance) {
                const dataRows = result.data.slice(1); // ข้าม Header แถวแรก
                hotBookingInstance.loadData(dataRows);
                alert(`✅ นำเข้าข้อมูลสำเร็จทั้งหมด ${dataRows.length} รายการ\nอย่าลืมกด "บันทึกลงฐานข้อมูล" เพื่อเซฟเข้าระบบ`);
            }
        } else {
            alert('❌ ไม่สามารถอ่านไฟล์ได้: ' + result.message);
        }
    } catch (err) {
        alert('❌ เกิดข้อผิดพลาดในการนำเข้าไฟล์: ' + err.message);
    } finally {
        event.target.value = ''; // เคลียร์ไฟล์
    }
}

// ==========================================
// 📤 ฟังก์ชัน Export Excel ดาวน์โหลดไฟล์
// ==========================================
async function exportBookingsToExcel() {
    const monthVal = document.getElementById('monthFilter')?.value || '';
    let url = '/api/export-bookings';
    
    if (monthVal) {
        const [year, month] = monthVal.split('-');
        url += `?year=${year}&month=${month}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Bookings_Export_${monthVal || 'All'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        alert('❌ เกิดข้อผิดพลาดในการดาวน์โหลด Excel: ' + err.message);
    }
}