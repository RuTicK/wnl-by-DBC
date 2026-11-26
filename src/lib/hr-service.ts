import {
  ALL_LEAVE_TYPES,
  areEmailsEquivalent,
  calculateLeaveDays,
  calculateUserQuotaSummary,
  checkApprovalPermission,
  checkProbationLeaveEligibility,
  checkRejectionPermission,
  COMPANY_EMAIL_DOMAINS,
  doesUserMatchEmail,
  DURATION_TYPE_META,
  ENABLE_WFA,
  extractWfhMeetLinkAndNote,
  filterLeavesForViewer,
  findOverlappingLeave,
  formatThaiDate,
  getAdditionalUserEmails,
  getBangkokNow,
  getCompanyAliasEmail,
  getEquivalentEmails,
  getInitialLeaveStatus,
  getUserEmails,
  isSuperAdminEmail,
  isSuperAdminUser,
  isValidEmailFormat,
  LEAVE_TYPE_META,
  normalizeAndValidateMeetLink,
  parseDateUTC,
  parseEmailList,
  STANDARD_LEAVE_QUOTAS,
  SUPER_ADMIN_ALT_EMAIL,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_EMAILS,
} from './leave-utils';
import {
  attendanceToAppSheetRow,
  attendanceToRow,
  DatabaseState,
  getDatabaseState,
  getEffectiveGoogleChatWebhookUrl,
  getEffectiveGoogleChatWebhookUrl2,
  getEffectiveGoogleClientId,
  getStorageMode,
  holidayToAppSheetRow,
  holidayToRow,
  isAppSheetConfigured,
  isGoogleSheetsConfigured,
  isValidGoogleChatWebhookUrl,
  leaveToAppSheetRow,
  leaveToRow,
  resetLocalDemoStore,
  saveDatabaseState,
  SheetMutation,
  syncToAppSheetTable,
  userToAppSheetRow,
  userToRow,
  withDatabaseLock,
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

export {
  areEmailsEquivalent,
  COMPANY_EMAIL_DOMAINS,
  doesUserMatchEmail,
  getAdditionalUserEmails,
  getCompanyAliasEmail,
  getEquivalentEmails,
  getUserEmails,
  isSuperAdminEmail,
  isSuperAdminUser,
  isValidEmailFormat,
  parseEmailList,
  SUPER_ADMIN_ALT_EMAIL,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_EMAILS,
};

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

function recalculateLeaveRequestsForHolidays(state: DatabaseState): LeaveRequest[] {
  const updatedLeaves: LeaveRequest[] = [];
  for (const req of state.leaveRequests) {
    if (req.status === 'cancelled' || req.status === 'rejected') continue;
    const calc = calculateLeaveDays(
      req.startDate,
      req.endDate,
      req.durationType,
      state.holidays
    );
    if (calc.isValid && calc.totalDays > 0 && req.totalDays !== calc.totalDays) {
      req.totalDays = calc.totalDays;
      updatedLeaves.push(req);
    }
  }
  return updatedLeaves;
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

  const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  if (idToken) {
    try {
      const res = await fetchWithTimeout(
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
        iss?: string;
        aud?: string;
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };

      if (
        data.iss &&
        data.iss !== 'accounts.google.com' &&
        data.iss !== 'https://accounts.google.com'
      ) {
        return {
          success: false,
          error: 'Google ID Token ไม่ได้ออกโดย Google (Invalid Issuer)',
        };
      }

      const expectedClientId = getEffectiveGoogleClientId();
      if (expectedClientId && (!data.aud || data.aud.trim() !== expectedClientId)) {
        return {
          success: false,
          error:
            'Google ID Token ไม่ได้ออกให้กับ Client ID ของระบบนี้ (Audience Mismatch)',
        };
      }

      if (data.email_verified !== true && data.email_verified !== 'true') {
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
      const expectedClientId = getEffectiveGoogleClientId();
      if (expectedClientId) {
        const tokenInfoRes = await fetchWithTimeout(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(
            accessToken
          )}`
        );
        if (!tokenInfoRes.ok) {
          return {
            success: false,
            error: 'Google Access Token ไม่ถูกต้องหรือหมดอายุ กรุณาล็อกอินใหม่อีกครั้ง',
          };
        }
        const tokenInfo = (await tokenInfoRes.json()) as {
          aud?: string;
          azp?: string;
        };
        const tokenAud = (tokenInfo.aud || tokenInfo.azp || '').trim();
        if (!tokenAud || tokenAud !== expectedClientId) {
          return {
            success: false,
            error:
              'Google Access Token ไม่ได้ออกให้กับ Client ID ของระบบนี้ (Audience Mismatch)',
          };
        }
      }

      const res = await fetchWithTimeout(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
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

      if (data.email_verified !== true && data.email_verified !== 'true') {
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
 * รองรับเฉพาะ Google Login ที่ยืนยันตัวตนแล้ว (ดึง email + englishName จากบัญชี Google)
 * ไม่อนุญาตการเข้าสู่ระบบด้วยรหัสผ่านมาตรฐาน (เช่น 1234 / GOOGLE_SSO) เพื่อความปลอดภัย
 */
export async function authenticateUser(
  identifier: string,
  _password?: string,
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
  if (!options?.isGoogleLogin) {
    return {
      success: false,
      error:
        'ระบบรองรับการเข้าสู่ระบบด้วยบัญชี Google (Google Sign-In) เท่านั้น ไม่รองรับการเข้าสู่ระบบด้วยรหัสผ่าน',
      mode: getStorageMode(),
    };
  }

  const cleanEmail = (options.googleEmail || identifier || '')
    .trim()
    .toLowerCase();
  if (!cleanEmail) {
    return {
      success: false,
      error: 'กรุณาระบุอีเมล Google ของพนักงาน',
      mode: getStorageMode(),
    };
  }

  let syncAppSheetUser: User | null = null;
  const result = await withDatabaseLock(async () => {
    let { state, mode } = await getDatabaseState();

    const foundByGoogle = state.users.find((u) =>
      doesUserMatchEmail(u, cleanEmail)
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

    // หาก Google Login ส่งชื่อภาษาอังกฤษ หรือรูปภาพโปรไฟล์มาด้วย ให้ซิงก์อัปเดตลงโปรไฟล์พนักงานอัตโนมัติ
    let profileChanged = false;
    const modifiedLeaves: LeaveRequest[] = [];
    const modifiedAttendance: AttendanceRecord[] = [];

    const googleEnName = options.googleEnglishName?.trim();
    if (googleEnName) {
      if (googleEnName !== foundByGoogle.englishName) {
        foundByGoogle.englishName = googleEnName;
        profileChanged = true;
      }
      const knownPrefixes = getUserEmails(foundByGoogle)
        .map((e) => e.split('@')[0]?.toLowerCase())
        .filter(Boolean);
      if (
        !foundByGoogle.name?.trim() ||
        knownPrefixes.includes(foundByGoogle.name.trim().toLowerCase())
      ) {
        foundByGoogle.name = googleEnName;
        profileChanged = true;
        for (const req of state.leaveRequests) {
          if (req.userId === foundByGoogle.id && req.userName !== foundByGoogle.name) {
            req.userName = foundByGoogle.name;
            modifiedLeaves.push(req);
          }
        }
        for (const att of state.attendance || []) {
          if (att.userId === foundByGoogle.id && att.userName !== foundByGoogle.name) {
            att.userName = foundByGoogle.name;
            modifiedAttendance.push(att);
          }
        }
      }
    }

    const googlePic = options.googlePicture?.trim();
    if (googlePic && googlePic !== foundByGoogle.avatarUrl) {
      foundByGoogle.avatarUrl = googlePic;
      profileChanged = true;
    }

    if (profileChanged) {
      const mutations: SheetMutation[] = [
        {
          type: 'upsertById',
          tab: 'Users',
          items: [{ id: foundByGoogle.id, row: userToRow(foundByGoogle) }],
        },
      ];
      if (modifiedLeaves.length > 0) {
        mutations.push({
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: modifiedLeaves.map((l) => ({ id: l.id, row: leaveToRow(l) })),
        });
      }
      if (modifiedAttendance.length > 0) {
        mutations.push({
          type: 'upsertById',
          tab: 'Attendance',
          items: modifiedAttendance.map((a) => ({
            id: a.id,
            row: attendanceToRow(a),
          })),
        });
      }

      const saved = await saveDatabaseState(state, mutations);
      mode = saved.mode;
      syncAppSheetUser = { ...foundByGoogle };
    }

    return {
      success: true,
      user: toSafeUser(foundByGoogle),
      mode,
    };
  });

  if (syncAppSheetUser) {
    const userToSync: User = syncAppSheetUser;
    await syncToAppSheetTable(
      'Users',
      'Edit',
      [userToAppSheetRow(userToSync)],
      userToSync.email
    );
  }

  return result;
}

/**
 * Helper สำหรับเข้าสู่ระบบด้วยโปรไฟล์ Google โดยตรง (รองรับทั้ง @digitalbusinessconsult.asia และ @dbcgroup.asia)
 */
export async function loginWithGoogleProfile(
  profileOrEmail:
    | string
    | {
        email: string;
        englishName?: string;
        name?: string;
        picture?: string;
        avatarUrl?: string;
      },
  englishName?: string,
  picture?: string
) {
  const email =
    typeof profileOrEmail === 'string'
      ? profileOrEmail
      : profileOrEmail?.email || '';
  const resolvedEnglishName =
    typeof profileOrEmail === 'string'
      ? englishName
      : profileOrEmail?.englishName || profileOrEmail?.name;
  const resolvedPicture =
    typeof profileOrEmail === 'string'
      ? picture
      : profileOrEmail?.picture || profileOrEmail?.avatarUrl;

  return authenticateUser(email, undefined, {
    isGoogleLogin: true,
    googleEmail: email,
    googleEnglishName: resolvedEnglishName,
    googlePicture: resolvedPicture,
  });
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
  let appSheetAction: { action: 'Add' | 'Edit'; user: User } | null = null;

  const result = await withDatabaseLock(async () => {
    const { state, mode } = await getDatabaseState();

    const parsedEmails = parseEmailList(input.email);
    const cleanEmail = parsedEmails[0] || '';
    const cleanSecondaryEmail =
      parsedEmails[1] && parsedEmails[1] !== cleanEmail
        ? parsedEmails[1]
        : undefined;
    const cleanName = (input.name || '').trim();
    const cleanDepartment = (input.department || '').trim();
    const cleanPosition = (input.position || '').trim();
    const cleanEnglishName =
      (input.englishName || '').trim() || cleanEmail.split('@')[0] || 'Employee';
    let role: Role = 'employee';
    if (input.role === 'admin') {
      if (!isSuperAdminEmail(cleanEmail) && !isSuperAdminEmail(cleanSecondaryEmail)) {
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

    if (
      !cleanEmail ||
      !isValidEmailFormat(cleanEmail) ||
      parsedEmails.some((e) => !isValidEmailFormat(e))
    ) {
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

    const todayStr = getBangkokNow().dateStr;
    const cleanStartDate =
      input.startDate && parseDateUTC(input.startDate.trim())
        ? input.startDate.trim()
        : todayStr;

    const existingByEmail = state.users.find(
      (u) =>
        doesUserMatchEmail(u, cleanEmail) ||
        (cleanSecondaryEmail && doesUserMatchEmail(u, cleanSecondaryEmail))
    );
    if (existingByEmail) {
      let savedMode = mode;
      if (cleanEnglishName && existingByEmail.englishName !== cleanEnglishName) {
        existingByEmail.englishName = cleanEnglishName;
        const saved = await saveDatabaseState(state, [
          {
            type: 'upsertById',
            tab: 'Users',
            items: [{ id: existingByEmail.id, row: userToRow(existingByEmail) }],
          },
        ]);
        savedMode = saved.mode;
        appSheetAction = { action: 'Edit', user: { ...existingByEmail } };
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
      ...(cleanSecondaryEmail ? { secondaryEmail: cleanSecondaryEmail } : {}),
      role,
      department: cleanDepartment,
      position: cleanPosition,
      startDate: cleanStartDate,
      quotas: { ...STANDARD_LEAVE_QUOTAS },
    };

    state.users.push(newUser);
    const saved = await saveDatabaseState(state, [
      {
        type: 'append',
        tab: 'Users',
        rows: [userToRow(newUser)],
      },
    ]);
    appSheetAction = { action: 'Add', user: { ...newUser } };

    return {
      success: true,
      user: toSafeUser(newUser),
      mode: saved.mode,
    };
  });

  if (appSheetAction) {
    const syncInfo: { action: 'Add' | 'Edit'; user: User } = appSheetAction;
    await syncToAppSheetTable(
      'Users',
      syncInfo.action,
      [userToAppSheetRow(syncInfo.user)],
      syncInfo.user.email
    );
  }

  return result;
}

/**
 * ปิดการใช้งานฟีเจอร์เปลี่ยนสิทธิ์ของตัวเองเพื่อความปลอดภัย (Privilege Escalation Prevention)
 * การเปลี่ยนบทบาท/แผนก/วันเริ่มงาน ต้องดำเนินการโดย HR / C-Level / Admin ผ่าน upsertEmployee เท่านั้น
 */
export async function updateOwnTestingProfile(
  _userId: string,
  _input: {
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
  return {
    success: false,
    error:
      'ไม่อนุญาตให้เปลี่ยนสิทธิ์หรือข้อมูลพนักงานด้วยตนเอง กรุณาติดต่อฝ่ายบุคคล (HR) หรือผู้ดูแลระบบ (Admin)',
    mode: getStorageMode(),
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
  year: number = new Date().getFullYear(),
  preloaded?: {
    state: DatabaseState;
    mode: 'google_sheets' | 'demo_local';
    syncError?: string;
  }
): Promise<DashboardPayload> {
  const { state, mode, syncError } = preloaded ?? (await getDatabaseState());
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
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (!actor) {
      return { success: false as const, error: 'ไม่พบผู้ใช้งานในระบบ' };
    }

    if (actor.role === 'employee' && !actor.department?.trim()) {
      return {
        success: false as const,
        error: 'ไม่พบข้อมูลแผนกของพนักงาน ไม่สามารถส่งคำขออนุมัติไปยังหัวหน้าแผนกได้',
      };
    }

    const leaveType = String(input.leaveType || '')
      .trim()
      .toLowerCase() as LeaveType;
    if (!ALL_LEAVE_TYPES.includes(leaveType)) {
      return {
        success: false as const,
        error: 'ประเภทการลาไม่ถูกต้อง',
      };
    }

    const durationType = String(input.durationType || '')
      .trim()
      .toLowerCase() as LeaveDuration;
    if (
      durationType !== 'full' &&
      durationType !== 'half_morning' &&
      durationType !== 'half_afternoon'
    ) {
      return {
        success: false as const,
        error: 'รูปแบบช่วงเวลาการลาไม่ถูกต้อง',
      };
    }

    if (leaveType === 'wfa' && !ENABLE_WFA) {
      return {
        success: false as const,
        error: 'ระบบ Work From Anywhere (WFA) ปิดใช้งานชั่วคราว',
      };
    }

    if (leaveType === 'wfh') {
      return {
        success: false as const,
        error:
          'การทำงานที่บ้าน (WFH) ไม่ต้องยื่นใบขออนุมัติล่วงหน้า กรุณากด Check-in (WFH) พร้อมแนบลิงก์ Google Meet ในหน้าลงเวลาเข้างาน',
      };
    }

    const reason = (input.reason || '').trim();
    if (!reason) {
      return { success: false as const, error: 'กรุณาระบุเหตุผลการลา / รายละเอียดงาน' };
    }

    const locationDetail = (input.locationDetail || '').trim();
    if (leaveType === 'offsite' && !locationDetail) {
      return {
        success: false as const,
        error:
          'กรุณาระบุสถานที่ปฏิบัติงาน / ชื่อลูกค้า / งานที่ไปออกบูธ สำหรับการขอทำงานนอกสถานที่',
      };
    }

    const calc = calculateLeaveDays(
      input.startDate,
      input.endDate,
      durationType,
      state.holidays
    );

    if (!calc.isValid || calc.totalDays <= 0) {
      return {
        success: false as const,
        error: calc.error || 'จำนวนวันลาไม่ถูกต้อง',
      };
    }

    // 1. ตรวจสอบเงื่อนไขผ่านทดลองงาน 119 วัน (Probation Check) — ยกเว้น C-Level และ Admin
    if (actor.role !== 'c_level' && actor.role !== 'admin') {
      const probationCheck = checkProbationLeaveEligibility(
        actor.startDate,
        leaveType,
        input.startDate
      );
      if (!probationCheck.allowed) {
        return {
          success: false as const,
          error: probationCheck.error,
        };
      }
    }

    // 2. ตรวจสอบวันลาซ้อนทับกับใบลาเดิม (เทียบเฉพาะวันทำการจริง)
    const overlap = findOverlappingLeave(
      actor.id,
      input.startDate,
      input.endDate,
      durationType,
      state.leaveRequests,
      undefined,
      state.holidays
    );

    if (overlap) {
      return {
        success: false as const,
        error: `คุณมีรายการลา/ปฏิบัติงานนอกสถานที่ในช่วงวันที่ดังกล่าวอยู่แล้ว (${overlap.startDate} ถึง ${overlap.endDate})`,
      };
    }

    // 3. ตรวจสอบโควต้าคงเหลือแยกตามปีที่วันทำการตกอยู่ (ข้ามกรณี isUnlimited เช่น ทำงานนอกสถานที่)
    const daysByYear = new Map<number, number>();
    const dayWeight = durationType === 'full' ? 1 : 0.5;
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
      const typeQuota = quotaOverview.quotas[leaveType];

      if (!typeQuota.isUnlimited && neededDays > typeQuota.availableAfterPending) {
        return {
          success: false as const,
          error: `โควต้า${LEAVE_TYPE_META[leaveType].label}ไม่เพียงพอ (ต้องการใช้ ${neededDays} วันในปี ${targetYear} แต่เหลือที่ขอได้ ${typeQuota.availableAfterPending} วัน จากโควต้าทั้งหมด ${typeQuota.totalQuota} วัน)`,
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
      leaveType,
      durationType,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: calc.totalDays,
      reason,
      locationDetail: locationDetail || undefined,
      attachmentUrl: input.attachmentUrl?.trim() || undefined,
      attachmentName: input.attachmentName?.trim() || undefined,
      status: initialStatus,
      targetApproverId:
        actor.role === 'manager'
          ? actor.cLevelApproverId?.trim() || undefined
          : undefined,
      createdAt: new Date().toISOString(),
    };

    state.leaveRequests.unshift(newLeave);
    await saveDatabaseState(state, [
      {
        type: 'append',
        tab: 'LeaveRequests',
        rows: [leaveToRow(newLeave)],
      },
    ]);

    return {
      success: true as const,
      leave: newLeave,
      actor: { ...actor },
      usersSnapshot: [...state.users],
    };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'LeaveRequests',
    'Add',
    [leaveToAppSheetRow(lockedRes.leave)],
    lockedRes.actor.email
  );
  if (isNotifiableLeaveType(lockedRes.leave.leaveType)) {
    await sendGoogleChatLeaveNotification(
      lockedRes.leave,
      'created',
      lockedRes.actor,
      lockedRes.usersSnapshot
    );
  }

  return { success: true, leave: lockedRes.leave };
}

/**
 * ตรวจสอบว่าเป็นประเภทคำขอที่ต้องแจ้งเตือนเข้า Google Chat หรือไม่
 * (แจ้งเตือน: ลาป่วย, ลากิจ, ลาพักร้อน, Work From Home, ทำงานนอกสถานที่/พบลูกค้า)
 * ยังไม่รวม WFA (Work From Anywhere)
 */
export function isNotifiableLeaveType(leaveType: LeaveType): boolean {
  return (
    leaveType === 'sick' ||
    leaveType === 'personal' ||
    leaveType === 'vacation' ||
    leaveType === 'wfh' ||
    leaveType === 'offsite'
  );
}

/**
 * ส่งข้อความไปยัง Google Chat Incoming Webhook หลายห้องพร้อมกันอย่างปลอดภัย
 * - ตัด URL ว่างและ URL ซ้ำออกอัตโนมัติ
 * - แยก timeout และ error handling อิสระต่อกัน หากห้องใดล้มเหลว ห้องอื่นยังคงได้รับข้อความตามปกติ
 */
async function postToGoogleChatWebhooks(
  webhookUrls: string[],
  text: string
): Promise<{ sent: boolean; error?: string }> {
  const uniqueTargets = Array.from(
    new Set(
      webhookUrls
        .map((u) => (u || '').trim())
        .filter((u) => isValidGoogleChatWebhookUrl(u))
    )
  );
  if (uniqueTargets.length === 0) {
    return { sent: false };
  }

  const results = await Promise.all(
    uniqueTargets.map(async (webhookUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return {
            sent: false,
            error: `Google Chat HTTP ${res.status}: ${errText.slice(0, 200)}`,
          };
        }
        return { sent: true };
      } catch (err) {
        return {
          sent: false,
          error:
            err instanceof Error
              ? err.message
              : 'Google Chat webhook network error',
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const anySent = results.some((r) => r.sent);
  const errors = results
    .map((r) => r.error)
    .filter((e): e is string => Boolean(e));

  return {
    sent: anySent,
    ...(errors.length > 0 ? { error: errors.join(' | ') } : {}),
  };
}

export async function sendGoogleChatLeaveNotification(
  leave: LeaveRequest,
  eventType:
    | 'created'
    | 'approved_step1'
    | 'approved_final'
    | 'rejected'
    | 'cancelled',
  actor?: User,
  allUsers?: User[]
): Promise<{ sent: boolean; error?: string }> {
  if (!isNotifiableLeaveType(leave.leaveType)) {
    return { sent: false };
  }

  // แชท 1 (GOOGLE_CHAT_WEBHOOK_URL): แจ้งเตือนทุกขั้นตอนของคำขอลา
  // แชท 2 (GOOGLE_CHAT_WEBHOOK_URL_2): แจ้งเตือนเฉพาะขั้นสุดท้ายเมื่อ flow ถูกอนุมัติครบแล้ว (approved_final) เท่านั้น ไม่แจ้งเตือนขั้น 1
  const targetWebhooks: string[] = [];
  const webhook1 = getEffectiveGoogleChatWebhookUrl();
  if (webhook1) {
    targetWebhooks.push(webhook1);
  }
  if (eventType === 'approved_final') {
    const webhook2 = getEffectiveGoogleChatWebhookUrl2();
    if (webhook2) {
      targetWebhooks.push(webhook2);
    }
  }

  if (targetWebhooks.length === 0) {
    return { sent: false };
  }

  const isRemoteOrOffsite =
    leave.leaveType === 'wfh' || leave.leaveType === 'offsite';
  const typeLabel =
    LEAVE_TYPE_META[leave.leaveType]?.label || leave.leaveType;
  const durationLabel =
    DURATION_TYPE_META[leave.durationType]?.label || leave.durationType;
  const dateRangeStr =
    leave.startDate === leave.endDate
      ? formatThaiDate(leave.startDate)
      : `${formatThaiDate(leave.startDate)} ถึง ${formatThaiDate(
          leave.endDate
        )}`;

  const headerMap: Record<typeof eventType, string> = {
    created: isRemoteOrOffsite
      ? '📢 *แจ้งเตือนคำขอปฏิบัติงานนอกสถานที่/WFH ใหม่ — วันนี้ลา by DBC*'
      : '📢 *แจ้งเตือนคำขอลางานใหม่ — วันนี้ลา by DBC*',
    approved_step1: '⏳ *อัปเดตสถานะคำขอ (อนุมัติขั้นที่ 1) — วันนี้ลา by DBC*',
    approved_final: '✅ *อนุมัติคำขอเรียบร้อยแล้ว — วันนี้ลา by DBC*',
    rejected: '❌ *ไม่อนุมัติคำขอ — วันนี้ลา by DBC*',
    cancelled: '🚫 *ยกเลิกคำขอ — วันนี้ลา by DBC*',
  };

  let statusLine = '';
  if (eventType === 'created') {
    if (leave.status === 'pending_manager') {
      statusLine = `🔔 *สถานะ:* รอหัวหน้าฝ่าย (${leave.department || '-'}) อนุมัติขั้นที่ 1`;
    } else if (leave.status === 'pending_c_level') {
      const targetCLevel = allUsers?.find(
        (u) => u.id === leave.targetApproverId
      );
      statusLine = `🔔 *สถานะ:* รอผู้บริหาร ${
        targetCLevel ? `(${targetCLevel.name})` : '(C-Level)'
      } อนุมัติขั้นที่ 1`;
    } else if (leave.status === 'pending_hr') {
      statusLine = '🔔 *สถานะ:* รอฝ่ายบุคคล (HR) อนุมัติขั้นสุดท้าย';
    } else if (leave.status === 'approved') {
      statusLine = '✅ *สถานะ:* อนุมัติเรียบร้อยแล้ว';
    }
  } else if (eventType === 'approved_step1') {
    statusLine = `✍️ *ผู้อนุมัติขั้นที่ 1:* ${actor?.name || '-'}\n🔔 *สถานะถัดไป:* รอฝ่ายบุคคล (HR) อนุมัติขั้นสุดท้าย`;
  } else if (eventType === 'approved_final') {
    statusLine = `✍️ *ผู้อนุมัติขั้นสุดท้าย:* ${actor?.name || '-'}\n✅ *สถานะ:* อนุมัติสมบูรณ์ (${leave.totalDays} วันทำการ)`;
  } else if (eventType === 'rejected') {
    statusLine = `✍️ *ผู้พิจารณา:* ${actor?.name || '-'}\n📝 *เหตุผลที่ไม่อนุมัติ:* ${
      leave.rejectedBy?.reason || '-'
    }`;
  } else if (eventType === 'cancelled') {
    statusLine = `✍️ *ยกเลิกโดย:* ${actor?.name || leave.userName}`;
  }

  const lines = [
    headerMap[eventType],
    '━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *พนักงาน:* ${leave.userName} (${leave.userId})`,
    `🏢 *ฝ่าย/แผนก:* ${leave.department || '-'}`,
    `📌 *ประเภท:* ${typeLabel} (${durationLabel})`,
    `📅 *ช่วงวันที่:* ${dateRangeStr} (รวม ${leave.totalDays} วันทำการ)`,
    ...(leave.locationDetail
      ? [`📍 *สถานที่/รายละเอียดงาน:* ${leave.locationDetail}`]
      : []),
    `💬 *เหตุผล/รายละเอียด:* ${leave.reason || '-'}`,
    ...(leave.attachmentUrl
      ? [`📎 *เอกสารแนบ:* ${leave.attachmentName || 'แนบเอกสารประกอบแล้ว'}`]
      : []),
    ...(statusLine ? [statusLine] : []),
  ];

  return postToGoogleChatWebhooks(targetWebhooks, lines.join('\n'));
}

/**
 * ส่งแจ้งเตือนการลงเวลา Work From Home (WFH) พร้อมลิงก์ Google Meet เข้า Google Chat ทันที
 * (ไม่ต้องยื่นใบขออนุมัติล่วงหน้า ส่งแจ้งเตือนทั้งแชท 1 และแชท 2)
 */
export async function sendGoogleChatWfhCheckInNotification(
  record: AttendanceRecord,
  actor: User,
  meetLink?: string,
  extraNote?: string
): Promise<{ sent: boolean; error?: string }> {
  const targetWebhooks = [
    getEffectiveGoogleChatWebhookUrl(),
    getEffectiveGoogleChatWebhookUrl2(),
  ].filter(Boolean);
  if (targetWebhooks.length === 0) {
    return { sent: false };
  }

  const extracted = extractWfhMeetLinkAndNote(record);
  const directMeetCheck = meetLink
    ? normalizeAndValidateMeetLink(meetLink)
    : { valid: false as const };
  const effectiveMeetLink =
    (directMeetCheck.valid && directMeetCheck.normalizedUrl) ||
    extracted.meetLink ||
    '-';
  const effectiveNote =
    (extraNote || '').trim() || extracted.extraNote || '';

  const lines = [
    '🏠 *แจ้งเตือนการลงเวลา Work From Home (WFH) — วันนี้ลา by DBC*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *พนักงาน:* ${actor.name} (${actor.id})`,
    `🏢 *ฝ่าย/แผนก:* ${actor.department || '-'}`,
    `⏰ *เวลา Check-in:* ${record.checkInTime} น.`,
    `📅 *วันที่:* ${formatThaiDate(record.date)}`,
    `🔗 *ลิงก์ Google Meet:* ${effectiveMeetLink}`,
    ...(effectiveNote ? [`💬 *หมายเหตุ / รายละเอียดงาน:* ${effectiveNote}`] : []),
    '✅ *สถานะ:* เช็คอิน Work From Home เรียบร้อยแล้ว (ไม่ต้องรออนุมัติ)',
  ];

  return postToGoogleChatWebhooks(targetWebhooks, lines.join('\n'));
}

/**
 * ส่งแจ้งเตือนการลงเวลาปฏิบัติงานนอกสถานที่เข้า Google Chat ทันที
 * (ไม่ผ่านขั้นตอนขออนุมัติล่วงหน้า รวมเข้ากับการ Check-in โดยตรง — ส่งแจ้งเตือนทั้งแชท 1 และแชท 2)
 */
export async function sendGoogleChatOffsiteCheckInNotification(
  record: AttendanceRecord,
  actor: User,
  locationName?: string,
  extraNote?: string
): Promise<{ sent: boolean; error?: string }> {
  const targetWebhooks = [
    getEffectiveGoogleChatWebhookUrl(),
    getEffectiveGoogleChatWebhookUrl2(),
  ].filter(Boolean);
  if (targetWebhooks.length === 0) {
    return { sent: false };
  }

  const effectiveLocation =
    (locationName || '').trim() ||
    record.locationName ||
    (record.note && record.note.includes(' • ')
      ? record.note.split(' • ')[0].trim()
      : record.note) ||
    '-';

  let effectiveNote = (extraNote || '').trim();
  if (!effectiveNote && record.note) {
    if (record.locationName && record.note.startsWith(`${record.locationName} • `)) {
      effectiveNote = record.note.slice(record.locationName.length + 3).trim();
    } else if (record.note.startsWith(`${effectiveLocation} • `)) {
      effectiveNote = record.note.slice(effectiveLocation.length + 3).trim();
    } else if (record.note !== record.locationName && record.note !== effectiveLocation) {
      effectiveNote = record.note.trim();
    }
  }

  const lines = [
    '📍 *แจ้งเตือนการลงเวลาปฏิบัติงานนอกสถานที่ — วันนี้ลา by DBC*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `👤 *พนักงาน:* ${actor.name} (${actor.id})`,
    `🏢 *ฝ่าย/แผนก:* ${actor.department || '-'}`,
    `⏰ *เวลา Check-in:* ${record.checkInTime} น.`,
    `📅 *วันที่:* ${formatThaiDate(record.date)}`,
    `📌 *สถานที่ / ลูกค้า:* ${effectiveLocation}`,
    ...(effectiveNote ? [`💬 *หมายเหตุ / รายละเอียดงาน:* ${effectiveNote}`] : []),
    '✅ *สถานะ:* เช็คอินนอกสถานที่เรียบร้อยแล้ว (ไม่ต้องรออนุมัติ)',
  ];

  return postToGoogleChatWebhooks(targetWebhooks, lines.join('\n'));
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
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (!actor) {
      return { success: false as const, error: 'ไม่พบผู้ใช้งานในระบบ' };
    }

    const leave = state.leaveRequests.find((l) => l.id === leaveId);
    if (!leave) {
      return { success: false as const, error: 'ไม่พบใบลาที่ระบุ' };
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
        return { success: false as const, error: 'คุณไม่มีสิทธิ์ยกเลิกใบลานี้' };
      }
      if (
        isOwner &&
        !isAdmin &&
        leave.status !== 'pending_manager' &&
        leave.status !== 'pending_c_level' &&
        leave.status !== 'pending_hr'
      ) {
        return {
          success: false as const,
          error: 'พนักงานสามารถยกเลิกได้เฉพาะใบลาที่อยู่ระหว่างรออนุมัติเท่านั้น',
        };
      }

      leave.status = 'cancelled';
      await saveDatabaseState(state, [
        {
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: [{ id: leave.id, row: leaveToRow(leave) }],
        },
      ]);
      return {
        success: true as const,
        leave: { ...leave },
        actor: { ...actor },
        usersSnapshot: [...state.users],
        chatEvent: 'cancelled' as const,
      };
    }

    if (action === 'reject') {
      const perm = checkRejectionPermission(leave, safeActor);
      if (!perm.allowed) {
        return { success: false as const, error: perm.error };
      }

      leave.status = 'rejected';
      leave.rejectedBy = {
        userId: actor.id,
        userName: actor.name,
        role: actor.role,
        rejectedAt: nowIso,
        reason: (comment || '').trim() || 'ไม่อนุมัติคำขอลา',
      };

      await saveDatabaseState(state, [
        {
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: [{ id: leave.id, row: leaveToRow(leave) }],
        },
      ]);
      return {
        success: true as const,
        leave: { ...leave },
        actor: { ...actor },
        usersSnapshot: [...state.users],
        chatEvent: 'rejected' as const,
      };
    }

    if (action === 'approve') {
      const perm = checkApprovalPermission(leave, safeActor);
      if (!perm.allowed || !perm.nextStatus || !perm.step) {
        return {
          success: false as const,
          error: perm.error || 'ไม่มีสิทธิ์อนุมัติใบลานี้',
        };
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

      await saveDatabaseState(state, [
        {
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: [{ id: leave.id, row: leaveToRow(leave) }],
        },
      ]);
      return {
        success: true as const,
        leave: { ...leave },
        actor: { ...actor },
        usersSnapshot: [...state.users],
        chatEvent:
          leave.status === 'approved'
            ? ('approved_final' as const)
            : ('approved_step1' as const),
      };
    }

    return { success: false as const, error: 'คำสั่งไม่ถูกต้อง' };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'LeaveRequests',
    'Edit',
    [leaveToAppSheetRow(lockedRes.leave)],
    lockedRes.actor.email
  );
  if (isNotifiableLeaveType(lockedRes.leave.leaveType)) {
    await sendGoogleChatLeaveNotification(
      lockedRes.leave,
      lockedRes.chatEvent,
      lockedRes.actor,
      lockedRes.usersSnapshot
    );
  }
  return { success: true, leave: lockedRes.leave };
}

// ============================================================================
// Check-in / Check-out Attendance Service (PDPA Compliant - No GPS / No Photo)
// ============================================================================

export interface CheckInInput {
  date?: string; // YYYY-MM-DD
  checkInTime?: string; // HH:mm
  workLocation: WorkLocationType;
  locationName?: string; // สถานที่ปฏิบัติงาน / ชื่อลูกค้า / ชื่องานออกบูธ
  meetLink?: string; // ลิงก์ Google Meet (จำเป็นสำหรับการ Check-in WFH)
  note?: string; // หมายเหตุเพิ่มเติม
}

export async function recordCheckIn(
  actorId: string,
  input: CheckInInput
): Promise<{
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}> {
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (!actor) {
      return { success: false as const, error: 'ไม่พบผู้ใช้งานในระบบ' };
    }

    const bangkok = getBangkokNow();
    const todayStr = bangkok.dateStr;
    const currentHm = bangkok.timeStr;

    const targetDate = (input.date || '').trim() || todayStr;
    if (!parseDateUTC(targetDate)) {
      return { success: false as const, error: 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)' };
    }

    const workLocation = String(input.workLocation || '')
      .trim()
      .toLowerCase() as WorkLocationType;
    if (
      workLocation !== 'office' &&
      workLocation !== 'wfh' &&
      workLocation !== 'wfa' &&
      workLocation !== 'offsite'
    ) {
      return {
        success: false as const,
        error: 'ประเภทสถานที่ปฏิบัติงานไม่ถูกต้อง',
      };
    }

    if (workLocation === 'wfa' && !ENABLE_WFA) {
      return {
        success: false as const,
        error: 'ระบบ Work From Anywhere (WFA) ปิดใช้งานชั่วคราว',
      };
    }

    // หากพนักงานยังไม่ผ่านโปร 119 วัน ห้าม Check-in แบบ WFH หรือ WFA (ยกเว้น C-Level และ Admin)
    if (
      actor.role !== 'c_level' &&
      actor.role !== 'admin' &&
      (workLocation === 'wfh' || workLocation === 'wfa')
    ) {
      const prob = checkProbationLeaveEligibility(
        actor.startDate,
        workLocation,
        targetDate
      );
      if (!prob.allowed) {
        return {
          success: false as const,
          error: prob.error,
        };
      }
    }

    const locationName = (input.locationName || '').trim();
    const rawNote = (input.note || '').trim();

    let effectiveLocation = locationName;
    let effectiveMeetLink: string | undefined = undefined;
    let effectiveExtraNote = rawNote;

    if (workLocation === 'wfh') {
      const meetCheck = normalizeAndValidateMeetLink(input.meetLink);
      if (!meetCheck.valid || !meetCheck.normalizedUrl) {
        return {
          success: false as const,
          error:
            meetCheck.error ||
            'กรุณาแนบลิงก์ Google Meet ที่ถูกต้องสำหรับการ Check-in WFH',
        };
      }
      effectiveMeetLink = meetCheck.normalizedUrl;
    }

    if (!effectiveLocation && rawNote && workLocation === 'offsite') {
      effectiveLocation = rawNote;
      effectiveExtraNote = '';
    }

    if (workLocation === 'offsite' && !effectiveLocation) {
      return {
        success: false as const,
        error: 'กรุณาระบุสถานที่ / ชื่อลูกค้า สำหรับการลงเวลาทำงานนอกสถานที่',
      };
    }

    let combinedNote: string | undefined = undefined;
    if (workLocation === 'offsite') {
      if (effectiveLocation && effectiveExtraNote) {
        combinedNote = `${effectiveLocation} • ${effectiveExtraNote}`;
      } else {
        combinedNote = effectiveLocation || undefined;
      }
    } else if (workLocation === 'wfh') {
      if (effectiveMeetLink && effectiveExtraNote) {
        combinedNote = `${effectiveMeetLink} • ${effectiveExtraNote}`;
      } else {
        combinedNote = effectiveMeetLink;
      }
    } else {
      combinedNote = rawNote || undefined;
    }

    const timeStr = (input.checkInTime || '').trim() || currentHm;

    if (!Array.isArray(state.attendance)) {
      state.attendance = [];
    }

    const existingIdx = state.attendance.findIndex(
      (a) => a.userId === actor.id && a.date === targetDate
    );

    if (existingIdx >= 0) {
      const existing = state.attendance[existingIdx];
      const isOffsite = workLocation === 'offsite';
      const isWfh = workLocation === 'wfh';
      const isSameLocation = existing.workLocation === workLocation;

      const nextLocationName = isOffsite
        ? effectiveLocation || (isSameLocation ? existing.locationName : undefined)
        : undefined;

      const nextMeetLink = isWfh ? effectiveMeetLink : undefined;

      const nextNote =
        isOffsite || isWfh
          ? combinedNote
          : rawNote || (isSameLocation ? existing.note : undefined);

      const updated: AttendanceRecord = {
        ...existing,
        userName: actor.name,
        department: actor.department,
        checkInTime: timeStr,
        workLocation,
        locationName: nextLocationName,
        meetLink: nextMeetLink,
        note: nextNote,
      };
      state.attendance[existingIdx] = updated;
      await saveDatabaseState(state, [
        {
          type: 'upsertById',
          tab: 'Attendance',
          items: [{ id: updated.id, row: attendanceToRow(updated) }],
        },
      ]);
      return {
        success: true as const,
        record: updated,
        actor: { ...actor },
        appSheetAction: 'Edit' as const,
        workLocation,
        effectiveLocation,
        effectiveMeetLink,
        effectiveExtraNote,
      };
    }

    const newRecord: AttendanceRecord = {
      id: `ATT-${targetDate}-${actor.id}`,
      userId: actor.id,
      userName: actor.name,
      department: actor.department,
      date: targetDate,
      checkInTime: timeStr,
      workLocation,
      locationName:
        workLocation === 'offsite'
          ? effectiveLocation || undefined
          : undefined,
      meetLink: workLocation === 'wfh' ? effectiveMeetLink : undefined,
      note: combinedNote,
    };

    state.attendance.unshift(newRecord);
    await saveDatabaseState(state, [
      {
        type: 'upsertById',
        tab: 'Attendance',
        items: [{ id: newRecord.id, row: attendanceToRow(newRecord) }],
      },
    ]);
    return {
      success: true as const,
      record: newRecord,
      actor: { ...actor },
      appSheetAction: 'Add' as const,
      workLocation,
      effectiveLocation,
      effectiveMeetLink,
      effectiveExtraNote,
    };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Attendance',
    lockedRes.appSheetAction,
    [attendanceToAppSheetRow(lockedRes.record)],
    lockedRes.actor.email
  );
  if (lockedRes.workLocation === 'offsite') {
    await sendGoogleChatOffsiteCheckInNotification(
      lockedRes.record,
      lockedRes.actor,
      lockedRes.effectiveLocation,
      lockedRes.effectiveExtraNote
    );
  } else if (lockedRes.workLocation === 'wfh') {
    await sendGoogleChatWfhCheckInNotification(
      lockedRes.record,
      lockedRes.actor,
      lockedRes.effectiveMeetLink,
      lockedRes.effectiveExtraNote
    );
  }
  return { success: true, record: lockedRes.record };
}

export async function recordCheckOut(
  actorId: string,
  input?: { date?: string; checkOutTime?: string; note?: string }
): Promise<{
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}> {
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (!actor) {
      return { success: false as const, error: 'ไม่พบผู้ใช้งานในระบบ' };
    }

    const bangkok = getBangkokNow();
    const todayStr = bangkok.dateStr;
    const currentHm = bangkok.timeStr;

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
        success: false as const,
        error: 'คุณยังไม่ได้กด Check-in เข้างานในวันนี้ กรุณากด Check-in ก่อน',
      };
    }

    const existing = state.attendance[existingIdx];
    const trimmedOutNote = input?.note?.trim();
    const existingWfhMeet =
      existing.workLocation === 'wfh'
        ? extractWfhMeetLinkAndNote(existing).meetLink
        : undefined;
    let nextNote = existing.note;
    if (trimmedOutNote) {
      if (existing.workLocation === 'wfh' && existingWfhMeet) {
        const startsWithMeet =
          trimmedOutNote === existingWfhMeet ||
          trimmedOutNote.startsWith(`${existingWfhMeet} • `);
        nextNote = startsWithMeet
          ? trimmedOutNote
          : `${existingWfhMeet} • ${trimmedOutNote}`;
      } else if (existing.workLocation === 'offsite' && existing.locationName) {
        const startsWithLocation =
          trimmedOutNote === existing.locationName ||
          trimmedOutNote.startsWith(`${existing.locationName} • `);
        nextNote = startsWithLocation
          ? trimmedOutNote
          : `${existing.locationName} • ${trimmedOutNote}`;
      } else {
        nextNote = trimmedOutNote;
      }
    }
    const updated: AttendanceRecord = {
      ...existing,
      ...(existingWfhMeet ? { meetLink: existingWfhMeet } : {}),
      checkOutTime: timeStr,
      note: nextNote,
    };

    state.attendance[existingIdx] = updated;
    await saveDatabaseState(state, [
      {
        type: 'upsertById',
        tab: 'Attendance',
        items: [{ id: updated.id, row: attendanceToRow(updated) }],
      },
    ]);
    return {
      success: true as const,
      record: updated,
      actorEmail: actor.email,
    };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Attendance',
    'Edit',
    [attendanceToAppSheetRow(lockedRes.record)],
    lockedRes.actorEmail
  );
  return { success: true, record: lockedRes.record };
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
  secondaryEmail?: string;
  role?: Role;
  department?: string;
  position?: string;
  startDate?: string;
  cLevelApproverId?: string;
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
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (
      !actor ||
      (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
    ) {
      return {
        success: false as const,
        error:
          'เฉพาะฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการข้อมูลพนักงานได้',
      };
    }

    const existingIndex = input.id
      ? state.users.findIndex((u) => u.id === input.id)
      : -1;

    // ป้องกันการแก้ไขหรือลดสิทธิ์บัญชี Admin โดยผู้ที่ไม่ได้เป็น Admin
    if (
      existingIndex >= 0 &&
      state.users[existingIndex].role === 'admin' &&
      actor.role !== 'admin'
    ) {
      return {
        success: false as const,
        error:
          'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขหรือเปลี่ยนแปลงสิทธิ์ของผู้ดูแลระบบได้',
      };
    }

    const parsedInputEmails = parseEmailList(input.email);
    const parsedSecondaryEmails = parseEmailList(input.secondaryEmail);
    const candidateEmail = parsedInputEmails[0] || '';
    const candidateSecondaryEmail =
      parsedSecondaryEmails[0] || parsedInputEmails[1] || '';

    const candidateTargetEmail = (
      existingIndex >= 0
        ? candidateEmail || state.users[existingIndex].email
        : candidateEmail
    )
      .trim()
      .toLowerCase();

    const candidateTargetSecondaryEmail = (
      existingIndex >= 0
        ? input.secondaryEmail !== undefined
          ? candidateSecondaryEmail
          : candidateSecondaryEmail ||
            state.users[existingIndex].secondaryEmail ||
            ''
        : candidateSecondaryEmail
    )
      .trim()
      .toLowerCase();

    // ป้องกันการลดสิทธิ์หรือถอดถอนอีเมลของบัญชี Super Admin หลัก
    if (existingIndex >= 0 && isSuperAdminUser(state.users[existingIndex])) {
      if (input.role && input.role !== 'admin') {
        return {
          success: false as const,
          error: 'ไม่สามารถเปลี่ยนตำแหน่งหรือลดสิทธิ์ของผู้ดูแลระบบสูงสุดได้',
        };
      }
      if (
        !isSuperAdminEmail(candidateTargetEmail) &&
        !isSuperAdminEmail(candidateTargetSecondaryEmail)
      ) {
        return {
          success: false as const,
          error:
            'ไม่สามารถเปลี่ยนอีเมลของผู้ดูแลระบบสูงสุดเป็นอีเมลอื่นที่ไม่ใช่บัญชี Super Admin ได้',
        };
      }
    }

    if (
      input.role === 'admin' &&
      !isSuperAdminEmail(candidateTargetEmail) &&
      !isSuperAdminEmail(candidateTargetSecondaryEmail)
    ) {
      if (actor.role !== 'admin') {
        return {
          success: false as const,
          error: `ตำแหน่ง Admin สงวนสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด (${SUPER_ADMIN_EMAIL}) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแต่งตั้งได้`,
        };
      }
    }

    const effectiveRole: Role =
      input.role ||
      (existingIndex >= 0 ? state.users[existingIndex].role : 'employee');
    const isExecutive = effectiveRole === 'c_level' || effectiveRole === 'admin';
    const cleanUsername = (input.username || '').trim();

    if (existingIndex < 0 && !input.role) {
      return {
        success: false as const,
        error: 'กรุณาเลือกระดับบทบาท (Role) ของพนักงาน',
      };
    }

    if (existingIndex < 0 && !candidateEmail && !cleanUsername) {
      return {
        success: false as const,
        error: 'กรุณากรอกอีเมล Google สำหรับเข้าสู่ระบบ',
      };
    }

    if (
      (candidateEmail && !isValidEmailFormat(candidateEmail)) ||
      (candidateSecondaryEmail && !isValidEmailFormat(candidateSecondaryEmail)) ||
      parsedInputEmails.some((e) => !isValidEmailFormat(e)) ||
      parsedSecondaryEmails.some((e) => !isValidEmailFormat(e))
    ) {
      return {
        success: false as const,
        error: 'รูปแบบอีเมล Google ไม่ถูกต้อง',
      };
    }

    const rawDept = (
      input.department !== undefined
        ? input.department
        : existingIndex >= 0
          ? state.users[existingIndex].department
          : ''
    ).trim();
    const department = isExecutive
      ? rawDept || 'Executive (C-Level)'
      : rawDept;

    if (!isExecutive && !department) {
      return {
        success: false as const,
        error: 'กรุณาเลือกฝ่าย / แผนกของพนักงาน',
      };
    }

    const rawStartDate = (
      input.startDate !== undefined
        ? input.startDate
        : existingIndex >= 0
          ? state.users[existingIndex].startDate
          : ''
    ).trim();
    if (
      !isExecutive &&
      existingIndex < 0 &&
      (!rawStartDate || !parseDateUTC(rawStartDate))
    ) {
      return {
        success: false as const,
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
          success: false as const,
          error: `ชื่อผู้ใช้ "${cleanUsername}" ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น`,
        };
      }
    }

    const candidateEmailsToCheck = [
      ...getEquivalentEmails(candidateEmail),
      ...getEquivalentEmails(candidateSecondaryEmail),
    ];
    if (candidateEmailsToCheck.length > 0) {
      const duplicateEmail = state.users.find(
        (u, idx) =>
          idx !== existingIndex &&
          candidateEmailsToCheck.some((ce) => doesUserMatchEmail(u, ce))
      );
      if (duplicateEmail) {
        const displayOffendingEmail =
          input.email?.trim() ||
          input.secondaryEmail?.trim() ||
          candidateEmail;
        return {
          success: false as const,
          error: `อีเมล "${displayOffendingEmail}" ถูกผูกกับพนักงานรหัส ${duplicateEmail.id} (${duplicateEmail.name}) แล้ว กรุณาใช้อีเมลอื่น`,
        };
      }
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
          ? candidateEmail || current.email
          : current.email;
      let updatedSecondaryEmail = current.secondaryEmail;
      if (input.secondaryEmail !== undefined) {
        updatedSecondaryEmail = candidateSecondaryEmail || undefined;
      } else if (parsedInputEmails.length > 1) {
        updatedSecondaryEmail = parsedInputEmails[1] || undefined;
      }
      if (
        updatedSecondaryEmail &&
        updatedSecondaryEmail.toLowerCase() === updatedEmail.toLowerCase()
      ) {
        updatedSecondaryEmail = undefined;
      }
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
      const updatedCLevelApproverId =
        effectiveRole === 'manager'
          ? input.cLevelApproverId !== undefined
            ? input.cLevelApproverId.trim() || undefined
            : current.cLevelApproverId
          : undefined;

      const {
        secondaryEmail: _oldSecondary,
        ...currentWithoutSecondary
      } = current;
      const updated: User = {
        ...currentWithoutSecondary,
        username: cleanUsername || current.username,
        name,
        englishName: updatedEnglishName,
        email: updatedEmail,
        ...(updatedSecondaryEmail
          ? { secondaryEmail: updatedSecondaryEmail }
          : {}),
        role: effectiveRole,
        department,
        position,
        startDate: updatedStartDate,
        cLevelApproverId: updatedCLevelApproverId,
        quotas: cleanQuotas,
      };
      state.users[existingIndex] = updated;

      const modifiedLeaves: LeaveRequest[] = [];
      for (const req of state.leaveRequests) {
        if (
          req.userId === updated.id &&
          (req.userName !== updated.name ||
            req.department !== updated.department ||
            req.requesterRole !== updated.role)
        ) {
          req.userName = updated.name;
          req.department = updated.department;
          req.requesterRole = updated.role;
          modifiedLeaves.push(req);
        }
      }

      const modifiedAttendance: AttendanceRecord[] = [];
      for (const att of state.attendance || []) {
        if (
          att.userId === updated.id &&
          (att.userName !== updated.name || att.department !== updated.department)
        ) {
          att.userName = updated.name;
          att.department = updated.department;
          modifiedAttendance.push(att);
        }
      }

      const mutations: SheetMutation[] = [
        {
          type: 'upsertById',
          tab: 'Users',
          items: [{ id: updated.id, row: userToRow(updated) }],
        },
      ];
      if (modifiedLeaves.length > 0) {
        mutations.push({
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: modifiedLeaves.map((l) => ({ id: l.id, row: leaveToRow(l) })),
        });
      }
      if (modifiedAttendance.length > 0) {
        mutations.push({
          type: 'upsertById',
          tab: 'Attendance',
          items: modifiedAttendance.map((a) => ({
            id: a.id,
            row: attendanceToRow(a),
          })),
        });
      }

      await saveDatabaseState(state, mutations);
      return {
        success: true as const,
        user: updated,
        appSheetAction: 'Edit' as const,
        actorEmail: actor.email,
      };
    } else {
      const newId = input.id?.trim() || generateNextEmployeeId(state.users);

      if (state.users.some((u) => u.id.toLowerCase() === newId.toLowerCase())) {
        return {
          success: false as const,
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
      const cleanSecondaryEmail =
        candidateSecondaryEmail &&
        candidateSecondaryEmail.toLowerCase() !== cleanEmail.toLowerCase()
          ? candidateSecondaryEmail
          : undefined;
      const cleanEnglishName = (input.englishName || '').trim();
      const cleanStartDate = isExecutive
        ? rawStartDate && parseDateUTC(rawStartDate)
          ? rawStartDate
          : ''
        : rawStartDate;
      const newCLevelApproverId =
        effectiveRole === 'manager' && input.cLevelApproverId
          ? input.cLevelApproverId.trim() || undefined
          : undefined;

      const newUser: User = {
        id: newId,
        username: derivedUsername,
        name,
        englishName: cleanEnglishName,
        email: cleanEmail,
        ...(cleanSecondaryEmail ? { secondaryEmail: cleanSecondaryEmail } : {}),
        role: effectiveRole,
        department,
        position,
        startDate: cleanStartDate,
        cLevelApproverId: newCLevelApproverId,
        quotas: cleanQuotas,
      };

      state.users.push(newUser);
      await saveDatabaseState(state, [
        {
          type: 'append',
          tab: 'Users',
          rows: [userToRow(newUser)],
        },
      ]);
      return {
        success: true as const,
        user: newUser,
        appSheetAction: 'Add' as const,
        actorEmail: actor.email,
      };
    }
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Users',
    lockedRes.appSheetAction,
    [userToAppSheetRow(lockedRes.user)],
    lockedRes.actorEmail
  );
  return { success: true, user: toSafeUser(lockedRes.user) };
}

