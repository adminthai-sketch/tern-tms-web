function initContainerHandsontable(data) {
    const container = document.getElementById('container-grid-container');
    if (!container) return;
    if (hotGridInstance) { hotGridInstance.destroy(); }

    const routeRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const isDrop = (value === true || value === 'true');
        const btnClass = isDrop ? 'bg-purple-200 text-purple-800 border-purple-400' : 'bg-white text-slate-500 border-slate-300 hover:bg-purple-50 hover:text-purple-600';
        const icon = isDrop ? '<i class="fa-solid fa-anchor"></i> แวะลานพัก' : '<i class="fa-solid fa-route"></i> ตรงไปที่หมาย';
        td.innerHTML = `<div class="p-1 w-full h-full"><button onclick="toggleDropRow(${row}, '${prop}')" class="w-full h-full text-[10px] font-bold border rounded shadow-sm flex items-center justify-center gap-1 transition-colors ${btnClass}">${icon}</button></div>`;
    };

    const statusRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        const isCompleted = (value === true || value === 'true');
        const btnClass = isCompleted 
            ? 'bg-emerald-500 text-white shadow-inner border-emerald-600' 
            : 'bg-slate-100 text-slate-300 border-slate-200 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-200';
        const icon = '<i class="fa-solid fa-check"></i>';
        td.innerHTML = `<div class="p-0.5 w-full h-full"><button onclick="toggleStatusRow(${row}, '${prop}')" class="w-full h-full text-[11px] font-bold border rounded flex items-center justify-center transition-all ${btnClass}">${icon}</button></div>`;
    };

    const orderIdRenderer = function(instance, td, row, col, prop, value) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.innerHTML = `
            <div class="flex flex-col items-center justify-center w-full h-full p-0.5 gap-0.5">
                <span class="truncate pr-1 text-[10px] font-bold">${value || ''}</span>
                <button onclick="openDispatchModal(${row})" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded shadow-sm text-[9px] flex items-center gap-1">
                    <i class="fa-solid fa-truck-fast"></i> จัดรถ
                </button>
            </div>
        `;
    };

    const feeRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.NumericRenderer.apply(this, arguments);
        const mode = instance.getDataAtRowProp(row, 'mode');
        td.style.fontWeight = '700'; td.style.verticalAlign = 'middle';
        
        if (mode === 'IMPORT') {
            if (prop === 'port_pass_fee') { td.style.backgroundColor = '#e0f2fe'; td.style.color = '#0369a1'; td.title = 'เก็บตอนเริ่มรับตู้ที่ท่าเรือ (IMPORT)'; }
            else if (prop === 'deposit_fee' || prop === 'lift_fee') { td.style.backgroundColor = '#e0f2fe'; td.style.color = '#0369a1'; td.title = 'เก็บตอนจบคืนตู้ที่ลานตู้ (IMPORT)'; }
            else { td.style.backgroundColor = '#f1f5f9'; td.style.color = '#cbd5e1'; }
        } else if (mode === 'EXPORT') {
            if (prop === 'shore_fee' || prop === 'port_pass_fee') { td.style.backgroundColor = '#fef3c7'; td.style.color = '#b45309'; td.title = 'เก็บตอนจบคืนตู้โหลดลงเรือ (EXPORT)'; }
            else if (prop === 'lift_fee') { td.style.backgroundColor = '#fef3c7'; td.style.color = '#b45309'; td.title = 'เก็บตอนเริ่มรับตู้เปล่าที่ลาน (EXPORT)'; }
            else { td.style.backgroundColor = '#f1f5f9'; td.style.color = '#cbd5e1'; }
        } else {
            td.style.backgroundColor = '#f8fafc';
        }
    };

    const vgmWarningRenderer = function(instance, td, row, col, prop, value, cellProperties) {
        Handsontable.renderers.HtmlRenderer.apply(this, arguments);
        td.style.fontWeight = '700';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        td.style.textTransform = 'uppercase';
        
        const srcData = instance.getSourceDataAtRow(row);
        const mode = srcData.mode;
        const vgmCutoff = srcData.vgm_cutoff;
        
        if (mode === 'EXPORT' && !value && vgmCutoff) {
            const now = new Date();
            const vgmDate = new Date(vgmCutoff);
            const diffHours = (vgmDate - now) / (1000 * 60 * 60);
            
            if (diffHours < 24) {
                td.style.backgroundColor = '#fef2f2';
                td.innerHTML = `<div class="vgm-text-blink text-[9px] text-red-500 leading-[1.1]"><i class="fa-solid fa-clock"></i> CUTOFF<br>${formatShortDate(vgmCutoff)}</div>`;
                td.title = `🚨 ใกล้ถึงหรือเลยเวลา VGM Cutoff (${formatShortDate(vgmCutoff)}) รีบใส่เบอร์ตู้ด่วน!`;
            } else {
                td.style.backgroundColor = '';
                td.innerHTML = '';
            }
        } else {
            td.style.backgroundColor = '';
            td.innerHTML = value ? value : '';
            td.style.color = '#1d4ed8'; 
        }
    };

    hotGridInstance = new Handsontable(container, {
        data: data.length > 0 ? data : [{}],
        wordWrap: false,
        autoRowSize: false,
        rowHeights: 36,
        
        fixedColumnsLeft: userGridSettings.fixedColumns !== undefined ? (Number(userGridSettings.fixedColumns) === 11 ? 12 : Number(userGridSettings.fixedColumns)) : 3,
        manualColumnFreeze: false, 

        nestedHeaders: [
            [
                { label: '📋 ข้อมูลงาน', colspan: 8 }, 
                { label: '📦 ข้อมูลตู้', colspan: 11 },
                { label: '🚚 ขา 1: PICK UP (รับตู้)', colspan: 6 },
                { label: '🅿️ ขาฝาก 1 (DROP 1)', colspan: 5 },
                { label: '🏭 ขา 2: DELIVERY (เข้าบรรจุ) <button onclick="copyLegToAllRows(\'leg1\', \'leg2\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 1 มาใส่ ขา 2 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 1</button>', colspan: 6 },
                { label: '🅿️ ขาฝาก 2 (DROP 2)', colspan: 5 },
                { label: '🚢 ขา 3: RETURN (คืนตู้) <button onclick="copyLegToAllRows(\'leg2\', \'leg3\')" class="ml-1 bg-blue-100 text-blue-700 border border-blue-300 px-1 py-0.5 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors text-[10px]" title="ดึงทะเบียนรถและคนขับจาก ขา 2 มาใส่ ขา 3 ทั้งหมด"><i class="fa-solid fa-angles-right"></i> ดึงรถขา 2</button>', colspan: 5 },
                { label: '💵 ค่าจ้างขนส่ง', colspan: 2 },
                { label: '💸 เบิกจ่ายหน้าท่า/ลาน และอื่นๆ', colspan: 6 }, 
                { label: '📝 หมายเหตุ', colspan: 1 } 
            ],
            [
                '✔', '⚙️ จัดรถ', 'Booking', 'MODE', 'ลูกค้า', 'ชื่องาน', 'ต้นทาง', 'ปลายทาง', 
                'ขนาดตู้', '📅 วันที่วิ่งงาน', 'เบอร์ตู้ 1', 'เบอร์ตู้ 2', 'ซีลตู้ 1', 'TARE ตู้ 1', 'MAX GROSS ตู้ 1',
                'ซีลตู้ 2', 'TARE ตู้ 2', 'MAX GROSS ตู้ 2', 'POP',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด (🚚 Auto-Fill)', 'เส้นทาง', '✅', 
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด', 'เส้นทาง', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', 'สถานที่ (ลานฝาก)', '✅',
                'ทะเบียนรถ', 'ประเภทรถ', 'คนขับ', '📅 เวลานัด', '✅',
                'ค่าเที่ยว', 'ค่าขนส่ง',
                'ค่าผ่านท่า', 'ค่าชอร์', 'ค่ายกตู้', 'ค่าฝากลาน', 'เบิกค่าใช้จ่าย', 'ค่าใช้จ่ายอื่นๆ',
                'หมายเหตุ'
            ]
        ],
        columns: [
            { data: '_checkbox', type: 'checkbox', className: 'htCenter htMiddle zone-info' }, 
            { data: 'order_id', type: 'text', readOnly: true, className: 'text-slate-400 font-bold htCenter htMiddle zone-info', renderer: orderIdRenderer }, 
            { data: 'booking_no', type: 'text', readOnly: true, className: 'font-bold text-primary htCenter htMiddle zone-info' }, 
            { data: 'mode', type: 'text', readOnly: true, className: 'htCenter htMiddle font-bold text-slate-500 zone-info' }, 
            { data: 'customer_name', type: 'text', readOnly: true, className: 'text-slate-700 font-bold htMiddle zone-info' }, 
            { data: 'job_name', type: 'text', readOnly: true, className: 'htMiddle zone-info' },
            { data: 'origin', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            { data: 'destination', type: 'text', readOnly: true, className: 'text-slate-700 htMiddle zone-info' }, 
            
            { data: 'container_size', type: 'dropdown', source: globalContainerSizes, className: 'htCenter htMiddle font-bold text-blue-700 zone-container' }, 
            { data: '_disp_run_date', type: 'text', readOnly: true, className: 'font-bold text-blue-800 htCenter htMiddle zone-container bg-blue-50/50' }, 
            { data: 'container_1_no', type: 'text', renderer: vgmWarningRenderer },
            { data: 'container_2_no', type: 'text', renderer: vgmWarningRenderer },
            { data: 'seal_1_no', type: 'text', className: 'htCenter htMiddle font-bold uppercase zone-container' },
            { data: 'tare_1', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'max_gross_1', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'seal_2_no', type: 'text', className: 'htCenter htMiddle font-bold uppercase zone-container' },
            { data: 'tare_2', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'max_gross_2', type: 'numeric', className: 'htCenter htMiddle zone-container' },
            { data: 'pop_no', type: 'text', className: 'htCenter htMiddle font-bold text-blue-700 uppercase zone-container' },

            { data: 'leg1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg1 font-bold htCenter htMiddle text-emerald-700' },
            vehicleTypeColumn('leg1', 'zone-leg1'),
            { data: 'leg1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg1 htMiddle font-bold text-emerald-700' },
            { data: '_disp_cy_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell bg-slate-50' }, 
            { data: 'leg1_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer }, 
            { data: 'leg1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg1', renderer: statusRenderer }, 

            { data: 'drop1_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            vehicleTypeColumn('drop1', 'zone-legdrop'),
            { data: 'drop1_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop1_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop1_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg2 font-bold htCenter htMiddle text-amber-700' },
            vehicleTypeColumn('leg2', 'zone-leg2'),
            { data: 'leg2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg2 htMiddle font-bold text-amber-700' },
            { data: '_disp_load_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 'leg2_is_drop', readOnly: true, className: 'htCenter htMiddle bg-purple-50/20', renderer: routeRenderer },
            { data: 'leg2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg2', renderer: statusRenderer },

            { data: 'drop2_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-legdrop font-bold htCenter htMiddle text-purple-700' },
            vehicleTypeColumn('drop2', 'zone-legdrop'),
            { data: 'drop2_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-legdrop htMiddle font-bold text-purple-700' },
            { data: 'drop2_location', type: 'text', className: 'zone-legdrop htMiddle' },
            { data: 'drop2_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-legdrop', renderer: statusRenderer },

            { data: 'leg3_plate', type: 'autocomplete', source: globalTruckList, strict: false, className: 'zone-leg3 font-bold htCenter htMiddle text-slate-700' },
            vehicleTypeColumn('leg3', 'zone-leg3'),
            { data: 'leg3_driver', type: 'autocomplete', source: globalDriverList, strict: false, className: 'zone-leg3 htMiddle font-bold text-slate-700' },
            { data: '_disp_return_date', type: 'text', readOnly: true, className: 'htCenter htMiddle time-cell' }, 
            { data: 'leg3_completed', type: 'text', readOnly: true, className: 'htCenter htMiddle zone-leg3', renderer: statusRenderer },

            { data: 'trip_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-emerald-700 font-bold bg-green-50 htRight htMiddle' }, 
            { data: 'trans_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-blue-700 font-bold bg-blue-50 htRight htMiddle' },

            { data: 'port_pass_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'shore_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'lift_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer }, 
            { data: 'deposit_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, renderer: feeRenderer },
            { data: 'advance_fee', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-rose-600 font-bold bg-rose-50 htRight htMiddle' },
            { data: 'other_expense', type: 'numeric', numericFormat: { pattern: '0,0' }, className: 'text-rose-600 font-bold bg-rose-50 htRight htMiddle' },
            
            { data: 'remark', type: 'text', className: 'htLeft htMiddle' }
        ],
        colWidths: [
            30, 90, 100, 75, 100, 160, 80, 80, 
            60, 80, 100, 100, 100, 90, 110, 100, 90, 110, 90, 
            90, 80, 110, 120, 110, 45, 
            90, 80, 110, 110, 45,
            90, 80, 110, 110, 110, 45,
            90, 80, 110, 110, 45,
            90, 80, 110, 110, 45,
            70, 70, 
            75, 75, 75, 75, 80, 85, 
            130 
        ],
        rowHeaders: true, width: '100%', height: '100%', stretchH: 'all',
        manualColumnResize: true, manualColumnMove: true,
        
        hiddenColumns: {
            columns: isDropYardsHidden ? DROP_YARD_COLUMNS : [], 
            indicators: true
        },
        
        contextMenu: {
            items: {
                "alignment": { name: 'จัดตำแหน่งข้อความ' },
                "hidden_columns_hide": { name: 'ซ่อนคอลัมน์' },
                "hidden_columns_show": { name: 'แสดงคอลัมน์ที่ซ่อน' },
                "copy": { name: 'คัดลอก (Copy)' }
            }
        },
        licenseKey: 'non-commercial-and-evaluation',

        afterChange: function(changes, source) {
            if (source === 'loadData' || source === 'auto' || !changes) return;
            
            changes.forEach(([row, prop, oldVal, newVal]) => {
                if (oldVal !== newVal && prop !== '_checkbox') editedRowIndices.add(row);
                
                if (['container_1_no', 'container_2_no', 'seal_1_no', 'seal_2_no', 'pop_no'].includes(prop) && newVal && typeof newVal === 'string') {
                    const cleanVal = newVal.replace(/\s/g, '').toUpperCase();
                    if (cleanVal !== newVal) {
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, prop, cleanVal, 'auto'), 10);
                    }
                }

                if (['leg1_plate', 'drop1_plate', 'leg2_plate', 'drop2_plate', 'leg3_plate'].includes(prop) && newVal) {
                    if (fleetAssignments[newVal]) {
                        const driverCol = prop.replace('_plate', '_driver');
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, driverCol, fleetAssignments[newVal], 'auto'), 10);
                    }
                }
                
                if (['leg1_driver', 'drop1_driver', 'leg2_driver', 'drop2_driver', 'leg3_driver'].includes(prop) && newVal) {
                    if (driverAssignments[newVal]) {
                        const plateCol = prop.replace('_driver', '_plate');
                        const matchedPlate = driverAssignments[newVal];
                        setTimeout(() => hotGridInstance.setDataAtRowProp(row, plateCol, matchedPlate, 'auto'), 10);
                    }
                }
            });
            updateSaveStatusBadge();
            this.render(); 
        },
        cells: function(row, col) {
            const cp = {};
            if (editedRowIndices.has(row)) {
                cp.className = (cp.className || '') + ' ht-edited-row';
                if (col === 1) cp.className += ' unsaved-id-cell';
            }
            return cp;
        }
    });

    if (userGridSettings.columnPositions && userGridSettings.columnPositions.length === hotGridInstance.countCols()) {
        try { hotGridInstance.getPlugin('manualColumnMove').moveColumns(userGridSettings.columnPositions, 0); } catch(e) {}
    }
}

