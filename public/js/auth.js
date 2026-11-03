// public/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. ตรวจสอบการล็อกอิน (ถ้ายังไม่ล็อกอิน เตะกลับไปหน้า login)
    const savedUser = localStorage.getItem('tms_user');
    if (!savedUser) {
        window.location.href = '/login.html';
        return;
    }

    // 2. ดึงข้อมูลสิทธิ์และตำแหน่ง
    const user = JSON.parse(savedUser);
    const p = user.permissions || {};
    const roleUpper = (user.role || '').toUpperCase();
    const isAdmin = p.admin || roleUpper === 'ADMIN';

    // 3. แสดงชื่อและตำแหน่งบน Header ของทุกหน้าที่มีการเรียกใช้
    const nameEl = document.getElementById('user-fullname');
    if (nameEl) nameEl.innerText = user.fullName || user.username;
    
    const roleBadgeEl = document.getElementById('user-role-badge');
    if (roleBadgeEl) roleBadgeEl.innerText = roleUpper;

    // 4. จัดการเปิด/ปิดเมนู Sidebar (ถ้าหน้านั้นมีเมนูเหล่านี้อยู่)
    const menuConfig = [
        { id: 'menu-admin', allowed: isAdmin },
        { id: 'menu-monitor', allowed: p.monitor || isAdmin },
        { id: 'menu-booking', allowed: p.booking || isAdmin },
        { id: 'menu-dispatch', allowed: p.dispatch || isAdmin },
        { id: 'menu-billing', allowed: p.billing || isAdmin }
    ];

    menuConfig.forEach(menu => {
        const el = document.getElementById(menu.id);
        if (el) {
            if (menu.allowed) {
                el.classList.remove('hidden');
                // ให้แสดงผลตามโครงสร้างเดิม (เช่น flex)
                el.style.display = el.classList.contains('flex') ? 'flex' : 'block';
            } else {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        }
    });

    // 5. 🛡️ เช็คสิทธิ์การเข้าใช้งาน "หน้าปัจจุบัน" (ป้องกันการแอบพิมพ์ URL เข้ามา)
    const currentPath = window.location.pathname.toLowerCase();
    let isAllowed = true;
    let pageName = "";

    if (currentPath.includes('/admin')) {
        isAllowed = isAdmin;
        pageName = "จัดการข้อมูลหลังบ้าน";
    } else if (currentPath.includes('/booking')) {
        isAllowed = p.booking || isAdmin;
        pageName = "สร้างบุคกิ้ง";
    } else if (currentPath.includes('/dispatch')) {
        isAllowed = p.dispatch || isAdmin;
        pageName = "จัดรถ (Dispatch)";
    } else if (currentPath.includes('/billing')) {
        isAllowed = p.billing || isAdmin;
        pageName = "ระบบบัญชี (Billing)";
    } else if (currentPath.includes('/monitor')) {
        isAllowed = p.monitor || isAdmin;
        pageName = "มอนิเตอร์";
    }

    if (!isAllowed) {
        alert(`⛔ คุณไม่มีสิทธิ์เข้าถึงหน้า ${pageName}`);
        window.location.href = '/index.html'; // ดีดกลับไปหน้าแรก
        return;
    }
});

// 6. ฟังก์ชัน Global สำหรับกดปุ่ม Logout ออกจากระบบ
window.logout = function() {
    localStorage.removeItem('tms_user');
    window.location.href = '/login.html';
};