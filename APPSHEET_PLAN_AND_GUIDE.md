# แผนการเปลี่ยนระบบเป็น Google AppSheet & คู่มือตั้งค่าแบบจับมือทำ (Step-by-Step)
## ระบบ "วันนี้ลา By DBC" — PDPA-Compliant HR Leave, WFH/WFA/Offsite & Office Check-in

เอกสารฉบับนี้ออกแบบมาเพื่อให้คุณสามารถนำไฟล์ Google Sheet **"วันนี้ลา By DBC"** (`1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c`) ไปสร้างเป็นแอปพลิเคชันบน **Google AppSheet** ได้ทันที โดยรองรับนโยบาย **PDPA (Data Minimization)** ของบริษัทครบทุกข้อ

---

## 1. สรุปการออกแบบฐานข้อมูลตามหลัก PDPA (Data Minimization)

เพื่อให้สอดคล้องกับนโยบายบริษัทที่ทำด้าน PDPA ระบบได้**ตัดการเก็บเบอร์โทรศัพท์ (`phone`), รหัสผ่าน (`password`), พิกัด GPS, รูปถ่ายใบหน้า และตัดการดึงข้อมูลจาก Google Calendar (`CalendarEvents`) ออกทั้งหมด** โดยเก็บเฉพาะข้อมูลที่จำเป็นต่อการบริหารงานบุคคลใน 4 แท็บดังนี้:

### 1.1 แท็บ `Users` (ข้อมูลพนักงานและโควต้า)
เก็บข้อมูลเพียง 13 คอลัมน์:
| คอลัมน์ | ชนิดข้อมูลใน AppSheet | คำอธิบาย |
| :--- | :--- | :--- |
| `id` | `Text` (**Key**) | รหัสพนักงาน (EmployeeID) เช่น `EMP001` |
| `name` | `Name` (**Label**) | ชื่อ-นามสกุลภาษาไทย |
| `englishName` | `Text` | ชื่อ-นามสกุลภาษาอังกฤษ (ดึงจาก Google Login) |
| `email` | `Email` | อีเมล Google ของพนักงาน (ใช้จับคู่กับ `USEREMAIL()` บน AppSheet) |
| `role` | `Enum` | `c_level`, `hr`, `manager`, `employee` |
| `department` | `Text` | แผนก เช่น `IT & Digital`, `Sales & Marketing`, `HR & Admin`, `Executive (C-Level)` |
| `position` | `Text` | ตำแหน่งงาน |
| `startDate` | `Date` | วันที่เริ่มงาน (`YYYY-MM-DD`) สำหรับคำนวณผ่านโปร 90 วัน |
| `sickQuota` | `Number` | โควต้าลาป่วยต่อปี (เช่น `30`) |
| `personalQuota` | `Number` | โควต้าลากิจต่อปี (เช่น `6`) |
| `vacationQuota` | `Number` | โควต้าลาพักร้อนต่อปี (เช่น `10`, ยังไม่ผ่านโปรใส่ `0`) |
| `wfhQuota` | `Number` | โควต้า Work From Home ต่อปี (ใส่ `0` = ไม่จำกัดโควต้า) |
| `wfaQuota` | `Number` | โควต้า Work From Anywhere ต่อปี (ใส่ `0` = ไม่จำกัดโควต้า) |

> **วิธีดึงข้อมูลจาก Google Login บน AppSheet:**
> AppSheet บังคับให้ผู้ใช้ล็อกอินด้วยบัญชี Google อยู่แล้ว คุณสามารถใช้ฟังก์ชัน `USEREMAIL()` เพื่อดึงอีเมลของผู้ใช้ที่กำลังล็อกอินอยู่มาเช็คสิทธิ์และดึง `EmployeeID`, `ชื่อภาษาไทย`, `ชื่อภาษาอังกฤษ`, `role`, `department` และ `วันที่เริ่มงาน` จากตาราง `Users` ได้อัตโนมัติ

---

### 1.2 แท็บ `LeaveRequests` (ใบลา 6 ประเภท และสายอนุมัติ 4 บทบาท)
รองรับ 6 ประเภทการลา/ปฏิบัติงาน:
1. `sick` — ลาป่วย
2. `personal` — ลากิจ
3. `vacation` — ลาพักร้อน (ต้องอายุงานครบ 90 วันขึ้นไป)
4. `wfh` — Work From Home (ทำงานที่บ้าน - ต้องอายุงานครบ 90 วันขึ้นไป)
5. `wfa` — Work From Anywhere (ทำงานนอกบ้าน - ต้องอายุงานครบ 90 วันขึ้นไป)
6. `offsite` — ทำงานนอกสถานที่ (ไปหาลูกค้า / ประชุมนอกสถานที่ / ออกบูธ - **ไม่จำกัดโควต้า** และผ่านโปรหรือไม่ผ่านโปรก็ขอได้ แต่ต้องระบุ `locationDetail`)

