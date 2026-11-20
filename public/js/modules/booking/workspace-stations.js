// Station presentation and copy actions use visual-to-physical row mapping after sorting.
function workspaceHasSecondContainer(row) {
    return ['container_2_no','tare_2','max_gross_2','seal_2_no','pop_2_no'].some(key=>row[key] != null && row[key] !== '');
}
function workspaceOpenContainers(visual, addSecond) {
    if (!workspaceReady()) return;
    openDispatchModal(visual);
    if (addSecond) addDispatchSecondContainer();
    document.getElementById('dispatch-container-section').scrollIntoView({block:'start'});
    const position = addSecond ? '2' : '1';
    document.querySelector('#dispatch-containers [data-position="'+position+'"] input')?.focus({preventScroll:true});
}

function workspaceCaptureScroll() {
    const holder = document.querySelector('#container-grid-container .ht_master .wtHolder');
    if (!holder || !hotGridInstance) return null;
    const widths = workspaceColumns.map((_,index)=>hotGridInstance.getColWidth(index));
    let start = 0;
    const anchors = workspaceColumns.map(([field], index)=>{
        const item = {field, offset:start-holder.scrollLeft};
        start += widths[index]; return item;
    }).filter(item=>item.offset>=0);
    return {left:holder.scrollLeft,top:holder.scrollTop,anchors};
}

function workspaceRestoreScroll(saved) {
    if (!saved) return;
    const grid = hotGridInstance;
    requestAnimationFrame(()=>{
        if (hotGridInstance !== grid) return;
        const holder = document.querySelector('#container-grid-container .ht_master .wtHolder');
        if (!holder) return;
        const anchor = saved.anchors.find(item=>workspaceColumns.some(([field])=>field===item.field));
        let left = saved.left;
        if (anchor) {
            const index = workspaceColumns.findIndex(([field])=>field===anchor.field);
            left = workspaceColumns.slice(0,index).reduce((sum,_,col)=>sum+grid.getColWidth(col),0)-anchor.offset;
        }
        holder.scrollLeft = Math.max(0,left);
        holder.scrollTop = saved.top;
    });
}

function workspaceTimeRenderer(instance, td, r, c, prop, value, properties) {
    Handsontable.renderers.TextRenderer(instance, td, r, c, prop, value, properties);
    td.replaceChildren();
    const label = document.createElement('strong');
    const stamp = value ? String(value).replace('T', ' ') : '';
    label.textContent = stamp ? stamp.slice(11,16) : '＋ ระบุวันเวลา';
    const hint = document.createElement('small');
    hint.textContent = stamp ? stamp.slice(0,10) : 'ดับเบิลคลิกเพื่อเลือก';
    td.title = 'ดับเบิลคลิกเพื่อเลือกวันเวลา';
    td.append(hint, document.createElement('br'), label);
}

function workspaceStationHeader(col, th) {
    if (col < 0) return;
    for (const name of [...th.classList]) if (name.startsWith('workspace-zone-')) th.classList.remove(name);
    th.classList.remove('workspace-station-start');
    const field = workspaceColumns[col]?.[0];
    const group = Object.keys(workspaceGroups).find(key => field === '_summary_'+key || workspaceGroups[key].fields.some(([prop])=>prop===field));
    if (!group) return;
    th.classList.add('workspace-zone-'+workspaceColors[group]);
    const previous = workspaceColumns[col-1]?.[0];
    if (!workspaceGroups[group].fields.some(([prop])=>prop===previous)) th.classList.add('workspace-station-start');
}

function workspaceCopyRenderer(instance, td, visual, col, prop, value, properties) {
    Handsontable.renderers.TextRenderer(instance, td, visual, col, prop, value, properties);
    td.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '↳ ดึงรถ + คนขับ';
    button.className = 'workspace-copy-button';
    button.onmousedown = event => event.stopPropagation();
    button.onclick = async event => {
        event.stopPropagation(); button.disabled = true;
        const row = instance.getSourceDataAtRow(instance.toPhysicalRow(visual));
        try {
            const source = await workspacePreviousCrew(row, prop === '_copy_delivery' ? 2 : 3);
            if (!source.plate && !source.driver) { alert('ขาก่อนหน้ายังไม่มีทะเบียนรถหรือคนขับ'); return; }
            const target = prop === '_copy_delivery' ? 'leg2' : 'leg3';
            const existing = row[target+'_plate'] || row[target+'_driver'];
            if (existing && !confirm('แทนที่รถและคนขับด้วยข้อมูลจาก '+source.label+'?')) return;
            const current = instance.toVisualRow(instance.getSourceData().findIndex(item=>item.order_id===row.order_id));
            if (current == null) return;
            instance.setDataAtRowProp([[current,target+'_plate',source.plate||null],[current,target+'_driver',source.driver||null]]);
            document.getElementById('dispatch-stage-help').textContent = row.order_id+' · ดึงรถและคนขับจาก '+source.label+' แล้ว กรุณากดบันทึกข้อมูล';
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
    };
    td.append(button);
}

async function workspacePreviousCrew(row, target) {
    const response = await fetch('/api/dispatch/stops/'+encodeURIComponent(row.order_id));
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'โหลดข้อมูลขาฝากตู้ไม่สำเร็จ');
    const segment = target === 2 ? 'after_pickup' : 'after_delivery';
    const stop = result.data.filter(item=>item.segment===segment).sort((a,b)=>a.position-b.position).at(-1);
    if (stop) return {plate:stop.plate, driver:stop.driver, label:'จุดฝาก '+(stop.location||stop.stop_id)};
    const prefix = 'leg'+(target-1);
    return {plate:row[prefix+'_plate'], driver:row[prefix+'_driver'], label:target===2?'PICK UP':'DELIVERY'};
}
