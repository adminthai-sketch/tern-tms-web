const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {summarizeHandoffs,acceptCompletedLegs,acceptCompletedStops}=require('../lib/handoffs');
const read=file=>fs.readFileSync(file,'utf8');
function route(file,query){
    const routes={},router={};let released=false;
    for(const method of ['get','post','put','delete'])router[method]=(path,...handlers)=>routes[method+' '+path]=handlers.at(-1);
    const pool={query,connect:async()=>({query,release(){released=true;}})};
    const ctx=vm.createContext({require:name=>name==='express'?{Router:()=>router}:name.includes('/handoffs')?require('../lib/handoffs'):
        name.includes('/session')?{readSession:()=>({id:7}),requirePermission:()=>()=>{}}:pool,module:{exports:{}}});
    vm.runInContext(read(file),ctx);return {routes,released:()=>released};
}
const res=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;}});
test('retracting C restores B and retains history; retracting every target leaves no active crew',()=>{
    const events=[{id:1,order_id:'ORD',leg_no:1,plate:'A'},{id:2,order_id:'ORD',leg_no:2,driver:'B'},
        {id:3,order_id:'ORD',leg_no:3,driver:'C'},{id:4,order_id:'ORD',leg_no:3,plate:null,driver:null}];
    assert.equal(summarizeHandoffs(events)[0].driver,'B');assert.equal(events.length,4);
    events.push({id:5,order_id:'ORD',leg_no:2},{id:6,order_id:'ORD',leg_no:1});
    assert.equal(summarizeHandoffs(events)[0].no_active,true);
    const ctx=vm.createContext({});vm.runInContext(read('public/js/modules/booking/monitor-crew.js'),ctx);
    assert.equal(ctx.monitorAssignedCrew({_confirmedCrew:summarizeHandoffs(events)[0],leg3_driver:'Planned C'}).driver,'');
});
test('completing B accepts B inside the same transaction, never planned C; unchecking does not retract',async()=>{
    const calls=[],client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:[]};}};
    const before={order_id:'ORD',leg2_driver:'B',leg3_driver:'Planned C'};
    await acceptCompletedLegs(client,before,{...before,leg2_completed:true},{leg2_completed:true},7);
    const insert=calls.find(([sql])=>sql.startsWith('INSERT'));
    assert.deepEqual(insert[1],['ORD',2,null,'B',7]);
    calls.length=0;await acceptCompletedLegs(client,{...before,leg2_completed:true},before,{leg2_completed:false},7);
    assert.equal(calls.length,0);
});
test('completed deposit stops accept their delivering crew while future planned stops do not',async()=>{
    const writes=[],client={query:async(sql,args)=>{if(sql.startsWith('INSERT'))writes.push(args);return {rows:[]};}};
    await acceptCompletedStops(client,'ORD',[],[{stop_id:'yard-1',completed:true,plate:'Y',driver:'Yard driver'},{stop_id:'yard-2',completed:false,plate:'Planned'}],7);
    assert.deepEqual(writes,[['ORD','yard-1','Y','Yard driver',7]]);
});
test('handoff insert failure rolls back completion and container writes together and releases connection',async()=>{
    const calls=[];
    const env=route('routes/bookings.js',async(sql,args)=>{
        calls.push(sql);
        if(sql.includes('FOR UPDATE OF s'))return {rows:[{order_id:'ORD',mode:'EXPORT',leg2_driver:'B'}]};
        if(sql.startsWith('INSERT INTO shipment_handoffs'))throw Error('simulated history failure');
        return {rows:[]};
    });
    const response=res();await env.routes['post /shipments']({headers:{},body:{dispatch_patch:true,data:[{order_id:'ORD',leg2_completed:true}]}},response);
    assert.equal(response.body.success,false);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'));assert.equal(env.released(),true);
});
test('cancellation appends an empty-crew event, blocks completed work and rejects stale edits',async()=>{
    for(const [completed,expected,status] of [[false,3,200],[true,3,409],[false,2,409]]){
        const calls=[];
        const env=route('routes/dispatch-handoffs.js',async(sql,args)=>{
            calls.push([sql,args]);
            if(sql.startsWith('SELECT * FROM shipment_operations'))return {rows:[{order_id:'ORD',leg3_completed:completed}]};
            if(sql.includes('FROM shipment_legs'))return {rows:[{completed,plate:'C',driver:'C'}]};
            if(sql.includes('FROM shipment_handoffs'))return {rows:[{id:3,plate:'C',driver:'C'}]};
            return {rows:[{id:4}]};
        });
        const response=res();await env.routes['post /dispatch/handoffs/:orderId']({params:{orderId:'ORD'},sessionUser:{id:7},body:{leg_no:3,cancel:true,expected_handoff_id:expected}},response);
        assert.equal(response.code,status);assert.ok(!calls.some(([sql])=>/^DELETE|^UPDATE/.test(sql)));
        assert.equal(calls.some(([sql])=>sql.startsWith('INSERT')),status===200);assert.equal(env.released(),true);
    }
});
test('quick fleet creation uses a transaction and never overwrites an existing record',async()=>{
    for(const duplicate of [false,true]){
        const calls=[];
        const env=route('routes/fleet.js',async(sql,args)=>{
            calls.push([sql,args]);if(sql.startsWith('SELECT * FROM trucks'))return {rows:duplicate?[{id:1,status:'ACTIVE',plate_number:'AB'}]:[]};
            if(sql.startsWith('INSERT'))throw Error('simulated failure');return {rows:[]};
        });
        const response=res();await env.routes['post /dispatch/fleet/quick']({body:{kind:'truck',plate_number:'AB',vehicle_type:'10W',brand:'Brand',model:'Model'}},response);
        assert.equal(response.body.success,duplicate);assert.ok(!calls.some(([sql])=>sql.startsWith('UPDATE')));
        assert.ok(calls.some(([sql])=>sql===(duplicate?'COMMIT':'ROLLBACK')));assert.equal(env.released(),true);
    }
});
test('deadline units include days, hours and minutes; overdue remains an animated warning',()=>{
    const ctx=vm.createContext({localStorage:{getItem:()=>null}});
    vm.runInContext(read('public/js/modules/booking/workspace-stations.js'),ctx);
    assert.equal(ctx.workspaceDuration(1770),'1 วัน 5 ชม. 30 นาที');
    assert.equal(ctx.workspaceDuration(60),'1 ชม.');assert.equal(ctx.workspaceDuration(0),'0 นาที');
    const grid=read('public/js/modules/booking/workspace-grid.js');vm.runInContext(grid.slice(0,grid.indexOf('initContainerHandsontable =')),ctx);
    const deadline=ctx.workspaceDeadline('2026-11-20T10:00',Date.parse('2026-11-21T15:30+07:00'));
    assert.equal(deadline.level,'overdue');assert.equal(deadline.text,'เลยเวลา 1 วัน 5 ชม. 30 นาที');
    assert.match(read('public/css/dispatch-stations.css'),/deadline-overdue.*animation:workspace-overdue-pulse/);
});
test('container 2 expands only its Order and folding never mutates stored fields',()=>{
    const ctx=vm.createContext({workspaceView:{container:true}});vm.runInContext(read('public/js/modules/booking/workspace-containers.js'),ctx);
    const row={order_id:'A',container_2_no:'SECOND',seal_2_no:'SEAL'};
    ctx.workspaceToggleSecond(row.order_id);
    assert.equal(vm.runInContext("workspaceSecondExpanded.has('A')",ctx),true);
    assert.equal(vm.runInContext("workspaceSecondExpanded.has('B')",ctx),false);
    const data=[row,{order_id:'B'}],instance={toPhysicalRow:index=>1-index,getSourceDataAtRow:index=>data[index]};
    assert.equal(ctx.workspaceContainerRowHeight(instance,data,0),52);
    assert.equal(ctx.workspaceContainerRowHeight(instance,data,1),164);
    ctx.workspaceToggleSecond(row.order_id);
    assert.equal(vm.runInContext("workspaceSecondExpanded.has('A')",ctx),false);
    assert.equal(row.container_2_no,'SECOND');assert.equal(row.seal_2_no,'SEAL');
});

