// ==========================================
// 🔍 MODULE: BOOKING FILTER (ส่วนที่ 2)
// ==========================================

let filterStates = { date: null, cust: null, book: null };

function buildSmartFilters() {
    if(!hotBookingInstance) return;
    const data = hotBookingInstance.getData();
    let dates = new Set(), custs = new Set(), books = new Set();

    data.forEach(r => {
        if(r[4]) dates.add(r[4]); 
        if(r[6]) custs.add(r[6]); 
        if(r[7]) books.add(r[7]); 
    });

    renderTags('tag-container-date', dates, 'date', 'ทุกวันที่');
    renderTags('tag-container-cust', custs, 'cust', 'ลูกค้าทั้งหมด');
    renderTags('tag-container-book', books, 'book', 'ทุก Booking');
}

function renderTags(containerId, itemsSet, filterType, allLabel) {
    let html = `<div class="filter-tag ${!filterStates[filterType] ? 'active filter-tag-all' : ''}" onclick="applyFilter('${filterType}', null)">👁️ ${allLabel}</div>`;
    Array.from(itemsSet).sort().forEach(v => {
        html += `<div class="filter-tag ${filterStates[filterType] === v ? 'active' : ''}" onclick="applyFilter('${filterType}', '${v}')">${v}</div>`;
    });
    document.getElementById(containerId).innerHTML = html;
}

function applyFilter(type, val) {
    filterStates[type] = val;
    const plugin = hotBookingInstance.getPlugin('filters');
    plugin.clearConditions();
    if(filterStates.date) plugin.addCondition(4, 'eq', [filterStates.date]); 
    if(filterStates.cust) plugin.addCondition(6, 'eq', [filterStates.cust]); 
    if(filterStates.book) plugin.addCondition(7, 'eq', [filterStates.book]); 
    plugin.filter();
    buildSmartFilters(); 
}