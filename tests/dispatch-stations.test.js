const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/modules/booking/workspace-stations.js','utf8');

test('copy crew uses latest stop in the correct segment, otherwise the previous main leg', async () => {
    const context = vm.createContext({fetch:async()=>({ok:true,json:async()=>({success:true,data:[
        {segment:'after_pickup',position:0,plate:'A',driver:'one'},
        {segment:'after_pickup',position:1,plate:'B',driver:'two',location:'Yard B'}
    ]})})});
    vm.runInContext(source,context);
    const row = {order_id:'ORD-X',leg1_plate:'original',leg2_plate:'delivery',leg2_driver:'driver'};
    const delivery = await context.workspacePreviousCrew(row,2);
    assert.equal(delivery.plate,'B'); assert.equal(delivery.driver,'two');
    const returns = await context.workspacePreviousCrew(row,3);
    assert.equal(returns.plate,'delivery'); assert.equal(returns.driver,'driver');
});

test('failed stop lookup does not silently copy a different crew', async () => {
    const context=vm.createContext({fetch:async()=>({ok:false,json:async()=>({success:false,message:'unavailable'})})});
    vm.runInContext(source,context);
    await assert.rejects(context.workspacePreviousCrew({order_id:'ORD-X'},2),/unavailable/);
});

test('Delivery appointment stays visible in the default view; Return uses Open Gate separately from Cutoff', () => {
    const grid=fs.readFileSync('public/js/modules/booking/workspace-grid.js','utf8');
    assert.match(grid,/delivery:true, returns:true/);
    assert.match(grid,/\['leg2_appointment','เวลาเข้าโรงงาน'\]/);
    assert.match(grid,/\['leg3_appointment','เวลาเปิดประตู'\]/);
    assert.match(grid,/\['leg3_appointment','open_gate'\]/);
});

test('folding preserves the visible column anchor and vertical position after columns shrink',()=>{
    const holder={scrollLeft:210,scrollTop:180};
    const context=vm.createContext({document:{querySelector:()=>holder},requestAnimationFrame:callback=>callback(),
        workspaceColumns:[['a'],['b'],['c'],['d']],hotGridInstance:{getColWidth:()=>100}});
    vm.runInContext(source,context);
    const saved=context.workspaceCaptureScroll();
    context.workspaceColumns=[['a'],['d']]; holder.scrollLeft=0;holder.scrollTop=0;
    context.workspaceRestoreScroll(saved);
    assert.equal(holder.scrollLeft,10);assert.equal(holder.scrollTop,180);
});

test('add second container targets the clicked visual row and focuses its container fields',()=>{
    const calls=[];
    const context=vm.createContext({workspaceReady:()=>true,openDispatchModal:row=>calls.push(row),
        addDispatchSecondContainer:()=>calls.push('second'),document:{
            getElementById:()=>({scrollIntoView:()=>calls.push('scroll')}),
            querySelector:selector=>({focus:()=>calls.push(selector)})}});
    vm.runInContext(source,context);
    context.workspaceOpenContainers(4,true);
    assert.equal(calls[0],4);assert.equal(calls[1],'second');
    assert.match(calls[3],/data-position="2"/);
});

test('container management is in the scrollable content, not the modal footer',()=>{
    const html=fs.readFileSync('public/booking-manage.html','utf8');
    assert.ok(html.indexOf('id="dispatch-container-section"')<html.indexOf('<!-- Footer -->'));
    assert.equal((html.match(/id="dispatch-add-container"/g)||[]).length,1);
    assert.match(html,/เพิ่มตู้ 2 ในเที่ยวนี้/);
});

test('second container detection includes seal and weight without requiring its number',()=>{
    const context=vm.createContext({});vm.runInContext(source,context);
    assert.equal(context.workspaceHasSecondContainer({container_1_no:'A'}),false);
    assert.equal(context.workspaceHasSecondContainer({pop_2_no:'POP-2'}),true);
    assert.equal(context.workspaceHasSecondContainer({tare_2:0}),true);
    assert.equal(context.workspaceHasSecondContainer({container_2_no:'B'}),true);
});