test('inline container 2 edits target the sorted Order and folding preserves its values',()=>{
    const element=()=>({children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){}});
    const a={order_id:'A'},b={order_id:'B',container_2_no:'SECOND'},td=element();
    const ctx=vm.createContext({document:{createElement:element},Handsontable:{renderers:{TextRenderer(){}}},workspaceHasSecondContainer:row=>!!row.container_2_no,
        workspaceCaptureScroll:()=>null,workspaceRestoreScroll(){},workspaceDirty:new Map(),editedRowIndices:new Set(),updateSaveStatusBadge(){}});
    vm.runInContext(read('public/js/modules/booking/workspace-containers.js'),ctx);
    const instance={toPhysicalRow:()=>1,getSourceDataAtRow:index=>[a,b][index],render(){}};
    const render=()=>ctx.workspaceSecondContainerRenderer(instance,td,0,0,'_container2',null,{});
    render();assert.equal(td.children[0].textContent,'▸ ดูตู้ 2');
    td.children[0].onclick({stopPropagation(){}});render();
    const input=td.children[1].children[0].children[0];input.value='CHANGED';input.oninput();
    td.children[0].onclick({stopPropagation(){}});render();
    assert.equal(b.container_2_no,'CHANGED');assert.equal(a.container_2_no,undefined);
    assert.equal(ctx.workspaceDirty.get('B').container_2_no,'CHANGED');assert.equal(td.children.length,1);
});
