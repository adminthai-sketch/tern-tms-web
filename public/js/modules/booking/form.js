// --- Helper จัด Format วันที่ให้ DB ---
function formatToGrid(datetimeStr) {
    if (!datetimeStr) return '';
    return datetimeStr.replace('T', ' ');
}

// --- โหลดข้อมูล Rate งานล่วงหน้า ---
let rateDataMap = {};
window.addEventListener('DOMContentLoaded', async () => {
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
});

// --- UI Toggles ---
function toggleModeUI() {
    const mode = document.getElementById('pMode').value;
    document.getElementById('export-zone').classList.add('hidden');
    document.getElementById('import-zone').classList.add('hidden');
    document.getElementById('transfer-zone').classList.add('hidden');
    document.getElementById('jobPreviewBox').classList.remove('hidden');
    
    if(mode === 'EXPORT') document.getElementById('export-zone').classList.remove('hidden');
    else if(mode === 'IMPORT') document.getElementById('import-zone').classList.remove('hidden');
    else if(mode === 'TRANSFER') document.getElementById('transfer-zone').classList.remove('hidden');
    else document.getElementById('jobPreviewBox').classList.add('hidden');
}

function syncCutoff() { 
    document.getElementById('pCutoffReturnExp').value = document.getElementById('pCutoffExp').value; 
}

function previewJobData() {
    const val = document.getElementById('jobNameInput').value;
    if(!val || !rateDataMap[val]) return;
    const rate = rateDataMap[val];
    
    document.getElementById('pCustomer').value = rate.customer || ''; 
    document.getElementById('pOrigin').value = rate.origin || ''; 
    document.getElementById('pDest').value = rate.dest || ''; 
    document.getElementById('pJobType').value = rate.jobType || ''; 
    
    document.getElementById('pDepotExp').value = rate.origin || ''; 
    document.getElementById('pPortImp').value = rate.origin || '';
    document.getElementById('pReturnExp').value = rate.dest || ''; 
    document.getElementById('pDepotImp').value = rate.dest || '';
    
    document.getElementById('pPriceType').value = ''; 
    updateFeeDropdowns();
}

function updateFeeDropdowns() {
    const val = document.getElementById('jobNameInput').value; 
    const type = document.getElementById('pPriceType').value;
    const trpInp = document.getElementById('pTripFee'); 
    const trnInp = document.getElementById('pTransFee');
    trpInp.value = ''; trnInp.value = '';
    
    if(!val || !rateDataMap[val] || !type) return;
    const rate = rateDataMap[val];
    if(type === '6W') { trpInp.value = rate.trp6 || ''; trnInp.value = rate.trn6 || ''; }
    if(type === '10W') { trpInp.value = rate.trp10 || ''; trnInp.value = rate.trn10 || ''; }
    if(type === '12W*2') { trpInp.value = rate.trp12 || ''; trnInp.value = rate.trn12 || ''; }
    if(type === 'เงินสด') { trpInp.value = rate.trpCash || ''; trnInp.value = rate.trnCash || ''; }
}

