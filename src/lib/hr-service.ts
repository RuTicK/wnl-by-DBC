import {
  calculateLeaveDays,
  calculateUserQuotaSummary,
  checkApprovalPermission,
  checkProbationLeaveEligibility,
  checkRejectionPermission,
  filterLeavesForViewer,
  findOverlappingLeave,
  getInitialLeaveStatus,
  LEAVE_TYPE_META,
  parseDateUTC,
  STANDARD_LEAVE_QUOTAS,
} from './leave-utils';
import {
  attendanceToAppSheetRow,
  DatabaseState,
  getDatabaseState,
  getEffectiveGoogleClientId,
  holidayToAppSheetRow,
  isAppSheetConfigured,
  leaveToAppSheetRow,
  resetLocalDemoStore,
  saveDatabaseState,
  syncToAppSheetTable,
  userToAppSheetRow,
} from './storage';
import {
  AttendanceRecord,
  EmployeeQuotaOverview,
  Holiday,
  LeaveDuration,
  LeaveRequest,
  LeaveType,
  Role,
  SafeUser,
  User,
  WorkLocationType,
} from './types';

export const SUPER_ADMIN_EMAIL = 'rut.wa@digitalbusinessconsult.asia';

export function toSafeUser(user: User): SafeUser {
  return { ...user };
}

