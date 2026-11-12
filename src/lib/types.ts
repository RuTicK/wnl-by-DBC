export type Role = 'employee' | 'manager' | 'hr' | 'c_level' | 'admin';

export const COMPANY_DEPARTMENTS = [
  'AE',
  'สำนักงาน',
  'Consult',
  'Marketing&BD',
] as const;

export type CompanyDepartment = (typeof COMPANY_DEPARTMENTS)[number];

export type LeaveType =
  | 'sick'      // ลาป่วย
  | 'personal'  // ลากิจ
  | 'vacation'  // ลาพักร้อน
  | 'wfh'       // Work From Home (ทำงานที่บ้าน)
  | 'wfa'       // Work From Anywhere (ทำงานนอกบ้าน)
  | 'offsite';  // ทำงานนอกสถานที่ (ไปหาลูกค้า / ประชุมนอกสถานที่ / ออกบูธ)

export type LeaveDuration = 'full' | 'half_morning' | 'half_afternoon';

export type LeaveStatus =
  | 'pending_manager' // รอหัวหน้าแผนกอนุมัติ (ขั้นที่ 1 สำหรับ Employee)
  | 'pending_c_level' // รอผู้บริหาร C-Level อนุมัติ (ขั้นที่ 1 สำหรับ Manager และ HR)
  | 'pending_hr'      // รอฝ่ายบุคคล HR อนุมัติ (ขั้นที่ 2 สำหรับทุกคน / HR2 อนุมัติให้ HR1)
  | 'approved'        // อนุมัติสมบูรณ์ (ตัดโควต้าแล้ว + แจ้งเตือน C-Level)
  | 'rejected'        // ไม่อนุมัติ
  | 'cancelled';      // ยกเลิกแล้ว

export type WorkLocationType = 'office' | 'wfh' | 'wfa' | 'offsite';

export interface LeaveQuotas {
  sick: number;    // ลาป่วย (30 วัน/ปี)
  personal: number;// ลากิจ (3 วัน/ปี)
  vacation: number;// ลาพักร้อน (6 วัน/ปี)
  wfh: number;     // WFH (0 = ไม่จำกัดโควต้า)
  wfa: number;     // WFA (0 = ไม่จำกัดโควต้า)
  offsite: number; // ทำงานนอกสถานที่ (0 = ไม่จำกัดโควต้าเสมอ)
}

/**
 * ข้อมูลพนักงานตามนโยบาย PDPA (Data Minimization):
 * เก็บเฉพาะ EmployeeID, ชื่อภาษาไทย, ชื่อภาษาอังกฤษ (จาก Google Login),
 * Email (จาก Google Login), Role, Department, Position, วันที่เริ่มงาน (สำหรับเช็คผ่านโปร 119 วัน)
 * ไม่เก็บเบอร์โทรศัพท์ ไม่เก็บเลขบัตรประชาชน ไม่เก็บที่อยู่บ้าน และไม่เก็บรหัสผ่านในชีต
 */
export interface User {
  id: string;          // รหัสพนักงาน เช่น EMP001
  name: string;        // ชื่อ-นามสกุล (ภาษาไทย)
  englishName: string; // ชื่อ-นามสกุล (ภาษาอังกฤษ จาก Google Login)
  email: string;       // อีเมล Google Login (ใช้คู่กับ USEREMAIL() ใน AppSheet)
  role: Role;          // 'c_level' | 'hr' | 'manager' | 'employee'
  department: string;  // แผนก
  position: string;    // ตำแหน่ง
  startDate: string;   // วันที่เริ่มงาน YYYY-MM-DD (ใช้ตรวจสอบผ่านโปร 119 วัน)
  quotas: LeaveQuotas;
  username?: string;   // ชื่อผู้ใช้สำรองสำหรับโหมดทดสอบ/อ้างอิง
}

export type SafeUser = User;

export interface ProbationInfo {
  startDate: string;
  daysWorked: number;
  probationDaysRequired: number; // 119 วัน
  daysRemaining: number;
  passed: boolean;
  passDate: string; // YYYY-MM-DD
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string; // ชื่อวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท
}

export interface ApprovalRecord {
  approvedBy: string;
  approvedByName: string;
  approvedAt: string;
  comment?: string;
}

export interface RejectionRecord {
  userId: string;
  userName: string;
  role: Role;
  rejectedAt: string;
  reason: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  requesterRole?: Role;
  department: string;
  leaveType: LeaveType;
  durationType: LeaveDuration;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  totalDays: number; // จำนวนวันสุทธิ (หัก ส.-อา. และวันหยุดนักขัตฤกษ์แล้ว)
  reason: string;
  locationDetail?: string; // สถานที่ปฏิบัติงาน / ชื่อลูกค้า / งานออกบูธ
  attachmentUrl?: string;  // ลิงก์หรือรูปใบรับรองแพทย์ (Base64 / URL)
  attachmentName?: string;
  status: LeaveStatus;
  managerApproval?: ApprovalRecord; // ขั้นที่ 1 โดย Manager (กรณี Employee ลา)
  cLevelApproval?: ApprovalRecord;  // ขั้นที่ 1 โดย C-Level (กรณี Manager หรือ HR1 ลา)
  hrApproval?: ApprovalRecord;      // ขั้นที่ 2 โดย HR (หรือ HR2 กรณี HR1 ลา)
  cLevelNotifiedAt?: string;        // เวลาที่ระบบแจ้งเตือน C-Level
  rejectedBy?: RejectionRecord;
  createdAt: string;
  isRedacted?: boolean; // true เมื่อแสดงให้เพื่อนร่วมแผนกดู (ซ่อนเหตุผลส่วนตัวตาม PDPA)
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  date: string;         // YYYY-MM-DD
  checkInTime: string;  // HH:mm
  checkOutTime?: string;// HH:mm
  workLocation: WorkLocationType; // 'office' | 'wfh' | 'wfa' | 'offsite'
  note?: string;        // หมายเหตุ / ชื่อลูกค้า (ไม่เก็บพิกัด GPS หรือภาพถ่ายใบหน้าตาม PDPA)
}

export interface LeaveCalculationResult {
  totalDays: number;
  calendarDays: number;
  workingDates: string[];
  skippedWeekendDates: string[];
  skippedHolidayDates: { date: string; name: string }[];
  isValid: boolean;
  error?: string;
}

export interface QuotaSummaryItem {
  leaveType: LeaveType;
  label: string;
  totalQuota: number;
  isUnlimited: boolean;
  usedDays: number;             // อนุมัติครบ 2 ขั้นตอนแล้ว (status === 'approved')
  pendingDays: number;          // รออนุมัติ (pending_manager | pending_c_level | pending_hr)
  remainingDays: number;        // totalQuota - usedDays
  availableAfterPending: number;// totalQuota - usedDays - pendingDays
}

export interface EmployeeQuotaOverview {
  user: SafeUser;
  year: number;
  probation: ProbationInfo;
  quotas: Record<LeaveType, QuotaSummaryItem>;
  totalUsed: number;
  totalPending: number;
  totalRemaining: number;
}