---

### 1.3 แท็บ `Attendance` (ระบบ Check-in / Check-out และหน้า Dashboard "ใครอยู่ Office บ้าง")
เก็บเฉพาะ 9 คอลัมน์ตามมาตรฐาน PDPA (ไม่เก็บพิกัด Lat/Long และไม่ถ่ายรูป):
- `id` (`Key`), `userId` (`Ref` -> `Users`), `userName`, `department`, `date` (`Date`), `checkInTime` (`Time`), `checkOutTime` (`Time`), `workLocation` (`office` | `wfh` | `wfa` | `offsite`), `note` (`Text`)

---

### 1.4 แท็บ `Holidays` (วันหยุดนักขัตฤกษ์ประจำปี)
- `id` (`Key`), `date` (`Date`), `name` (`Text`)

---

## 2. ขั้นตอนการสร้างแอปบน AppSheet แบบจับมือทำ

### Step 1: เชื่อมต่อ Google Sheet เข้ากับ AppSheet
1. เปิดไฟล์ Google Sheet **"วันนี้ลา By DBC"**: `https://docs.google.com/spreadsheets/d/1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c/edit`
2. ไปที่เมนู **Extensions (ส่วนขยาย) > AppSheet > Create an app**
3. ในเมนู **Data > Tables** ให้กดเพิ่มตารางให้ครบทั้ง 4 ตาราง: `Users`, `LeaveRequests`, `Attendance`, `Holidays`

---

### Step 2: ตั้งค่าคอลัมน์และสูตรในตาราง `LeaveRequests` (Copy-Paste ได้เลย)

ไปที่ **Data > Columns > LeaveRequests** แล้วตั้งค่าดังนี้:

1. **`id`**:
   - Type: `Text`, ติ๊ก **Key**
   - Initial Value: `"LV_" & UNIQUEID()`
2. **`userId`**:
   - Type: `Ref` (Source Table: `Users`)
   - Initial Value:
     ```excel
     LOOKUP(USEREMAIL(), "Users", "email", "id")
     ```
   - Editable_If: `FALSE`
3. **`userName`**:
   - Initial Value: `[userId].[name]`
4. **`requesterRole`**:
   - Initial Value: `[userId].[role]`
5. **`department`**:
   - Initial Value: `[userId].[department]`
6. **`leaveType` (เงื่อนไขทดลองงาน 90 วัน)**:
   - Type: `Enum`
   - ไปที่ **Data Validity > Valid_If** แล้ววางสูตรนี้:
     ```excel
     IF(
       (HOUR(TODAY() - LOOKUP(USEREMAIL(), "Users", "email", "startDate")) / 24) < 90,
       LIST("sick", "offsite", "personal"),
       LIST("sick", "personal", "vacation", "wfh", "wfa", "offsite")
     )
     ```
   - ไปที่ **Invalid value error** วางข้อความ:
     `"พนักงานที่ยังอยู่ในช่วงทดลองงาน (< 90 วัน) ไม่สามารถขอลาพักร้อน / WFH / WFA ได้ (ยังสามารถลาป่วย หรือไปทำงานนอกสถานที่ได้)"`
7. **`locationDetail` (ช่องระบุสถานที่/ชื่อลูกค้า สำหรับทำงานนอกสถานที่)**:
   - Type: `Text`
   - **Show_If**:
     ```excel
     IN([leaveType], LIST("offsite", "wfa"))
     ```
   - **Require_If**:
     ```excel
     [leaveType] = "offsite"
     ```
8. **`status` (กำหนดจุดเริ่มต้นของสายอนุมัติตาม Role อัตโนมัติ)**:
   - Type: `Enum` (`pending_manager`, `pending_c_level`, `pending_hr`, `approved`, `rejected`, `cancelled`)
   - **Initial Value**:
     ```excel
     SWITCH(
       LOOKUP(USEREMAIL(), "Users", "email", "role"),
       "employee", "pending_manager",
       "manager", "pending_c_level",
       "hr", "pending_c_level",
       "c_level", "pending_hr",
       "pending_manager"
     )
     ```

---

