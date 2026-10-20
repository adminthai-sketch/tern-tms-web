// ==========================================
// 📝 MODULE: BOOKING FORM (Data Entry & Edit)
// ==========================================

let rateDataMap = {};

window.addEventListener('DOMContentLoaded', async () => {
    // 1. โหลดเรทราคา
    try {
        const res = await fetch('/api/rates');
        const d = await res.json();
        if (d.success && d.data) {
            const datalist = document.getElementById('jobList');
            datalist.innerHTML = '';
            d.data.forEach(r => {
                rateDataMap[r[0]] = {
                    customer: r[1], origin: r[2], dest: r[3], jobType: r[6],
                    trp6: r[7], trp10: r[8], trp12: r[9], trpCash: r[10],
                    trn6: r[11], trn10: r[12], trn12: r[13], trnCash: r[14]
                };
                const opt = document.createElement('option');
                opt.value = r[0];
                datalist.appendChild(opt);
            });
        }
    } catch (err) { console.error("Error loading rates", err); }

    // 🌟 2. ดักจับ URL ว่าเป็นการ "แก้ไข" หรือไม่ (เช่น ?edit=BK-123)
    const urlParams = new URLSearchParams(window.location.search);
    const editBookingNo = urlParams.get('edit');
    if (editBookingNo) {
        await loadBookingForEdit(editBookingNo);
    }
});

// ==========================================
// 🔄 ฟังก์ชันดึงข้อมูลเก่ามาถมใส่ฟอร์ม (Auto-fill)
// ==========================================
async function loadBookingForEdit(bookingNo) {
    try {
        const res = await fetch(`/api/bookings/search?search=${bookingNo}`);
        const result = await res.json();
        
        if (result.success && result.data && result.data.length > 0) {
            const item = result.data.find(i => i.booking_no === bookingNo) || result.data[0];
            
            // เปลี่ยน UI เป็นโหมดแก้ไข
            document.getElementById('form-title').innerText = `แก้ไขรายการรับงาน (Booking: ${bookingNo})`;
            document.getElementById('editing-badge').classList.remove('hidden');
            document.getElementById('btn-cancel-edit').classList.remove('hidden');
            
            // เติมข้อมูลทั่วไป
            document.getElementById('pMode').value = item.mode || '';
            toggleModeUI();
            
            document.getElementById('runDate').value = item.run_date ? item.run_date.split('T')[0] : '';
            document.getElementById('rowCount').value = item.container_count || 1;
            document.getElementById('jobNameInput').value = item.job_name || '';
            document.getElementById('pCustomer').value = item.customer_name || '';
            document.getElementById('pOrigin').value = item.origin || '';
            document.getElementById('pDest').value = item.destination || '';
            document.getElementById('pPriceType').value = item.price_type || '';
            document.getElementById('pTripFee').value = item.trip_fee || '';
            document.getElementById('pTransFee').value = item.trans_fee || '';

            // ฟังก์ชันย่อยแยก Date/Time ยัดใส่ 2 ช่อง
            const setDateTime = (idBase, dtStr) => {
                if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return;
                const cleanStr = String(dtStr).replace('T', ' '); // รองรับทั้งมี T และไม่มี T
                const [d, t] = cleanStr.split(' ');
                const dateInput = document.getElementById(idBase + 'Date');
                const timeInput = document.getElementById(idBase + 'Time');
                if (dateInput && d) dateInput.value = d;
                if (timeInput && t) timeInput.value = t.substring(0, 5);
            };

            // เติมข้อมูลแยกตามโหมด
            if (item.mode === 'EXPORT') {
                document.getElementById('pBookingExp').value = item.booking_no || '';
                document.getElementById('pAgentExp').value = item.agent || '';
                document.getElementById('pDepotExp').value = item.origin || '';
                document.getElementById('pReturnExp').value = item.destination || '';
                
                setDateTime('pCyExp', item.cy_date);
                setDateTime('pVgmExp', item.vgm_cutoff);
                setDateTime('pCutoffExp', item.cutoff_time);
                setDateTime('pLoadExp', item.load_date);
                setDateTime('pOpenGateExp', item.open_gate);
            } else if (item.mode === 'IMPORT') {
                document.getElementById('pBookingImp').value = item.booking_no || '';
                document.getElementById('pAgentImp').value = item.agent || '';
                document.getElementById('pPortImp').value = item.origin || '';
                document.getElementById('pDepotImp').value = item.destination || '';
                
                setDateTime('pCyImp', item.cy_date);
                setDateTime('pRentImp', item.rent_cutoff);
                setDateTime('pDemImp', item.demurrage);
                setDateTime('pUnloadImp', item.unload_date);
                setDateTime('pReturnImp', item.return_date);
            }
        }
    } catch (err) {
        console.error('Error loading booking for edit:', err);
    }
}

