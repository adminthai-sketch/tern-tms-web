const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const stations=fs.readFileSync('public/js/modules/booking/workspace-stations.js','utf8');

test('Thai dispatch dates are reformatted without parsing or shifting the stored time',()=>{
    const ctx=vm.createContext({});vm.runInContext(stations,ctx);
    assert.equal(ctx.workspaceFormatDateTime('2026-11-25T17:00:00'),'25-11-2026 / 17:00');
    assert.equal(ctx.workspaceFormatDateTime('2026-12-01 00:01:00'),'01-12-2026 / 00:01');
    assert.equal(ctx.workspaceFormatDateTime(null),'');
});

test('size lookup supplies DC options without mutating Master data',async()=>{
    const routes={},sql=[];
    const router={get:(path,fn)=>routes[path]=fn,post(){},put(){},delete(){}};
    const ctx=vm.createContext({require:name=>name==='express'?{Router:()=>router}:{query:async text=>{sql.push(text);return {rows:[{size_name:'40HC'},{size_name:'20DC'}]};}},module:{exports:{}}});
    vm.runInContext(fs.readFileSync('routes/bookings.js','utf8'),ctx);
    let result;
    await routes['/container-sizes']({}, {json:data=>result=data,status(){return this;}});
    assert.deepEqual(Array.from(result.data,row=>row.size_name),['20DC','40DC','40HC']);
    assert.ok(sql.every(text=>text.startsWith('SELECT')));
});

test('monitor shows the last assigned main leg as a paired truck and driver without combining legs',()=>{
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/js/modules/booking/monitor-crew.js','utf8'),ctx);
    const order={leg1_plate:'A',leg1_driver:'pickup',leg2_plate:'B',leg2_driver:'factory',leg3_plate:'C',leg3_driver:'return'};
    const crew=ctx.monitorAssignedCrew(order);
    assert.equal(crew.driver,'return');assert.equal(crew.plate,'C');
    delete order.leg3_plate;delete order.leg3_driver;
    assert.equal(ctx.monitorAssignedCrew(order).driver,'factory');
    order.leg3_plate='C';assert.equal(ctx.monitorAssignedCrew(order).driver,'');
    assert.equal(ctx.monitorCrewText('<img>'),'&lt;img&gt;');
});

function element(tag) {
    return {tag,children:[],value:'',append(...items){this.children.push(...items);},setAttribute(){},
        querySelector(selector){return this.children.find(input=>selector.includes('"'+input.name+'"'));},
        querySelectorAll(){return this.children.flatMap(row=>row.children.filter(input=>input.tag==='input'));},
        reportValidity(){return !this.required || !!String(this.value).trim();},showModal(){}};
}

test('inline revenue button opens the Order selected after sorting, without depending on checkboxes',()=>{
    const td=element('td');td.replaceChildren=()=>td.children=[];
    let opened;
    const ctx=vm.createContext({document:{createElement:element},Handsontable:{renderers:{TextRenderer(){}}},openWorkspaceRevenue:id=>opened=id});
    vm.runInContext(stations,ctx);
    ctx.workspaceRevenueRenderer({toPhysicalRow:()=>1,getSourceDataAtRow:index=>({order_id:['ORD-A','ORD-B'][index]})},td,0,0,'additional_total',500,{});
    td.children[1].onclick({stopPropagation(){}});
    assert.equal(opened,'ORD-B');
});

test('revenue dialog saves the explicitly targeted Order and rejects incomplete rows',async()=>{
    const dialog=element('dialog');const calls=[];
    const ctx=vm.createContext({window:{addEventListener(){}},document:{createElement:element},workspaceReady:()=>true,
        rawShipmentList:[{order_id:'ORD-A'},{order_id:'ORD-B'}],workspaceSelected:new Set(['ORD-A']),
        workspaceRequest:async(url,body)=>calls.push(body),loadContainerGridData:async()=>{},alert:()=>{}});
    vm.runInContext(fs.readFileSync('public/js/modules/booking/workspace-finance.js','utf8'),ctx);
    ctx.workspaceDialog=()=>({dialog,close(){}});
    ctx.window.openWorkspaceRevenue('ORD-B');
    const host=dialog.children[0],save=dialog.children.at(-1);
    await save.onclick();assert.equal(calls.length,0);
    host.children[0].children[0].value='ค่ารอ';host.children[0].children[1].value='500';
    await save.onclick();
    assert.equal(calls[0].data[0].order_id,'ORD-B');
    assert.equal(calls[0].data[0].additional_revenue[0].amount,500);
});

test('removing POP and Open Gate from forms does not submit clearing patches for existing data',()=>{
    const modal=fs.readFileSync('public/js/modules/booking/manage-modal.js','utf8');
    const save=modal.slice(modal.indexOf('window.saveDispatchModal'));
    assert.ok(!save.includes('leg3_appointment:'));
    assert.ok(modal.includes("field !== 'pop'"));
    assert.ok(!fs.readFileSync('public/booking-manage.html','utf8').includes('id="modal-leg3-time"'));
});
