let currentDispatchOrder = null; // 🌟 เก็บ Object ของ Order แทนการจำ Index แถว

const dispatchContainerFields = [
    ['container', 'เบอร์ตู้'], ['seal', 'SEAL'], ['tare', 'TARE'],
    ['max_gross', 'MAX GROSS'], ['pop', 'POP']
];
const dispatchContainerKey = (field, position) => field + '_' + position +
    (['container', 'seal', 'pop'].includes(field) ? '_no' : '');

function addDispatchContainer(position) {
    const card = document.createElement('fieldset');
    card.dataset.position = position;
    card.className = 'grid grid-cols-2 sm:grid-cols-5 gap-2 border rounded-lg p-3';
    const legend = document.createElement('legend');
    legend.textContent = 'ตู้ ' + position;
    card.append(legend);
    if (position === 2) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = 'นำตู้ 2 ออก';
        remove.onclick = () => {
            if (!confirm('ล้างข้อมูลตู้ 2 ของเที่ยวนี้เมื่อบันทึก?')) return;
            for (const element of card.querySelectorAll('input')) element.value = '';
            card.hidden = true;
            document.getElementById('dispatch-add-container').hidden = false;
        };
        card.append(remove);
    }
    for (const [field, caption] of dispatchContainerFields.filter(([field])=>field !== 'pop')) {
        const label = document.createElement('label');
        label.className = 'text-xs font-semibold';
        label.textContent = caption;
        const input = document.createElement('input');
        const key = dispatchContainerKey(field, position);
        input.name = key;
        input.value = currentDispatchOrder[key] ?? '';
        input.className = 'block w-full border rounded px-2 py-1';
        if (field === 'tare' || field === 'max_gross') {
            input.type = 'number'; input.step = 'any'; input.min = '0';
        }
        label.append(input);
        card.append(label);
    }
    document.getElementById('dispatch-containers').append(card);
}

window.addDispatchSecondContainer = function() {
    const existing = document.querySelector('#dispatch-containers [data-position="2"]');
    if (existing) existing.hidden = false;
    else addDispatchContainer(2);
    document.getElementById('dispatch-add-container').hidden = true;
    const second = document.querySelector('#dispatch-containers [data-position="2"]');
    second.scrollIntoView({block:'nearest'});
    second.querySelector('input')?.focus({preventScroll:true});
};