export function generateNextEmployeeId(users: User[]): string {
  let maxNum = users.length;
  for (const u of users) {
    const match = /^EMP(\d+)$/i.exec(u.id.trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  let candidateNum = maxNum + 1;
  while (
    users.some(
      (u) =>
        u.id.toLowerCase() ===
        `emp${String(candidateNum).padStart(3, '0')}`
    )
  ) {
    candidateNum += 1;
  }
  return `EMP${String(candidateNum).padStart(3, '0')}`;
}

function recalculateLeaveRequestsForHolidays(state: DatabaseState): void {
  for (const req of state.leaveRequests) {
    if (req.status === 'cancelled' || req.status === 'rejected') continue;
    const calc = calculateLeaveDays(
      req.startDate,
      req.endDate,
      req.durationType,
      state.holidays
    );
    if (calc.isValid && calc.totalDays > 0) {
      req.totalDays = calc.totalDays;
    }
  }
}

export interface VerifiedGoogleProfile {
  email: string;
  englishName: string;
  picture?: string;
}

/**
 * ตรวจสอบ Google OAuth ID Token (credential) หรือ Access Token กับเซิร์ฟเวอร์ Google
 * เพื่อดึง verified email และชื่อภาษาอังกฤษ (English Name) จากบัญชี Google จริง
 */
export async function verifyGoogleOAuthCredentials(input: {
  googleIdToken?: string;
  googleAccessToken?: string;
}): Promise<{
  success: boolean;
  profile?: VerifiedGoogleProfile;
  error?: string;
}> {
  const idToken = input.googleIdToken?.trim();
  const accessToken = input.googleAccessToken?.trim();

  if (idToken) {
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
          idToken
        )}`
      );
      if (!res.ok) {
        return {
          success: false,
          error: 'Google ID Token ไม่ถูกต้องหรือหมดอายุ กรุณาล็อกอินใหม่อีกครั้ง',
        };
      }
      const data = (await res.json()) as {
        aud?: string;
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };

      const expectedClientId = getEffectiveGoogleClientId();
      if (expectedClientId && data.aud && data.aud.trim() !== expectedClientId) {
        return {
          success: false,
          error:
            'Google ID Token ไม่ได้ออกให้กับ Client ID ของระบบนี้ (Audience Mismatch)',
        };
      }

      if (data.email_verified === false || data.email_verified === 'false') {
        return {
          success: false,
          error: 'อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน (Unverified Email)',
        };
      }

      const email = (data.email || '').trim().toLowerCase();
      if (!email) {
        return {
          success: false,
          error: 'ไม่พบข้อมูลอีเมลจาก Google ID Token',
        };
      }
      const englishName = (
        data.name ||
        [data.given_name, data.family_name].filter(Boolean).join(' ') ||
        email.split('@')[0]
      ).trim();

      return {
        success: true,
        profile: {
          email,
          englishName,
          picture: data.picture || undefined,
        },
      };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถตรวจสอบ Google ID Token กับเซิร์ฟเวอร์ Google ได้',
      };
    }
  }

  if (accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        return {
          success: false,
          error: 'Google Access Token ไม่ถูกต้องหรือหมดอายุ กรุณาล็อกอินใหม่อีกครั้ง',
        };
      }
      const data = (await res.json()) as {
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };

      if (data.email_verified === false || data.email_verified === 'false') {
        return {
          success: false,
          error: 'อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน (Unverified Email)',
        };
      }

      const email = (data.email || '').trim().toLowerCase();
      if (!email) {
        return {
          success: false,
          error: 'ไม่พบข้อมูลอีเมลจากบัญชี Google ของคุณ',
        };
      }
      const englishName = (
        data.name ||
        [data.given_name, data.family_name].filter(Boolean).join(' ') ||
        email.split('@')[0]
      ).trim();

      return {
        success: true,
        profile: {
          email,
          englishName,
          picture: data.picture || undefined,
        },
      };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถดึงข้อมูลโปรไฟล์จาก Google OAuth ได้',
      };
    }
  }

  return {
    success: false,
    error: 'ไม่พบ Token สำหรับยืนยันตัวตนจาก Google OAuth',
  };
}

/**
 * รองรับทั้ง Google Login (ดึง email + englishName จากบัญชี Google)
 * และการเข้าสู่ระบบด้วยรหัสพนักงาน / อีเมล / ชื่อผู้ใช้
 */
export async function authenticateUser(
  identifier: string,
  password?: string,
  options?: {
    isGoogleLogin?: boolean;
    googleEmail?: string;
    googleEnglishName?: string;
    googlePicture?: string;
  }
): Promise<{
  success: boolean;
  user?: SafeUser;
  needsOnboarding?: boolean;
  suggestedEmployeeId?: string;
  googleProfile?: VerifiedGoogleProfile;
  unregisteredEmail?: string;
  error?: string;
  mode: 'google_sheets' | 'demo_local';
}> {
  let { state, mode } = await getDatabaseState();

  // กรณี Google Login (ดึง email และชื่อภาษาอังกฤษจาก Google OAuth / USEREMAIL)
  if (options?.isGoogleLogin) {
    const cleanEmail = (options.googleEmail || identifier || '')
      .trim()
      .toLowerCase();
    if (!cleanEmail) {
      return {
        success: false,
        error: 'กรุณาระบุอีเมล Google ของพนักงาน',
        mode,
      };
    }

    const foundByGoogle = state.users.find(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.id.toLowerCase() === cleanEmail ||
        (u.username && u.username.toLowerCase() === cleanEmail)
    );

    if (!foundByGoogle) {
      return {
        success: false,
        needsOnboarding: false,
        unregisteredEmail: cleanEmail,
        error: `ไม่พบบัญชีอีเมล "${cleanEmail}" ในระบบพนักงาน 'วันนี้ลา by DBC' กรุณาติดต่อฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level) เพื่อเพิ่มบัญชีของคุณเข้าสู่ระบบพนักงานก่อนเข้าใช้งาน`,
        mode,
      };
    }

    // หาก Google Login ส่งชื่อภาษาอังกฤษมาด้วย ให้ซิงก์อัปเดตลงโปรไฟล์พนักงานอัตโนมัติ
    const googleEnName = options.googleEnglishName?.trim();
    if (googleEnName) {
      let profileChanged = false;
      if (googleEnName !== foundByGoogle.englishName) {
        foundByGoogle.englishName = googleEnName;
        profileChanged = true;
      }
      const emailPrefix = foundByGoogle.email
        ? foundByGoogle.email.split('@')[0].toLowerCase()
        : '';
      if (
        !foundByGoogle.name?.trim() ||
        (emailPrefix && foundByGoogle.name.trim().toLowerCase() === emailPrefix)
      ) {
        foundByGoogle.name = googleEnName;
        profileChanged = true;
      }

      if (profileChanged) {
        const saved = await saveDatabaseState(state);
        mode = saved.mode;
        await syncToAppSheetTable(
          'Users',
          'Edit',
          [userToAppSheetRow(foundByGoogle)],
          foundByGoogle.email
        );
      }
    }

    return {
      success: true,
      user: toSafeUser(foundByGoogle),
      mode,
    };
  }

  const cleanId = (identifier || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanId || !cleanPass) {
    return {
      success: false,
      error: 'กรุณากรอกอีเมล / รหัสพนักงาน และรหัสผ่าน',
      mode: 'demo_local',
    };
  }

  const found = state.users.find((u) => {
    const emailPrefix = u.email ? u.email.split('@')[0].toLowerCase() : '';
    const emailShortPrefix = emailPrefix.split('.')[0];
    return (
      u.id.toLowerCase() === cleanId ||
      u.email.toLowerCase() === cleanId ||
      (u.username && u.username.toLowerCase() === cleanId) ||
      emailPrefix === cleanId ||
      emailShortPrefix === cleanId ||
      u.englishName.toLowerCase() === cleanId
    );
  });

  // ในโหมดสาธิต รหัสผ่านมาตรฐานคือ 1234 (หรือ GOOGLE_SSO สำหรับ Google Sign-In)
  const isValidPass = cleanPass === '1234' || cleanPass === 'GOOGLE_SSO';

  if (!found || !isValidPass) {
    return {
      success: false,
      error: 'อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง',
      mode,
    };
  }

  return {
    success: true,
    user: toSafeUser(found),
    mode,
  };
}

export interface OnboardGoogleUserInput {
  id?: string;
  name: string;
  englishName: string;
  email: string;
  role?: Role;
  department: string;
  position: string;
  startDate: string;
}

/**
 * ลงทะเบียนพนักงานใหม่ครั้งแรกเมื่อล็อกอินด้วย Google OAuth (PDPA Onboarding)
 * บันทึกลงแท็บ Users ใน Google Sheets ("วันนี้ลา By DBC") และซิงก์เข้า AppSheet ทันที
 */
export async function registerGoogleUser(
  input: OnboardGoogleUserInput
): Promise<{
  success: boolean;
  user?: SafeUser;
  error?: string;
  mode: 'google_sheets' | 'demo_local';
}> {
  const { state, mode } = await getDatabaseState();

  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanName = (input.name || '').trim();
  const cleanDepartment = (input.department || '').trim();
  const cleanPosition = (input.position || '').trim();
  const cleanEnglishName =
    (input.englishName || '').trim() || cleanEmail.split('@')[0] || 'Employee';
  let role: Role = 'employee';
  if (input.role === 'admin') {
    if (cleanEmail !== SUPER_ADMIN_EMAIL) {
      return {
        success: false,
        error: `ตำแหน่ง Admin สงวนสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด (${SUPER_ADMIN_EMAIL}) เท่านั้น`,
        mode,
      };
    }
    role = 'admin';
  } else if (
    input.role &&
    ['employee', 'manager', 'hr', 'c_level'].includes(input.role)
  ) {
    role = input.role;
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      error: 'ไม่พบอีเมลจาก Google Login ที่ถูกต้อง',
      mode,
    };
  }

  if (!cleanName || !cleanDepartment || !cleanPosition) {
    return {
      success: false,
      error:
        'กรุณากรอก ชื่อ-นามสกุลภาษาไทย, แผนก และตำแหน่งงาน ให้ครบถ้วนตามมาตรฐาน PDPA',
      mode,
    };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`;
  const cleanStartDate =
    input.startDate && parseDateUTC(input.startDate.trim())
      ? input.startDate.trim()
      : todayStr;

  // หากมีอีเมลนี้อยู่แล้วในระบบ ให้ซิงก์เฉพาะ englishName โดยไม่เขียนทับข้อมูล HR เดิมของพนักงาน
  const existingByEmail = state.users.find(
    (u) => u.email.toLowerCase() === cleanEmail
  );
  if (existingByEmail) {
    let savedMode = mode;
    if (cleanEnglishName && existingByEmail.englishName !== cleanEnglishName) {
      existingByEmail.englishName = cleanEnglishName;
      const saved = await saveDatabaseState(state);
      savedMode = saved.mode;
      await syncToAppSheetTable(
        'Users',
        'Edit',
        [userToAppSheetRow(existingByEmail)],
        existingByEmail.email
      );
    }
    return {
      success: true,
      user: toSafeUser(existingByEmail),
      mode: savedMode,
    };
  }

  const newId = (input.id || '').trim() || generateNextEmployeeId(state.users);
  if (state.users.some((u) => u.id.toLowerCase() === newId.toLowerCase())) {
    return {
      success: false,
      error: `รหัสพนักงาน "${newId}" มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น (แนะนำ: ${generateNextEmployeeId(
        state.users
      )})`,
      mode,
    };
  }

  const derivedUsername = cleanEmail.split('@')[0].split('.')[0] || newId.toLowerCase();

  const newUser: User = {
    id: newId,
    username: derivedUsername,
    name: cleanName,
    englishName: cleanEnglishName,
    email: cleanEmail,
    role,
    department: cleanDepartment,
    position: cleanPosition,
    startDate: cleanStartDate,
    quotas: { ...STANDARD_LEAVE_QUOTAS },
  };

  state.users.push(newUser);
  const saved = await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Users',
    'Add',
    [userToAppSheetRow(newUser)],
    newUser.email
  );

  return {
    success: true,
    user: toSafeUser(newUser),
    mode: saved.mode,
  };
}