export async function deleteEmployee(
  actorId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (
      !actor ||
      (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
    ) {
      return {
        success: false as const,
        error:
          'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบพนักงานได้',
      };
    }

    const targetUser = state.users.find((u) => u.id === targetUserId);
    if (targetUser && isSuperAdminUser(targetUser)) {
      return {
        success: false as const,
        error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด (Admin) ได้',
      };
    }

    if (targetUser && targetUser.role === 'admin' && actor.role !== 'admin') {
      return {
        success: false as const,
        error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบบัญชีผู้ดูแลระบบได้',
      };
    }

    if (actor.id === targetUserId) {
      return {
        success: false as const,
        error: 'ไม่สามารถลบบัญชีของตัวเองที่กำลังใช้งานอยู่ได้',
      };
    }

    const idx = state.users.findIndex((u) => u.id === targetUserId);
    if (idx === -1) {
      return { success: false as const, error: 'ไม่พบพนักงานที่ต้องการลบ' };
    }

    const deletedLeaveIds = state.leaveRequests
      .filter((l) => l.userId === targetUserId)
      .map((l) => l.id);
    const deletedAttendanceIds = (state.attendance || [])
      .filter((a) => a.userId === targetUserId)
      .map((a) => a.id);

    state.users.splice(idx, 1);
    state.leaveRequests = state.leaveRequests.filter(
      (l) => l.userId !== targetUserId
    );
    state.attendance = (state.attendance || []).filter(
      (a) => a.userId !== targetUserId
    );

    const mutations: SheetMutation[] = [
      { type: 'deleteByIds', tab: 'Users', ids: [targetUserId] },
    ];
    if (deletedLeaveIds.length > 0) {
      mutations.push({
        type: 'deleteByIds',
        tab: 'LeaveRequests',
        ids: deletedLeaveIds,
      });
    }
    if (deletedAttendanceIds.length > 0) {
      mutations.push({
        type: 'deleteByIds',
        tab: 'Attendance',
        ids: deletedAttendanceIds,
      });
    }

    await saveDatabaseState(state, mutations);
    return { success: true as const, actorEmail: actor.email };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Users',
    'Delete',
    [{ id: targetUserId }],
    lockedRes.actorEmail
  );
  return { success: true };
}

