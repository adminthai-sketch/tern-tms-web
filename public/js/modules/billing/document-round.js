window.issueDispatchDocument=function(){
    const rows=hotDetailInstance?.getSourceData().filter(row=>row.order_id && [true,'true',1,'1'].includes(row._selected))||[];
    if(!rows.length)return alert('กรุณาติ๊กเลือกเที่ยวที่ต้องการพิมพ์ใบปะหน้า');
    location.href='/print-invoice.html?'+new URLSearchParams({orders:JSON.stringify(rows.map(row=>row.order_id))});
};
window.addEventListener('DOMContentLoaded',()=>{
    const button=document.createElement('button');button.textContent='พิมพ์ใบปะหน้าเที่ยวที่เลือก';button.className='m-2 rounded bg-violet-800 px-4 py-2 text-white';button.onclick=issueDispatchDocument;
    document.getElementById('billing-cost-section').prepend(button);
    const reprint=document.createElement('button');reprint.textContent='พิมพ์ซ้ำตาม IV';reprint.className='m-2 border rounded p-2';reprint.onclick=()=>{const iv=prompt('เลข IV ที่ต้องการพิมพ์ซ้ำ');if(iv?.trim())location.href='/print-invoice.html?'+new URLSearchParams({iv:iv.trim()});};button.after(reprint);
});
