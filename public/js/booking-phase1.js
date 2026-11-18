// Booking-only UI; never changes Master Rates when editing the job owner.
let phaseCustomers = [];
let originalBooking = null;

function renderContainerRows(rows, locked = false) {
    const box = document.getElementById('containerRows');
    box.replaceChildren();
    for (const row of rows) addContainerRow(row, locked);
    document.getElementById('addContainerRow').disabled = locked;
}

function addContainerRow(row = { qty: 1, size: '40HC' }, locked = false) {
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center mb-2';
    const qty = document.createElement('input');
    qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = row.qty;
    qty.className = 'container-qty w-20 border border-slate-300 rounded-lg p-1.5 text-center font-bold text-sm bg-white'; qty.disabled = locked;
    qty.setAttribute('aria-label', 'จำนวนตู้');
    
    const size = document.createElement('input');
    size.value = row.size; size.setAttribute('list', 'dl-container-sizes');
    size.className = 'container-size w-32 border border-slate-300 rounded-lg p-1.5 text-sm uppercase font-semibold bg-white'; size.disabled = locked;
    size.setAttribute('aria-label', 'ขนาดตู้'); size.placeholder = 'ขนาดตู้';
    
    const remove = document.createElement('button');
    remove.type = 'button'; remove.innerHTML = '<i class="fa-solid fa-trash-can"></i>'; 
    remove.className = 'text-slate-400 hover:text-red-500 px-1.5 text-xs';
    remove.disabled = locked;
    remove.onclick = () => { if (div.parentElement.children.length > 1) div.remove(); };
    
    div.append(qty, document.createTextNode(' × '), size, remove);
    document.getElementById('containerRows').append(div);
}

function readContainerRows() {
    return Array.from(document.getElementById('containerRows').children, row => ({
        qty: Number(row.querySelector('.container-qty').value),
        size: row.querySelector('.container-size').value.trim().toUpperCase()
    }));
}

async function loadPhaseCustomers() {
    const response = await fetch('/api/customers');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('โหลดลูกค้าไม่สำเร็จ');
    
    // โครงสร้างข้อมูลจาก /api/customers: [id, customer_no, customer_name, short_name, billing_name, phone_number, address, tax_id]
    phaseCustomers = result.data.map(row => ({
        id: row[0],
        customer_no: row[1] || '',
        customer_name: row[2] || '',
        short_name: row[3] || '',
        billing_name: row[4] || '',
        phone_number: row[5] || '',
        address: row[6] || '',
        tax_id: row[7] || ''
    }));

    const list = document.getElementById('bookingCustomerList'); 
    list.replaceChildren();
    for (const customer of phaseCustomers) {
        if (!customer.short_name && !customer.customer_name) continue;
        const option = document.createElement('option');
        option.value = customer.short_name || customer.customer_name;
        option.label = customer.customer_name + (customer.tax_id ? ` [Tax: ${customer.tax_id}]` : ''); 
        list.append(option);
    }
}

function displayCustomerCard(customer) {
    const fullNameField = document.getElementById('pCustomerFullName');
    const taxIdField = document.getElementById('pCustomerTaxId');
    const billingNameField = document.getElementById('pCustomerBillingName');
    const addressField = document.getElementById('pCustomerAddress');
    const alertBox = document.getElementById('missing-customer-info-alert');

    if (!customer) {
        fullNameField.value = '';
        taxIdField.value = '';
        billingNameField.value = '';
        addressField.value = '';
        alertBox.classList.add('hidden');
        return;
    }

    fullNameField.value = customer.customer_name || '-';
    taxIdField.value = customer.tax_id || '-';
    billingNameField.value = customer.billing_name || customer.customer_name || '-';
    addressField.value = customer.address || '-';

    // เช็คว่าขาดเลขภาษี หรือ ที่อยู่ หรือไม่
    if (!customer.tax_id || !customer.address) {
        alertBox.classList.remove('hidden');
    } else {
        alertBox.classList.add('hidden');
    }
}

