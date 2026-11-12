# วันนี้ลา by DBC (PDPA-Compliant HR Leave, WFH/WFA/Offsite & Office Check-in)

ระบบบริหารจัดการวันลา ปฏิบัติงานนอกสถานที่ และลงเวลาเข้าออฟฟิศ (Check-in / Check-out) ออกแบบตามมาตรฐาน **PDPA (Data Minimization)** รองรับทั้งการใช้งานผ่าน **Google AppSheet** (ล็อกอินด้วยบัญชี Google ของบริษัท) และ **เว็บแอปพลิเคชัน Next.js ต้นแบบ** ที่เชื่อมกับฐานข้อมูล Google Sheet เดียวกัน

👉 **คู่มือการวางแผนและสูตรตั้งค่า Google AppSheet ฉบับจับมือทำ:** ดูได้ที่ไฟล์ [`APPSHEET_PLAN_AND_GUIDE.md`](./APPSHEET_PLAN_AND_GUIDE.md) หรือกดปุ่ม **"แผนทำ AppSheet & คู่มือระบบ"** บนหน้าเว็บ

---

## ฟีเจอร์หลักตามความต้องการล่าสุด

1. **ฐานข้อมูล PDPA-Compliant (เก็บเฉพาะข้อมูลที่จำเป็น):**
   - เก็บเฉพาะ: `EmployeeID (id)`, `ชื่อภาษาไทย (name)`, `ชื่อภาษาอังกฤษ (englishName - ดึงจาก Google Login)`, `อีเมล (email - ดึงจาก Google Login)`, `role (c_level / hr / manager / employee)`, `department`, `position`, `วันที่เริ่มงาน (startDate)` และโควต้าวันลา
   - **ไม่เก็บ:** เบอร์โทรศัพท์, รหัสผ่าน, พิกัด GPS, รูปถ่ายใบหน้า และตัดการดึงข้อมูลจาก Google Calendar ออกทั้งหมด
2. **ตรวจสอบระยะเวลาทดลองงาน 90 วัน (Probation Check) อัตโนมัติ:**
   - คำนวณอายุงานจาก `วันที่เริ่มงาน (startDate)`
   - หากอายุงานยังไม่ครบ **90 วัน (3 เดือน)** ระบบจะไม่อนุญาตให้ขอ `ลาพักร้อน`, `Work From Home (WFH)`, และ `Work From Anywhere (WFA)` แต่ยังอนุญาตให้กด `ลาป่วย` และ `ทำงานนอกสถานที่ (ไปหาลูกค้า/ออกบูธ)` ได้
3. **รองรับ 6 ประเภทการลาและการปฏิบัติงาน:**
   - `ลาป่วย (sick)`, `ลากิจ (personal)`, `ลาพักร้อน (vacation)`
   - `Work From Home (wfh - ทำงานที่บ้าน)`, `Work From Anywhere (wfa - ทำงานนอกบ้าน)` (ตั้งโควต้าต่อปีได้ หรือใส่ `0` เพื่อไม่จำกัดโควต้า)
   - `ทำงานนอกสถานที่ (offsite - ไปหาลูกค้า / ประชุมนอกสถานที่ / ออกบูธ)` — **ไม่จำกัดโควต้า** พร้อมช่องระบุสถานที่/ชื่อลูกค้า
4. **สายการอนุมัติ 4 บทบาท (`C-Level`, `HR`, `Manager`, `Employee`) พร้อมระบบ HR สำรอง 2 คน:**
   - **กรณี `Employee` ลา:** `Employee` &rarr; `Manager (ขั้นที่ 1)` &rarr; `HR (ขั้นที่ 2)` + แจ้งเตือน `C-Level`
   - **กรณี `Manager` ลา:** `Manager` &rarr; `C-Level (ขั้นที่ 1)` &rarr; `HR (ขั้นที่ 2)` + แจ้งเตือน `C-Level`
   - **กรณี `HR` ลา (มี HR 2 คนสำรองกัน):** `HR คนที่ 1` &rarr; `C-Level (ขั้นที่ 1)` &rarr; `HR คนที่ 2 (ขั้นที่ 2)` *(ระบบล็อกห้าม HR กดอนุมัติขั้นที่ 2 ให้ใบลาของตัวเอง)*
5. **ระบบ Check-in / Check-out และหน้า Dashboard "วันนี้ใครอยู่ Office บ้าง":**
   - พนักงานกดลงเวลาเข้างาน (`Check-in`) และเลิกงาน (`Check-out`) พร้อมเลือกสถานะสถานที่ทำงานวันนี้ (`เข้า Office`, `WFH`, `WFA`, `ทำงานนอกสถานที่`)
   - หน้า Dashboard แสดงรายชื่อและจำนวนคนที่นั่งอยู่ใน Office วันนี้ แยกตามสถานะอย่างชัดเจน

---

## รายชื่อบัญชีทดสอบในระบบ (Google Login Simulation & Google Sheet Mockup)

| รหัสพนักงาน | ชื่อภาษาไทย | ชื่อภาษาอังกฤษ | อีเมล (Google Login) | บทบาท (`role`) | แผนก | วันเริ่มงาน |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `EMP009` | ดร.อนันต์ วิสัยทัศน์ไกล | Dr. Anan Wisaithatklai | `anan.ceo@company.co.th` | `c_level` | Executive (C-Level) | `2020-01-01` |
| `EMP001` | ศิริพร บริหารงาน (HR 1) | Siriporn Boriharn | `siriporn.hr@company.co.th` | `hr` | HR & Admin | `2022-03-01` |
| `EMP008` | พิมพ์ชนก ดูแลดี (HR 2 สำรอง) | Pimchanok Dulaedee | `pimchanok.hr@company.co.th` | `hr` | HR & Admin | `2023-05-01` |
| `EMP002` | กิตติพงศ์ วรโชติ (หัวหน้า IT) | Kittipong Worachot | `kittipong.it@company.co.th` | `manager` | IT & Digital | `2021-06-15` |
| `EMP003` | สมชาย ใจดี | Somchai Jaidee | `somchai.it@company.co.th` | `employee` | IT & Digital | `2023-01-10` |
| `EMP004` | แพรวพรรณ สุขสวัสดิ์ | Praewpan Suksawat | `praew.it@company.co.th` | `employee` | IT & Digital | `2024-02-01` |
| `EMP005` | วรพล ยอดเยี่ยม (หัวหน้า Sales) | Worapon Yodyiam | `worapon.sales@company.co.th` | `manager` | Sales & Marketing | `2021-09-01` |
| `EMP006` | ณัฐพงศ์ ทองดี | Nattapong Thongdee | `nattapong.sales@company.co.th` | `employee` | Sales & Marketing | `2023-07-15` |
| `EMP007` | กัญญาภัค รุ่งเรือง (ทดลองงาน) | Kanyapak Rungrueng | `kanya.acc@company.co.th` | `employee` | Accounting & Finance | `2026-10-15` *(ยังไม่ครบ 90 วัน)* |
