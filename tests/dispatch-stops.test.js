const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('stop persistence rolls back on failure and releases the checked-out client',async()=>{
    const routes={},calls=[];let released=false;
    const router={get:(url,fn)=>routes['GET '+url]=fn,put:(url,fn)=>routes['PUT '+url]=fn};
    const query=async(sql)=>{calls.push(sql);if(sql.includes('SELECT order_id'))return {rows:[{order_id:'ORD'}]};if(sql.includes('SELECT *'))return {rows:[]};if(sql.includes('INSERT INTO shipment_stops'))throw Error('failure');return {rows:[]};};
    vm.runInNewContext(fs.readFileSync('routes/dispatch-stops.js','utf8'),{require:name=>name==='express'?{Router:()=>router}:name.includes('/handoffs')?require('../lib/handoffs'):name.includes('/session')?{readSession:()=>null}:{connect:async()=>({query,release(){released=true;}})},module:{exports:{}}});
    const res={status(code){this.code=code;return this;},json(value){this.value=value;}};
    await routes['PUT /dispatch/stops/:orderId']({params:{orderId:'ORD'},body:{base:[],stops:[{stop_id:'a',segment:'after_pickup',position:0,completed:false}]}},res);
    assert.equal(res.code,500);assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.equal(released,true);
});
test('Booking links preserve Booking and month and dispatch preserves the URL',()=>{
    const list=fs.readFileSync('public/js/modules/booking/list.js','utf8');
    assert.equal((list.match(/month=\$\{encodeURIComponent\(String\(rData\[6\]/g)||[]).length,2);
    assert.ok(!fs.readFileSync('public/js/modules/booking/manage.js','utf8').includes('replaceState({}, document.title, window.location.pathname)'));
});
