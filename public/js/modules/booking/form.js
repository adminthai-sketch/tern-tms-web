// ==========================================
// 📦 MODULE: BOOKING FORM (ส่วนที่ 1)
// ==========================================

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
    
    if (typeof refreshTableColumnsByMode === 'function') {
        refreshTableColumnsByMode(mode);
    }
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
    document.getElementById('pJobType').value = rate.jobType || 'ทั่วไป';
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

async function generateData(btn) {
    const mode = document.getElementById('pMode').value;
    const runDate = document.getElementById('runDate').value;
    const editingRow = document.getElementById('editingOrderId').value;
    
    if(!mode || !runDate) { 
        alert('⚠️ กรุณาเลือก Mode และระบุวันที่วิ่งงานให้ครบถ้วน'); 
        return; 
    }

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
    const tripFee = document.getElementById('pTripFee').value; 
    const transFee = document.getElementById('pTransFee').value;

    // โหมดแก้ไข
    if (editingRow !== "") {
        let rIdx = parseInt(editingRow);
        let rowData = hotBookingInstance.getDataAtRow(rIdx);
        rowData[2] = mode; rowData[4] = runDate; rowData[5] = jobName; rowData[6] = customer; rowData[7] = bookingNo;
        rowData[12] = jobType; rowData[13] = agent; rowData[19] = cyDate;
        
        if (mode === 'EXPORT') { rowData[20] = vgmCutoff; rowData[21] = cutoffTime; rowData[22] = loadDate; rowData[23] = openGate; }
        else if (mode === 'IMPORT') { rowData[24] = rentCutoff; rowData[25] = demurrage; rowData[26] = unloadDate; rowData[27] = returnDate; }
        
        rowData[56] = tripFee; rowData[57] = transFee;
        
        hotBookingInstance.populateFromArray(rIdx, 1, [[...rowData.slice(1)]]);
        cancelEdit();
        document.getElementById('grid-section').scrollIntoView({ behavior: 'smooth' });
        await saveShipments(false);
        return;
    }

    // โหมดสร้างใหม่ (1. บันทึกลงตาราง bookings หัวบิล)
    const rowCount = parseInt(document.getElementById('rowCount').value) || 1;
    const bookingData = {
        mode: mode,
        run_date: runDate,
        container_count: rowCount,
        job_name: jobName,
        customer_name: customer,
        booking_no: bookingNo || `TEMP-${Date.now()}`,
        origin: origin,
        destination: destination
    };

    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก Booking...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/bookings/header', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        });
        const result = await response.json();

        if (result.success) {
            let maxSeq = hotBookingInstance.countRows() + 1;
            let newRows = [];
            const today = new Date().toISOString().split('T')[0];
            const datePrefix = runDate.replace(/-/g, '').substring(2); 

            for (let i = 0; i < rowCount; i++) {
                let orderId = `ORD-${datePrefix}-${("000" + maxSeq++).slice(-3)}`;
                let row = new Array(79).fill(""); 
                row[0] = false; 
                row[1] = orderId; row[2] = mode; row[3] = today; row[4] = runDate;
                row[5] = jobName; row[6] = customer; row[7] = bookingData.booking_no;
                row[10] = 1; row[12] = jobType; row[13] = agent; row[19] = cyDate; 
                
                if (mode === 'EXPORT') { row[20] = vgmCutoff; row[21] = cutoffTime; row[22] = loadDate; row[23] = openGate; } 
                else if (mode === 'IMPORT') { row[24] = rentCutoff; row[25] = demurrage; row[26] = unloadDate; row[27] = returnDate; }
                
                row[56] = tripFee; row[57] = transFee; row[78] = 'รอจัดรถ';
                row._isUnsaved = true;
                newRows.push(row);
            }

            // 2. แทรกแถวใหม่ลงตาราง Handsontable
            hotBookingInstance.alter('insert_row', 0, rowCount);
            hotBookingInstance.populateFromArray(0, 0, newRows);
            
            document.getElementById('jobNameInput').value = '';
            document.getElementById('jobPreviewBox').classList.add('hidden');
            document.getElementById('pMode').value = ''; 
            
            document.getElementById('grid-section').scrollIntoView({ behavior: 'smooth' });

            // 3. Auto-save ตู้ลงตาราง shipments (หน่วงเวลาให้ Grid เรนเดอร์เสร็จก่อน)
            setTimeout(async () => {
                await saveShipments(true); 
            }, 300);

        } else {
            alert('❌ ไม่สามารถบันทึกลงตาราง Bookings ได้: ' + result.message);
        }
    } catch (error) {
        alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + error.message);
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

function cancelEdit() {
    document.getElementById('editingOrderId').value = "";
    document.getElementById('form-title').innerText = "สร้างรายการรับงานใหม่ (New Booking)";
    document.getElementById('editing-badge').classList.add('hidden');
    document.getElementById('btn-submit-form').innerHTML = '<i class="fa-solid fa-plus-circle"></i> สร้างรายการลงตาราง';
    document.getElementById('btn-submit-form').classList.replace('bg-emerald-600', 'bg-primary');
    document.getElementById('btn-submit-form').classList.replace('hover:bg-emerald-700', 'hover:bg-blue-900');
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('box-row-count').classList.remove('hidden');
}