### Step 3: สร้างปุ่มกดอนุมัติใบลา 4 บทบาท (เมนู Actions ด้านซ้าย)

ตามสายการอนุมัติที่คุณกำหนด:
- **Employee ลา:** `Employee > Manager (ขั้นที่ 1) > HR (ขั้นที่ 2) + แจ้งเตือน C-Level`
- **Manager ลา:** `Manager > C-Level (ขั้นที่ 1) > HR (ขั้นที่ 2) + แจ้งเตือน C-Level`
- **HR ลา (มี HR 2 คนสำรอง):** `HR1 > C-Level (ขั้นที่ 1) > HR2 (ขั้นที่ 2 - ห้ามอนุมัติใบลาตัวเอง)`

ให้ไปที่แถบเมนูด้านซ้ายเลือก **Actions (ไอคอนสายฟ้า/ลูกศร — เวอร์ชันเก่าชื่อ Behavior)** แล้วกด **+ (Add Action)** สร้างปุ่ม 4 ปุ่มสำหรับตาราง `LeaveRequests`:

#### ปุ่มที่ 1: `Approve_Step1_Manager` (หัวหน้าแผนกอนุมัติลูกทีม)
- **Do this:** `Data: set the values of some columns in this row`
- **Set these columns:**
  - `status` = `"pending_hr"`
  - `managerApprovedBy` = `LOOKUP(USEREMAIL(), "Users", "email", "name")`
- **Behavior > Only if this condition is true:**
  ```excel
  AND(
    [status] = "pending_manager",
    LOOKUP(USEREMAIL(), "Users", "email", "role") = "manager",
    LOOKUP(USEREMAIL(), "Users", "email", "department") = [department]
  )
  ```

#### ปุ่มที่ 2: `Approve_Step1_CLevel` (C-Level อนุมัติขั้นที่ 1 ให้ Manager และ HR)
- **Do this:** `Data: set the values of some columns in this row`
- **Set these columns:**
  - `status` = `"pending_hr"`
  - `cLevelApprovedBy` = `LOOKUP(USEREMAIL(), "Users", "email", "name")`
- **Behavior > Only if this condition is true:**
  ```excel
  AND(
    [status] = "pending_c_level",
    LOOKUP(USEREMAIL(), "Users", "email", "role") = "c_level"
  )
  ```

#### ปุ่มที่ 3: `Approve_Step2_HR` (HR อนุมัติขั้นที่ 2 ตัดโควต้า และถ้า HR1 ลา ต้องให้ HR2 กดเท่านั้น)
- **Do this:** `Data: set the values of some columns in this row`
- **Set these columns:**
  - `status` = `"approved"`
  - `hrApprovedBy` = `LOOKUP(USEREMAIL(), "Users", "email", "name")`
  - `cLevelNotifiedAt` = `TEXT(NOW(), "YYYY-MM-DDTHH:MM:SS")`
- **Behavior > Only if this condition is true:**
  ```excel
  AND(
    [status] = "pending_hr",
    LOOKUP(USEREMAIL(), "Users", "email", "role") = "hr",
    LOOKUP(USEREMAIL(), "Users", "email", "id") <> [userId]
  )
  ```
  *(หมายเหตุ: เงื่อนไข `LOOKUP(USEREMAIL(), "Users", "email", "id") <> [userId]` จะบังคับให้ HR1 ไม่สามารถกดอนุมัติขั้นที่ 2 ให้ใบลาของตัวเองได้ ต้องให้ HR2 สำรองเป็นคนกดเท่านั้น)*

#### ปุ่มที่ 4: `Reject_Leave` (ไม่อนุมัติใบลา)
- **Do this:** `Data: set the values of some columns in this row`
- **Set these columns:** `status` = `"rejected"`
- **Behavior > Only if this condition is true:**
  ```excel
  OR(
    AND([status] = "pending_manager", LOOKUP(USEREMAIL(), "Users", "email", "role") = "manager", LOOKUP(USEREMAIL(), "Users", "email", "department") = [department]),
    AND([status] = "pending_c_level", LOOKUP(USEREMAIL(), "Users", "email", "role") = "c_level"),
    AND([status] = "pending_hr", LOOKUP(USEREMAIL(), "Users", "email", "role") = "hr", LOOKUP(USEREMAIL(), "Users", "email", "id") <> [userId])
  )
  ```

---

### Step 4: ตั้งค่าตาราง `Attendance` (Check-in / Check-out) และหน้า Dashboard "วันนี้ใครอยู่ Office บ้าง"

