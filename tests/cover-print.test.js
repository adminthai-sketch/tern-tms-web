const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('cover print opens selected Orders without requiring status or IV/AR and makes no writes',()=>{
    const context=vm.createContext({window:{addEventListener(){}},location:{},URLSearchParams,
        hotDetailInstance:{getSourceData:()=>[
            {_selected:true,order_id:'ORD-A',booking_no:'A',iv_no:'IV-OLD'},
            {_selected:true,order_id:'ORD-B',booking_no:'B',overall_status:'รอจัดรถ'},
            {_selected:false,order_id:'ORD-C'}]},
        alert:()=>assert.fail('should allow printing'),fetch:()=>assert.fail('must not write')});
    vm.runInContext(fs.readFileSync('public/js/modules/billing/document-round.js','utf8'),context);
    context.window.issueDispatchDocument();
    const url=new URL(context.location.href,'https://example.com');
    assert.deepEqual(JSON.parse(url.searchParams.get('orders')),['ORD-A','ORD-B']);
});
