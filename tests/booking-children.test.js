const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(response={ok:true,success:true}) {
    const parent=Array(19).fill('');parent[3]='BK-A';parent[6]='2026-10-15';parent[5]='EXPORT';
    const other=Array(19).fill('');other[3]='BK-B';
    let data=[other,parent],url='',alerts=[];
    const grid={getSourceData:()=>data,loadData:rows=>{data=rows;}};
    const ctx=vm.createContext({window:{},document:{addEventListener(){},getElementById:()=>({value:'2026-11'})},
        hotGridInstance:grid,editedRowIndices:new Set(),expandedBookings:{},showLoadingToast(){},alert:text=>alerts.push(text),URLSearchParams,
        fetch:async address=>{url=address;return {ok:response.ok,json:async()=>({success:response.success,data:[
            {booking_no:'BK-A',order_id:'ORD-A',container_size:'20',container_1_no:'C1',container_2_no:'C2'},
            {booking_no:'BK-B',order_id:'ORD-B'}]})};}});
    vm.runInContext(fs.readFileSync('public/js/modules/booking/list-children.js','utf8'),ctx);
    return {ctx,grid,get data(){return data;},get url(){return url;},alerts};
}
test('expand and collapse preserve readonly child metadata and the other Booking; use parent month',async()=>{
    const env=setup();await env.ctx.window.toggleRowExpansion('BK-A',0);
    assert.match(env.url,/year=2026&month=10/);
    assert.equal(env.data.length,3);assert.equal(env.data[2]._orderId,'ORD-A');
    assert.equal(env.data[2]._isChild,true);assert.match(env.data[2][9],/C1 \/ C2/);
    assert.equal(env.data[2][6],'2026-10-15');
    await env.ctx.window.toggleRowExpansion('BK-A',0);
    assert.equal(env.data.length,2);assert.equal(env.data[0][3],'BK-B');
});
test('failed child fetch leaves header rows intact',async()=>{
    const env=setup({ok:false,success:false});await env.ctx.window.toggleRowExpansion('BK-A',0);
    assert.equal(env.data.length,2);assert.equal(env.alerts.length,1);
});
test('unsaved Booking edits prevent row indices from shifting',async()=>{
    const env=setup();env.ctx.editedRowIndices.add(1);
    await env.ctx.window.toggleRowExpansion('BK-A',0);
    assert.equal(env.url,'');assert.equal(env.data.length,2);
});
