// ==========================================
// 📝 MODULE: BOOKING FORM (Enterprise 3-Tier Schema)
// ==========================================

let rateDataMap = {};

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/rates');
        const d = await res.json();
        if (d.success && d.data) {
            const datalist = document.getElementById('jobList');
            if (datalist) datalist.innerHTML = '';
            
            d.data.forEach(r => {
                rateDataMap[r[2]] = {
                    customer: r[1], origin: r[3], dest: r[4], jobType: r[7],
                    trp6: r[8], trp10: r[9], trp12: r[10], trpCash: r[11],
                    trn6: r[12], trn10: r[13], trn12: r[14], trnCash: r[15]
                };
                
                if (datalist) {
                    const opt = document.createElement('option');
                    opt.value = r[2]; 
                    datalist.appendChild(opt);
                }
            });
        }
    } catch (err) { console.error("Error loading rates", err); }

    const urlParams = new URLSearchParams(window.location.search);
    const editBookingNo = urlParams.get('edit');
    if (editBookingNo) await loadBookingForEdit(editBookingNo);
});

async function loadBookingForEdit(bookingNo) {
    try {
        const res = await fetch(`/api/bookings/search?search=${bookingNo}`);
        const result = await res.json();
        
        if (result.success && result.data && result.data.length > 0) {
            const item = result.data.find(i => i.booking_no === bookingNo) || result.data[0];
            
            document.getElementById('form-title').innerText = `แก้ไขรายการรับงาน (Booking: ${bookingNo})`;
            document.getElementById('editing-badge').classList.remove('hidden');
            document.getElementById('btn-cancel-edit').classList.remove('hidden');
            
            // ใช้ Hidden Input เก็บ ID สำหรับอ้างอิงตอนกดเซฟ
            let idInput = document.getElementById('editingOrderId');
            if(idInput) idInput.value = item.id;
            
            document.getElementById('pMode').value = item.mode || '';
            toggleModeUI();
            
            document.getElementById('runDate').value = item.run_date ? item.run_date.split('T')[0] : '';
            document.getElementById('rowCount').value = item.container_count || 1;
            
            // 🌟 ดึงค่าขนาดตู้กลับมาแสดง
            if (document.getElementById('containerSize')) document.getElementById('containerSize').value = item.container_size || '';

            document.getElementById('jobNameInput').value = item.job_name || '';
            document.getElementById('pCustomer').value = item.customer_name || '';
            document.getElementById('pOrigin').value = item.origin || '';
            document.getElementById('pDest').value = item.destination || '';
            
            if (document.getElementById('pJobType')) document.getElementById('pJobType').value = item.job_type || '';
            if (document.getElementById('pPriceType')) document.getElementById('pPriceType').value = item.price_type || '';
            if (document.getElementById('pTripFee')) document.getElementById('pTripFee').value = item.trip_fee || '';
            if (document.getElementById('pTransFee')) document.getElementById('pTransFee').value = item.trans_fee || '';

            const setDateTime = (idBase, dtStr) => {
                if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return;
                let cleanStr = String(dtStr).trim().replace(' ', 'T'); 
                if (cleanStr.length > 16) cleanStr = cleanStr.substring(0, 16);
                const input = document.getElementById(idBase);
                if (input) input.value = cleanStr;
            };

            if (item.mode === 'EXPORT') {
                document.getElementById('pBookingExp').value = item.booking_no || '';
                document.getElementById('pAgentExp').value = item.agent || '';
                document.getElementById('pDepotExp').value = item.origin || '';
                document.getElementById('pReturnExp').value = item.destination || '';
                setDateTime('pCyExp', item.cy_date); setDateTime('pVgmExp', item.vgm_cutoff);
                setDateTime('pCutoffExp', item.cutoff_time); setDateTime('pLoadExp', item.load_date);
                setDateTime('pOpenGateExp', item.open_gate);
                setDateTime('pCutoffReturnExp', item.cutoff_time);
            } else if (item.mode === 'IMPORT') {
                document.getElementById('pBookingImp').value = item.booking_no || '';
                document.getElementById('pAgentImp').value = item.agent || '';
                document.getElementById('pPortImp').value = item.origin || '';
                document.getElementById('pDepotImp').value = item.destination || '';
                setDateTime('pCyImp', item.cy_date); setDateTime('pRentImp', item.rent_cutoff);
                setDateTime('pDemImp', item.demurrage); setDateTime('pUnloadImp', item.unload_date);
                setDateTime('pReturnImp', item.return_date);
            } else if (item.mode === 'TRANSFER') {
                if (document.getElementById('pRefTrans')) {
                    document.getElementById('pRefTrans').value = item.booking_no || '';
                }
            }
        }
    } catch (err) { console.error('Error loading edit', err); }
}

window.cancelEdit = function() { window.location.href = '/booking-list.html'; };

