from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

out = Path(__file__).parent / 'artifacts'
out.mkdir(exist_ok=True)
doc = Document()
sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21)
sec.top_margin = sec.bottom_margin = Cm(1.7)
sec.left_margin = sec.right_margin = Cm(1.8)
for name in ['Normal','Title','Heading 1','Heading 2']:
    style=doc.styles[name]
    style.font.name='Tahoma'
    style.font.color.rgb=RGBColor(0,0,0)
    style.font.size=Pt(10 if name=='Normal' else 22 if name=='Title' else 15 if name=='Heading 1' else 12)
    style.element.rPr.rFonts.set(qn('w:eastAsia'),'Tahoma')
doc.styles['Normal'].paragraph_format.space_after=Pt(6)
doc.styles['Normal'].paragraph_format.line_spacing=1.18
def p(text): doc.add_paragraph(text)
def h(text): doc.add_heading(text,1)
def table(headers, rows, widths):
    t=doc.add_table(rows=1, cols=len(headers)); t.autofit=False
    for c,w in zip(t.columns,widths): c.width=Cm(w)
    for c,text in zip(t.rows[0].cells,headers): c.text=text
    for row in rows:
        for c,text in zip(t.add_row().cells,row): c.text=text
    for ri,row in enumerate(t.rows):
        pr=row._tr.get_or_add_trPr()
        no=OxmlElement('w:cantSplit');pr.append(no)
        if ri==0: pr.append(OxmlElement('w:tblHeader'))
        for ci,c in enumerate(row.cells):
            c.width=Cm(widths[ci]);tcpr=c._tc.get_or_add_tcPr()
            shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'DCE6F1' if ri==0 else 'F5F7FA' if ri%2==0 else 'FFFFFF');tcpr.append(shade)
            borders=OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                b=OxmlElement('w:'+side);b.set(qn('w:val'),'single');b.set(qn('w:sz'),'4');b.set(qn('w:color'),'D9D9D9');borders.append(b)
            tcpr.append(borders)
            for para in c.paragraphs:
                para.paragraph_format.space_after=Pt(4)
                for r in para.runs: r.font.size=Pt(9);r.bold=ri==0
    doc.add_paragraph()
def page(): doc.add_page_break()