/**
 * สำหรับผู้ใช้งานที่ล็อกอินด้วยบัญชี Google จริง สามารถสลับ Role (employee / manager / hr / c_level)
 * หรือสลับสถานะทดลองงาน 120 วัน (startDate) / แผนก ของบัญชีตัวเอง เพื่อทดสอบสิทธิ์ทุกมุมมองได้ทันที
 */
export async function updateOwnTestingProfile(
  userId: string,
  input: {
    role?: Role;
    startDate?: string;
    department?: string;
    name?: string;
  }
): Promise<{
  success: boolean;
  user?: SafeUser;
  error?: string;
  mode: 'google_sheets' | 'demo_local';
}> {
  const { state, mode } = await getDatabaseState();
  const user = state.users.find((u) => u.id === userId);
  if (!user) {
    return {
      success: false,
      error: 'ไม่พบบัญชีผู้ใช้งานในระบบ',
      mode,
    };
  }

  if (input.role) {
    if (input.role === 'admin') {
      if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
        user.role = 'admin';
      }
    } else if (['employee', 'manager', 'hr', 'c_level'].includes(input.role)) {
      user.role = input.role;
    }
  }

  if (input.startDate && parseDateUTC(input.startDate.trim())) {
    user.startDate = input.startDate.trim();
  }

  if (input.department && input.department.trim()) {
    user.department = input.department.trim();
  }

  if (input.name && input.name.trim()) {
    user.name = input.name.trim();
  }

  for (const req of state.leaveRequests) {
    if (req.userId === user.id) {
      req.userName = user.name;
      req.department = user.department;
    }
  }

  for (const att of state.attendance || []) {
    if (att.userId === user.id) {
      att.userName = user.name;
      att.department = user.department;
    }
  }

  const saved = await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Users',
    'Edit',
    [userToAppSheetRow(user)],
    user.email
  );

  return {
    success: true,
    user: toSafeUser(user),
    mode: saved.mode,
  };
}