function openQuickCustomer(mode = 'new') {
    const dialog = document.getElementById('quickCustomer');
    const title = document.getElementById('quick-customer-title');
    const idInput = document.getElementById('quick_customer_id');
    const shortInput = document.getElementById('quick_short_name');
    const nameInput = document.getElementById('quick_customer_name');
    const billingInput = document.getElementById('quick_billing_name');
    const taxInput = document.getElementById('quick_tax_id');
    const addrInput = document.getElementById('quick_address');

    if (mode === 'edit') {
        const currentId = document.getElementById('pCustomerId').value;
        const cust = phaseCustomers.find(c => String(c.id) === String(currentId));
        if (!cust) return;

        title.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1.5"></i> เติมข้อมูลลูกค้า / เลขผู้เสียภาษี';
        idInput.value = cust.id;
        shortInput.value = cust.short_name;
        shortInput.readOnly = true;
        shortInput.classList.add('bg-slate-100');
        nameInput.value = cust.customer_name;
        billingInput.value = cust.billing_name || cust.customer_name;
        taxInput.value = cust.tax_id || '';
        addrInput.value = cust.address || '';
    } else {
        title.innerHTML = '<i class="fa-solid fa-building-circle-check mr-1.5"></i> เพิ่มลูกค้าใหม่';
        idInput.value = '';
        shortInput.readOnly = false;
        shortInput.classList.remove('bg-slate-100');
        // ถ้าไม่ได้พิมพ์ค้างไว้ในช่องค้นหา ให้เคลียร์ค่า
        if (!shortInput.value) shortInput.value = document.getElementById('pCustomer').value.trim().toUpperCase();
        nameInput.value = '';
        billingInput.value = '';
        taxInput.value = '';
        addrInput.value = '';
    }
    dialog.showModal();
}

