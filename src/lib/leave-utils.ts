import {
  AttendanceRecord,
  EmployeeQuotaOverview,
  Holiday,
  LeaveCalculationResult,
  LeaveDuration,
  LeaveQuotas,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  ProbationInfo,
  QuotaSummaryItem,
  Role,
  SafeUser,
  WorkLocationType,
} from './types';

export const ALL_LEAVE_TYPES: LeaveType[] = [
  'sick',
  'personal',
  'vacation',
  'wfh',
  'wfa',
  'offsite',
];

/**
 * รายการประเภทคำขอที่สามารถยื่นขออนุมัติผ่าน LeaveRequestModal ได้
 * (การทำงานนอกสถานที่ / offsite รวมเข้าสู่ขั้นตอน Check-in โดยตรง ไม่ต้องยื่นขออนุมัติล่วงหน้า)
 */
export const REQUESTABLE_LEAVE_TYPES: LeaveType[] = [
  'sick',
  'personal',
  'vacation',
  'wfh',
  'wfa',
];

/**
 * โควต้ามาตรฐานตายตัวของบริษัท (HR ไม่ต้องตั้งค่าเอง):
 * - ลาป่วย (sick): 30 วัน/ปี
 * - ลากิจ (personal): 3 วัน/ปี
 * - ลาพักร้อน (vacation): 6 วัน/ปี
 * - WFH / WFA / นอกสถานที่ (offsite): ไม่มีโควต้า (ไม่จำกัด / 0 วัน)
 */
export const STANDARD_LEAVE_QUOTAS: LeaveQuotas = {
  sick: 30,
  personal: 3,
  vacation: 6,
  wfh: 0,
  wfa: 0,
  offsite: 0,
};

export const PROBATION_DAYS_REQUIRED = 119;

/**
 * ช่วงทดลองงาน (< 119 วัน):
 * ห้ามกด "ลาพักร้อน (vacation) / Work From Home (wfh) / Work From Anywhere (wfa)"
 * แต่ยังสามารถกด "ลาป่วย (sick) / ทำงานนอกสถานที่ (offsite) / ลากิจฉุกเฉิน (personal)" ได้
 */
export const PROBATION_RESTRICTED_TYPES: LeaveType[] = [
  'vacation',
  'wfh',
  'wfa',
];

/**
 * โดเมนอีเมลของบริษัท (โดเมนหลัก @digitalbusinessconsult.asia และโดเมนลูก @dbcgroup.asia)
 * พนักงาน 1 คนสามารถเข้าสู่ระบบได้จากทั้ง 2 โดเมนโดยใช้ชื่อผู้ใช้ (local-part) เดียวกัน
 * หรือผูกอีเมลที่สอง (secondaryEmail) เข้ากับบัญชีเดียวกันได้
 */
export const COMPANY_EMAIL_DOMAINS = [
  'digitalbusinessconsult.asia',
  'dbcgroup.asia',
] as const;

export const SUPER_ADMIN_EMAIL = 'rut.wa@digitalbusinessconsult.asia';
export const SUPER_ADMIN_ALT_EMAIL = 'rut.wa@dbcgroup.asia';
export const SUPER_ADMIN_EMAILS = [
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_ALT_EMAIL,
] as const;

/**
 * แยกสตริงอีเมล (รองรับกรณีคั่นด้วยจุลภาค อัฒภาค เครื่องหมายทับ หรือช่องว่าง) เป็นรายการอีเมลตัวพิมพ์เล็ก
 */
export function parseEmailList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s/]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * ตรวจสอบรูปแบบอีเมลว่าถูกต้องตามโครงสร้าง local-part@domain.tld หรือไม่
 */
export function isValidEmailFormat(email?: string | null): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0 || atIdx !== trimmed.lastIndexOf('@')) return false;
  const localPart = trimmed.slice(0, atIdx).trim();
  const domain = trimmed.slice(atIdx + 1).trim();
  if (!localPart || !domain) return false;
  if (/\s/.test(localPart) || /\s/.test(domain)) return false;
  if (
    !domain.includes('.') ||
    domain.startsWith('.') ||
    domain.endsWith('.') ||
    domain.includes('..')
  ) {
    return false;
  }
  return true;
}

/**
 * คืนค่าอีเมลคู่ขนานของโดเมนบริษัท (เช่น name@digitalbusinessconsult.asia <-> name@dbcgroup.asia)
 * หากไม่ใช่อีเมลภายใต้โดเมนบริษัท จะคืนค่า null
 */
export function getCompanyAliasEmail(email?: string | null): string | null {
  const list = parseEmailList(email);
  if (list.length === 0) return null;
  const primary = list[0];
  const atIdx = primary.indexOf('@');
  if (atIdx <= 0 || atIdx !== primary.lastIndexOf('@')) return null;

  const localPart = primary.slice(0, atIdx).trim();
  const domain = primary.slice(atIdx + 1).trim();
  if (!localPart || !domain) return null;

  if (domain === 'digitalbusinessconsult.asia') {
    return `${localPart}@dbcgroup.asia`;
  }
  if (domain === 'dbcgroup.asia') {
    return `${localPart}@digitalbusinessconsult.asia`;
  }
  return null;
}

/**
 * คืนค่ารายการอีเมลทั้งหมดที่เทียบเท่ากับอีเมลที่ระบุ (รวมทั้งโดเมนหลักและโดเมนลูกของบริษัท)
 */
export function getEquivalentEmails(rawEmail?: string | null): string[] {
  const list = parseEmailList(rawEmail);
  const result: string[] = [];
  const add = (e: string) => {
    if (e && !result.includes(e)) {
      result.push(e);
    }
  };

  for (const item of list) {
    add(item);
    const atIdx = item.indexOf('@');
    if (atIdx > 0 && atIdx === item.lastIndexOf('@')) {
      const localPart = item.slice(0, atIdx).trim();
      const domain = item.slice(atIdx + 1).trim();
      if (
        localPart &&
        domain &&
        (COMPANY_EMAIL_DOMAINS as readonly string[]).includes(domain)
      ) {
        for (const corpDomain of COMPANY_EMAIL_DOMAINS) {
          add(`${localPart}@${corpDomain}`);
        }
      }
    }
  }

  return result;
}