// ❌ ฟังก์ชันยกเลิกการแก้ไข
window.cancelEdit = function() {
    window.location.href = '/booking-list.html'; //กดยกเลิกให้เด้งกลับหน้าตาราง
};

// ==========================================
// 💡 ฟังก์ชันทำงานบนหน้าจอปกติ
// ==========================================
window.toggleModeUI = function() {
    const mode = document.getElementById('pMode').value;
    document.getElementById('export-zone').classList.add('hidden');
    document.getElementById('import-zone').classList.add('hidden');
    document.getElementById('jobPreviewBox').classList.remove('hidden');
    
    if(mode === 'EXPORT') document.getElementById('export-zone').classList.remove('hidden');
    else if(mode === 'IMPORT') document.getElementById('import-zone').classList.remove('hidden');
    else if(!mode) document.getElementById('jobPreviewBox').classList.add('hidden');
}

window.previewJobData = function() {
    const val = document.getElementById('jobNameInput').value;
    if(!val || !rateDataMap[val]) return;
    const rate = rateDataMap[val];
    
    document.getElementById('pCustomer').value = rate.customer || ''; 
    document.getElementById('pOrigin').value = rate.origin || ''; 
    document.getElementById('pDest').value = rate.dest || ''; 
    
    if (document.getElementById('pMode').value === 'EXPORT') {
        document.getElementById('pDepotExp').value = rate.origin || ''; 
        document.getElementById('pReturnExp').value = rate.dest || ''; 
    } else {
        document.getElementById('pPortImp').value = rate.origin || '';
        document.getElementById('pDepotImp').value = rate.dest || '';
    }
}

function getCombinedDateTime(idBase) {
    const d = document.getElementById(idBase + 'Date')?.value;
    const t = document.getElementById(idBase + 'Time')?.value;
    if (d && t) return `${d} ${t}`;
    if (d) return `${d} 00:00`;
    return "";
}

window.submitBookingForm = async function(btn) {
    const mode = document.getElementById('pMode').value;
    const runDate = document.getElementById('runDate').value;
    const customer = document.getElementById('pCustomer').value;
    const containerCount = document.getElementById('rowCount').value || 1;

    if(!mode || !runDate || !customer) {
        alert('⚠️ กรุณากรอก Mode, วันที่วิ่งงาน และชื่อลูกค้าให้ครบถ้วน'); 
        return; 
    }

    let cyDate="", vgmCutoff="", cutoffTime="", loadDate="", openGate="", rentCutoff="", demurrage="", unloadDate="", returnDate="";

    if (mode === 'EXPORT') {
        cyDate = getCombinedDateTime('pCyExp');
        vgmCutoff = getCombinedDateTime('pVgmExp');
        cutoffTime = getCombinedDateTime('pCutoffExp');
        loadDate = getCombinedDateTime('pLoadExp');
        openGate = getCombinedDateTime('pOpenGateExp');
    } else if (mode === 'IMPORT') {
        cyDate = getCombinedDateTime('pCyImp');
        rentCutoff = getCombinedDateTime('pRentImp');
        demurrage = getCombinedDateTime('pDemImp');
        unloadDate = getCombinedDateTime('pUnloadImp');
        returnDate = getCombinedDateTime('pReturnImp');
    }

    const dataToSave = {
        mode: mode,
        run_date: runDate,
        customer_name: customer,
        job_name: document.getElementById('jobNameInput').value,
        origin: document.getElementById('pOrigin').value,
        destination: document.getElementById('pDest').value,
        container_count: containerCount,
        booking_no: mode === 'EXPORT' ? document.getElementById('pBookingExp').value : document.getElementById('pBookingImp').value,
        trip_fee: document.getElementById('pTripFee').value || 0,
        trans_fee: document.getElementById('pTransFee').value || 0,
        price_type: document.getElementById('pPriceType').value || '',
        
        cy_date: cyDate, vgm_cutoff: vgmCutoff, cutoff_time: cutoffTime, 
        load_date: loadDate, open_gate: openGate,
        rent_cutoff: rentCutoff, demurrage: demurrage, 
        unload_date: unloadDate, return_date: returnDate
    };

    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/bookings/header', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSave)
        });
        const result = await res.json();

        if (result.success) {
            alert('✅ บันทึก Booking เรียบร้อย!');
            // ถ้ามาจากการกดแก้ฟอร์ม ให้เด้งกลับไปหน้าตารางเลย
            const urlParams = new URLSearchParams(window.location.search);
            if(urlParams.get('edit')) {
                window.location.href = '/booking-list.html';
            } else {
                window.location.reload(); 
            }
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch (err) {
        alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        btn.innerHTML = orgText;
        btn.disabled = false;
    }
}