const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function handlers(query) {
    const routes = {};
    const router = Object.fromEntries(['get','post'].map(method=>[method,(url,handler)=>routes[method+' '+url]=handler]));
    const pool = { query, connect:async()=>({query,release(){routes.released=true;}}) };
    vm.runInNewContext(fs.readFileSync(path.join(root,'routes/dispatch-workspace.js'),'utf8'),{require:name=>name==='express'?{Router:()=>router}:pool,module:{exports:{}}});
    return routes;
}
async function request(handler,body) {
    const response={code:200,status(code){this.code=code;return this;},json(data){this.data=data;}};
    await handler({body},response);return response;
}
test('document issue rolls back every selected Order on a late failure',async()=>{
    const calls=[];
    const routes=handlers(async(sql)=>{
        calls.push(sql);
        if(sql.includes('SELECT id, username'))return {rows:[{username:'test'}]};
        if(sql.startsWith('SELECT order_id FROM financials'))return {rows:[]};
        if(sql.includes('FOR UPDATE OF s, f'))return {rows:[1,2].map(n=>({order_id:'ORD-'+n,booking_no:'BK',overall_status:'รอวางบิล'}))};
        if(sql.startsWith('UPDATE financials'))return {rows:[{}]};
        if(sql.startsWith('INSERT INTO dispatch_document_audit'))throw Error('simulated failure');
        return {rows:[]};
    });
    const response=await request(routes['post /dispatch/documents'],{user_id:1,booking_no:'BK',order_ids:['ORD-1','ORD-2'],iv_no:'IV',ar_no:'AR'});
    assert.equal(response.code,500);assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.equal(routes.released,true);
});
test('rejects mixed bookings and already billed Orders',async()=>{
    for(const extra of [{booking_no:'OTHER'},{iv_no:'OLD'}]){
        const routes=handlers(async sql=>{
            if(sql.includes('SELECT id, username'))return {rows:[{username:'test'}]};
            if(sql.startsWith('SELECT order_id FROM financials'))return {rows:[]};
            if(sql.includes('FOR UPDATE OF s, f'))return {rows:[{order_id:'ORD',booking_no:'BK',overall_status:'รอวางบิล',...extra}]};
            return {rows:[]};
        });
        assert.equal((await request(routes['post /dispatch/documents'],{user_id:1,booking_no:'BK',order_ids:['ORD'],iv_no:'IV',ar_no:'AR'})).code,409);
    }
});
test('finance zero and null are bound separately and omitted fields are untouched',async()=>{
    const writes=[];
    const routes=handlers(async(sql,values)=>{
        if(sql.includes('SELECT id, username'))return {rows:[{username:'test'}]};
        if(sql.startsWith('SELECT * FROM financials'))return {rows:[{order_id:'ORD',trans_fee:99}]};
        if(sql.startsWith('UPDATE financials')){writes.push({sql,values});return {rows:[{}]};}
        return {rows:[]};
    });
    assert.equal((await request(routes['post /dispatch/finance'],{user_id:1,data:[{order_id:'ORD',trip_fee:0,port_pass_fee:null}]})).code,200);
    assert.deepEqual(Array.from(writes[0].values),[0,null,'ORD']);assert.ok(!writes[0].sql.includes('trans_fee'));
});
test('workspace scripts parse and each extracted module stays below 800 lines',()=>{
    for(const name of fs.readdirSync(path.join(root,'public/js/modules/booking')).filter(name=>/^(workspace-|manage)/.test(name))){
        const source=fs.readFileSync(path.join(root,'public/js/modules/booking',name),'utf8');
        new vm.Script(source);assert.ok(source.split('\n').length<=800,name);
    }
});
test('Excel text beginning with formulas remains a string through export and readback',()=>{
    const XLSX=require('xlsx');const values=['=1+1','+SUM(A1)','@evil','-1+2','ภาษาไทย'];
    const sheet=XLSX.utils.aoa_to_sheet(values.map(value=>[value]));
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Data');
    const result=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
    values.forEach((value,index)=>{const cell=result.Sheets.Data['A'+(index+1)];assert.equal(cell.t,'s');assert.equal(cell.v,value);assert.equal(cell.f,undefined);});
});