/**
 * คืนค่ารายการอีเมลทั้งหมดที่พนักงานคนนี้สามารถใช้เข้าสู่ระบบได้
 * (รวม email หลัก, secondaryEmail และอีเมลคู่ขนาน @digitalbusinessconsult.asia / @dbcgroup.asia)
 */
export function getUserEmails(
  user?: {
    email?: string | null;
    secondaryEmail?: string | null;
    aliasEmails?: string[] | null;
  } | null
): string[] {
  if (!user) return [];
  const result: string[] = [];
  const addAll = (raw?: string | null) => {
    for (const e of getEquivalentEmails(raw)) {
      if (!result.includes(e)) {
        result.push(e);
      }
    }
  };

  addAll(user.email);
  addAll(user.secondaryEmail);
  if (Array.isArray(user.aliasEmails)) {
    for (const alias of user.aliasEmails) {
      addAll(alias);
    }
  }
  return result;
}

/**
 * คืนค่ารายการอีเมลเพิ่มเติมของพนักงาน (นอกเหนือจากอีเมลหลักตัวแรก) สำหรับแสดงผลบน UI
 */
export function getAdditionalUserEmails(
  user?: {
    email?: string | null;
    secondaryEmail?: string | null;
    aliasEmails?: string[] | null;
  } | null
): string[] {
  if (!user) return [];
  const primary = parseEmailList(user.email)[0] || '';
  return getUserEmails(user).filter((e) => e !== primary);
}

/**
 * ตรวจสอบว่าอีเมล 2 ค่าเป็นอีเมลเดียวกันหรือเป็นอีเมลคู่ขนานภายใต้โดเมนบริษัทเดียวกันหรือไม่
 */
export function areEmailsEquivalent(
  emailA?: string | null,
  emailB?: string | null
): boolean {
  const setA = getEquivalentEmails(emailA);
  const setB = getEquivalentEmails(emailB);
  if (setA.length === 0 || setB.length === 0) return false;
  return setA.some((a) => setB.includes(a));
}

/**
 * ตรวจสอบว่าพนักงานคนนี้เป็นเจ้าของอีเมลที่ระบุหรือไม่ (รองรับทั้ง 2 โดเมนบริษัทและ secondaryEmail)
 */
export function doesUserMatchEmail(
  user?: {
    email?: string | null;
    secondaryEmail?: string | null;
    aliasEmails?: string[] | null;
  } | null,
  candidateEmail?: string | null
): boolean {
  const userEmails = getUserEmails(user);
  const candidateSet = getEquivalentEmails(candidateEmail);
  if (userEmails.length === 0 || candidateSet.length === 0) return false;
  return userEmails.some((e) => candidateSet.includes(e));
}

/**
 * ตรวจสอบว่าเป็นอีเมลของผู้ดูแลระบบสูงสุด (Super Admin) หรือไม่
 * รองรับทั้ง rut.wa@digitalbusinessconsult.asia และ rut.wa@dbcgroup.asia
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  return areEmailsEquivalent(email, SUPER_ADMIN_EMAIL);
}

/**
 * ตรวจสอบว่าบัญชีผู้ใช้นี้เป็นผู้ดูแลระบบสูงสุด (Super Admin) จากอีเมลหลักหรืออีเมลรองหรือไม่
 */
export function isSuperAdminUser(
  user?: {
    email?: string | null;
    secondaryEmail?: string | null;
    aliasEmails?: string[] | null;
  } | null
): boolean {
  return Boolean(user && doesUserMatchEmail(user, SUPER_ADMIN_EMAIL));
}

/**
 * คำนวณรหัสพนักงานใหม่ถัดไปโดยอัตโนมัติ (เช่น EMP012 จาก EMP011)
 */