window.openDispatchModal = function(rowVisualIndex) {
    if (!hotGridInstance) return;
    if (editedRowIndices.size) {
        alert('กรุณาบันทึกข้อมูลในตารางก่อนเปิดหน้าจัดรถ');
        return;
    }
    
    const physicalRow = hotGridInstance.toPhysicalRow(rowVisualIndex);
    const rData = hotGridInstance.getSourceDataAtRow(physicalRow);
    if (!rData) return;

    currentDispatchOrder = rData; // จำ Order ปัจจุบันไว้
    document.getElementById('dispatch-copy-source').textContent = '';
    document.getElementById('dispatch-containers').replaceChildren();
    document.getElementById('dispatch-add-container').hidden = false;
    addDispatchContainer(1);
    if (dispatchContainerFields.some(([field]) => rData[dispatchContainerKey(field, 2)] != null && rData[dispatchContainerKey(field, 2)] !== '')) {
        addDispatchSecondContainer();
    }

    const orderId = rData.order_id || 'Order';
    const bookingNo = rData.booking_no || '';
    const customer = rData.customer_name || 'ไม่ระบุลูกค้า';
    document.getElementById('modal-row-display').innerText = `${orderId} (${bookingNo} - ${customer})`;

    // โหลดรายชื่อรถและคนขับ
    ['leg1', 'leg2', 'leg3'].forEach(leg => {
        const plateSel = document.getElementById(`modal-${leg}-plate`);
        const driverSel = document.getElementById(`modal-${leg}-driver`);
        
        fillFleetOptions(plateSel,globalTruckList,rData[leg+'_plate'],'-- เลือกรถ --');
        fillFleetOptions(driverSel,globalDriverList,rData[leg+'_driver'],'-- เลือกคนขับ --');
    });

    const parentRow = rawShipmentList.find(r => r.booking_no === bookingNo && r.order_id && !String(r.order_id).includes('ORD-ADD'));
    
    // 🌟 โหลดเวลาจาก Order ตัวเองก่อน ถ้าไม่มีค่อยไปดึงจากหัว Booking (Plan Time) 🌟
    const planCy = rData.leg1_appointment || rData.cy_date;
    const planVgm = rData.order_vgm_cutoff || rData.vgm_cutoff;
    const planLoad = rData.leg2_appointment || (rData.mode === 'IMPORT' ? rData.unload_date : rData.load_date);
    const planCutoff = rData.order_return_cutoff || rData.cutoff_time;

    // แสดงแจ้งเตือนเวลาอ้างอิงบนหัว Modal
    document.getElementById('ref-vgm-time').innerText = formatDateTimeForModal(parentRow?.vgm_cutoff) || '-';
    document.getElementById('ref-cutoff-time').innerText = formatDateTimeForModal(parentRow?.cutoff_time) || '-';

    // ถมข้อมูลลงฟอร์ม
    document.getElementById('modal-leg1-plate').value = rData.leg1_plate || '';
    document.getElementById('modal-leg1-driver').value = rData.leg1_driver || '';
    document.getElementById('modal-leg1-time').value = convertToDatetimeLocal(planCy); 
    document.getElementById('modal-leg1-actual').value = convertToDatetimeLocal(rData.actual_drop_date);
    document.getElementById('modal-leg1-vgm').value = convertToDatetimeLocal(planVgm); 

    document.getElementById('modal-leg2-plate').value = rData.leg2_plate || '';
    document.getElementById('modal-leg2-driver').value = rData.leg2_driver || '';
    document.getElementById('modal-leg2-time').value = convertToDatetimeLocal(planLoad); 
    document.getElementById('modal-leg2-actual').value = convertToDatetimeLocal(rData.actual_load_date); // เวลาจริง

    document.getElementById('modal-leg3-plate').value = rData.leg3_plate || '';
    document.getElementById('modal-leg3-driver').value = rData.leg3_driver || '';
    document.getElementById('modal-leg3-actual').value = convertToDatetimeLocal(rData.actual_return_date); // เวลาจริง
    document.getElementById('modal-leg3-cutoff').value = convertToDatetimeLocal(planCutoff); 

    // ดึงโหมดงานเพื่อจัดการ UI
    currentJobMode = rData.mode ? String(rData.mode).trim().toUpperCase() : 'EXPORT';
    const jobType = rData.job_type ? String(rData.job_type).trim().toUpperCase() : '';
    
    // ตั้งค่าเริ่มต้น UI
    document.getElementById('endpoint-leg1').classList.add('hidden');
    document.getElementById('endpoint-leg2').classList.add('hidden');
    document.getElementById('endpoint-leg3').classList.add('hidden');
    document.getElementById('overlay-leg3').classList.add('hidden');
    document.getElementById('is-drop-only').checked = (rData.is_drop_only === true || rData.is_drop_only === 'true');

    renderDispatchEndpoint(currentJobMode, jobType);
    const modal = document.getElementById('dispatch-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    checkVGMAlert();
};

function renderDispatchEndpoint(mode, jobType) {
    for (const id of ['endpoint-leg1', 'endpoint-leg2', 'endpoint-leg3', 'overlay-leg3']) {
        document.getElementById(id).classList.add('hidden');
    }
    const badge = document.getElementById('endpoint-badge');
    
    // ลอจิกอ่านใจจุดปิดจ๊อบ
    if (document.getElementById('is-drop-only').checked) {
        badge.innerHTML = `<i class="fa-solid fa-anchor"></i> <span>ฝากลาน (Drop Only)</span>`;
        badge.className = "bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-amber-300";
        document.getElementById('endpoint-leg1').classList.remove('hidden');
        document.getElementById('overlay-leg3').classList.remove('hidden'); 
    } else if (mode === 'TRANSFER' || jobType === 'DOMESTIC') {
        badge.innerHTML = `<i class="fa-solid fa-industry"></i> <span>ส่งมอบ (DELIVERY)</span>`;
        badge.className = "bg-orange-100 text-orange-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-orange-300";
        document.getElementById('endpoint-leg2').classList.remove('hidden');
        document.getElementById('overlay-leg3').classList.remove('hidden'); 
    } else {
        badge.innerHTML = `<i class="fa-solid fa-ship"></i> <span>คืนตู้ (RETURN)</span>`;
        badge.className = "bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-lg text-sm shadow-md flex items-center gap-2 border border-purple-300";
        document.getElementById('endpoint-leg3').classList.remove('hidden');
    }

}

window.toggleDropOnlyMode = function() {
    if (currentDispatchOrder) renderDispatchEndpoint(currentJobMode, String(currentDispatchOrder.job_type || '').trim().toUpperCase());
};

window.stampCurrentTime = function(inputId) {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date());
    document.getElementById(inputId).value = parts.replace(' ', 'T');
};