export class UserNotFoundError extends Error {
  constructor(message: string = 'ไม่พบข้อมูลผู้ใช้งานในระบบหรือเซสชันหมดอายุ') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export interface DashboardPayload {
  currentUser: SafeUser;
  users: SafeUser[];
  leaves: LeaveRequest[];
  holidays: Holiday[];
  attendance: AttendanceRecord[];
  myQuota: EmployeeQuotaOverview;
  allQuotas: EmployeeQuotaOverview[];
  storageMode: 'google_sheets' | 'demo_local';
  appSheetConfigured?: boolean;
  syncError?: string;
}

export async function getSystemDataForUser(
  viewerId: string,
  year: number = new Date().getFullYear()
): Promise<DashboardPayload> {
  const { state, mode, syncError } = await getDatabaseState();
  const viewer = state.users.find((u) => u.id === viewerId);

  if (!viewer) {
    throw new UserNotFoundError();
  }

  const safeViewer = toSafeUser(viewer);

  const visibleLeaves = filterLeavesForViewer(state.leaveRequests, safeViewer);
  visibleLeaves.sort((a, b) => b.startDate.localeCompare(a.startDate));

  const sortedHolidays = [...state.holidays].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const sortedAttendance = [...(state.attendance || [])].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.checkInTime.localeCompare(b.checkInTime);
  });

  const safeUsers = state.users.map((u) => toSafeUser(u));
  const myQuota = calculateUserQuotaSummary(
    safeViewer,
    state.leaveRequests,
    year,
    state.holidays
  );

  const quotaTargetUsers =
    viewer.role === 'admin' || viewer.role === 'hr' || viewer.role === 'c_level'
      ? safeUsers
      : viewer.role === 'manager'
        ? safeUsers.filter((u) => {
            const viewerDept = (viewer.department || '').trim().toLowerCase();
            const uDept = (u.department || '').trim().toLowerCase();
            return Boolean(viewerDept && uDept && viewerDept === uDept);
          })
        : [safeViewer];

  const allQuotas = quotaTargetUsers.map((u) =>
    calculateUserQuotaSummary(u, state.leaveRequests, year, state.holidays)
  );

  return {
    currentUser: safeViewer,
    users: safeUsers,
    leaves: visibleLeaves,
    holidays: sortedHolidays,
    attendance: sortedAttendance,
    myQuota,
    allQuotas,
    storageMode: mode,
    appSheetConfigured: isAppSheetConfigured(),
    syncError,
  };
}

export interface CreateLeaveInput {
  leaveType: LeaveType;
  durationType: LeaveDuration;
  startDate: string;
  endDate: string;
  reason: string;
  locationDetail?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export async function createLeaveRequest(
  actorId: string,
  input: CreateLeaveInput
): Promise<{
  success: boolean;
  leave?: LeaveRequest;
  error?: string;
}> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (!actor) {
    return { success: false, error: 'ไม่พบผู้ใช้งานในระบบ' };
  }

  if (actor.role === 'employee' && !actor.department?.trim()) {
    return {
      success: false,
      error: 'ไม่พบข้อมูลแผนกของพนักงาน ไม่สามารถส่งคำขออนุมัติไปยังหัวหน้าแผนกได้',
    };
  }

  const reason = (input.reason || '').trim();
  if (!reason) {
    return { success: false, error: 'กรุณาระบุเหตุผลการลา / รายละเอียดงาน' };
  }

  const locationDetail = (input.locationDetail || '').trim();
  if (input.leaveType === 'offsite' && !locationDetail) {
    return {
      success: false,
      error:
        'กรุณาระบุสถานที่ปฏิบัติงาน / ชื่อลูกค้า / งานที่ไปออกบูธ สำหรับการขอทำงานนอกสถานที่',
    };
  }

  const calc = calculateLeaveDays(
    input.startDate,
    input.endDate,
    input.durationType,
    state.holidays
  );

  if (!calc.isValid || calc.totalDays <= 0) {
    return {
      success: false,
      error: calc.error || 'จำนวนวันลาไม่ถูกต้อง',
    };
  }

  // 1. ตรวจสอบเงื่อนไขผ่านทดลองงาน 120 วัน (Probation Check) — ยกเว้น C-Level และ Admin
  if (actor.role !== 'c_level' && actor.role !== 'admin') {
    const probationCheck = checkProbationLeaveEligibility(
      actor.startDate,
      input.leaveType,
      input.startDate
    );
    if (!probationCheck.allowed) {
      return {
        success: false,
        error: probationCheck.error,
      };
    }
  }

  // 2. ตรวจสอบวันลาซ้อนทับกับใบลาเดิม (เทียบเฉพาะวันทำการจริง)
  const overlap = findOverlappingLeave(
    actor.id,
    input.startDate,
    input.endDate,
    input.durationType,
    state.leaveRequests,
    undefined,
    state.holidays
  );

  if (overlap) {
    return {
      success: false,
      error: `คุณมีรายการลา/ปฏิบัติงานนอกสถานที่ในช่วงวันที่ดังกล่าวอยู่แล้ว (${overlap.startDate} ถึง ${overlap.endDate})`,
    };
  }

  // 3. ตรวจสอบโควต้าคงเหลือแยกตามปีที่วันทำการตกอยู่ (ข้ามกรณี isUnlimited เช่น ทำงานนอกสถานที่)
  const daysByYear = new Map<number, number>();
  const dayWeight = input.durationType === 'full' ? 1 : 0.5;
  for (const workDate of calc.workingDates) {
    const y = Number(workDate.slice(0, 4));
    daysByYear.set(y, (daysByYear.get(y) || 0) + dayWeight);
  }