// --- 💾 SAVE TO DATABASE DIRECTLY ---
async function generateData(btn) {
    const mode = document.getElementById('pMode').value;
    const runDate = document.getElementById('runDate').value;
    
    if(!mode || !runDate) { alert('⚠️ กรุณาเลือก Mode และระบุวันที่วิ่งงานให้ครบถ้วน'); return; }

    let bookingNo = "";
    if (mode === 'EXPORT') bookingNo = document.getElementById('pBookingExp').value;
    else if (mode === 'IMPORT') bookingNo = document.getElementById('pBookingImp').value;
    else if (mode === 'TRANSFER') bookingNo = document.getElementById('pRefTrans').value;

    let cyDate = "", agent = "", loadDate = "", vgmCutoff = "", cutoffTime = "", openGate = "";
    let rentCutoff = "", demurrage = "", unloadDate = "", returnDate = "";

    if (mode === 'EXPORT') {
        agent = document.getElementById('pAgentExp').value;
        cyDate = formatToGrid(document.getElementById('pCyExp').value); 
        vgmCutoff = formatToGrid(document.getElementById('pVgmExp').value);
        cutoffTime = formatToGrid(document.getElementById('pCutoffExp').value); 
        loadDate = formatToGrid(document.getElementById('pLoadExp').value); 
        openGate = formatToGrid(document.getElementById('pOpenGateExp').value);
    } else if (mode === 'IMPORT') {
        agent = document.getElementById('pAgentImp').value;
        cyDate = formatToGrid(document.getElementById('pCyImp').value); 
        rentCutoff = formatToGrid(document.getElementById('pRentImp').value);
        demurrage = formatToGrid(document.getElementById('pDemImp').value); 
        unloadDate = formatToGrid(document.getElementById('pUnloadImp').value); 
        returnDate = formatToGrid(document.getElementById('pReturnImp').value);
    }

    const customer = document.getElementById('pCustomer').value.trim(); 
    const jobName = document.getElementById('jobNameInput').value.trim();
    const origin = document.getElementById('pOrigin').value.trim();
    const destination = document.getElementById('pDest').value.trim();
    const jobType = document.getElementById('pJobType').value; 
    const priceType = document.getElementById('pPriceType').value; 
    const tripFee = document.getElementById('pTripFee').value; 
    const transFee = document.getElementById('pTransFee').value;

    const rowCount = parseInt(document.getElementById('rowCount').value) || 1;
    const finalBookingNo = bookingNo || `TEMP-${Date.now().toString().slice(-6)}`;

    // 1. ข้อมูลหัวบิล (Bookings)
    const bookingData = {
        mode: mode, run_date: runDate, container_count: rowCount, job_name: jobName,
        customer_name: customer, booking_no: finalBookingNo, origin: origin, destination: destination,
        agent: agent, cy_date: cyDate, vgm_cutoff: vgmCutoff, cutoff_time: cutoffTime, load_date: loadDate, open_gate: openGate,
        rent_cutoff: rentCutoff, demurrage: demurrage, unload_date: unloadDate, return_date: returnDate,
        job_type: jobType, price_type: priceType, trip_fee: tripFee, trans_fee: transFee
    };

    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';
    btn.disabled = true;

    try {
        // [ยิง API 1] บันทึกหัวบิล
        const resHeader = await fetch('/api/bookings/header', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bookingData)
        });
        const resultHeader = await resHeader.json();

        if (resultHeader.success) {
            
            // 2. สร้างรายการตู้คอนเทนเนอร์ (Shipments) โครงสร้าง 79 คอลัมน์ (ตาม schema เดิมที่ระบบต้องการ)
            let shipmentsData = [];
            const today = new Date().toISOString().split('T')[0];
            const datePrefix = runDate.replace(/-/g, '').substring(2); 

            for (let i = 0; i < rowCount; i++) {
                // สร้าง Order ID ไม่ให้ซ้ำ: ORD-YYMMDD-XXXX (สุ่มเลข 4 หลัก + ลำดับ)
                let randomCode = Math.floor(1000 + Math.random() * 9000);
                let orderId = `ORD-${datePrefix}-${randomCode}-${i+1}`;
                
                let row = new Array(79).fill(""); 
                row[0] = false; row[1] = orderId; row[2] = mode; row[3] = today; row[4] = runDate;
                row[5] = jobName; row[6] = customer; row[7] = finalBookingNo;
                row[10] = 1; row[12] = jobType; row[13] = agent; row[19] = cyDate; 
                
                if (mode === 'EXPORT') { row[20] = vgmCutoff; row[21] = cutoffTime; row[22] = loadDate; row[23] = openGate; } 
                else if (mode === 'IMPORT') { row[24] = rentCutoff; row[25] = demurrage; row[26] = unloadDate; row[27] = returnDate; }
                
                row[56] = tripFee; row[57] = transFee; row[78] = 'รอจัดรถ';
                shipmentsData.push(row);
            }

            // [ยิง API 2] บันทึกหางบิล (รายการตู้)
            const resShipments = await fetch('/api/shipments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: shipmentsData })
            });
            const resultShipments = await resShipments.json();

            if (resultShipments.success) {
                alert('✅ บันทึก Booking สำเร็จ! คุณสามารถไปจัดรถได้ที่เมนู "หน้าจัดการบิล/จัดรถ"');
                window.location.reload(); // เคลียร์ฟอร์มเตรียมคีย์บิลถัดไป
            } else {
                alert('⚠️ สร้างหัวบิลสำเร็จ แต่สร้างรายการตู้ไม่สำเร็จ: ' + resultShipments.message);
            }
        } else {
            alert('❌ ไม่สามารถบันทึกหัวบิลได้: ' + resultHeader.message);
        }
    } catch (error) { 
        alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + error.message); 
    } finally { 
        btn.innerHTML = originalBtnText; 
        btn.disabled = false; 
    }
}