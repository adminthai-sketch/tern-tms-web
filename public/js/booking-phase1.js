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
    qty.className = 'container-qty w-24 border rounded p-2'; qty.disabled = locked;
    qty.setAttribute('aria-label', 'จำนวนตู้');
    const size = document.createElement('input');
    size.value = row.size; size.setAttribute('list', 'dl-container-sizes');
    size.className = 'container-size w-40 border rounded p-2'; size.disabled = locked;
    size.setAttribute('aria-label', 'ขนาดตู้'); size.placeholder = 'ขนาดตู้';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'ลบแถว'; remove.disabled = locked;
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
    phaseCustomers = result.data.map(([id, , customer_name, short_name]) => ({ id, customer_name, short_name }));
    const list = document.getElementById('bookingCustomerList'); list.replaceChildren();
    for (const customer of phaseCustomers) {
        const option = document.createElement('option');
        option.value = customer.short_name || customer.customer_name;
        option.label = customer.customer_name + ' (#' + customer.id + ')'; list.append(option);
    }
}
function openQuickCustomer() { document.getElementById('quickCustomer').showModal(); }
async function saveQuickCustomer(button) {
    button.disabled = true;
    try {
        const body = Object.fromEntries(['short_name', 'customer_name', 'billing_name', 'tax_id', 'address']
            .map(field => [field, document.getElementById('quick_' + field).value.trim()]));
        const response = await fetch('/api/customers/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'เพิ่มลูกค้าไม่สำเร็จ');
        phaseCustomers.push({ ...result.data, id: result.customer_id });
        document.getElementById('pCustomer').value = result.data.short_name;
        document.getElementById('pCustomer').dataset.customerId = result.customer_id;
        document.getElementById('pCustomerId').value = result.customer_id;
        document.getElementById('quickCustomer').close();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
}

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
    const matches = phaseCustomers.filter(c => (c.short_name || c.customer_name) === input.value.trim());
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
        document.getElementById('pJobType').value = 'CONTAINER'; toggleModeUI();
    }
    document.getElementById('pCustomer').addEventListener('input', event => {
        delete event.target.dataset.customerId;
        document.getElementById('pCustomerId').value = '';
    });
    try { await loadPhaseCustomers(); } catch (error) { alert(error.message); }
});