// 🌟 ระบบแจ้งเตือนเวลา VGM 🌟
function checkVGMAlert() {
    const vgmInput = document.getElementById('modal-leg1-vgm');
    const message = document.getElementById('vgm-alert-msg');
    message.classList.add('hidden');
    vgmInput.classList.remove('bg-rose-100', 'text-rose-700', 'bg-red-100', 'text-red-700', 'vgm-text-blink', 'bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-red-500', 'ring-yellow-500', 'ring-rose-500');
    if (!vgmInput.value) return;
    
    const vgmTime = new Date(vgmInput.value + '+07:00');
    const now = new Date();
    const diffHours = (vgmTime - now) / (1000 * 60 * 60);
    if (diffHours <= 3) {
        message.textContent = diffHours <= 0 ? 'เลย VGM Cutoff' : diffHours <= 2 ? 'เหลือไม่เกิน 2 ชม.' : 'เหลือไม่เกิน 3 ชม.';
        message.classList.remove('hidden');
    }
    
    if (diffHours < 0) {
        vgmInput.classList.add('bg-rose-100', 'text-rose-700', 'ring-2', 'ring-rose-500');
        // เพิ่มข้อความ "เลยเวลา VGM แล้ว" (คุณสามารถเพิ่ม label ข้างๆ input ได้)
    } else if (diffHours <= 2) {
        vgmInput.classList.add('bg-red-100', 'text-red-700', 'vgm-text-blink', 'ring-2', 'ring-red-500');
    } else if (diffHours <= 3) {
        vgmInput.classList.add('bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-yellow-500');
    } else {
        vgmInput.classList.remove('bg-rose-100', 'text-rose-700', 'bg-red-100', 'text-red-700', 'vgm-text-blink', 'bg-yellow-100', 'text-yellow-700', 'ring-2', 'ring-red-500', 'ring-yellow-500');
    }
}

// 🌟 ก๊อปปี้รถ (ระบุให้ชัดเจนว่าดึงจากขารับตู้ หรือ ฝากลาน) 🌟
window.copyTruck = async function(fromLegStr, toLegNum) {
    try {
        const response = await fetch('/api/dispatch/stops/' + encodeURIComponent(currentDispatchOrder.order_id));
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'โหลดจุดฝากไม่สำเร็จ');
        const segment = toLegNum === 2 ? 'after_pickup' : 'after_delivery';
        const previous = result.data.filter(stop => stop.segment === segment).sort((a,b)=>a.position-b.position).at(-1);
        if (previous) {
            document.getElementById(`modal-leg${toLegNum}-plate`).value = previous.plate || '';
            document.getElementById(`modal-leg${toLegNum}-driver`).value = previous.driver || '';
            document.getElementById('dispatch-copy-source').textContent = 'ใช้ข้อมูลจากจุดฝาก ' + (previous.location || previous.stop_id);
            return;
        }
    } catch (error) { alert(error.message); return; }
    // fromLegStr สามารถรับเป็น 'leg1' (รับตู้) หรือ 'drop1' (ฝากลาน) ได้
    // แต่เพื่อความง่ายในเวอร์ชันนี้ สมมติว่าดึงจาก leg ตรงๆ ไปก่อน เดี๋ยวค่อยไปปรับหน้า HTML ใส่ปุ่มดึง Drop
    const drop = 'drop' + (toLegNum - 1);
    const useDrop = currentDispatchOrder?.[drop + '_completed'] === true &&
        (currentDispatchOrder[drop + '_plate'] || currentDispatchOrder[drop + '_driver']);
    const plate = useDrop ? currentDispatchOrder[drop + '_plate'] : document.getElementById(`modal-${fromLegStr}-plate`).value;
    const driver = useDrop ? currentDispatchOrder[drop + '_driver'] : document.getElementById(`modal-${fromLegStr}-driver`).value;
    
    document.getElementById(`modal-leg${toLegNum}-plate`).value = plate || '';
    document.getElementById(`modal-leg${toLegNum}-driver`).value = driver || '';
    document.getElementById('dispatch-copy-source').textContent = useDrop ? 'ใช้ข้อมูลจากขาฝากตู้' : 'ใช้ข้อมูลจากขาก่อน';
};

