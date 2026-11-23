// Loaded after either Booking List or Dispatch modules, before their data requests finish.
(() => {
    const dispatch=location.pathname.includes('booking-manage');
    const rows=()=>dispatch?rawShipmentList:rawBookingList;
    const ready=()=>dispatch?workspaceReady():!(typeof editedRowIndices!=='undefined'&&editedRowIndices.size) || (alert('กรุณาบันทึกข้อมูลก่อนเปลี่ยนตัวกรอง'),false);
    const originalApply=window.applyFilters;
    window.applyFilters=function(){originalApply();TmsFilters.refresh();};
    updateDropdownOptions=function(){TmsFilters.refresh();};
    window.handleCrossFilter=function(event){
        if(!ready())return;
        if(event?.target?.id==='filter-booking-no')TmsFilters.syncBooking();
        TmsFilters.refresh();window.applyFilters();
    };
    TmsFilters.mount({rows,ready,apply:()=>window.applyFilters()});
})();
