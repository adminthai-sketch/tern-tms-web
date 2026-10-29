<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>รายการ Booking - ระบบวางบิล TERN TMS</title>
    <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>tailwind.config = { theme: { extend: { fontFamily: { sans: ['Prompt', 'sans-serif'] } } } }</script>
    <link href="https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.js"></script>
    <style>
        body { font-family: 'Prompt', sans-serif; background-color: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .htCenter { text-align: center; vertical-align: middle; }
        .htMiddle { vertical-align: middle; }
        .tab-btn-active { background-color: #8b5cf6; color: white; font-weight: bold; border-color: #7c3aed; }
        .tab-btn-inactive { background-color: #f1f5f9; color: #64748b; font-weight: 600; }
        .tab-btn-inactive:hover { background-color: #e2e8f0; color: #334155; }
    </style>
</head>
<body class="flex flex-col h-screen">

    <!-- Header Navigation -->
    <header class="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-6 shrink-0 shadow-sm z-50">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center text-sm shadow-sm"><i class="fa-solid fa-file-invoice-dollar"></i></div>
            <span class="font-bold text-lg text-slate-800">ระบบวางบิล & บัญชี</span>
            <div class="h-5 w-px bg-slate-300 mx-2"></div>
            
            <!-- Tabs (แยกไฟล์) -->
            <div class="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs gap-1">
                <a href="/billing.html" class="tab-btn-active px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5"><i class="fa-solid fa-list-check"></i> 1. หน้ารายการ Booking</a>
                <a href="/billing-detail.html" class="tab-btn-inactive px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5"><i class="fa-solid fa-file-lines"></i> 2. รายละเอียดตู้/เปิดบิล</a>
                <a href="/billing-iv.html" class="tab-btn-inactive px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5"><i class="fa-solid fa-receipt"></i> 3. รายการ IV (ใบแจ้งหนี้)</a>
            </div>

            <div class="h-5 w-px bg-slate-300 mx-2"></div>
            <a href="/index.html" class="text-slate-500 hover:text-slate-800 transition-colors text-xs font-semibold flex items-center gap-1"><i class="fa-solid fa-house"></i> หน้าแรก</a>
        </div>
        <div class="flex items-center gap-4">
            <div class="text-right">
                <div id="user-fullname" class="text-xs font-bold text-slate-700">Loading...</div>
                <div id="user-role-badge" class="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-500">ROLE</div>
            </div>
            <button onclick="logout()" class="text-slate-400 hover:text-red-500 transition-colors p-2"><i class="fa-solid fa-power-off"></i></button>
        </div>
    </header>

    <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Toolbar -->
        <div class="bg-white border-b border-slate-200 px-6 py-2 shrink-0 shadow-sm z-40 flex flex-wrap items-center gap-2 text-xs">
            <div class="flex items-center bg-slate-100 border border-slate-300 rounded-lg overflow-hidden">
                <div class="px-3 py-1.5 bg-slate-200 border-r border-slate-300 text-slate-600 font-bold flex items-center gap-1.5"><i class="fa-regular fa-calendar-check text-purple-600"></i> เดือน:</div>
                <input type="month" id="filter-month" onchange="loadBillingMasterData()" class="px-3 py-1.5 outline-none font-bold text-slate-700 bg-transparent cursor-pointer">
            </div>
            <div class="h-6 w-px bg-slate-300 mx-1"></div>
            <input type="text" id="filter-run-date" list="dl-run-date" placeholder="📅 วันที่วิ่งงาน..." class="border border-slate-300 rounded-lg px-2.5 py-1.5 w-32 outline-none" onchange="handleMasterFilter()">
            <datalist id="dl-run-date"></datalist>
            <input type="text" id="filter-customer" list="dl-customer" placeholder="🏢 ชื่อลูกค้า..." class="border border-slate-300 rounded-lg px-2.5 py-1.5 w-36 outline-none" onchange="handleMasterFilter()">
            <datalist id="dl-customer"></datalist>
            <input type="text" id="filter-booking-no" list="dl-booking-no" placeholder="📄 เลข Booking..." class="border border-slate-300 rounded-lg px-2.5 py-1.5 w-36 outline-none" onchange="handleMasterFilter()">
            <datalist id="dl-booking-no"></datalist>
            <input type="text" id="global-search" placeholder="🔍 ค้นหา IV, AR, ชื่อ..." class="border border-slate-300 rounded-lg px-3 py-1.5 w-48 outline-none" onkeyup="handleMasterFilter()">
            <button onclick="clearMasterFilters()" class="text-slate-400 hover:text-slate-600 p-1.5" title="ล้างตัวกรอง"><i class="fa-solid fa-eraser"></i></button>
            <div class="flex-1"></div>
            <button onclick="saveMasterBillingChanges()" class="bg-purple-600 text-white font-bold px-4 py-1.5 rounded-lg shadow hover:bg-purple-700 transition-colors flex items-center gap-1.5">
                <i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล IV/AR ด่วน
            </button>
        </div>

        <!-- KPI -->
        <div class="px-6 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-4 shrink-0 text-xs">
            <span class="font-bold text-slate-500"><i class="fa-solid fa-chart-pie"></i> สรุปภาพรวมประจำเดือน:</span>
            <div class="bg-white border border-rose-200 px-3 py-1 rounded-full flex gap-2 items-center text-rose-700 cursor-pointer shadow-sm hover:bg-rose-50" onclick="setQuickMasterFilter('pending')">
                <i class="fa-solid fa-clock"></i> รอวางบิล: <span id="stat-pending-bk" class="font-bold">0 Booking</span> | <span id="stat-pending-ct" class="font-bold">0 ตู้</span> | <span id="stat-pending-amt" class="font-bold">0.00 ฿</span>
            </div>
            <div class="bg-white border border-emerald-200 px-3 py-1 rounded-full flex gap-2 items-center text-emerald-700 cursor-pointer shadow-sm hover:bg-emerald-50" onclick="setQuickMasterFilter('billed')">
                <i class="fa-solid fa-file-invoice"></i> วางบิลแล้ว: <span id="stat-billed-bk" class="font-bold">0 Booking</span> | <span id="stat-billed-ct" class="font-bold">0 ตู้</span> | <span id="stat-billed-amt" class="font-bold">0.00 ฿</span>
            </div>
        </div>

        <!-- Grid -->
        <div class="flex-1 overflow-hidden relative p-4">
            <div id="master-loading-overlay" class="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm hidden">
                <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-2"></div>
                <div class="font-bold text-purple-700 text-xs">กำลังโหลดรายการบุคกิ้ง...</div>
            </div>
            <div id="master-grid-container" class="w-full h-full bg-white rounded-xl shadow-sm border border-slate-200"></div>
        </div>
    </div>

    <!-- ลิงก์ไปหาไฟล์ JS ที่แยกใหม่ -->
    <script src="/js/modules/billing/master.js"></script>
    <script>function logout() { localStorage.removeItem('tms_user'); window.location.href = '/login.html'; }</script>
</body>
</html>