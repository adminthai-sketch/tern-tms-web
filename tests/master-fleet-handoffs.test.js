const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
function routeModule(file,query) {
    const routes={};const router={get:(path,...fn)=>routes['GET '+path]=fn.at(-1),post:(path,...fn)=>routes['POST '+path]=fn.at(-1),put:(path,...fn)=>routes['PUT '+path]=fn.at(-1)};
    let released=false;
    const pool={query,connect:async()=>({query,release(){released=true;}})};
    const context=vm.createContext({require:name=>name==='express'?{Router:()=>router}:name.includes('session')?{requirePermission:()=>()=>{}}:name.includes('master-setup')?{setupMasters:async()=>{}}:pool,module:{exports:{}}});
    vm.runInContext(fs.readFileSync(file,'utf8'),context);
    return {routes,get released(){return released;}};
}
const response=()=>({status(code){this.code=code;return this;},json(body){this.body=body;}});

test('master create rejects duplicate codes and rolls back without writing',async()=>{
    const calls=[];
    const env=routeModule('routes/container-sizes.js',async sql=>{calls.push(sql);return {rows:sql.includes('lower(trim(size_name))')?[{size_name:'40HC'}]:[]};});
    const res=response();await env.routes['POST /admin/container-sizes']({params:{},body:{size_name:'40hc'}},res);
    assert.equal(res.code,409);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(sql=>sql.startsWith('INSERT')));assert.equal(env.released,true);
});
test('master edits are optimistic and do not rename used historical sizes',async()=>{
    const calls=[];
    const env=routeModule('routes/container-sizes.js',async sql=>{calls.push(sql);if(sql.includes('FOR UPDATE'))return {rows:[{revision:'rev'}]};if(sql.includes('SELECT 1 FROM bookings'))return {rows:[{used:1}]};return {rows:[]};});
    const res=response();await env.routes['PUT /admin/container-sizes/:code']({params:{code:'40HC'},body:{size_name:'40HQ',revision:'rev'}},res);
    assert.equal(res.code,409);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(sql=>sql.startsWith('UPDATE')));
});
test('deactivating a size updates only the master and preserves Booking and Order rows',async()=>{
    const calls=[];
    const env=routeModule('routes/container-sizes.js',async(sql,args)=>{calls.push([sql,args]);if(sql.includes('FOR UPDATE'))return {rows:[{revision:'rev'}]};return {rows:[]};});
    const res=response();await env.routes['PUT /admin/container-sizes/:code']({params:{code:'40HC'},body:{size_name:'40HC',revision:'rev',is_active:false}},res);
    assert.equal(res.body.success,true);assert.ok(calls.some(([sql,args])=>sql.startsWith('UPDATE master')&&args[2]===false));
    assert.ok(!calls.some(([sql])=>/DELETE|UPDATE bookings|UPDATE shipment/.test(sql)));assert.equal(env.released,true);
});

test('handoff snapshots saved crew, ignores client-supplied identity and rolls back a failed insert',async()=>{
    const calls=[];let insertArgs;
    const env=routeModule('routes/dispatch-handoffs.js',async(sql,args)=>{
        calls.push(sql);
        if(sql.startsWith('SELECT * FROM shipment_operations'))return {rows:[{order_id:'ORD-1'}]};
        if(sql.includes('FROM shipment_legs'))return {rows:[{plate:'B',driver:'factory'}]};
        if(sql.startsWith('INSERT')){insertArgs=args;throw Error('simulated failure');}
        return {rows:[]};
    });
    const res=response();await env.routes['POST /dispatch/handoffs/:orderId']({params:{orderId:'ORD-1'},sessionUser:{id:7},body:{leg_no:2,expected_plate:'B',expected_driver:'factory',user_id:999}},res);
    assert.equal(insertArgs[5],7);assert.equal(insertArgs[3],'B');assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'));assert.equal(env.released,true);
});
test('handoff rejects stale crew and does not silently accept a changed assignment',async()=>{
    let inserted=false;
    const env=routeModule('routes/dispatch-handoffs.js',async sql=>{
        if(sql.startsWith('SELECT * FROM shipment_operations'))return {rows:[{}]};
        if(sql.includes('FROM shipment_legs'))return {rows:[{plate:'C',driver:'new'}]};
        if(sql.startsWith('INSERT'))inserted=true;return {rows:[]};
    });
    const res=response();await env.routes['POST /dispatch/handoffs/:orderId']({params:{orderId:'ORD'},sessionUser:{id:1},body:{leg_no:3,expected_plate:'B',expected_driver:'old'}},res);
    assert.equal(res.code,409);assert.equal(inserted,false);
});
test('monitor keeps the confirmed handoff when later-leg planning changes and includes confirmed stops',()=>{
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/js/modules/booking/monitor-crew.js','utf8'),ctx);
    const order={leg1_plate:'A',leg1_driver:'pickup',leg2_plate:'B',leg2_driver:'factory',leg3_plate:'C',leg3_driver:'planned',
        _confirmedCrew:{plate:'B',driver:'factory',leg_no:2}};
    assert.equal(ctx.monitorAssignedCrew(order).driver,'factory');
    order._confirmedCrew={plate:'Y',driver:'yard',stop_id:'stop-1'};
    assert.equal(ctx.monitorAssignedCrew(order).driver,'yard');
    delete order._confirmedCrew;order.confirmed_stops=[{segment:'after_pickup',position:0,completed:true,plate:'Y',driver:'yard'}];
    assert.equal(ctx.monitorAssignedCrew(order).driver,'yard');
});

test('signed session rejects tampering and non-admin users cannot write container masters',async()=>{
    let activeRole='User';const pool={query:async()=>({rows:[{id:1,status:'ACTIVE',password_hash:'hash',role_name:activeRole,permissions:{}}]})};
    const ctx=vm.createContext({require:name=>name==='crypto'?crypto:pool,process:{env:{TMS_SESSION_SECRET:'test-secret'}},Buffer,module:{exports:{}},Date});
    vm.runInContext(fs.readFileSync('lib/session.js','utf8'),ctx);
    const auth=ctx.module.exports;let cookie;
    auth.setSessionCookie({headers:{},secure:false},{setHeader:(name,value)=>cookie=value},{id:1},'hash');
    const req={headers:{cookie:cookie.split(';')[0]}};
    assert.equal(auth.readSession(req).id,1);
    assert.equal(auth.readSession({headers:{cookie:req.headers.cookie+'x'}}),null);
    const res=response();let allowed=false;
    await auth.requirePermission('admin')(req,res,()=>allowed=true);assert.equal(res.code,403);assert.equal(allowed,false);
    activeRole='Admin';await auth.requirePermission('admin')(req,response(),()=>allowed=true);assert.equal(allowed,true);
});

test('fleet endpoint uses active database records and errors are not disguised as empty success',async()=>{
    const calls=[];const env=routeModule('routes/fleet.js',async sql=>{calls.push(sql);throw Error('offline');});
    const res=response();await env.routes['GET /dispatch/fleet']({},res);
    assert.equal(res.code,503);assert.equal(res.body.success,false);assert.ok(calls.every(sql=>sql.includes("status='ACTIVE'")));
});
