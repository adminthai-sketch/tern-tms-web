// Keep the original field IDs for links and existing actions; encode multiple values as JSON.
const TmsFilters = (() => {
    const specs = [
        ['filter-run-date','วันที่วิ่งงาน','run_date'],
        ['filter-customer','ลูกค้า','customer_name'],
        ['filter-booking-no','Booking','booking_no']
    ];
    const values = value => {
        if (!value) return [];
        try { const parsed=JSON.parse(value); if(Array.isArray(parsed))return parsed.map(String); } catch {}
        return [String(value)];
    };
    const encode = list => list.length===1 ? list[0] : list.length ? JSON.stringify(list) : '';
    const matches = (value,...candidates) => !values(value).length || values(value).some(v=>candidates.includes(v));
    const cell = (row,key) => key==='run_date' ? String(row[key]||'').slice(0,10) : String(row[key]||'').trim();
    const controls = new Map();
    let config;
    function get(id) {return values(document.getElementById(id).value);}
    function set(id,list) {document.getElementById(id).value=encode([...new Set(list.filter(Boolean))]);}
    function options(id) {
        const own=specs.find(s=>s[0]===id);
        return [...new Set(config.rows().filter(row=>specs.every(([other,,key])=>other===id || matches(document.getElementById(other).value,cell(row,key))))
            .map(row=>cell(row,own[2])).filter(Boolean).concat(get(id)))].sort();
    }
    function refresh() {
        for(const [id,view] of controls) {
            const chosen=get(id),title=specs.find(s=>s[0]===id)[1];
            view.button.textContent=(chosen.length===1?chosen[0]:chosen.length?`${title} ${chosen.length} ค่า`:title+' · ทั้งหมด')+' ▾';
            view.button.classList.toggle('has-selection',chosen.length>0);
            view.button.title=chosen.join(', ')||'เลือกได้หลายค่า';
        }
    }
    function syncBooking() {
        const bookings=get('filter-booking-no');
        if(!bookings.length)return;
        const rows=config.rows().filter(row=>bookings.includes(cell(row,'booking_no')));
        set('filter-customer',rows.map(row=>cell(row,'customer_name')));
        set('filter-run-date',rows.map(row=>cell(row,'run_date')));
        const months=[...new Set(rows.map(row=>cell(row,'run_date').slice(0,7)).filter(Boolean))];
        if(months.length===1)document.getElementById('filter-month').value=months[0];
    }
    function commit(id,list) {
        if(!config.ready())return false;
        set(id,list);
        if(id==='filter-booking-no')syncBooking();
        refresh();config.apply();return true;
    }
    function mount(optionsConfig) {
        config=optionsConfig;
        for(const [id,title] of specs) {
            const input=document.getElementById(id);
            input.type='hidden';input.removeAttribute('list');input.removeAttribute('onchange');
            const wrapper=document.createElement('div');wrapper.className='tms-filter';
            const button=document.createElement('button');button.type='button';button.className='tms-filter-trigger';
            button.setAttribute('aria-label',title+' เลือกหลายค่า');button.setAttribute('aria-expanded','false');
            const panel=document.createElement('div');panel.className='tms-filter-panel';panel.hidden=true;
            panel.setAttribute('role','group');panel.setAttribute('aria-label','ตัวกรอง '+title);
            const search=document.createElement('input');search.type='search';search.placeholder='ค้นหา '+title;search.className='tms-filter-search';
            const list=document.createElement('div');list.className='tms-filter-options';
            const tools=document.createElement('div');tools.className='tms-filter-tools';
            const footer=document.createElement('div');footer.className='tms-filter-tools';
            let draft=new Set(),available=[];
            function render() {
                list.replaceChildren();
                const visible=available.filter(v=>v.toLowerCase().includes(search.value.trim().toLowerCase()));
                if(!visible.length){const empty=document.createElement('p');empty.textContent='ไม่พบข้อมูลในตัวกรองปัจจุบัน';list.append(empty);}
                for(const value of visible){
                    const label=document.createElement('label'),checkbox=document.createElement('input'),text=document.createElement('span');
                    checkbox.type='checkbox';checkbox.checked=draft.has(value);text.textContent=value;
                    checkbox.onchange=()=>checkbox.checked?draft.add(value):draft.delete(value);
                    label.append(checkbox,text);list.append(label);
                }
            }
            function hide(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
            for(const [label,action] of [['เลือกทั้งหมด',()=>{available.filter(v=>v.toLowerCase().includes(search.value.trim().toLowerCase())).forEach(v=>draft.add(v));render();}],['ล้างค่า',()=>{draft.clear();render();}]]){
                const tool=document.createElement('button');tool.type='button';tool.textContent=label;tool.onclick=action;tools.append(tool);
            }
            const cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';cancel.onclick=hide;
            const apply=document.createElement('button');apply.type='button';apply.className='tms-filter-apply';apply.textContent='ใช้ตัวกรอง';
            apply.onclick=()=>{if(commit(id,[...draft]))hide();};
            footer.append(cancel,apply);panel.append(search,tools,list,footer);wrapper.append(button,panel);input.after(wrapper);
            controls.set(id,{button,panel,hide});
            button.onclick=()=>{
                if(!config.ready())return;
                if(!panel.hidden){hide();return;}
                controls.forEach(view=>view.hide());draft=new Set(get(id));available=options(id);search.value='';render();
                panel.hidden=false;button.setAttribute('aria-expanded','true');search.focus();
            };
            search.oninput=render;wrapper.onkeydown=event=>{if(event.key==='Escape'){hide();button.focus();}};
        }
        document.addEventListener('click',event=>{for(const view of controls.values())if(!view.button.parentElement.contains(event.target))view.hide();});
        refresh();
    }
    return {values,encode,matches,cell,mount,refresh,syncBooking,commit};
})();