async function saveQuickCustomer(button) {
    button.disabled = true;
    try {
        const editId = document.getElementById('quick_customer_id').value;
        const body = {
            short_name: document.getElementById('quick_short_name').value.trim().toUpperCase(),
            customer_name: document.getElementById('quick_customer_name').value.trim(),
            billing_name: document.getElementById('quick_billing_name').value.trim(),
            tax_id: document.getElementById('quick_tax_id').value.trim(),
            address: document.getElementById('quick_address').value.trim()
        };

        if (!body.short_name || !body.customer_name) {
            throw new Error('กรุณากรอกตัวย่อและชื่อบริษัทเต็ม');
        }

        // ถ้ามี editId ให้ยิงไปอัปเดตข้อมูลลูกค้าเดิม (PUT), ถ้าไม่มีให้สร้างใหม่ (POST)
        const url = editId ? `/api/customers/${editId}` : '/api/customers/quick';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, { 
            method: method, 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');

        // โหลดรายชื่อลูกค้าใหม่ทั้งหมดเพื่อให้ข้อมูลซิงค์ล่าสุด
        await loadPhaseCustomers();

        const targetId = editId || result.customer_id;
        const updatedCust = phaseCustomers.find(c => String(c.id) === String(targetId));
        
        if (updatedCust) {
            document.getElementById('pCustomer').value = updatedCust.short_name;
            document.getElementById('pCustomer').dataset.customerId = updatedCust.id;
            document.getElementById('pCustomerId').value = updatedCust.id;
            displayCustomerCard(updatedCust);
        }

        document.getElementById('quickCustomer').close();
    } catch (error) { 
        alert(error.message); 
    } finally { 
        button.disabled = false; 
    }
}

window.checkAndPromptCustomer = function() {
    const inputField = document.getElementById('pCustomer');
    const val = inputField.value.trim().toUpperCase();
    inputField.value = val;
    
    if (!val) {
        delete inputField.dataset.customerId;
        document.getElementById('pCustomerId').value = '';
        displayCustomerCard(null);
        return;
    }

    const matchedCustomer = phaseCustomers.find(c => 
        (c.short_name || '').toUpperCase() === val || 
        (c.customer_name || '').toUpperCase() === val
    );
    
    if (matchedCustomer) {
        inputField.dataset.customerId = matchedCustomer.id;
        document.getElementById('pCustomerId').value = matchedCustomer.id;
        displayCustomerCard(matchedCustomer);
    } else {
        delete inputField.dataset.customerId;
        document.getElementById('pCustomerId').value = '';
        displayCustomerCard(null);
        
        if (confirm(`🚨 ไม่พบตัวย่อลูกค้า "${val}" ในระบบ\n\nต้องการเพิ่มข้อมูลบริษัท เลขผู้เสียภาษี และที่อยู่ ตอนนี้เลยหรือไม่?`)) {
            document.getElementById('quick_short_name').value = val;
            openQuickCustomer('new');
        } else {
            inputField.value = '';
        }
    }
};

window.updateFeeDropdowns = function() {
    const val = document.getElementById('jobNameInput') ? document.getElementById('jobNameInput').value.trim() : ''; 
    const trpInp = document.getElementById('pTripFee'); 
    const trnInp = document.getElementById('pTransFee');
    
    if (!val || !rateDataMap[val]) return;
    const rate = rateDataMap[val];
    
    if (trpInp && !trpInp.value) trpInp.value = rate.trp10 || rate.trp6 || rate.trp12 || rate.trpCash || '';
    if (trnInp && !trnInp.value) trnInp.value = rate.trn10 || rate.trn6 || rate.trn12 || rate.trnCash || '';
};

const legacyLoadBooking = loadBookingForEdit;
loadBookingForEdit = async function(bookingNo) {
    document.getElementById('btn-submit-form').disabled = true;
    try {
        const response = await fetch('/api/bookings/search?search=' + encodeURIComponent(bookingNo));
        const result = await response.json();
        const item = result.data?.find(row => row.booking_no === bookingNo);
        if (!response.ok || !result.success || !item) throw new Error('ไม่พบ Booking ที่ต้องการแก้ไข');
        await legacyLoadBooking(bookingNo, item);
        originalBooking = item;
        document.getElementById('editingOrderId').value = item.id;
        document.getElementById('pCustomer').dataset.customerId = item.customer_id || '';
        document.getElementById('pCustomerId').value = item.customer_id || '';
        
        const matched = phaseCustomers.find(c => String(c.id) === String(item.customer_id));
        if (matched) {
            document.getElementById('pCustomer').value = matched.short_name || matched.customer_name;
            displayCustomerCard(matched);
        }

        document.getElementById('jobOwner').value = item.job_owner || '';
        document.getElementById('pFactory').value = item.factory || '';
        document.getElementById('pTripFee').value = item.trip_fee ?? '';
        document.getElementById('pTransFee').value = item.trans_fee ?? '';
        renderContainerRows(item.container_list || [{ qty: item.container_count || 1, size: item.container_size || '' }], true);
        for (const id of ['pBookingExp', 'pBookingImp', 'pRefTrans']) document.getElementById(id).readOnly = true;
        document.getElementById('btn-submit-form').disabled = false;
    } catch (error) { alert(error.message); }
};

const legacySubmitBooking = submitBookingForm;
submitBookingForm = async function(button) {
    const rows = readContainerRows();
    if (!originalBooking && (!rows.length || rows.some(r => !Number.isSafeInteger(r.qty) || r.qty < 1 || !r.size) || rows.reduce((n,r) => n+r.qty,0) > 1000)) {
        alert('กรุณาระบุจำนวนเต็มและขนาดตู้ทุกแถว รวมไม่เกิน 1,000 ตู้'); return;
    }
    const input = document.getElementById('pCustomer');
    const matches = phaseCustomers.filter(c => (c.short_name || c.customer_name).toUpperCase() === input.value.trim().toUpperCase());
    const selected = matches.find(c => String(c.id) === input.dataset.customerId) || (matches.length === 1 ? matches[0] : null);
    if (!selected) { alert('กรุณาเลือกลูกค้าที่มีตัวย่อไม่ซ้ำ หรือกดเพิ่มลูกค้า'); return; }
    input.dataset.customerId = selected.id;
    document.getElementById('pCustomerId').value = selected.id;
    document.getElementById('rowCount').value = originalBooking ? originalBooking.container_count : rows.reduce((n,r) => n+r.qty,0);
    document.getElementById('containerSize').value = rows.length === 1 ? rows[0].size : '';
    await legacySubmitBooking(button);
};

function phaseBookingPayload(payload) {
    payload.customer_id = Number(document.getElementById('pCustomerId').value);
    payload.job_owner = document.getElementById('jobOwner').value.trim();
    payload.factory = document.getElementById('pFactory').value.trim();
    if (!originalBooking) payload.container_list = readContainerRows();
    else {
        delete payload.container_count; delete payload.container_size;
        payload.booking_no = originalBooking.booking_no;
    }
    if (payload.mode === 'EXPORT') delete payload.demurrage;
    payload.agent = document.getElementById(payload.mode === 'IMPORT' ? 'pAgentImp' : 'pAgentExp').value;
    return payload;
}

window.addEventListener('DOMContentLoaded', async () => {
    renderContainerRows([{ qty: 1, size: '40HC' }]);
    if (!new URLSearchParams(location.search).get('edit')) {
        document.getElementById('pMode').value = 'EXPORT';
        document.getElementById('pJobType').value = 'CONTAINER'; 
        toggleModeUI();
    }
    document.getElementById('pCustomer').addEventListener('input', event => {
        delete event.target.dataset.customerId;
        document.getElementById('pCustomerId').value = '';
    });
    try { await loadPhaseCustomers(); } catch (error) { alert(error.message); }
});