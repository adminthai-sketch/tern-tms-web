// Display assignment only. This does not allocate driver pay or customer revenue.
function monitorAssignedCrew(order) {
    for (const leg of [3,2,1]) {
        if (order['leg'+leg+'_plate'] || order['leg'+leg+'_driver']) {
            return {plate:order['leg'+leg+'_plate']||'',driver:order['leg'+leg+'_driver']||'',leg};
        }
    }
    return {plate:'',driver:'',leg:null};
}

function monitorCrewText(value) {
    return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
