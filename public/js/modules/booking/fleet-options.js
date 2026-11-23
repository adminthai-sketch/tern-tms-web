function fillFleetOptions(select,values,saved,placeholder) {
    select.replaceChildren(new Option(placeholder,''));
    for(const value of [...new Set(values)])select.add(new Option(value,value));
    if(saved && !values.includes(saved))select.add(new Option(saved+' (ข้อมูลเดิม)',saved));
    select.value=saved||'';
}
window.handleModalTruckChange = function(leg) {
    const plate=document.getElementById(`modal-leg${leg}-plate`).value;
    const driver=document.getElementById(`modal-leg${leg}-driver`);
    if(fleetAssignments[plate])driver.value=fleetAssignments[plate];
    document.getElementById('dispatch-copy-source').textContent=fleetAssignments[plate]?'คนขับประจำรถ '+plate+': '+fleetAssignments[plate]+' · เปลี่ยนเฉพาะเที่ยวได้':'รถคันนี้ยังไม่มีคนขับประจำ กรุณาเลือกคนขับ';
};
window.handleModalDriverChange = function(leg) {
    const driver=document.getElementById(`modal-leg${leg}-driver`).value;
    const plate=document.getElementById(`modal-leg${leg}-plate`);
    if(driverAssignments[driver])plate.value=driverAssignments[driver];
};

// Never replace a paired cell explicitly included in the same paste operation.
function workspaceFleetSuggestions(changes, instance, source) {
    if (source === 'fleet-auto') return [];
    const explicit = new Set(changes.map(([row, field]) => row + ':' + field));
    const suggestions = [];
    for (const [visual, field, old, value] of changes) {
        if (!value || old === value || typeof field !== 'string') continue;
        const isPlate = field.endsWith('_plate'), isDriver = field.endsWith('_driver');
        if (!isPlate && !isDriver) continue;
        const paired = isPlate ? field.replace('_plate','_driver') : field.replace('_driver','_plate');
        const match = (isPlate ? fleetAssignments : driverAssignments)[value];
        if (match && !explicit.has(visual + ':' + paired)) suggestions.push([visual, paired, match]);
    }
    return suggestions;
}