  for (const [targetYear, neededDays] of daysByYear.entries()) {
    const quotaOverview = calculateUserQuotaSummary(
      toSafeUser(actor),
      state.leaveRequests,
      targetYear,
      state.holidays
    );
    const typeQuota = quotaOverview.quotas[input.leaveType];

    if (!typeQuota.isUnlimited && neededDays > typeQuota.availableAfterPending) {
      return {
        success: false,
        error: `โควต้า${LEAVE_TYPE_META[input.leaveType].label}ไม่เพียงพอ (ต้องการใช้ ${neededDays} วันในปี ${targetYear} แต่เหลือที่ขอได้ ${typeQuota.availableAfterPending} วัน จากโควต้าทั้งหมด ${typeQuota.totalQuota} วัน)`,
      };
    }
  }

  const leaveYear = Number(input.startDate.slice(0, 4));
  const nextNum = state.leaveRequests.length + 1;
  const initialStatus = getInitialLeaveStatus(actor.role);

  const newLeave: LeaveRequest = {
    id: `LV-${leaveYear}-${String(nextNum).padStart(3, '0')}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`,
    userId: actor.id,
    userName: actor.name,
    requesterRole: actor.role,
    department: (actor.department || '').trim(),
    leaveType: input.leaveType,
    durationType: input.durationType,
    startDate: input.startDate,
    endDate: input.endDate,
    totalDays: calc.totalDays,
    reason,
    locationDetail: locationDetail || undefined,
    attachmentUrl: input.attachmentUrl?.trim() || undefined,
    attachmentName: input.attachmentName?.trim() || undefined,
    status: initialStatus,
    createdAt: new Date().toISOString(),
  };

  state.leaveRequests.unshift(newLeave);
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'LeaveRequests',
    'Add',
    [leaveToAppSheetRow(newLeave)],
    actor.email
  );

  return { success: true, leave: newLeave };
}

export async function processLeaveAction(
  actorId: string,
  leaveId: string,
  action: 'approve' | 'reject' | 'cancel',
  comment?: string
): Promise<{
  success: boolean;
  leave?: LeaveRequest;
  error?: string;
}> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (!actor) {
    return { success: false, error: 'ไม่พบผู้ใช้งานในระบบ' };
  }

  const leave = state.leaveRequests.find((l) => l.id === leaveId);
  if (!leave) {
    return { success: false, error: 'ไม่พบใบลาที่ระบุ' };
  }

  const safeActor = toSafeUser(actor);
  const nowIso = new Date().toISOString();

  if (action === 'cancel') {
    const isOwner = leave.userId === actor.id;
    const isAdmin =
      actor.role === 'admin' ||
      actor.role === 'hr' ||
      actor.role === 'c_level';

    if (!isOwner && !isAdmin) {
      return { success: false, error: 'คุณไม่มีสิทธิ์ยกเลิกใบลานี้' };
    }
    if (
      isOwner &&
      !isAdmin &&
      leave.status !== 'pending_manager' &&
      leave.status !== 'pending_c_level' &&
      leave.status !== 'pending_hr'
    ) {
      return {
        success: false,
        error: 'พนักงานสามารถยกเลิกได้เฉพาะใบลาที่อยู่ระหว่างรออนุมัติเท่านั้น',
      };
    }

    leave.status = 'cancelled';
    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'LeaveRequests',
      'Edit',
      [leaveToAppSheetRow(leave)],
      actor.email
    );
    return { success: true, leave };
  }

  if (action === 'reject') {
    const perm = checkRejectionPermission(leave, safeActor);
    if (!perm.allowed) {
      return { success: false, error: perm.error };
    }

    leave.status = 'rejected';
    leave.rejectedBy = {
      userId: actor.id,
      userName: actor.name,
      role: actor.role,
      rejectedAt: nowIso,
      reason: (comment || '').trim() || 'ไม่อนุมัติคำขอลา',
    };

    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'LeaveRequests',
      'Edit',
      [leaveToAppSheetRow(leave)],
      actor.email
    );
    return { success: true, leave };
  }

  if (action === 'approve') {
    const perm = checkApprovalPermission(leave, safeActor);
    if (!perm.allowed || !perm.nextStatus || !perm.step) {
      return { success: false, error: perm.error || 'ไม่มีสิทธิ์อนุมัติใบลานี้' };
    }

    if (perm.step === 'manager') {
      leave.status = 'pending_hr';
      leave.managerApproval = {
        approvedBy: actor.id,
        approvedByName: actor.name,
        approvedAt: nowIso,
        comment: comment?.trim() || 'อนุมัติขั้นที่ 1 (หัวหน้าแผนก)',
      };
    } else if (perm.step === 'c_level') {
      leave.status = 'pending_hr';
      leave.cLevelApproval = {
        approvedBy: actor.id,
        approvedByName: actor.name,
        approvedAt: nowIso,
        comment: comment?.trim() || 'อนุมัติขั้นที่ 1 (ผู้บริหาร C-Level)',
      };
    } else if (perm.step === 'hr') {
      leave.status = 'approved';
      leave.hrApproval = {
        approvedBy: actor.id,
        approvedByName: actor.name,
        approvedAt: nowIso,
        comment:
          comment?.trim() ||
          'อนุมัติขั้นที่ 2 (HR ตัดโควต้าสมบูรณ์ & แจ้งเตือน C-Level)',
      };
      leave.cLevelNotifiedAt = nowIso;
    }

    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'LeaveRequests',
      'Edit',
      [leaveToAppSheetRow(leave)],
      actor.email
    );
    return { success: true, leave };
  }

  return { success: false, error: 'คำสั่งไม่ถูกต้อง' };
}