1. ในตาราง **`Attendance`**:
   - `id`: Initial Value = `"ATT_" & UNIQUEID()`
   - `userId`: Initial Value = `LOOKUP(USEREMAIL(), "Users", "email", "id")`
   - `userName`: Initial Value = `[userId].[name]`
   - `department`: Initial Value = `[userId].[department]`
   - `date`: Initial Value = `TODAY()`
   - `checkInTime`: Initial Value = `TIMENOW()`
   - `workLocation`: Enum (`office`, `wfh`, `wfa`, `offsite`)
     - **Valid_If** (ป้องกันคนยังไม่ผ่านโปรกด Check-in แบบ WFH/WFA):
       ```excel
       IF(
         (HOUR(TODAY() - LOOKUP(USEREMAIL(), "Users", "email", "startDate")) / 24) < 90,
         LIST("office", "offsite"),
         LIST("office", "wfh", "wfa", "offsite")
       )
       ```
2. สร้าง Action ปุ่ม **"กด Check-out เลิกงาน"** บนตาราง `Attendance`:
   - **Set these columns:** `checkOutTime` = `TIMENOW()`
   - **Only if this condition is true:**
     ```excel
     AND(
       [userId] = LOOKUP(USEREMAIL(), "Users", "email", "id"),
       [date] = TODAY(),
       ISBLANK([checkOutTime])
     )
     ```
3. สร้าง Slice ชื่อ **`Today_Office_Status`** (Data > Slices):
   - Source Table: `Attendance`
   - Row filter condition: `[date] = TODAY()`
4. สร้างหน้าจอเมนูหลักทั้ง 4 หน้า (ไปที่เมนู **Views** ด้านซ้าย &rarr; หัวข้อ **Primary Navigation** &rarr; กด **`+`**):
   - **เมนูที่ 1: `ใครอยู่ Office วันนี้`**
     - **For this data:** `Today_Office_Status`
     - **View type:** `deck` หรือ `table`
     - **Position:** `Left most`
     - **Group by:** `workLocation` (จะได้เห็นแยกกลุ่มชัดเจนว่าวันนี้ใครอยู่ `office`, `wfh`, `wfa`, `offsite`)
   - **เมนูที่ 2: `ใบลา & ปฏิบัติงาน`** (สำหรับกดยื่นใบลาและกดอนุมัติใบลา)
     - **For this data:** `LeaveRequests`
     - **View type:** `deck` หรือ `table`
     - **Position:** `Left`
     - **Group by:** `status` (แยกกลุ่มตามสถานะ รออนุมัติ / อนุมัติแล้ว)
   - **เมนูที่ 3: `ปฏิทินวันลา`**
     - **For this data:** `LeaveRequests`
     - **View type:** `calendar`
     - **Position:** `Right`
     - **View Options:** ตั้งค่า Start date = `startDate`, End date = `endDate`, Description = `userName`, Category = `leaveType`
   - **เมนูที่ 4: `พนักงาน & โควต้า`**
     - **For this data:** `Users`
     - **View type:** `deck` หรือ `card`
     - **Position:** `Right most`

---

### Step 5: สร้าง Automation Bot แจ้งเตือน C-Level อัตโนมัติ

1. ไปที่เมนู **Automation > Bots > + New Bot**
2. ตั้งชื่อ Bot: `Notify_C_Level_On_Employee_Or_Manager_Leave`
3. ตั้งค่า **Event**:
   - Event Type: `Data Change` (Adds and Updates)
   - Table: `LeaveRequests`
   - **Condition**:
     ```excel
     AND(
       IN([requesterRole], LIST("employee", "manager")),
       [_THISROW_AFTER].[status] = "approved",
       [_THISROW_BEFORE].[status] <> "approved"
     )
     ```
4. ตั้งค่า **Step (Run a task > Send an email หรือ Send a notification)**:
   - **To:**
     ```excel
     SELECT(Users[email], [role] = "c_level")
     ```
   - **Email Subject:**
     `[แจ้งเตือน C-Level] อนุมัติวันลา/ปฏิบัติงานของ <<[userName]>> (<<[department]>>)`
   - **Email Body:**
     `เรียน ผู้บริหาร (C-Level), พนักงาน <<[userName]>> แผนก <<[department]>> ได้รับการอนุมัติ <<[leaveType]>> ตั้งแต่วันที่ <<[startDate]>> ถึง <<[endDate]>> (รวม <<[totalDays]>> วัน) สถานที่/เหตุผล: <<[locationDetail]>> <<[reason]>>`
