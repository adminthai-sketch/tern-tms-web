(() => {
    const containerPage=location.pathname.includes('admin-container-sizes');
    const groups=[
        ['บัญชีและสิทธิ์',[['users','ผู้ใช้งาน','fa-users'],['roles','กลุ่มสิทธิ์','fa-user-shield']]],
        ['รถและคนขับ',[['trucks','ข้อมูลรถ','fa-truck'],['driver_info','พนักงานขับรถ','fa-id-card'],['truck_assignments','จับคู่รถ–คนขับ','fa-link']]],
        ['ข้อมูลหลัก',[['customers','ลูกค้าและชื่อออกบิล','fa-building'],['rates','เรทราคา','fa-tags'],['container-sizes','ขนาด / ประเภทตู้','fa-box']]]
    ];
    document.body.classList.add('admin-shell');
    let nav=document.querySelector('nav');
    if(!nav){
        nav=document.createElement('nav');
        const main=document.querySelector('main'),layout=document.createElement('div');layout.className='admin-layout';
        main.before(layout);layout.append(nav,main);
    }
    nav.className='admin-navigation';nav.setAttribute('aria-label','จัดการข้อมูลหลังบ้าน');nav.replaceChildren();
    const heading=document.createElement('h2');heading.textContent='จัดการข้อมูลหลังบ้าน';heading.className='admin-nav-title';nav.append(heading);
    const hint=document.createElement('p');hint.textContent='เลือกหมวดที่ต้องการจัดการ';hint.className='admin-nav-hint';nav.append(hint);
    for(const [title,items] of groups){
        const section=document.createElement('section'),label=document.createElement('h3');label.textContent=title;section.append(label);
        for(const [key,text,icon] of items){
            const link=document.createElement('a');link.className='sidebar-item';link.id='menu-'+key;
            link.href=key==='container-sizes'?'/admin-container-sizes.html':'/admin.html#'+key;
            const symbol=document.createElement('i');symbol.className='fa-solid '+icon;symbol.setAttribute('aria-hidden','true');
            const name=document.createElement('span');name.textContent=text;link.append(symbol,name);
            if(containerPage&&key==='container-sizes'){link.classList.add('is-current');link.setAttribute('aria-current','page');}
            if(!containerPage&&key!=='container-sizes')link.onclick=event=>{event.preventDefault();switchMasterTab(key);};
            section.append(link);
        }
        nav.append(section);
    }
    const home=document.createElement('a');home.href='/index.html';home.className='admin-home';home.textContent='← กลับหน้าหลัก TMS';nav.append(home);
})();