// ============================================================================
// Check-in / Check-out Attendance Service (PDPA Compliant - No GPS / No Photo)
// ============================================================================

export interface CheckInInput {
  date?: string; // YYYY-MM-DD
  checkInTime?: string; // HH:mm
  workLocation: WorkLocationType;
  note?: string;
}

export async function recordCheckIn(
  actorId: string,
  input: CheckInInput
): Promise<{
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (!actor) {
    return { success: false, error: 'ไม่พบผู้ใช้งานในระบบ' };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const targetDate = (input.date || '').trim() || todayStr;
  if (!parseDateUTC(targetDate)) {
    return { success: false, error: 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)' };
  }

  // หากพนักงานยังไม่ผ่านโปร 120 วัน ห้าม Check-in แบบ WFH หรือ WFA
  if (input.workLocation === 'wfh' || input.workLocation === 'wfa') {
    const prob = checkProbationLeaveEligibility(
      actor.startDate,
      input.workLocation,
      targetDate
    );
    if (!prob.allowed) {
      return {
        success: false,
        error: prob.error,
      };
    }
  }

  const note = (input.note || '').trim();
  if (input.workLocation === 'offsite' && !note) {
    return {
      success: false,
      error: 'กรุณาระบุสถานที่ / ชื่อลูกค้า สำหรับการลงเวลาทำงานนอกสถานที่',
    };
  }

  const timeStr = (input.checkInTime || '').trim() || currentHm;

  if (!Array.isArray(state.attendance)) {
    state.attendance = [];
  }

  const existingIdx = state.attendance.findIndex(
    (a) => a.userId === actor.id && a.date === targetDate
  );

  if (existingIdx >= 0) {
    const updated: AttendanceRecord = {
      ...state.attendance[existingIdx],
      userName: actor.name,
      department: actor.department,
      checkInTime: timeStr,
      workLocation: input.workLocation,
      note: note || state.attendance[existingIdx].note,
    };
    state.attendance[existingIdx] = updated;
    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'Attendance',
      'Edit',
      [attendanceToAppSheetRow(updated)],
      actor.email
    );
    return { success: true, record: updated };
  }

  const newRecord: AttendanceRecord = {
    id: `ATT-${targetDate}-${actor.id}`,
    userId: actor.id,
    userName: actor.name,
    department: actor.department,
    date: targetDate,
    checkInTime: timeStr,
    workLocation: input.workLocation,
    note: note || undefined,
  };

  state.attendance.unshift(newRecord);
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Attendance',
    'Add',
    [attendanceToAppSheetRow(newRecord)],
    actor.email
  );
  return { success: true, record: newRecord };
}

export async function recordCheckOut(
  actorId: string,
  input?: { date?: string; checkOutTime?: string; note?: string }
): Promise<{
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (!actor) {
    return { success: false, error: 'ไม่พบผู้ใช้งานในระบบ' };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const targetDate = (input?.date || '').trim() || todayStr;
  const timeStr = (input?.checkOutTime || '').trim() || currentHm;

  if (!Array.isArray(state.attendance)) {
    state.attendance = [];
  }

  const existingIdx = state.attendance.findIndex(
    (a) => a.userId === actor.id && a.date === targetDate
  );

  if (existingIdx === -1) {
    return {
      success: false,
      error: 'คุณยังไม่ได้กด Check-in เข้างานในวันนี้ กรุณากด Check-in ก่อน',
    };
  }

  const existing = state.attendance[existingIdx];
  const updated: AttendanceRecord = {
    ...existing,
    checkOutTime: timeStr,
    note: input?.note?.trim() ? input.note.trim() : existing.note,
  };

  state.attendance[existingIdx] = updated;
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Attendance',
    'Edit',
    [attendanceToAppSheetRow(updated)],
    actor.email
  );
  return { success: true, record: updated };
}

// ============================================================================
// Employee & Holiday Management (PDPA Compliant)
// ============================================================================

export interface UpsertEmployeeInput {
  id?: string;
  username?: string;
  name?: string;
  englishName?: string;
  email?: string;
  role: Role;
  department?: string;
  position?: string;
  startDate?: string;
  quotas?: {
    sick?: number;
    personal?: number;
    vacation?: number;
    wfh?: number;
    wfa?: number;
    offsite?: number;
    other?: number; // legacy fallback
  };
}

