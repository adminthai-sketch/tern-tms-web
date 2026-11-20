// Child Orders are display rows, not editable Booking headers.
let bookingChildrenLoading = false;
window.toggleRowExpansion = async function(bookingNo) {
    if (!hotGridInstance || bookingChildrenLoading) return;
    if (editedRowIndices.size) return alert('กรุณาบันทึกข้อมูลที่แก้ไขก่อนกางหรือพับตู้ย่อย');
    const grid = hotGridInstance;
    const parent = grid.getSourceData().find(row=>!row._isChild && row[3]===bookingNo);
    if (!parent) return;
    if (expandedBookings[bookingNo]) {
        delete expandedBookings[bookingNo];
        grid.loadData(grid.getSourceData().filter(row=>!(row._isChild && row._parentBooking===bookingNo)));
        return;
    }
    bookingChildrenLoading = true; showLoadingToast(true);
    try {
        const monthValue = String(parent[6]||'').slice(0,7) || document.getElementById('filter-month').value;
        const [year, month] = monthValue.split('-');
        const response = await fetch('/api/shipments?'+new URLSearchParams({year,month}));
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error(result.message||'โหลดตู้ย่อยไม่สำเร็จ');
        if (grid !== hotGridInstance) return;
        const orders = result.data.filter(row=>row.booking_no===bookingNo);
        if (!orders.length) return alert('Booking นี้ยังไม่มีเที่ยว (Order)');
        const source = grid.getSourceData().slice();
        const index = source.findIndex(row=>!row._isChild && row[3]===bookingNo);
        if (index<0) return;
        source.splice(index+1,0,...orders.map(order=>bookingChildRow(parent,order)));
        expandedBookings[bookingNo] = orders.length;
        grid.loadData(source);
    } catch(error) { alert(error.message); }
    finally { bookingChildrenLoading=false; showLoadingToast(false); }
};

function bookingChildRow(parent, order) {
    const row = Array(19).fill('');
    row[0]=false;row[3]=parent[3];row[5]=order.mode||parent[5];row[6]=parent[6];
    const numbers=[order.container_1_no,order.container_2_no].filter(Boolean).join(' / ') || 'ยังไม่ลงเบอร์ตู้';
    row[9]=[order.container_size||'ไม่ระบุขนาด',numbers,order.overall_status||'รอจัดรถ'].join(' · ');
    row._isChild=true;row._orderId=order.order_id;row._parentBooking=parent[3];
    return row;
}

// Stop Handsontable's mousedown selection from replacing the button before click fires.
document.addEventListener('mousedown', event=>{
    if (event.target.closest('#booking-grid-container button, #hot-container button')) event.stopPropagation();
},true);
