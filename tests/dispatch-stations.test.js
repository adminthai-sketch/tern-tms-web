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
