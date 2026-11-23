const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=name=>fs.readFileSync('public/js/modules/booking/'+name,'utf8');
function element(tag){
    return {tag,children:[],value:'',hidden:false,checked:false,textContent:'',classList:{toggle(){}},
        append(...items){this.children.push(...items);for(const item of items)if(item&&typeof item==='object')item.parentElement=this;},
        after(){},replaceChildren(...items){this.children=[];this.append(...items);},removeAttribute(){},setAttribute(){},focus(){},
        add(option){this.children.push(option);if(this.children.length===1)this.value=String(option.value);},showModal(){},contains(){return false;}};
}
function filterContext(){
    const inputs=Object.fromEntries(['filter-run-date','filter-customer','filter-booking-no','filter-month'].map(id=>[id,element('input')]));
    const ctx=vm.createContext({document:{getElementById:id=>inputs[id],createElement:element,addEventListener(){}}});
    vm.runInContext(read('multi-filters.js')+';globalThis.filters=TmsFilters;',ctx);
    return {ctx,inputs};
}
test('multi-value filters use OR within a field, AND across fields, and preserve comma-containing names',()=>{
    const {ctx}=filterContext(),f=ctx.filters;
    assert.equal(f.matches(f.encode(['A','B']),'B'),true);
    assert.equal(f.matches(f.encode(['A','B']),'C'),false);
    assert.equal(f.matches('','C'),true);
    assert.deepEqual(Array.from(f.values(f.encode(['Company, Ltd','B']))),['Company, Ltd','B']);
    const rows=[{customer:'A',date:'1'},{customer:'B',date:'2'},{customer:'C',date:'1'}];
    assert.equal(rows.filter(r=>f.matches(f.encode(['A','B']),r.customer)&&f.matches('1',r.date)).length,1);
});
test('choosing multiple Bookings fills every related customer and date, retains manual choices and blocks dirty changes',()=>{
    const {ctx,inputs}=filterContext();let ready=true,applied=0;
    ctx.filters.mount({rows:()=>[
        {booking_no:'BK1',customer_name:'A',run_date:'2026-11-01'},
        {booking_no:'BK2',customer_name:'B',run_date:'2026-11-02'},
        {booking_no:'BK3',customer_name:'C',run_date:'2026-11-03'}
    ],ready:()=>ready,apply:()=>applied++});
    ctx.filters.commit('filter-booking-no',['BK1','BK2']);
    assert.deepEqual(Array.from(ctx.filters.values(inputs['filter-customer'].value)),['A','B']);
    assert.deepEqual(Array.from(ctx.filters.values(inputs['filter-run-date'].value)),['2026-11-01','2026-11-02']);
    assert.equal(inputs['filter-month'].value,'2026-11');
    ready=false;ctx.filters.commit('filter-booking-no',['BK3']);
    assert.equal(applied,1);assert.deepEqual(Array.from(ctx.filters.values(inputs['filter-booking-no'].value)),['BK1','BK2']);
});
test('expired session reports login expiry without opening a password dialog or retrying writes',async()=>{
    let requests=0;const ctx=vm.createContext({fetch:async()=>{requests++;return {status:401};}});
    vm.runInContext(fs.readFileSync('public/js/session-login.js','utf8'),ctx);
    await assert.rejects(ctx.tmsAuthenticatedRequest('/api/dispatch/handoffs/ORD-A'),/หมดอายุ/);
    assert.equal(requests,1);
});
test('handoff is one action using existing authentication without an extra password or confirmation',async()=>{
    const calls=[];
    const ctx=vm.createContext({workspaceReady:()=>true,tmsAuthenticatedRequest:async(...args)=>calls.push(args),
        document:{getElementById:()=>element('p')},alert:message=>{throw Error(message);}});
    vm.runInContext(read('workspace-handoffs.js'),ctx);
    await ctx.workspaceAcceptCrew({order_id:'ORD-X',leg2_driver:'B',leg2_plate:'TRUCK-B'},{leg_no:2});
    assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0][1].body).expected_driver,'B');
});
function exportContext(saveResult){
    const dialog=element('dialog'),rows=[{order_id:'A',booking_no:'BK',trans_fee:0},{order_id:'B',booking_no:'BK',trans_fee:200}];
    let downloaded=0,saves=0;
    const ctx=vm.createContext({window:{},document:{createElement:element,createTextNode:text=>text},Option:function(text,value){this.text=text;this.value=value;},
        workspaceDialog:()=>({dialog}),workspaceGroups:{revenue:{fields:[['trans_fee','ขนส่ง']]}},
        hotGridInstance:{getData:()=>[[],[]],toPhysicalRow:visual=>1-visual,getSourceDataAtRow:physical=>rows[physical]},
        workspaceSelected:new Set(['B']),workspaceDirty:new Map([['B',{}]]),rawShipmentList:rows,workspaceUser:{id:1},
        localStorage:{getItem:()=>null,setItem(){}},fetch:async()=>({ok:true,json:async()=>({success:true,data:[]})}),
        saveGridChanges:async()=>{saves++;return saveResult;},alert(){},
        XLSX:{utils:{aoa_to_sheet:data=>data,book_new:()=>({}),book_append_sheet(){}},writeFile(){downloaded++;}}});
    vm.runInContext(read('workspace-export.js'),ctx);
    return {ctx,dialog,counts:()=>({downloaded,saves})};
}
test('Excel defaults to selected visible Orders after sorting and defers saving until download',async()=>{
    const {ctx,dialog,counts}=exportContext(true);await ctx.window.exportToExcel();
    assert.equal(dialog.children[0].value,'selected');assert.equal(dialog.children.at(-1).tag,'details');
    assert.equal(counts().saves,0);
    const rows=ctx.workspaceExportRows(ctx.hotGridInstance,'selected',ctx.workspaceSelected);
    assert.equal(rows[0].order_id,'B');assert.equal(rows.length,1);
    await dialog.children[2].onclick();assert.equal(counts().saves,1);assert.equal(counts().downloaded,1);
});
test('Excel never downloads when saving pending edits fails',async()=>{
    const {ctx,dialog,counts}=exportContext(false);await ctx.window.exportToExcel();
    await dialog.children[2].onclick();assert.equal(counts().saves,1);assert.equal(counts().downloaded,0);
});