export async function upsertEmployee(
  actorId: string,
  input: UpsertEmployeeInput
): Promise<{
  success: boolean;
  user?: SafeUser;
  error?: string;
}> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (
    !actor ||
    (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
  ) {
    return {
      success: false,
      error:
        'เฉพาะฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการข้อมูลพนักงานได้',
    };
  }

  const existingIndex = input.id
    ? state.users.findIndex((u) => u.id === input.id)
    : -1;

  const isExecutive = input.role === 'c_level' || input.role === 'admin';
  const cleanUsername = (input.username || '').trim();
  const candidateEmail = (input.email || '').trim().toLowerCase();

  if (existingIndex < 0 && !candidateEmail && !cleanUsername) {
    return {
      success: false,
      error: 'กรุณากรอกอีเมล Google สำหรับเข้าสู่ระบบ',
    };
  }

  if (candidateEmail && !candidateEmail.includes('@')) {
    return {
      success: false,
      error: 'รูปแบบอีเมล Google ไม่ถูกต้อง',
    };
  }

  const rawDept = (input.department || '').trim();
  const department = isExecutive
    ? rawDept || 'Executive (C-Level)'
    : rawDept;

  if (!isExecutive && !department) {
    return {
      success: false,
      error: 'กรุณาเลือกฝ่าย / แผนกของพนักงาน',
    };
  }

  const rawStartDate = (input.startDate || '').trim();
  if (
    !isExecutive &&
    existingIndex < 0 &&
    (!rawStartDate || !parseDateUTC(rawStartDate))
  ) {
    return {
      success: false,
      error: 'กรุณาระบุวันเริ่มทำงานของพนักงาน',
    };
  }

  const emailPrefix = candidateEmail ? candidateEmail.split('@')[0] : '';
  const name =
    (input.name || '').trim() ||
    (existingIndex >= 0
      ? state.users[existingIndex].name
      : emailPrefix || 'พนักงานใหม่');
  const position =
    (input.position || '').trim() ||
    (existingIndex >= 0
      ? state.users[existingIndex].position
      : isExecutive
        ? 'ผู้บริหารระดับสูง (C-Level)'
        : input.role === 'manager'
          ? 'หัวหน้าฝ่าย'
          : input.role === 'hr'
            ? 'ฝ่ายบุคคล (HR)'
            : 'พนักงาน');

  if (cleanUsername) {
    const duplicateUsername = state.users.find(
      (u, idx) =>
        idx !== existingIndex &&
        u.username &&
        u.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicateUsername) {
      return {
        success: false,
        error: `ชื่อผู้ใช้ "${cleanUsername}" ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น`,
      };
    }
  }

  if (candidateEmail) {
    const duplicateEmail = state.users.find(
      (u, idx) =>
        idx !== existingIndex &&
        u.email &&
        u.email.toLowerCase() === candidateEmail
    );
    if (duplicateEmail) {
      return {
        success: false,
        error: `อีเมล "${input.email?.trim()}" ถูกผูกกับพนักงานรหัส ${duplicateEmail.id} (${duplicateEmail.name}) แล้ว กรุณาใช้อีเมลอื่น`,
      };
    }
  }

  const candidateTargetEmail = (
    existingIndex >= 0 ? state.users[existingIndex].email : input.email || ''
  )
    .trim()
    .toLowerCase();

  if (input.role === 'admin' && candidateTargetEmail !== SUPER_ADMIN_EMAIL) {
    return {
      success: false,
      error: `ตำแหน่ง Admin สงวนสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด (${SUPER_ADMIN_EMAIL}) เท่านั้น`,
    };
  }

  // ป้องกันการลดสิทธิ์บัญชี Super Admin จากผู้อื่น
  if (
    existingIndex >= 0 &&
    state.users[existingIndex].email.toLowerCase() === SUPER_ADMIN_EMAIL &&
    actor.email.toLowerCase() !== SUPER_ADMIN_EMAIL &&
    input.role &&
    input.role !== 'admin'
  ) {
    return {
      success: false,
      error: 'ไม่สามารถเปลี่ยนตำแหน่งหรือลดสิทธิ์ของผู้ดูแลระบบสูงสุดได้',
    };
  }

  const cleanQuotas = {
    sick: STANDARD_LEAVE_QUOTAS.sick,
    personal: STANDARD_LEAVE_QUOTAS.personal,
    vacation: STANDARD_LEAVE_QUOTAS.vacation,
    wfh: 0,
    wfa: 0,
    offsite: 0,
  };

  if (existingIndex >= 0) {
    const current = state.users[existingIndex];
    const updatedEmail =
      input.email !== undefined
        ? input.email.trim().toLowerCase() || current.email
        : current.email;
    const updatedEnglishName =
      input.englishName !== undefined
        ? input.englishName.trim() || current.englishName
        : current.englishName;
    const updatedStartDate = isExecutive
      ? rawStartDate && parseDateUTC(rawStartDate)
        ? rawStartDate
        : ''
      : rawStartDate && parseDateUTC(rawStartDate)
        ? rawStartDate
        : current.startDate;

    const updated: User = {
      ...current,
      username: cleanUsername || current.username,
      name,
      englishName: updatedEnglishName,
      email: updatedEmail,
      role: input.role,
      department,
      position,
      startDate: updatedStartDate,
      quotas: cleanQuotas,
    };
    state.users[existingIndex] = updated;

    for (const req of state.leaveRequests) {
      if (req.userId === updated.id) {
        req.userName = updated.name;
        req.department = updated.department;
        req.requesterRole = updated.role;
      }
    }

    for (const att of state.attendance || []) {
      if (att.userId === updated.id) {
        att.userName = updated.name;
        att.department = updated.department;
      }
    }

    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'Users',
      'Edit',
      [userToAppSheetRow(updated)],
      actor.email
    );
    return { success: true, user: toSafeUser(updated) };
  } else {
    const newId = input.id?.trim() || generateNextEmployeeId(state.users);

    if (state.users.some((u) => u.id.toLowerCase() === newId.toLowerCase())) {
      return {
        success: false,
        error: `รหัสพนักงาน "${newId}" มีอยู่ในระบบแล้ว`,
      };
    }

    const derivedUsername =
      cleanUsername ||
      (candidateEmail.includes('@')
        ? candidateEmail.split('@')[0]
        : newId.toLowerCase());

    const cleanEmail =
      candidateEmail || `${derivedUsername}@company.co.th`;
    const cleanEnglishName = (input.englishName || '').trim();
    const cleanStartDate = isExecutive
      ? rawStartDate && parseDateUTC(rawStartDate)
        ? rawStartDate
        : ''
      : rawStartDate;

    const newUser: User = {
      id: newId,
      username: derivedUsername,
      name,
      englishName: cleanEnglishName,
      email: cleanEmail,
      role: input.role,
      department,
      position,
      startDate: cleanStartDate,
      quotas: cleanQuotas,
    };

    state.users.push(newUser);
    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'Users',
      'Add',
      [userToAppSheetRow(newUser)],
      actor.email
    );
    return { success: true, user: toSafeUser(newUser) };
  }
}

