// public/js/password.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. สร้าง HTML หน้าต่างเปลี่ยนรหัสผ่านแล้วยัดใส่ <body>
    const modalHTML = `
    <div id="change-pwd-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
        <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all">
            <div class="px-6 py-4 bg-slate-800 text-white flex justify-between items-center">
                <h3 class="font-bold text-lg"><i class="fa-solid fa-key mr-2 text-amber-400"></i> เปลี่ยนรหัสผ่าน</h3>
                <button onclick="closePasswordModal()" class="text-slate-300 hover:text-red-400"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">รหัสผ่านปัจจุบัน:</label>
                    <input type="password" id="old-pwd" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none" placeholder="••••••••">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">รหัสผ่านใหม่:</label>
                    <input type="password" id="new-pwd" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" placeholder="ความยาวอย่างน้อย 6 ตัวอักษร">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">ยืนยันรหัสผ่านใหม่:</label>
                    <input type="password" id="confirm-pwd" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง">
                </div>
                <div id="pwd-error" class="text-red-500 text-xs font-bold hidden"></div>
            </div>
            <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                <button onclick="closePasswordModal()" class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">ยกเลิก</button>
                <button id="btn-save-pwd" onclick="submitPasswordChange()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow transition-colors">บันทึกรหัสผ่าน</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 2. ไปแทรกปุ่ม "กุญแจ" ไว้ข้างๆ ปุ่ม Logout บน Header ของทุกหน้า
    const logoutBtn = document.querySelector('button[onclick="logout()"]');
    if (logoutBtn) {
        const keyBtnHTML = `<button onclick="openPasswordModal()" class="text-slate-400 hover:text-amber-500 p-2 transition-colors" title="เปลี่ยนรหัสผ่าน"><i class="fa-solid fa-key"></i></button>`;
        logoutBtn.insertAdjacentHTML('beforebegin', keyBtnHTML);
    }
});

function openPasswordModal() {
    document.getElementById('old-pwd').value = '';
    document.getElementById('new-pwd').value = '';
    document.getElementById('confirm-pwd').value = '';
    document.getElementById('pwd-error').classList.add('hidden');
    document.getElementById('change-pwd-modal').classList.remove('hidden');
}

function closePasswordModal() {
    document.getElementById('change-pwd-modal').classList.add('hidden');
}

async function submitPasswordChange() {
    const oldP = document.getElementById('old-pwd').value;
    const newP = document.getElementById('new-pwd').value;
    const confP = document.getElementById('confirm-pwd').value;
    const errDiv = document.getElementById('pwd-error');
    
    if (!oldP || !newP || !confP) {
        errDiv.innerText = "⚠️ กรุณากรอกข้อมูลให้ครบทุกช่อง"; errDiv.classList.remove('hidden'); return;
    }
    if (newP.length < 6) {
        errDiv.innerText = "⚠️ รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร"; errDiv.classList.remove('hidden'); return;
    }
    if (newP !== confP) {
        errDiv.innerText = "⚠️ รหัสผ่านใหม่และการยืนยันไม่ตรงกัน!"; errDiv.classList.remove('hidden'); return;
    }

    const user = JSON.parse(localStorage.getItem('tms_user') || '{}');
    if (!user.username) {
        alert("เซสชั่นหมดอายุ กรุณาล็อกอินใหม่"); window.location.href = '/login.html'; return;
    }

    const btn = document.getElementById('btn-save-pwd');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> รอสักครู่...'; btn.disabled = true;

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, oldPassword: oldP, newPassword: newP })
        });
        const result = await res.json();
        
        if (res.ok && result.success) {
            alert('✅ ' + result.message);
            localStorage.removeItem('tms_user');
            window.location.href = '/login.html';
        } else {
            errDiv.innerText = '❌ ' + result.message; errDiv.classList.remove('hidden');
        }
    } catch (error) {
        errDiv.innerText = '❌ ติดต่อเซิร์ฟเวอร์ไม่ได้'; errDiv.classList.remove('hidden');
    } finally {
        btn.innerHTML = 'บันทึกรหัสผ่าน'; btn.disabled = false;
    }
}