window.saveDispatchModal = async function(btnElement) {
    if (!currentDispatchOrder) return;
    
    const orgText = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> บันทึก...';
    btnElement.disabled = true;

    // 1. ดึงข้อมูลจากฟอร์ม
    const updateData = {
        order_id: currentDispatchOrder.order_id,
        booking_no: currentDispatchOrder.booking_no,
        is_drop_only: document.getElementById('is-drop-only').checked,
        
        leg1_plate: document.getElementById('modal-leg1-plate').value,
        leg1_driver: document.getElementById('modal-leg1-driver').value,
        leg1_appointment: formatDatetimeForDB(document.getElementById('modal-leg1-time').value),
        actual_drop_date: formatDatetimeForDB(document.getElementById('modal-leg1-actual').value),
        order_vgm_cutoff: formatDatetimeForDB(document.getElementById('modal-leg1-vgm').value),

        leg2_plate: document.getElementById('modal-leg2-plate').value,
        leg2_driver: document.getElementById('modal-leg2-driver').value,
        leg2_appointment: formatDatetimeForDB(document.getElementById('modal-leg2-time').value),
        actual_load_date: formatDatetimeForDB(document.getElementById('modal-leg2-actual').value),

        leg3_plate: document.getElementById('modal-leg3-plate').value,
        leg3_driver: document.getElementById('modal-leg3-driver').value,
        actual_return_date: formatDatetimeForDB(document.getElementById('modal-leg3-actual').value),
        order_return_cutoff: formatDatetimeForDB(document.getElementById('modal-leg3-cutoff').value),
    };

    for (const input of document.querySelectorAll('#dispatch-containers input')) {
        if (!input.reportValidity()) {
            btnElement.innerHTML = orgText;
            btnElement.disabled = false;
            return;
        }
        if (input.value !== String(currentDispatchOrder[input.name] ?? '')) updateData[input.name] = input.value;
    }

    // 3. ยิง API บันทึกรายออร์เดอร์ (สมมติว่า backend รองรับการอัปเดตจาก Array)
    try {
        const res = await fetch('/api/shipments', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dispatch_patch: true, data: [updateData] })
        });
        
        const result = await res.json();
        
        if (res.ok && result.success) {
            // ปิด Modal
            document.getElementById('dispatch-modal').classList.add('hidden');
            alert(`✅ บันทึกและจัดรถสำเร็จ! (สถานะ: ${result.overall_status})`);
            
            // รีโหลดข้อมูลทั้งหมดใหม่ เพื่อให้ตารางอัปเดต (วิธีที่ชัวร์ที่สุดว่า DB กับ หน้าจอตรงกัน)
            loadContainerGridData();
        } else {
            alert('❌ ข้อผิดพลาดจากระบบ: ' + result.message);
        }
    } catch (err) {
        alert('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
        btnElement.innerHTML = orgText;
        btnElement.disabled = false;
    }
};

window.saveGridChanges = async function() {
    if (!hotGridInstance || !editedRowIndices.size) return;
    const button = document.getElementById('btn-save-grid');
    button.disabled = true;
    try {
        const data = [...editedRowIndices].map(index => {
            const { seal_no, tare, max_gross, _savedPlates, ...row } = hotGridInstance.getSourceDataAtRow(hotGridInstance.toPhysicalRow(index));
            return row;
        });
        const response = await fetch('/api/shipments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกตารางไม่สำเร็จ');
        editedRowIndices.clear();
        await loadContainerGridData();
        alert('บันทึกตารางสำเร็จ');
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
};

// --- ฟังก์ชันช่วยเหลือ (แปลงฟอร์แมตวันที่) ---
function convertToDatetimeLocal(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    let clean = String(dtStr).trim().replace(' ', 'T');
    if (clean.length === 10) clean += 'T00:00';
    return clean.substring(0, 16);
}
function formatDatetimeForDB(dtStr) {
    if (!dtStr) return null;
    return dtStr.replace('T', ' ') + ':00'; 
}
function formatDateTimeForModal(dtStr) {
    if (!dtStr || String(dtStr).trim() === 'NaN' || String(dtStr).trim() === 'null') return '';
    return workspaceFormatDateTime(dtStr);
}