doc.add_paragraph('คู่มือโครงสร้างโปรเจกต์ TERN TMS','Title')
p('แผนที่ไฟล์และแนวทางเลือกจุดแก้ไขสำหรับผู้ดูแลระบบ')
p('อ้างอิงซอร์สในโฟลเดอร์ C:\\Users\\GM_Pa\\Desktop\\tern-tms-web ณ วันที่ 20 พฤศจิกายน 2026')
p('คู่มือนี้อธิบายว่าแต่ละหน้าเรียก JavaScript และ API ใด ข้อมูลถูกบันทึกที่ตารางไหน และควรเริ่มตรวจไฟล์ใดเมื่อแก้ฟอร์ม ตาราง ราคา หรือเอกสาร เพื่อให้ตามเส้นทางข้อมูลได้ครบตั้งแต่กรอกจนเปิดกลับมาอ่าน')
h('ภาพรวมการทำงาน')
table(['ลำดับ','ส่วนของระบบ','หน้าที่'],[
('1','public/*.html','โครงหน้า ช่องกรอก ปุ่ม และการโหลดสคริปต์'),
('2','public/js/','จัดตาราง คำนวณหน้าจอ และส่งข้อมูลผ่าน fetch'),
('3','server.js','รับคำขอและเชื่อม URL เข้ากลุ่ม API'),
('4','routes/*.js','ตรวจข้อมูล อ่านและบันทึกด้วย SQL'),
('5','config/db.js → Neon','ใช้ DATABASE_URL เชื่อม PostgreSQL')],[1.3,5,10.9])
h('เส้นทางงานหลัก')
p('สร้าง Booking → สร้าง Order แต่ละเที่ยว → จัดรถและลงข้อมูลตู้ → ยืนยันเวลาทำงานจริง → ลงรายได้และค่าใช้จ่าย → เลือกเที่ยวออก IV และ AR → พิมพ์ใบปะหน้า')
p('หนึ่ง Booking มีหลาย Order ได้ และวางบิลหลายรอบได้ การเพิ่มตู้ 2 ในเที่ยวเป็นข้อมูลตู้ของ Order เดิม ส่วนราคาตั้งต้นอยู่ที่หัว Booking และยอดระดับเที่ยวอยู่ใน financials')
h('ไฟล์ควบคุมระบบ')
table(['ไฟล์','หน้าที่'],[('server.js','เริ่ม Express เสิร์ฟ public และ mount routes'),('config/db.js','เชื่อม Neon และอ่านวันเวลาให้คงค่าปฏิทิน'),('package.json','ไลบรารีและคำสั่ง npm start / npm test'),('vercel.json','กำหนด build และส่งคำขอไป server.js'),('sql/ และ tests/','Migration ฐานข้อมูลและชุดทดสอบพฤติกรรม')],[5,12.2])
page()
h('แผนที่หน้าเว็บและสคริปต์')
p('ชื่อหน้าในตารางอยู่ใต้ public ส่วนสคริปต์ที่ขึ้นต้น booking/ หรือ billing/ อยู่ใต้ public/js/modules/')
table(['หน้าเว็บ','สคริปต์หลัก','API ที่เกี่ยวข้อง'],[
('booking.html','สคริปต์ใน HTML และ public/js/booking-phase1.js','routes/bookings.js'),
('booking-bulk.html','booking/bulk.js','bookings.js และ excel.js'),
('booking-list.html','booking/list.js','bookings.js'),
('booking-manage.html','กลุ่ม manage และ workspace','bookings.js และ dispatch-workspace.js'),
('booking-monitor.html','สคริปต์ใน HTML','bookings.js'),
('billing.html','billing/master.js','billing.js'),
('billing-detail.html','billing/detail.js และ document-round.js','billing.js และ dispatch-workspace.js'),
('billing-iv.html','billing/iv.js','billing.js'),
('billing-iv-detail.html','billing/iv-detail.js','billing.js'),
('print-invoice.html','สคริปต์ใน HTML','billing.js เส้นทาง print-data'),
('admin.html','สคริปต์ใน HTML','admin.js'),
('index.html และ login.html','เมนูและการเข้าสู่ระบบ','admin.js เส้นทาง login')],[4.5,6.4,6.3])
h('ไฟล์ที่ใช้ร่วมกัน')
p('public/js/auth.js จัดการสถานะผู้ใช้และสิทธิ์บนหน้าเว็บ ส่วน public/js/password.js ดูแลหน้าต่างเปลี่ยนรหัสผ่าน การตรวจสิทธิ์หน้าเว็บต้องพิจารณาร่วมกับการตรวจฝั่ง API')
h('ชื่อไฟล์ที่ควรตรวจให้แน่ใจก่อนแก้')
p('routes/auth.js และ routes/fleet.js ปัจจุบันเป็น router เปล่า การ Login และทะเบียนรถ คนขับ ลูกค้า และเรทอยู่ใน routes/admin.js')
p('booking/form.js, booking/filter.js และ booking/grid.js มีอยู่ในโฟลเดอร์ แต่หน้า Booking ปัจจุบันไม่ได้โหลดไฟล์เหล่านี้โดยตรง ให้ตรวจแท็ก script src ของหน้าเป้าหมายก่อนเลือกไฟล์แก้')
page()
h('โครงสร้างหน้าจัดรถ')
p('booking-manage.html โหลดไฟล์ตามลำดับด้านล่าง สคริปต์ใช้ตัวแปรร่วมกันและบางไฟล์กำหนดฟังก์ชันทับไฟล์ก่อนหน้า จึงควรรักษาลำดับการโหลด')
table(['ไฟล์ใน booking/','หน้าที่'],[
('manage.js','ตัวแปรกลาง โหลดข้อมูล กรอง Booking เพิ่มและลบเที่ยว ปุ่มพื้นฐาน'),
('manage-grid-legacy.js','โค้ดตารางเดิมที่แยกออกเพื่อรักษาส่วนที่มีอยู่'),
('manage-modal.js','Pop-up จัดรถ ตู้ 1/2 เวลาจริง Cutoff และ VGM'),
('workspace-grid.js','ตารางปัจจุบัน หมวดพับได้ มุมมอง การเลือกเที่ยว และบันทึกเฉพาะช่องที่แก้'),
('workspace-finance.js','รายได้เพิ่มในหน้าจัดรถและปุ่มไปหน้าวางบิล'),
('workspace-export.js','เลือกแถว คอลัมน์ ลำดับ และรูปแบบ Excel')],[6.5,10.7])
p('workspace-grid.js กำหนด initContainerHandsontable และ saveGridChanges ใหม่หลังโหลดตารางเดิม หากแก้คอลัมน์ปัจจุบันให้เริ่มที่ไฟล์นี้ การแก้เฉพาะ manage-grid-legacy.js อาจไม่ปรากฏบนหน้าปัจจุบัน')
h('เส้นทางบันทึกที่ควรรู้')
table(['คำขอจากหน้าเว็บ','ผู้รับใน Backend','ข้อมูลหลัก'],[
('/api/bookings/header','routes/bookings.js','สร้างหัว Booking และ Order ใน transaction'),
('/api/bookings/:id','routes/bookings.js','แก้หัว Booking'),
('/api/shipments','routes/bookings.js','อ่านและบันทึกเที่ยวจัดรถ'),
('/api/dispatch/finance','routes/dispatch-workspace.js','ยอดเงิน รายได้เพิ่ม และประวัติแก้ไข'),
('/api/dispatch/documents','routes/dispatch-workspace.js','ออก IV/AR ให้เที่ยวที่เลือก'),
('/api/dispatch/templates','routes/dispatch-workspace.js','รูปแบบ Excel ส่วนตัวหรือผูกลูกค้า'),
('/api/billing/shipments','routes/billing.js','ข้อมูลวางบิลเดิม'),
('/api/billing/print-data','routes/billing.js','ข้อมูลใบปะหน้า')],[6.3,5,5.9])
p('server.js เติม prefix ให้ API เช่น router.get("/shipments") ใน billing.js จะถูกเรียกเป็น /api/billing/shipments ส่วนใน bookings.js ใช้ /api/shipments')
page()
h('ความสัมพันธ์ของข้อมูล')
p('customers เชื่อม bookings ผ่าน customer_id → bookings เชื่อม shipment_operations ผ่าน booking_no → shipment_operations เชื่อมตู้ ขาวิ่ง และการเงินผ่าน order_id เส้นทางนี้อธิบายการ join ที่โค้ดใช้ แต่ละเส้นต้องตรวจ Foreign Key จาก Schema เพิ่มเติมเมื่อต้องเปลี่ยนความสัมพันธ์')
table(['ตาราง','ระดับข้อมูลและหน้าที่'],[
('customers','ทะเบียนลูกค้า ตัวย่อ ชื่อออกบิล เลขภาษี ที่อยู่'),
('bookings','หัวงาน โหมด เส้นทาง โรงงาน container_list และราคาตั้งต้น'),
('shipment_operations','หนึ่ง Order ต่อเที่ยว รถ สถานะ เวลาจริง และข้อมูลเดิมบางส่วน'),
('shipment_containers','ตู้ 1/2 ภายใน Order เบอร์ตู้ SEAL TARE MAX GROSS POP'),
('shipment_legs','ขารับตู้ จุดฝาก เข้าโรงงาน และคืนตู้'),
('financials','ยอดระดับ Order ค่าใช้จ่าย รายได้เพิ่ม IV/AR'),
('rates','Master Rates สำหรับเติมราคาตั้งต้น'),
('trucks / driver_info / truck_assignments','ทะเบียนรถ คนขับ และการจับคู่'),
('users / roles','ผู้ใช้และบทบาท'),
('dispatch_export_templates','ชื่อรูปแบบ Excel คอลัมน์ owner_id และ customer_id'),
('dispatch_document_audit','ประวัติผู้แก้ยอด เหตุผลและข้อมูลก่อน/หลัง')],[6.8,10.4])
p('ข้อมูลขาวิ่งยังมีใน shipment_operations ควบคู่กับ shipment_legs โดย trigger จาก migration 002–003 ช่วยซิงก์ เมื่อแก้เส้นทางบันทึกต้องตรวจผลในตารางลูกด้วย')
h('Migration ที่เกี่ยวข้อง')
table(['ไฟล์ SQL','สิ่งที่เพิ่ม'],[
('001 → 003','ตารางตู้ ตารางขาวิ่ง และประเภทของรถรายขา'),
('004-booking-phase1.sql','ชุดจำนวน×ขนาดตู้ เจ้าของงาน โรงงาน และขนาดราย Order'),
('005-dispatch-actual.sql','เวลาจริง Drop Only Cutoff รายเที่ยว และ POP ต่อตู้'),
('006-billing-additional-revenue.sql','รายการรายได้เพิ่มใน financials'),
('007-dispatch-workspace.sql','ประวัติการเงินและรูปแบบ Excel')],[7.2,10])
page()
h('เลือกไฟล์แก้ตามปัญหา')
table(['สิ่งที่ต้องการแก้','เริ่มตรวจไฟล์'],[
('ตำแหน่ง สี ช่องกรอก และปุ่ม Pop-up','public/booking-manage.html'),
('คอลัมน์ หมวดพับได้ และมุมมองงาน','booking/workspace-grid.js'),
('ข้อมูลใน Pop-up และปุ่มใช้รถเดิม','booking/manage-modal.js'),
('สถานะรอวางบิลและเวลาจบงาน','saveDispatchPatch ใน routes/bookings.js'),
('เพิ่มรายได้และแก้ยอดเงิน','workspace-finance.js และ routes/dispatch-workspace.js'),
('เลือกเที่ยวและออก IV/AR','billing/document-round.js และ dispatch-workspace.js'),
('หน้าตาใบปะหน้า','public/print-invoice.html'),
('ยอดหรือรายการที่ส่งไปพิมพ์','print-data ใน routes/billing.js'),
('คอลัมน์และรูปแบบ Excel','booking/workspace-export.js และ API templates'),
('ลูกค้า รถ คนขับ เรทและผู้ใช้งาน','public/admin.html และ routes/admin.js')],[7.3,9.9])
h('วิธีไล่ตรวจเมื่อบันทึกแล้วข้อมูลหาย')
p('1. เปิด HTML เป้าหมายแล้วตรวจว่าโหลดสคริปต์ไหน และปุ่มเรียกฟังก์ชันใด')
p('2. ตรวจฟังก์ชัน JavaScript ว่าส่ง URL และชื่อฟิลด์อะไร เปิด Network ในเบราว์เซอร์ดู request กับ response')
p('3. ตาม URL ไป server.js และ routes ตรวจ validation ชื่อคอลัมน์ SQL และเงื่อนไข UPDATE')
p('4. ตรวจค่าที่บันทึกด้วย SELECT เฉพาะข้อมูลที่จำเป็น แล้วโหลดหน้าใหม่เทียบค่ากับ API GET')
p('5. รัน npm test และทดสอบกรอก → บันทึก → เปิดใหม่ โดยเฉพาะวันเวลา เงิน 0 การล้างค่า และการแก้หลายเที่ยว')
h('ข้อจำกัดที่ควรติดตาม')
p('การบันทึกผู้แก้ไขในส่วน workspace ยังอ้าง user_id ที่แอปส่งมาตามระบบเดิม ควรพัฒนาการยืนยันตัวตนฝั่งเซิร์ฟเวอร์ก่อนใช้งานที่ต้องการตรวจสอบตัวบุคคลอย่างรัดกุม')
p('สถานะการรัน migration ใน Neon ต้องตรวจจากฐานจริง การมีไฟล์ SQL ใน Git ยังไม่ยืนยันว่ารันแล้ว โดย migration 007 เป็นเงื่อนไขของรูปแบบ Excel ประวัติแก้ยอด และการออกเอกสารแบบใหม่')
doc.core_properties.title='คู่มือโครงสร้างโปรเจกต์ TERN TMS'
doc.core_properties.subject='ความสัมพันธ์ของไฟล์และแนวทางแก้ไขระบบ'
doc.save(out/'TERN-TMS-Project-Guide.docx')
print(out/'TERN-TMS-Project-Guide.docx')
