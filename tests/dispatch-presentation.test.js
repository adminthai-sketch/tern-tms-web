const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync('public/js/modules/booking/' + file, 'utf8');

test('container 2 starts folded even with an old saved expanded view; toggling preserves data', () => {
    const ctx = vm.createContext({localStorage:{getItem:key=>key==='tms_user'?'{}':'{"container":true,"second":true}'}});
    const grid = read('workspace-grid.js');
    vm.runInContext(grid.slice(0, grid.indexOf('initContainerHandsontable =')), ctx);
    assert.ok(!ctx.workspaceBuildColumns().fields.some(([field])=>field==='container_2_no'));
    vm.runInContext('workspaceView.second=true', ctx);
    assert.ok(ctx.workspaceBuildColumns().fields.some(([field])=>field==='container_2_no'));
    assert.ok(!grid.includes('workspaceView.second = true;\n    }'));
});

test('fleet selection updates paired values without overriding explicit pasted pairs or recursing', () => {
    const ctx=vm.createContext({window:{},fleetAssignments:{TRUCK:'DRIVER'},driverAssignments:{DRIVER:'TRUCK'}});
    vm.runInContext(read('fleet-options.js'),ctx);
    assert.equal(ctx.workspaceFleetSuggestions([[2,'leg2_plate','OLD','TRUCK']],{},'edit')[0][2],'DRIVER');
    assert.equal(ctx.workspaceFleetSuggestions([[2,'leg2_driver','OLD','DRIVER']],{},'edit')[0][1],'leg2_plate');
    assert.equal(ctx.workspaceFleetSuggestions([[2,'leg2_plate','OLD','TRUCK'],[2,'leg2_driver','OLD','MANUAL']],{},'CopyPaste.paste').length,0);
    assert.equal(ctx.workspaceFleetSuggestions([[2,'leg2_plate','OLD','TRUCK']],{},'fleet-auto').length,0);
    assert.equal(ctx.workspaceFleetSuggestions([[2,'leg2_driver','OLD','UNKNOWN']],{},'edit').length,0);
});

test('Monitor keeps B while C is planned, then shows C only on its confirmed handoff', () => {
    const ctx=vm.createContext({});vm.runInContext(read('monitor-crew.js'),ctx);
    const order={leg1_driver:'A',leg2_driver:'B',leg3_driver:'C',_confirmedCrew:{driver:'B',plate:'B-TRUCK',leg_no:2}};
    assert.equal(ctx.monitorAssignedCrew(order).driver,'B');
    order.leg3_completed=true;
    assert.equal(ctx.monitorAssignedCrew(order).driver,'B');
    order._confirmedCrew={driver:'C',plate:'C-TRUCK',leg_no:3};
    assert.equal(ctx.monitorAssignedCrew(order).driver,'C');
});