export async function upsertHoliday(
  actorId: string,
  input: { id?: string; date: string; name: string }
): Promise<{ success: boolean; holiday?: Holiday; error?: string }> {
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (
      !actor ||
      (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
    ) {
      return {
        success: false as const,
        error:
          'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการวันหยุดบริษัทได้',
      };
    }

    const date = (input.date || '').trim();
    const name = (input.name || '').trim();

    if (!parseDateUTC(date) || !name) {
      return {
        success: false as const,
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
        success: false as const,
        error: `วันที่ ${date} มีวันหยุด "${duplicateDateHoliday.name}" กำหนดไว้แล้ว`,
      };
    }

    if (existingIdx >= 0) {
      state.holidays[existingIdx] = {
        ...state.holidays[existingIdx],
        date,
        name,
      };
      const updatedHoliday = state.holidays[existingIdx];
      const recalculatedLeaves = recalculateLeaveRequestsForHolidays(state);
      const mutations: SheetMutation[] = [
        {
          type: 'upsertById',
          tab: 'Holidays',
          items: [{ id: updatedHoliday.id, row: holidayToRow(updatedHoliday) }],
        },
      ];
      if (recalculatedLeaves.length > 0) {
        mutations.push({
          type: 'upsertById',
          tab: 'LeaveRequests',
          items: recalculatedLeaves.map((l) => ({
            id: l.id,
            row: leaveToRow(l),
          })),
        });
      }
      await saveDatabaseState(state, mutations);
      return {
        success: true as const,
        holiday: updatedHoliday,
        appSheetAction: 'Edit' as const,
        actorEmail: actor.email,
      };
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
    const recalculatedLeaves = recalculateLeaveRequestsForHolidays(state);
    const mutations: SheetMutation[] = [
      {
        type: 'append',
        tab: 'Holidays',
        rows: [holidayToRow(newHoliday)],
      },
    ];
    if (recalculatedLeaves.length > 0) {
      mutations.push({
        type: 'upsertById',
        tab: 'LeaveRequests',
        items: recalculatedLeaves.map((l) => ({
          id: l.id,
          row: leaveToRow(l),
        })),
      });
    }
    await saveDatabaseState(state, mutations);
    return {
      success: true as const,
      holiday: newHoliday,
      appSheetAction: 'Add' as const,
      actorEmail: actor.email,
    };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Holidays',
    lockedRes.appSheetAction,
    [holidayToAppSheetRow(lockedRes.holiday)],
    lockedRes.actorEmail
  );
  return { success: true, holiday: lockedRes.holiday };
}

export async function deleteHoliday(
  actorId: string,
  holidayId: string
): Promise<{ success: boolean; error?: string }> {
  const lockedRes = await withDatabaseLock(async () => {
    const { state } = await getDatabaseState();
    const actor = state.users.find((u) => u.id === actorId);
    if (
      !actor ||
      (actor.role !== 'hr' && actor.role !== 'c_level' && actor.role !== 'admin')
    ) {
      return {
        success: false as const,
        error:
          'เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบวันหยุดบริษัทได้',
      };
    }

    const idx = state.holidays.findIndex((h) => h.id === holidayId);
    if (idx === -1) {
      return { success: false as const, error: 'ไม่พบวันหยุดที่ต้องการลบ' };
    }

    state.holidays.splice(idx, 1);
    const recalculatedLeaves = recalculateLeaveRequestsForHolidays(state);
    const mutations: SheetMutation[] = [
      { type: 'deleteByIds', tab: 'Holidays', ids: [holidayId] },
    ];
    if (recalculatedLeaves.length > 0) {
      mutations.push({
        type: 'upsertById',
        tab: 'LeaveRequests',
        items: recalculatedLeaves.map((l) => ({
          id: l.id,
          row: leaveToRow(l),
        })),
      });
    }
    await saveDatabaseState(state, mutations);
    return { success: true as const, actorEmail: actor.email };
  });

  if (!lockedRes.success) {
    return { success: false, error: lockedRes.error };
  }

  await syncToAppSheetTable(
    'Holidays',
    'Delete',
    [{ id: holidayId }],
    lockedRes.actorEmail
  );
  return { success: true };
}

export async function resetDemoData(preserveUserId?: string): Promise<{
  success: boolean;
  preservedUserId?: string;
  error?: string;
}> {
  if (isGoogleSheetsConfigured()) {
    return {
      success: false,
      error: 'ไม่สามารถรีเซ็ตข้อมูลเดโมขณะเชื่อมต่อฐานข้อมูล Google Sheets จริงได้',
    };
  }
  return withDatabaseLock(async () => {
    let preserveUser: User | undefined;
    if (preserveUserId) {
      const { state } = await getDatabaseState();
      preserveUser = state.users.find((u) => u.id === preserveUserId);
    }
    resetLocalDemoStore(preserveUser);
    return {
      success: true,
      preservedUserId: preserveUser ? preserveUser.id : undefined,
    };
  });
}
