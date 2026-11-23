async function tmsAuthenticatedRequest(url,options={}) {
    let response=await fetch(url,options);
    if(response.status===401)throw Error('การเข้าสู่ระบบหมดอายุ กรุณาเปิดหน้าเข้าสู่ระบบในแท็บใหม่แล้วกลับมากดอีกครั้ง ข้อมูลที่แก้ไขยังอยู่ในหน้านี้');
    const result=await response.json();
    if(!response.ok||!result.success)throw Error(result.message||'บันทึกไม่สำเร็จ');
    return result;
}
