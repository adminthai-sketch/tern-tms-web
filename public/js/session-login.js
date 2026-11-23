let tmsLoginPromise;
function tmsReauthenticate() {
    if(tmsLoginPromise)return tmsLoginPromise;
    tmsLoginPromise=new Promise((resolve,reject)=>{
        const dialog=document.createElement('dialog');
        dialog.className='rounded-xl p-6 w-full max-w-md shadow-xl';
        const title=document.createElement('h2');title.textContent='ยืนยันบัญชีผู้ใช้งาน';title.className='text-lg font-bold mb-2';
        const note=document.createElement('p');note.textContent='เข้าสู่ระบบอีกครั้งเพื่อยืนยันสิทธิ์ ข้อมูลที่แก้ในหน้าจอยังคงอยู่';note.className='text-sm text-slate-600 mb-4';
        const form=document.createElement('form');
        const username=document.createElement('input');username.required=true;username.autocomplete='username';username.placeholder='ชื่อผู้ใช้งาน';
        const password=document.createElement('input');password.required=true;password.type='password';password.autocomplete='current-password';password.placeholder='รหัสผ่าน';
        for(const field of [username,password])field.className='w-full border rounded p-2 mb-3';
        const message=document.createElement('p');message.className='text-sm text-red-700';message.setAttribute('role','alert');
        const submit=document.createElement('button');submit.type='submit';submit.textContent='ยืนยัน';submit.className='bg-blue-800 text-white rounded px-4 py-2';
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';cancel.className='border rounded px-4 py-2 ml-2';cancel.onclick=()=>dialog.close();
        let completed=false;
        form.onsubmit=async event=>{
            event.preventDefault();submit.disabled=true;
            try {
                const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});
                const result=await response.json();
                if(!response.ok||!result.success)throw Error(result.message||'เข้าสู่ระบบไม่สำเร็จ');
                localStorage.setItem('tms_user',JSON.stringify(result.user));completed=true;password.value='';dialog.close();resolve();
            }catch(e){message.textContent=e.message;}finally{submit.disabled=false;}
        };
        dialog.addEventListener('close',()=>{password.value='';dialog.remove();if(!completed)reject(Error('ยกเลิกการยืนยันบัญชี'));},{once:true});
        form.append(username,password,message,submit,cancel);dialog.append(title,note,form);document.body.append(dialog);dialog.showModal();
    }).finally(()=>{tmsLoginPromise=null;});
    return tmsLoginPromise;
}
async function tmsAuthenticatedRequest(url,options={}) {
    let response=await fetch(url,options);
    if(response.status===401){await tmsReauthenticate();response=await fetch(url,options);}
    const result=await response.json();
    if(!response.ok||!result.success)throw Error(result.message||'บันทึกไม่สำเร็จ');
    return result;
}