window.toggleModeUI = function() {
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

window.syncCutoff = function() { 
    const exp = document.getElementById('pCutoffExp');
    const auto = document.getElementById('pCutoffReturnExp');
    if(exp && auto) auto.value = exp.value; 
};

window.previewJobData = function() {
    const val = document.getElementById('jobNameInput').value;
    if(!val || !rateDataMap[val]) return;
    const rate = rateDataMap[val];
    
    document.getElementById('pCustomer').value = rate.customer || ''; 
    document.getElementById('pOrigin').value = rate.origin || ''; 
    document.getElementById('pDest').value = rate.dest || ''; 
    if(document.getElementById('pJobType')) document.getElementById('pJobType').value = rate.jobType || '';
    
    if (document.getElementById('pMode').value === 'EXPORT') {
        document.getElementById('pDepotExp').value = rate.origin || ''; 
        document.getElementById('pReturnExp').value = rate.dest || ''; 
    } else {
        document.getElementById('pPortImp').value = rate.origin || '';
        document.getElementById('pDepotImp').value = rate.dest || '';
    }
    window.updateFeeDropdowns();
}

window.updateFeeDropdowns = function() {
    const val = document.getElementById('jobNameInput').value; 
    const type = document.getElementById('pPriceType') ? document.getElementById('pPriceType').value : '';
    const trpInp = document.getElementById('pTripFee'); 
    const trnInp = document.getElementById('pTransFee');
    if(trpInp) trpInp.value = ''; 
    if(trnInp) trnInp.value = '';
    
    if(!val || !rateDataMap[val] || !type) return;
    const rate = rateDataMap[val];
    if(type === '6W') { if(trpInp) trpInp.value = rate.trp6 || ''; if(trnInp) trnInp.value = rate.trn6 || ''; }
    if(type === '10W') { if(trpInp) trpInp.value = rate.trp10 || ''; if(trnInp) trnInp.value = rate.trn10 || ''; }
    if(type === '12W*2') { if(trpInp) trpInp.value = rate.trp12 || ''; if(trnInp) trnInp.value = rate.trn12 || ''; }
    if(type === 'เงินสด') { if(trpInp) trpInp.value = rate.trpCash || ''; if(trnInp) trnInp.value = rate.trnCash || ''; }
}

function getCombinedDateTime(idBase) {
    const input = document.getElementById(idBase);
    if (input && input.value) return input.value.replace('T', ' ');
    return "";
}

window.submitBookingForm = async function(btn) {
    const mode = document.getElementById('pMode').value;
    const runDate = document.getElementById('runDate').value;
    const customer = document.getElementById('pCustomer').value;
    const containerCount = document.getElementById('rowCount').value || 1;
    
    // 🌟 ดึงค่าขนาดตู้
    const containerSizeVal = document.getElementById('containerSize') ? document.getElementById('containerSize').value.toUpperCase() : '';

    if(!mode || !runDate || !customer) {
        alert('⚠️ กรุณากรอก Mode, วันที่วิ่งงาน และชื่อลูกค้าให้ครบถ้วน'); 
        return; 
    }

    let b_no = "", agentVal = "", cyDate="", vgmCutoff="", cutoffTime="", loadDate="", openGate="", rentCutoff="", demurrage="", unloadDate="", returnDate="";
    
    if (mode === 'EXPORT') {
        b_no = document.getElementById('pBookingExp').value;
        agentVal = document.getElementById('pAgentExp') ? document.getElementById('pAgentExp').value : ''; // 🌟 ดึงค่า Agent ขาออก
        cyDate = getCombinedDateTime('pCyExp'); vgmCutoff = getCombinedDateTime('pVgmExp');
        cutoffTime = getCombinedDateTime('pCutoffExp'); loadDate = getCombinedDateTime('pLoadExp');
        openGate = getCombinedDateTime('pOpenGateExp');
    } else if (mode === 'IMPORT') {
        b_no = document.getElementById('pBookingImp').value;
        agentVal = document.getElementById('pAgentImp') ? document.getElementById('pAgentImp').value : ''; // 🌟 ดึงค่า Agent ขาเข้า
        cyDate = getCombinedDateTime('pCyImp'); rentCutoff = getCombinedDateTime('pRentImp');
        demurrage = getCombinedDateTime('pDemImp'); unloadDate = getCombinedDateTime('pUnloadImp');
        returnDate = getCombinedDateTime('pReturnImp');
    } else if (mode === 'TRANSFER') {
        const trRef = document.getElementById('pRefTrans');
        if(trRef) b_no = trRef.value;
    }

    const jobName = document.getElementById('jobNameInput').value.trim();
    const jobTypeVal = document.getElementById('pJobType') ? document.getElementById('pJobType').value : '';
    const priceTypeVal = document.getElementById('pPriceType') ? document.getElementById('pPriceType').value : '';
    
    const formatNum = (v) => v ? parseFloat(String(v).replace(/,/g, '')) : 0;
    const tripFeeVal = document.getElementById('pTripFee') ? formatNum(document.getElementById('pTripFee').value) : 0;
    const transFeeVal = document.getElementById('pTransFee') ? formatNum(document.getElementById('pTransFee').value) : 0;

    if (jobName) {
        let isNewRate = !rateDataMap[jobName];
        let priceChanged = false;
        
        if (!isNewRate && priceTypeVal) {
            const rate = rateDataMap[jobName];
            if (priceTypeVal === '6W' && (Number(rate.trp6||0) !== tripFeeVal || Number(rate.trn6||0) !== transFeeVal)) priceChanged = true;
            else if (priceTypeVal === '10W' && (Number(rate.trp10||0) !== tripFeeVal || Number(rate.trn10||0) !== transFeeVal)) priceChanged = true;
            else if (priceTypeVal === '12W*2' && (Number(rate.trp12||0) !== tripFeeVal || Number(rate.trn12||0) !== transFeeVal)) priceChanged = true;
            else if (priceTypeVal === 'เงินสด' && (Number(rate.trpCash||0) !== tripFeeVal || Number(rate.trnCash||0) !== transFeeVal)) priceChanged = true;
        }

        if (isNewRate || priceChanged) {
            const msg = isNewRate 
                ? `🚨 ระบบตรวจพบชื่องานใหม่: "${jobName}"\nคุณต้องการบันทึกข้อมูลและราคาชุดนี้ลงในตาราง Master Rates (ฐานข้อมูล) ด้วยหรือไม่?`
                : `🔄 คุณมีการแก้ไขราคาสำหรับรถ ${priceTypeVal} ของงาน "${jobName}"\nต้องการอัปเดตราคาใหม่ลงตาราง Master Rates (ฐานข้อมูล) ด้วยหรือไม่?`;
                
            if (confirm(msg)) {
                const singleRateData = {
                    job_name: jobName, customer_name: customer,
                    origin: document.getElementById('pOrigin').value, destination: document.getElementById('pDest').value,
                    job_type: jobTypeVal,
                    trip_fee_6w: priceTypeVal === '6W' ? tripFeeVal : null,
                    trip_fee_10w: priceTypeVal === '10W' ? tripFeeVal : null,
                    trip_fee_12w: priceTypeVal === '12W*2' ? tripFeeVal : null,
                    trip_fee_cash: priceTypeVal === 'เงินสด' ? tripFeeVal : null,
                    trans_fee_6w: priceTypeVal === '6W' ? transFeeVal : null,
                    trans_fee_10w: priceTypeVal === '10W' ? transFeeVal : null,
                    trans_fee_12w: priceTypeVal === '12W*2' ? transFeeVal : null,
                    trans_fee_cash: priceTypeVal === 'เงินสด' ? transFeeVal : null,
                };
                try { await fetch('/api/rates/single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(singleRateData) }); } catch(e) {}
            }
        }
    }

    // 🌟 ห่อข้อมูลเตรียมส่งไป Database (พร้อม Field ใหม่ครบถ้วน)
    const dataToSave = {
        mode: mode, run_date: runDate, customer_name: customer, job_name: jobName, job_type: jobTypeVal,
        origin: document.getElementById('pOrigin').value, destination: document.getElementById('pDest').value,
        container_count: containerCount,
        container_size: containerSizeVal, // 🌟 ขนาดตู้
        booking_no: b_no,
        agent: agentVal, // 🌟 สายเรือ
        price_type: priceTypeVal, trip_fee: tripFeeVal, trans_fee: transFeeVal,
        cy_date: cyDate, vgm_cutoff: vgmCutoff, cutoff_time: cutoffTime, load_date: loadDate, open_gate: openGate,
        rent_cutoff: rentCutoff, demurrage: demurrage, unload_date: unloadDate, return_date: returnDate
    };

    const orgText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const editBookingNo = urlParams.get('edit');
        
        let res;
        if (editBookingNo && document.getElementById('editingOrderId').value) {
            // โหมดอัปเดต (PUT)
            const bookingId = document.getElementById('editingOrderId').value;
            res = await fetch(`/api/bookings/${bookingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSave) });
        } else {
            // โหมดสร้างใหม่ (POST)
            res = await fetch('/api/bookings/header', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSave) });
        }

        const result = await res.json();
        if (result.success || res.ok) {
            alert('✅ บันทึก Booking เรียบร้อย!');
            if(editBookingNo) window.location.href = '/booking-list.html';
            else window.location.reload(); 
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + (result.message || 'Unknown Error'));
        }
    } catch (err) { alert('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'); } 
    finally { btn.innerHTML = orgText; btn.disabled = false; }
};