export function getNextEmployeeId(users: { id: string }[]): string {
  let maxNum = 0;
  for (const u of users) {
    const match = u.id.match(/^EMP(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  let candidate = maxNum + 1;
  while (
    users.some(
      (u) => u.id.toLowerCase() === `emp${String(candidate).padStart(3, '0')}`
    )
  ) {
    candidate += 1;
  }
  return `EMP${String(candidate).padStart(3, '0')}`;
}

export const LEAVE_TYPE_META: Record<
  LeaveType,
  {
    label: string;
    shortLabel: string;
    category: 'leave' | 'remote_or_offsite';
    requiresLocationDetail?: boolean;
    color: string;
    bgLight: string;
    textColor: string;
    borderColor: string;
    badgeClass: string;
  }
> = {
  sick: {
    label: 'ลาป่วย',
    shortLabel: 'ป่วย',
    category: 'leave',
    color: '#ef4444',
    bgLight: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  personal: {
    label: 'ลากิจ',
    shortLabel: 'กิจ',
    category: 'leave',
    color: '#f59e0b',
    bgLight: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  vacation: {
    label: 'ลาพักร้อน',
    shortLabel: 'พักร้อน',
    category: 'leave',
    color: '#0ea5e9',
    bgLight: 'bg-sky-50',
    textColor: 'text-sky-700',
    borderColor: 'border-sky-200',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  wfh: {
    label: 'Work From Home (ทำงานที่บ้าน)',
    shortLabel: 'WFH',
    category: 'remote_or_offsite',
    color: '#0066ff',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  wfa: {
    label: 'Work From Anywhere (ทำงานต่างจังหวัด/ที่อื่น)',
    shortLabel: 'WFA',
    category: 'remote_or_offsite',
    color: '#8b5cf6',
    bgLight: 'bg-violet-50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-200',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
  },
  offsite: {
    label: 'ทำงานนอกสถานที่ (พบลูกค้า/ประชุม/ออกบูธ)',
    shortLabel: 'นอกสถานที่',
    category: 'remote_or_offsite',
    requiresLocationDetail: true,
    color: '#0d9488',
    bgLight: 'bg-teal-50',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

export const WORK_LOCATION_META: Record<
  WorkLocationType,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeClass: string;
    color: string;
  }
> = {
  office: {
    label: 'เข้า Office (สำนักงาน)',
    shortLabel: 'เข้า Office',
    description: 'ปฏิบัติงานประจำที่ออฟฟิศบริษัท',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    color: '#10b981',
  },
  wfh: {
    label: 'Work From Home (ทำงานที่บ้าน)',
    shortLabel: 'WFH',
    description: 'ปฏิบัติงานออนไลน์จากที่บ้าน',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    color: '#0066ff',
  },
  wfa: {
    label: 'Work From Anywhere (ทำงานต่างจังหวัด/ที่อื่น)',
    shortLabel: 'WFA',
    description: 'ปฏิบัติงานออนไลน์จากต่างจังหวัดหรือสถานที่อื่น',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
    color: '#8b5cf6',
  },
  offsite: {
    label: 'ทำงานนอกสถานที่ (พบลูกค้า/ประชุม/ออกบูธ)',
    shortLabel: 'พบลูกค้า/ออกบูธ',
    description: 'ไปหาลูกค้า ประชุมนอกสถานที่ หรือไปออกบูธ',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    color: '#0d9488',
  },
};

export const DURATION_TYPE_META: Record<
  LeaveDuration,
  { label: string; shortLabel: string; daysWeight: number }
> = {
  full: {
    label: 'เต็มวัน (1 วัน)',
    shortLabel: 'เต็มวัน',
    daysWeight: 1,
  },
  half_morning: {
    label: 'ครึ่งวันเช้า (0.5 วัน)',
    shortLabel: 'ครึ่งเช้า',
    daysWeight: 0.5,
  },
  half_afternoon: {
    label: 'ครึ่งวันบ่าย (0.5 วัน)',
    shortLabel: 'ครึ่งบ่าย',
    daysWeight: 0.5,
  },
};

export const STATUS_META: Record<
  LeaveStatus,
  {
    label: string;
    shortLabel: string;
    stepBadge: string;
    badgeClass: string;
  }
> = {
  pending_manager: {
    label: 'รอหัวหน้าแผนกอนุมัติ (ขั้นที่ 1/2)',
    shortLabel: 'รอหัวหน้า (1/2)',
    stepBadge: 'ขั้นที่ 1/2 (Manager)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  pending_c_level: {
    label: 'รอผู้บริหาร C-Level อนุมัติ (ขั้นที่ 1/2)',
    shortLabel: 'รอ C-Level (1/2)',
    stepBadge: 'ขั้นที่ 1/2 (C-Level)',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  pending_hr: {
    label: 'รอ HR อนุมัติ (ขั้นที่ 2/2)',
    shortLabel: 'รอ HR (2/2)',
    stepBadge: 'ขั้นที่ 2/2 (HR)',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  approved: {
    label: 'อนุมัติสมบูรณ์ (ตัดโควต้า & แจ้ง C-Level แล้ว)',
    shortLabel: 'อนุมัติแล้ว',
    stepBadge: 'สำเร็จ',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  rejected: {
    label: 'ไม่อนุมัติ',
    shortLabel: 'ไม่อนุมัติ',
    stepBadge: 'ถูกปฏิเสธ',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  cancelled: {
    label: 'ยกเลิกแล้ว',
    shortLabel: 'ยกเลิก',
    stepBadge: 'ยกเลิก',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-300',
  },
};

export const ROLE_META: Record<
  Role,
  { label: string; description: string; badgeClass: string }
> = {
  employee: {
    label: 'พนักงานทั่วไป (Employee)',
    description: 'สายอนุมัติ: Employee > Manager > HR (แจ้งเตือน C-Level)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  manager: {
    label: 'หัวหน้าแผนก (Manager)',
    description: 'อนุมัติลูกทีมขั้นที่ 1 • สายการลาตัวเอง: Manager > C-Level > HR',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  hr: {
    label: 'ฝ่ายบุคคล (HR)',
    description: 'อนุมัติขั้นที่ 2 (ตัดโควต้า) • สายการลาตัวเอง: HR1 > C-Level > HR2 สำรอง',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  c_level: {
    label: 'ผู้บริหารระดับสูง (C-Level)',
    description: 'อนุมัติขั้นที่ 1 ให้ Manager และ HR • รับแจ้งเตือนการลาทั้งบริษัท',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  admin: {
    label: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
    description: 'สิทธิ์สูงสุดเข้าถึงทุกหน้าและจัดการทั้งระบบ • เฉพาะคุณรุจน์',
    badgeClass: 'bg-gradient-to-r from-blue-100 via-sky-50 to-amber-100 text-[#0A2540] border-amber-300 font-extrabold shadow-2xs',
  },
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * แปลงสตริง YYYY-MM-DD เป็น UTC Date เพื่อป้องกันปัญหา Timezone คลาดเคลื่อน
 */
export function parseDateUTC(dateStr: string): Date | null {
  if (!DATE_REGEX.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatThaiDate(dateStr: string, short = false): string {
  const dt = parseDateUTC(dateStr);
  if (!dt) return dateStr;
  const thaiMonthsShort = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  const thaiMonthsFull = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  const day = dt.getUTCDate();
  const month = short
    ? thaiMonthsShort[dt.getUTCMonth()]
    : thaiMonthsFull[dt.getUTCMonth()];
  const year = dt.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * ดึงวันและเวลาปัจจุบันตามโซนเวลาประเทศไทย (Asia/Bangkok, UTC+7)
 * เพื่อป้องกันปัญหาเวลาคลาดเคลื่อนเมื่อรันบน Serverless / Vercel (UTC)
 */
export function getBangkokNow(): {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  year: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  let year = '';
  let month = '';
  let day = '';
  let hour = '';
  let minute = '';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    else if (p.type === 'month') month = p.value;
    else if (p.type === 'day') day = p.value;
    else if (p.type === 'hour') hour = p.value;
    else if (p.type === 'minute') minute = p.value;
  }
  if (hour === '24') hour = '00';

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hour}:${minute}`,
    year: parseInt(year, 10),
  };
}

/**
 * คำนวณสถานะการผ่านทดลองงาน 119 วัน จากวันที่เริ่มงาน (startDate)
 */
export function getProbationInfo(
  startDateStr?: string,
  referenceDateStr?: string
): ProbationInfo {
  const fallbackStart = '2023-01-01';
  const cleanStart = startDateStr && parseDateUTC(startDateStr) ? startDateStr : fallbackStart;
  const startDt = parseDateUTC(cleanStart)!;

  const defaultRef = getBangkokNow().dateStr;
  const refDt =
    (referenceDateStr && parseDateUTC(referenceDateStr)) ||
    parseDateUTC(defaultRef)!;

  const diffDays = Math.floor(
    (refDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysWorked = Math.max(0, diffDays);

  const passDt = new Date(startDt.getTime());
  passDt.setUTCDate(passDt.getUTCDate() + PROBATION_DAYS_REQUIRED);
  const passDate = formatDateUTC(passDt);

  const passed = diffDays >= PROBATION_DAYS_REQUIRED;
  const daysRemaining = passed
    ? 0
    : Math.max(0, PROBATION_DAYS_REQUIRED - Math.max(0, diffDays));

  return {
    startDate: cleanStart,
    daysWorked,
    probationDaysRequired: PROBATION_DAYS_REQUIRED,
    daysRemaining,
    passed,
    passDate,
  };
}

/**
 * ตรวจสอบว่าพนักงานที่อยู่ในช่วงทดลองงาน (< 119 วัน) มีสิทธิ์ขอลาประเภทที่เลือกหรือไม่
 */
export function checkProbationLeaveEligibility(
  userStartDate: string | undefined,
  leaveType: LeaveType,
  leaveStartDate: string
): {
  allowed: boolean;
  probation: ProbationInfo;
  error?: string;
} {
  const probation = getProbationInfo(userStartDate, leaveStartDate);
  if (probation.passed) {
    return { allowed: true, probation };
  }

  if (PROBATION_RESTRICTED_TYPES.includes(leaveType)) {
    return {
      allowed: false,
      probation,
      error: `พนักงานอยู่ในช่วงทดลองงานยังไม่ครบ ${PROBATION_DAYS_REQUIRED} วัน (เริ่มงาน ${probation.startDate} • ครบกำหนดผ่านโปร ${probation.passDate}) ยังไม่สามารถขอ "${LEAVE_TYPE_META[leaveType].label}" ได้ (สามารถขอลาป่วย หรือ ทำงานนอกสถานที่ได้)`,
    };
  }

  return { allowed: true, probation };
}

/**
 * คืนค่าสถานะเริ่มต้นของใบลาตามบทบาทของผู้ยื่น:
 * - Employee -> pending_manager (Employee > Manager > HR แจ้งเตือน C-Level)
 * - Manager  -> pending_c_level (Manager > C-Level > HR แจ้งเตือน C-Level)
 * - HR       -> pending_c_level (HR1 > C-Level > HR2 สำรอง)
 * - C-Level  -> pending_hr      (C-Level > HR รับทราบ/บันทึก)
 */
export function getInitialLeaveStatus(requesterRole: Role): LeaveStatus {
  if (requesterRole === 'manager' || requesterRole === 'hr') {
    return 'pending_c_level';
  }
  if (requesterRole === 'c_level' || requesterRole === 'admin') {
    return 'pending_hr';
  }
  return 'pending_manager';
}

export function getApprovalFlowLabel(requesterRole: Role = 'employee'): string {
  switch (requesterRole) {
    case 'admin':
      return 'Admin > HR บันทึกข้อมูล';
    case 'manager':
      return 'Manager > C-Level (ขั้นที่ 1) > HR (ขั้นที่ 2) + แจ้งเตือน C-Level';
    case 'hr':
      return 'HR 1 > C-Level (ขั้นที่ 1) > HR 2 สำรอง (ขั้นที่ 2)';
    case 'c_level':
      return 'C-Level > HR บันทึกข้อมูล';
    default:
      return 'Employee > Manager (ขั้นที่ 1) > HR (ขั้นที่ 2) + แจ้งเตือน C-Level';
  }
}

/**
 * คำนวณจำนวนวันลาสุทธิ โดยตัดวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ออกอัตโนมัติ
 */
export function calculateLeaveDays(
  startDate: string,
  endDate: string,
  durationType: LeaveDuration,
  holidays: Holiday[]
): LeaveCalculationResult {
  const start = parseDateUTC(startDate);
  const end = parseDateUTC(endDate);

  if (!start || !end) {
    return {
      totalDays: 0,
      calendarDays: 0,
      workingDates: [],
      skippedWeekendDates: [],
      skippedHolidayDates: [],
      isValid: false,
      error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)',
    };
  }

  if (start.getTime() > end.getTime()) {
    return {
      totalDays: 0,
      calendarDays: 0,
      workingDates: [],
      skippedWeekendDates: [],
      skippedHolidayDates: [],
      isValid: false,
      error: 'วันสิ้นสุดการลาต้องไม่ก่อนวันเริ่มต้นการลา',
    };
  }

  const diffCalendarDays =
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (diffCalendarDays > 366) {
    return {
      totalDays: 0,
      calendarDays: diffCalendarDays,
      workingDates: [],
      skippedWeekendDates: [],
      skippedHolidayDates: [],
      isValid: false,
      error: 'ช่วงวันลาต้องไม่เกิน 1 ปีต่อครั้ง',
    };
  }

  if (
    (durationType === 'half_morning' || durationType === 'half_afternoon') &&
    startDate !== endDate
  ) {
    return {
      totalDays: 0,
      calendarDays: diffCalendarDays,
      workingDates: [],
      skippedWeekendDates: [],
      skippedHolidayDates: [],
      isValid: false,
      error: 'การลาครึ่งวัน (เช้า/บ่าย) สามารถเลือกได้เฉพาะวันเดียวเท่านั้น',
    };
  }

  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    holidayMap.set(h.date, h.name);
  }

  const workingDates: string[] = [];
  const skippedWeekendDates: string[] = [];
  const skippedHolidayDates: { date: string; name: string }[] = [];

  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    const curStr = formatDateUTC(cursor);
    const dayOfWeek = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      skippedWeekendDates.push(curStr);
    } else if (holidayMap.has(curStr)) {
      skippedHolidayDates.push({
        date: curStr,
        name: holidayMap.get(curStr) || 'วันหยุดบริษัท',
      });
    } else {
      workingDates.push(curStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (workingDates.length === 0) {
    return {
      totalDays: 0,
      calendarDays: diffCalendarDays,
      workingDates,
      skippedWeekendDates,
      skippedHolidayDates,
      isValid: false,
      error:
        'วันที่เลือกตรงกับวันหยุดเสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์ทั้งหมด (0 วันทำการ)',
    };
  }

  const totalDays =
    durationType === 'full' ? workingDates.length : 0.5;

  return {
    totalDays,
    calendarDays: diffCalendarDays,
    workingDates,
    skippedWeekendDates,
    skippedHolidayDates,
    isValid: true,
  };
}

/**
 * ตรวจสอบว่าใบลาที่กำลังจะยื่น ชนกับใบลาเดิมของพนักงานคนเดียวกันหรือไม่
 */
export function findOverlappingLeave(
  userId: string,
  startDate: string,
  endDate: string,
  durationType: LeaveDuration,
  existingLeaves: LeaveRequest[],
  excludeLeaveId?: string,
  holidays: Holiday[] = []
): LeaveRequest | null {
  const activeStatuses: LeaveStatus[] = [
    'pending_manager',
    'pending_c_level',
    'pending_hr',
    'approved',
  ];

  const newCalc = calculateLeaveDays(startDate, endDate, durationType, holidays);
  const newWorkingSet = new Set(
    newCalc.isValid ? newCalc.workingDates : [startDate, endDate]
  );

  for (const req of existingLeaves) {
    if (req.userId !== userId) continue;
    if (excludeLeaveId && req.id === excludeLeaveId) continue;
    if (!activeStatuses.includes(req.status)) continue;

    const isDateOverlap =
      startDate <= req.endDate && endDate >= req.startDate;
    if (!isDateOverlap) continue;

    const reqCalc = calculateLeaveDays(
      req.startDate,
      req.endDate,
      req.durationType,
      holidays
    );
    const reqWorkingDates = reqCalc.isValid
      ? reqCalc.workingDates
      : [req.startDate];

    const sharedWorkingDates = reqWorkingDates.filter((d) =>
      newWorkingSet.has(d)
    );
    if (sharedWorkingDates.length === 0) {
      continue;
    }

    if (
      sharedWorkingDates.length === 1 &&
      durationType !== 'full' &&
      req.durationType !== 'full'
    ) {
      const isComplementaryHalfDay =
        (durationType === 'half_morning' &&
          req.durationType === 'half_afternoon') ||
        (durationType === 'half_afternoon' &&
          req.durationType === 'half_morning');

      if (isComplementaryHalfDay) {
        continue;
      }
    }

    return req;
  }

  return null;
}

/**
 * คำนวณจำนวนวันลาของใบลาที่ตกอยู่ในปีที่ระบุ (รองรับกรณีลาข้ามปี)
 */
export function getLeaveDaysInYear(
  req: LeaveRequest,
  year: number,
  holidays: Holiday[] = []
): number {
  const yearPrefix = `${year}-`;
  const startYear = req.startDate.slice(0, 4);
  const endYear = req.endDate.slice(0, 4);

  if (startYear === endYear) {
    return req.startDate.startsWith(yearPrefix) ? Number(req.totalDays) : 0;
  }

  if (String(year) < startYear || String(year) > endYear) {
    return 0;
  }

  const calc = calculateLeaveDays(
    req.startDate,
    req.endDate,
    req.durationType,
    holidays
  );
  if (!calc.isValid) {
    return req.startDate.startsWith(yearPrefix) ? Number(req.totalDays) : 0;
  }

  const daysInYear = calc.workingDates.filter((d) =>
    d.startsWith(yearPrefix)
  ).length;
  return req.durationType === 'full' ? daysInYear : daysInYear * 0.5;
}

/**
 * แยกจำนวนวันลาของใบลาลงในแต่ละเดือน (0..11) ของปีที่ระบุ
 */
export function getLeaveDaysByMonthInYear(
  req: LeaveRequest,
  year: number,
  holidays: Holiday[] = []
): number[] {
  const monthDays = Array(12).fill(0);
  const yearPrefix = `${year}-`;
  const startYear = req.startDate.slice(0, 4);
  const endYear = req.endDate.slice(0, 4);

  if (String(year) < startYear || String(year) > endYear) {
    return monthDays;
  }

  if (
    startYear === endYear &&
    req.startDate.slice(0, 7) === req.endDate.slice(0, 7)
  ) {
    if (req.startDate.startsWith(yearPrefix)) {
      const m = Number(req.startDate.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        monthDays[m] = Number(req.totalDays);
      }
    }
    return monthDays;
  }

  const calc = calculateLeaveDays(
    req.startDate,
    req.endDate,
    req.durationType,
    holidays
  );
  if (!calc.isValid) {
    if (req.startDate.startsWith(yearPrefix)) {
      const m = Number(req.startDate.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        monthDays[m] = Number(req.totalDays);
      }
    }
    return monthDays;
  }

  const weight = req.durationType === 'full' ? 1 : 0.5;
  for (const d of calc.workingDates) {
    if (d.startsWith(yearPrefix)) {
      const m = Number(d.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        monthDays[m] += weight;
      }
    }
  }
  return monthDays;
}

/**
 * คำนวณโควต้าวันลาและสถานะผ่านโปรของพนักงานรายคนในปีที่ระบุ
 * - สำหรับ 'offsite' (ทำงานนอกสถานที่) หรือ 'wfh'/'wfa' ที่ตั้งค่าโควต้าเป็น 0 จะถือเป็น "ไม่จำกัดโควต้า (isUnlimited = true)"
 */
export function calculateUserQuotaSummary(
  user: SafeUser,
  leaveRequests: LeaveRequest[],
  year: number,
  holidays: Holiday[] = []
): EmployeeQuotaOverview {
  const quotas = {} as Record<LeaveType, QuotaSummaryItem>;
  let totalUsed = 0;
  let totalPending = 0;
  let totalRemaining = 0;

  for (const t of ALL_LEAVE_TYPES) {
    const isUnlimited = t === 'offsite' || t === 'wfh' || t === 'wfa';
    const standardLimit = STANDARD_LEAVE_QUOTAS[t] ?? 0;
    // โควต้ามาตรฐานตายตัวของบริษัท (ป่วย 30 วัน, กิจ 3 วัน, พักร้อน 6 วัน, WFH/WFA/Offsite ไม่จำกัด)
    const totalQuota = isUnlimited ? 0 : standardLimit;

    let usedDays = 0;
    let pendingDays = 0;

    for (const req of leaveRequests) {
      if (req.userId !== user.id) continue;
      if (req.leaveType !== t) continue;

      const daysInTargetYear = getLeaveDaysInYear(req, year, holidays);
      if (daysInTargetYear <= 0) continue;

      if (req.status === 'approved') {
        usedDays += daysInTargetYear;
      } else if (
        req.status === 'pending_manager' ||
        req.status === 'pending_c_level' ||
        req.status === 'pending_hr'
      ) {
        pendingDays += daysInTargetYear;
      }
    }

    const remainingDays = isUnlimited
      ? 999
      : Math.max(0, totalQuota - usedDays);
    const availableAfterPending = isUnlimited
      ? 999
      : Math.max(0, totalQuota - usedDays - pendingDays);

    quotas[t] = {
      leaveType: t,
      label: LEAVE_TYPE_META[t].label,
      totalQuota,
      isUnlimited,
      usedDays,
      pendingDays,
      remainingDays,
      availableAfterPending,
    };

    totalUsed += usedDays;
    totalPending += pendingDays;
    if (!isUnlimited) {
      totalRemaining += remainingDays;
    }
  }

  return {
    user,
    year,
    probation: getProbationInfo(user.startDate),
    quotas,
    totalUsed,
    totalPending,
    totalRemaining,
  };
}

/**
 * กรองและซ่อนข้อมูลใบลาตามบทบาทของผู้ใช้งาน (PDPA Privacy & Visibility Rules):
 * - C-Level & HR: เห็นทั้งบริษัท + เห็นรายละเอียดทั้งหมด
 * - Manager: เห็นทั้งแผนกของตัวเอง + เห็นรายละเอียดของลูกทีมในแผนก
 * - Employee: เห็นของตัวเอง (ครบ) + เห็นเพื่อนในแผนกเดียวกัน (ซ่อนเหตุผลส่วนตัวและไฟล์แนบตาม PDPA)
 */
export function filterLeavesForViewer(
  leaves: LeaveRequest[],
  viewer: SafeUser
): LeaveRequest[] {
  if (viewer.role === 'admin' || viewer.role === 'hr') {
    return leaves.map((l) => ({ ...l, isRedacted: false }));
  }

  if (viewer.role === 'c_level') {
    return leaves
      .filter((l) => {
        if (l.userId === viewer.id) return true;
        if (l.status === 'pending_c_level' && l.targetApproverId) {
          return viewer.id === l.targetApproverId;
        }
        return true;
      })
      .map((l) => ({ ...l, isRedacted: false }));
  }

  if (viewer.role === 'manager') {
    const viewerDept = (viewer.department || '').trim().toLowerCase();
    return leaves
      .filter((l) => {
        if (l.userId === viewer.id) return true;
        const leaveDept = (l.department || '').trim().toLowerCase();
        return Boolean(viewerDept && leaveDept && viewerDept === leaveDept);
      })
      .map((l) => ({ ...l, isRedacted: false }));
  }

  // กรณีพนักงานทั่วไป (employee)
  const viewerDept = (viewer.department || '').trim().toLowerCase();
  return leaves
    .filter((l) => {
      if (l.userId === viewer.id) return true;
      const isActive =
        l.status === 'approved' ||
        l.status === 'pending_manager' ||
        l.status === 'pending_c_level' ||
        l.status === 'pending_hr';
      const leaveDept = (l.department || '').trim().toLowerCase();
      return (
        Boolean(viewerDept && leaveDept && viewerDept === leaveDept) && isActive
      );
    })
    .map((l) => {
      if (l.userId === viewer.id) {
        return { ...l, isRedacted: false };
      }
      return {
        ...l,
        reason: 'เหตุผลส่วนตัว (ซ่อนข้อมูล)',
        attachmentUrl: undefined,
        attachmentName: undefined,
        isRedacted: true,
      };
    });
}

/**
 * ตรวจสอบสิทธิ์ในการกดอนุมัติใบลาตามสายการอนุมัติ 4 บทบาท:
 * 1. ถ้าพนักงานลา: Employee > Manager (ขั้นที่ 1) > HR (ขั้นที่ 2) แจ้งเตือน C-Level
 * 2. ถ้า Manager ลา: Manager > C-Level (ขั้นที่ 1) > HR (ขั้นที่ 2) แจ้งเตือน C-Level
 * 3. ถ้า HR ลา: HR 1 > C-Level (ขั้นที่ 1) > HR 2 สำรอง (ขั้นที่ 2 ห้ามอนุมัติตัวเอง)
 */
export function checkApprovalPermission(
  leave: LeaveRequest,
  actor: SafeUser
): {
  allowed: boolean;
  nextStatus?: LeaveStatus;
  step?: 'manager' | 'c_level' | 'hr';
  error?: string;
} {
  // สิทธิ์สูงสุดสำหรับ Super Admin (คุณรุจน์): สามารถอนุมัติได้ทุกขั้นตอน
  if (actor.role === 'admin') {
    if (leave.status === 'pending_manager') {
      return { allowed: true, nextStatus: 'pending_hr', step: 'manager' };
    }
    if (leave.status === 'pending_c_level') {
      return { allowed: true, nextStatus: 'pending_hr', step: 'c_level' };
    }
    if (leave.status === 'pending_hr') {
      return { allowed: true, nextStatus: 'approved', step: 'hr' };
    }
  }

  // ขั้นที่ 1 สำหรับ Employee: รอหัวหน้าแผนก (pending_manager)
  if (leave.status === 'pending_manager') {
    const actorDept = (actor.department || '').trim().toLowerCase();
    const leaveDept = (leave.department || '').trim().toLowerCase();
    const isDeptManager =
      (actor.role === 'manager' || actor.role === 'c_level') &&
      Boolean(actorDept) &&
      actorDept !== 'executive (c-level)' &&
      actorDept !== 'executive' &&
      actorDept !== 'ผู้บริหาร (c-level)';

    if (isDeptManager) {
      if (actor.id === leave.userId) {
        return {
          allowed: false,
          error: 'ผู้ยื่นใบลาไม่สามารถกดอนุมัติใบลาของตนเองได้',
        };
      }
      if (!leaveDept || actorDept !== leaveDept) {
        return {
          allowed: false,
          error: `เฉพาะหัวหน้าแผนกในสังกัดเท่านั้นที่สามารถอนุมัติขั้นที่ 1 ได้ (หัวหน้าแผนก ${actor.department || '-'} ไม่สามารถอนุมัติใบลาของแผนก ${leave.department || '-'})`,
        };
      }
      return {
        allowed: true,
        nextStatus: 'pending_hr',
        step: 'manager',
      };
    }
    return {
      allowed: false,
      error: 'เฉพาะหัวหน้าแผนกในสังกัดเท่านั้นที่สามารถอนุมัติขั้นที่ 1 ได้ (ระบบจะส่งต่อให้ HR ในขั้นที่ 2 หลังจากหัวหน้าแผนกอนุมัติแล้ว)',
    };
  }

  // ขั้นที่ 1 สำหรับ Manager และ HR: รอ C-Level (pending_c_level)
  if (leave.status === 'pending_c_level') {
    if (actor.role === 'c_level' && actor.id !== leave.userId) {
      if (leave.targetApproverId && actor.id !== leave.targetApproverId) {
        return {
          allowed: false,
          error:
            'ใบลาของหัวหน้าฝ่ายท่านนี้ถูกกำหนดให้ผู้บริหารระดับสูงที่สังกัดเป็นผู้อนุมัติเท่านั้น',
        };
      }
      return {
        allowed: true,
        nextStatus: 'pending_hr',
        step: 'c_level',
      };
    }
    return {
      allowed: false,
      error:
        'ใบลาของหัวหน้าแผนก (Manager) และฝ่ายบุคคล (HR) ต้องได้รับการอนุมัติขั้นที่ 1 จากผู้บริหาร (C-Level) เท่านั้น',
    };
  }

  // ขั้นที่ 2 สำหรับทุกคน: รอ HR (pending_hr)
  if (leave.status === 'pending_hr') {
    if (actor.role === 'hr') {
      // กฎเหล็ก: ถ้า HR1 เป็นคนยื่นลา ต้องให้ HR2 (HR สำรองอีกคน) เป็นคนกดอนุมัติขั้นที่ 2 เท่านั้น!
      if (actor.id === leave.userId) {
        return {
          allowed: false,
          error:
            'ตามขั้นตอน HR1 > C-Level > HR2 ผู้ยื่นใบลาไม่สามารถกดอนุมัติขั้นที่ 2 ให้ตนเองได้ ต้องให้ HR สำรองอีกท่านเป็นผู้กดอนุมัติ',
        };
      }
      return {
        allowed: true,
        nextStatus: 'approved',
        step: 'hr',
      };
    }
    return {
      allowed: false,
      error:
        'ใบลานี้ผ่านการอนุมัติขั้นที่ 1 แล้ว ต้องรอฝ่ายบุคคล (HR) อนุมัติขั้นที่ 2 เท่านั้น',
    };
  }

  return {
    allowed: false,
    error: `ไม่สามารถอนุมัติใบลาที่มีสถานะ "${STATUS_META[leave.status]?.label || leave.status}" ได้`,
  };
}

/**
 * ตรวจสอบสิทธิ์ในการไม่อนุมัติ (Reject) ใบลา
 */
export function checkRejectionPermission(
  leave: LeaveRequest,
  actor: SafeUser
): { allowed: boolean; error?: string } {
  if (leave.userId === actor.id) {
    return {
      allowed: false,
      error: 'ผู้ยื่นใบลาสามารถกดยกเลิกใบลาของตนเองได้โดยตรง',
    };
  }

  // Super Admin (คุณรุจน์) สามารถปฏิเสธใบลาที่ค้างอยู่ได้ทุกใบ
  if (actor.role === 'admin') {
    if (
      leave.status === 'pending_manager' ||
      leave.status === 'pending_c_level' ||
      leave.status === 'pending_hr'
    ) {
      return { allowed: true };
    }
  }

  if (leave.status === 'pending_manager') {
    const actorDept = (actor.department || '').trim().toLowerCase();
    const leaveDept = (leave.department || '').trim().toLowerCase();
    const isDeptManager =
      (actor.role === 'manager' || actor.role === 'c_level') &&
      Boolean(actorDept) &&
      actorDept !== 'executive (c-level)' &&
      actorDept !== 'executive' &&
      actorDept !== 'ผู้บริหาร (c-level)';

    if (isDeptManager) {
      if (actorDept === leaveDept) {
        return { allowed: true };
      }
      return {
        allowed: false,
        error: `คุณไม่มีสิทธิ์ปฏิเสธใบลานี้ (หัวหน้าแผนก ${actor.department || '-'} ไม่สามารถปฏิเสธใบลาของแผนก ${leave.department || '-'})`,
      };
    }
    return {
      allowed: false,
      error: 'เฉพาะหัวหน้าแผนกในสังกัดเท่านั้นที่สามารถปฏิเสธคำขอในขั้นที่ 1 ได้',
    };
  }

  if (leave.status === 'pending_c_level') {
    if (actor.role === 'c_level') {
      if (leave.targetApproverId && actor.id !== leave.targetApproverId) {
        return {
          allowed: false,
          error:
            'ใบลาของหัวหน้าฝ่ายท่านนี้ถูกกำหนดให้ผู้บริหารระดับสูงที่สังกัดเป็นผู้พิจารณาเท่านั้น',
        };
      }
      return { allowed: true };
    }
    return {
      allowed: false,
      error: 'เฉพาะผู้บริหาร (C-Level) เท่านั้นที่สามารถปฏิเสธใบลานี้ในขั้นที่ 1 ได้',
    };
  }

  if (leave.status === 'pending_hr') {
    if (actor.role === 'hr' || actor.role === 'c_level') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: 'เฉพาะฝ่ายบุคคล (HR) เท่านั้นที่สามารถปฏิเสธใบลาในขั้นที่ 2 ได้',
    };
  }

  return {
    allowed: false,
    error: 'ใบลานี้ไม่ได้อยู่ในสถานะรออนุมัติ',
  };
}

/**
 * แปลงค่าข้อความให้อยู่ในรูปแบบ CSV cell ที่ปลอดภัย (ป้องกัน CSV Injection)
 */
export function escapeCsvCell(value: string | number | undefined | null): string {
  const raw = value === undefined || value === null ? '' : String(value);
  const sanitized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (
    sanitized.includes(',') ||
    sanitized.includes('"') ||
    sanitized.includes('\n') ||
    sanitized.includes('\r')
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * สร้างเนื้อหาไฟล์ CSV ประวัติการลาทั้งหมด
 */
export function generateLeavesCsv(leaves: LeaveRequest[]): string {
  const headers = [
    'รหัสใบลา',
    'รหัสพนักงาน',
    'ชื่อ-นามสกุล',
    'แผนก',
    'ประเภทการลา/ปฏิบัติงาน',
    'รูปแบบช่วงเวลา',
    'วันที่เริ่ม',
    'วันที่สิ้นสุด',
    'จำนวนวันสุทธิ',
    'สถานะ',
    'สถานที่/ลูกค้า (ถ้ามี)',
    'เหตุผล/รายละเอียด',
    'ผู้อนุมัติขั้นที่ 1 (Manager/C-Level)',
    'ผู้อนุมัติขั้นที่ 2 (HR)',
    'แจ้งเตือน C-Level เมื่อ',
    'วันที่ยื่นรายการ',
  ];

  const rows = leaves.map((l) => [
    l.id,
    l.userId,
    l.userName,
    l.department,
    LEAVE_TYPE_META[l.leaveType]?.label || l.leaveType,
    DURATION_TYPE_META[l.durationType]?.label || l.durationType,
    l.startDate,
    l.endDate,
    l.totalDays,
    STATUS_META[l.status]?.label || l.status,
    l.locationDetail || '-',
    l.reason,
    l.cLevelApproval?.approvedByName ||
      l.managerApproval?.approvedByName ||
      '-',
    l.hrApproval?.approvedByName || '-',
    l.cLevelNotifiedAt ? l.cLevelNotifiedAt.slice(0, 10) : '-',
    l.createdAt.slice(0, 10),
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * สร้างเนื้อหาไฟล์ CSV สรุปโควต้าวันลาคงเหลือรายบุคคล
 */
export function generateQuotaSummaryCsv(
  overviews: EmployeeQuotaOverview[]
): string {
  const headers = [
    'รหัสพนักงาน',
    'ชื่อภาษาไทย',
    'ชื่อภาษาอังกฤษ',
    'อีเมล (Google Login)',
    'แผนก',
    'ตำแหน่ง',
    'วันที่เริ่มงาน',
    'สถานะผ่านโปร (119 วัน)',
    'ปี',
    'โควต้าลาป่วย',
    'ใช้ไป (ลาป่วย)',
    'คงเหลือ (ลาป่วย)',
    'โควต้าลากิจ',
    'ใช้ไป (ลากิจ)',
    'คงเหลือ (ลากิจ)',
    'โควต้าลาพักร้อน',
    'ใช้ไป (ลาพักร้อน)',
    'คงเหลือ (ลาพักร้อน)',
    'ใช้ไป (WFH)',
    'ใช้ไป (WFA)',
    'ใช้ไป (ทำงานนอกสถานที่)',
    'รวมวันลา/ปฏิบัติงานนอกสถานที่ทั้งหมด',
    'รวมรออนุมัติ',
  ];

  const rows = overviews.map((o) => [
    o.user.id,
    o.user.name,
    o.user.englishName,
    o.user.email,
    o.user.department,
    o.user.position,
    o.user.startDate,
    o.probation.passed
      ? 'ผ่านทดลองงานแล้ว'
      : `ทดลองงาน (เหลือ ${o.probation.daysRemaining} วัน)`,
    o.year,
    o.quotas.sick.totalQuota,
    o.quotas.sick.usedDays,
    o.quotas.sick.remainingDays,
    o.quotas.personal.totalQuota,
    o.quotas.personal.usedDays,
    o.quotas.personal.remainingDays,
    o.quotas.vacation.totalQuota,
    o.quotas.vacation.usedDays,
    o.quotas.vacation.remainingDays,
    o.quotas.wfh.usedDays,
    o.quotas.wfa.usedDays,
    o.quotas.offsite.usedDays,
    o.totalUsed,
    o.totalPending,
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * สร้างเนื้อหาไฟล์ CSV ประวัติการ Check-in / Check-out (PDPA Compliant)
 */
export function generateAttendanceCsv(records: AttendanceRecord[]): string {
  const headers = [
    'รหัสลงเวลา',
    'วันที่',
    'รหัสพนักงาน',
    'ชื่อ-นามสกุล',
    'แผนก',
    'เวลา Check-in',
    'เวลา Check-out',
    'สถานที่ปฏิบัติงาน',
    'หมายเหตุ / รายละเอียดลูกค้า',
  ];

  const rows = records.map((r) => [
    r.id,
    r.date,
    r.userId,
    r.userName,
    r.department,
    r.checkInTime,
    r.checkOutTime || '-',
    WORK_LOCATION_META[r.workLocation]?.label || r.workLocation,
    r.note || '-',
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];

  return '\uFEFF' + lines.join('\r\n');
}
