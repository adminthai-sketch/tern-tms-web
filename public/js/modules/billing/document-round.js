window.issueDispatchDocument=async function(){
    const rows=hotDetailInstance?.getSourceData().filter(row=>row._selected&&!row.iv_no&&!row.ar_no)||[];
    if(!rows.length||new Set(rows.map(row=>row.booking_no)).size!==1)return alert('เลือกเที่ยวที่ยังไม่มี IV/AR ใน Booking เดียว');
    const iv=prompt('เลข IV ของรอบนี้');if(!iv?.trim())return;
    const ar=prompt('เลข AR ของรอบนี้');if(!ar?.trim())return;
    const revenue=rows.reduce((sum,row)=>sum+(row.additional_revenue||[]).reduce((n,item)=>n+Math.round(Number(item.amount)*100),0),0)/100;
    if(!confirm('ออกใบปะหน้า '+rows.length+' เที่ยว · รายได้เพิ่ม '+revenue.toLocaleString('th-TH')+' บาท · IV '+iv+' / AR '+ar))return;
    try{
        const user=JSON.parse(localStorage.getItem('tms_user')||'{}');
        const response=await fetch('/api/dispatch/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:user.id,booking_no:rows[0].booking_no,order_ids:rows.map(row=>row.order_id),iv_no:iv,ar_no:ar})});
        const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message);
        location.href='/print-invoice.html?'+new URLSearchParams({iv:result.iv_no});
    }catch(error){alert(error.message);}
};
window.addEventListener('DOMContentLoaded',()=>{
    const button=document.createElement('button');button.textContent='ออก IV/AR และดูใบปะหน้าเที่ยวที่เลือก';button.className='m-2 rounded bg-violet-800 px-4 py-2 text-white';button.onclick=issueDispatchDocument;
    document.getElementById('billing-cost-section').prepend(button);
    const reprint=document.createElement('button');reprint.textContent='พิมพ์ซ้ำตาม IV';reprint.className='m-2 border rounded p-2';reprint.onclick=()=>{const iv=prompt('เลข IV ที่ต้องการพิมพ์ซ้ำ');if(iv?.trim())location.href='/print-invoice.html?'+new URLSearchParams({iv:iv.trim()});};button.after(reprint);
});