export async function deleteEmployee(
  actorId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (
    !actor ||
    (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
  ) {
    return {
      success: false,
      error:
        'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบพนักงานได้',
    };
  }

  const targetUser = state.users.find((u) => u.id === targetUserId);
  if (targetUser && targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
    return {
      success: false,
      error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด (Admin) ได้',
    };
  }

  if (actor.id === targetUserId) {
    return {
      success: false,
      error: 'ไม่สามารถลบบัญชีของตัวเองที่กำลังใช้งานอยู่ได้',
    };
  }

  const idx = state.users.findIndex((u) => u.id === targetUserId);
  if (idx === -1) {
    return { success: false, error: 'ไม่พบพนักงานที่ต้องการลบ' };
  }

  state.users.splice(idx, 1);
  state.leaveRequests = state.leaveRequests.filter(
    (l) => l.userId !== targetUserId
  );
  state.attendance = (state.attendance || []).filter(
    (a) => a.userId !== targetUserId
  );
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Users',
    'Delete',
    [{ id: targetUserId }],
    actor.email
  );
  return { success: true };
}

export async function upsertHoliday(
  actorId: string,
  input: { id?: string; date: string; name: string }
): Promise<{ success: boolean; holiday?: Holiday; error?: string }> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (
    !actor ||
    (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
  ) {
    return {
      success: false,
      error:
        'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการวันหยุดบริษัทได้',
    };
  }

  const date = (input.date || '').trim();
  const name = (input.name || '').trim();

  if (!parseDateUTC(date) || !name) {
    return {
      success: false,
      error: 'กรุณาระบุวันที่ (YYYY-MM-DD ที่ถูกต้องตามปฏิทิน) และชื่อวันหยุดนักขัตฤกษ์ให้ครบถ้วน',
    };
  }

  const existingIdx = input.id
    ? state.holidays.findIndex((h) => h.id === input.id)
    : state.holidays.findIndex((h) => h.date === date);

  const duplicateDateHoliday = state.holidays.find(
    (h, idx) => idx !== existingIdx && h.date === date
  );
  if (duplicateDateHoliday) {
    return {
      success: false,
      error: `วันที่ ${date} มีวันหยุด "${duplicateDateHoliday.name}" กำหนดไว้แล้ว`,
    };
  }

  if (existingIdx >= 0) {
    state.holidays[existingIdx] = {
      ...state.holidays[existingIdx],
      date,
      name,
    };
    recalculateLeaveRequestsForHolidays(state);
    await saveDatabaseState(state);
    await syncToAppSheetTable(
      'Holidays',
      'Edit',
      [holidayToAppSheetRow(state.holidays[existingIdx])],
      actor.email
    );
    return { success: true, holiday: state.holidays[existingIdx] };
  }

  const newHoliday: Holiday = {
    id: `HOL-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`,
    date,
    name,
  };
  state.holidays.push(newHoliday);
  recalculateLeaveRequestsForHolidays(state);
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Holidays',
    'Add',
    [holidayToAppSheetRow(newHoliday)],
    actor.email
  );
  return { success: true, holiday: newHoliday };
}

export async function deleteHoliday(
  actorId: string,
  holidayId: string
): Promise<{ success: boolean; error?: string }> {
  const { state } = await getDatabaseState();
  const actor = state.users.find((u) => u.id === actorId);
  if (
    !actor ||
    (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
  ) {
    return {
      success: false,
      error:
        'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบวันหยุดบริษัทได้',
    };
  }

  const idx = state.holidays.findIndex((h) => h.id === holidayId);
  if (idx === -1) {
    return { success: false, error: 'ไม่พบวันหยุดที่ต้องการลบ' };
  }

  state.holidays.splice(idx, 1);
  recalculateLeaveRequestsForHolidays(state);
  await saveDatabaseState(state);
  await syncToAppSheetTable(
    'Holidays',
    'Delete',
    [{ id: holidayId }],
    actor.email
  );
  return { success: true };
}

export async function resetDemoData(preserveUserId?: string): Promise<{
  success: boolean;
  preservedUserId?: string;
}> {
  let preserveUser: User | undefined;
  if (preserveUserId) {
    const { state } = await getDatabaseState();
    preserveUser = state.users.find((u) => u.id === preserveUserId);
  }
  const fresh = resetLocalDemoStore(preserveUser);
  if (preserveUser) {
    await saveDatabaseState(fresh);
  }
  return {
    success: true,
    preservedUserId: preserveUser ? preserveUser.id : undefined,
  };
}
