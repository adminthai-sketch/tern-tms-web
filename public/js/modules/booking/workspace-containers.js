// Container 2 belongs to one Order; opening its card never adds another Order or clears data.
const workspaceSecondExpanded=new Set(),workspaceSecondDraft=new Set();
function workspaceContainerRowHeight(instance,data,visual) {
    const row=instance?instance.getSourceDataAtRow(instance.toPhysicalRow(visual)):data[visual];
    return workspaceSecondExpanded.has(row?.order_id)&&workspaceView.container!==false?164:52;
}
function workspaceToggleSecond(orderId) {
    if(workspaceSecondExpanded.has(orderId))workspaceSecondExpanded.delete(orderId);
    else {workspaceSecondExpanded.add(orderId);workspaceSecondDraft.add(orderId);}
}
function workspaceSecondContainerRenderer(instance,td,visual,col,prop,value,properties) {
    Handsontable.renderers.TextRenderer(instance,td,visual,col,prop,value,properties);
    td.replaceChildren();const row=instance.getSourceDataAtRow(instance.toPhysicalRow(visual));
    const expanded=workspaceSecondExpanded.has(row.order_id);
    const exists=workspaceHasSecondContainer(row)||workspaceSecondDraft.has(row.order_id);
    const button=document.createElement('button');button.type='button';button.className='workspace-container-button';
    button.textContent=expanded?'▾ พับตู้ 2':exists?'▸ ดูตู้ 2':'＋ เพิ่มตู้ 2';
    button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',button.textContent+' '+row.order_id);
    button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
    button.onclick=event=>{
        event.stopPropagation();const saved=workspaceCaptureScroll();workspaceToggleSecond(row.order_id);
        instance.render();workspaceRestoreScroll(saved);
    };
    td.append(button);
    if(!expanded)return;
    const card=document.createElement('div');card.className='workspace-second-card';
    for(const [field,caption] of [['container_2_no','เบอร์ตู้ 2'],['seal_2_no','SEAL 2'],['tare_2','TARE 2'],['max_gross_2','MAX GROSS 2']]){
        const label=document.createElement('label');label.textContent=caption;
        const input=document.createElement('input');input.value=row[field]??'';input.setAttribute('aria-label',caption+' '+row.order_id);
        if(field==='tare_2'||field==='max_gross_2'){input.type='number';input.min='0';input.step='any';}
        for(const name of ['mousedown','keydown','click'])input.addEventListener(name,event=>event.stopPropagation());
        input.oninput=()=>{
            row[field]=input.value;
            const patch=workspaceDirty.get(row.order_id)||{order_id:row.order_id};patch[field]=input.value===''?null:input.value;
            workspaceDirty.set(row.order_id,patch);editedRowIndices=new Set(workspaceDirty.keys());updateSaveStatusBadge();
        };
        label.append(input);card.append(label);
    }
    td.append(card);
}
