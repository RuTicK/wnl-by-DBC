import { JWT } from 'google-auth-library';
import { sheets as createSheetsClient } from 'googleapis/build/src/apis/sheets';
import fs from 'fs';
import path from 'path';
import {
  AttendanceRecord,
  Holiday,
  LeaveDuration,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Role,
  User,
  WorkLocationType,
} from './types';
import {
  INITIAL_ATTENDANCE,
  INITIAL_HOLIDAYS,
  INITIAL_LEAVE_REQUESTS,
  INITIAL_USERS,
} from './mock-data';
import { STANDARD_LEAVE_QUOTAS } from './leave-utils';

export interface DatabaseState {
  users: User[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  attendance: AttendanceRecord[];
}

export interface RuntimeAppConfig {
  googleClientId?: string;
  googleSheetId?: string;
  googleServiceAccountEmail?: string;
  googlePrivateKey?: string;
  appsheetAppId?: string;
  appsheetAccessKey?: string;
}

const DATA_FILE_PATH = path.join(process.cwd(), '.data', 'hr-store.json');
const CONFIG_FILE_PATH = path.join(process.cwd(), '.data', 'app-config.json');

let memoryStore: DatabaseState | null = null;
let memoryConfig: RuntimeAppConfig | null = null;

export function getRuntimeAppConfig(): RuntimeAppConfig {
  if (memoryConfig) {
    return memoryConfig;
  }
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as RuntimeAppConfig;
      if (parsed && typeof parsed === 'object') {
        memoryConfig = parsed;
        return memoryConfig;
      }
    }
  } catch {
    // Ignore file read errors
  }
  memoryConfig = {};
  return memoryConfig;
}

export function saveRuntimeAppConfig(
  partial: Partial<RuntimeAppConfig>
): RuntimeAppConfig {
  const current = getRuntimeAppConfig();
  const updated: RuntimeAppConfig = {
    ...current,
    ...partial,
  };
  memoryConfig = updated;
  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      CONFIG_FILE_PATH,
      JSON.stringify(updated, null, 2),
      'utf-8'
    );
  } catch {
    // On read-only serverless environments, memoryConfig persists in warm lambda
  }
  return updated;
}

export function getEffectiveGoogleClientId(): string {
  const cfg = getRuntimeAppConfig();
  return (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    cfg.googleClientId?.trim() ||
    ''
  );
}

export function getEffectiveAppSheetConfig(): {
  appId: string;
  accessKey: string;
  configured: boolean;
} {
  const cfg = getRuntimeAppConfig();
  const appId =
    process.env.APPSHEET_APP_ID?.trim() || cfg.appsheetAppId?.trim() || '';
  const accessKey =
    process.env.APPSHEET_ACCESS_KEY?.trim() ||
    cfg.appsheetAccessKey?.trim() ||
    '';
  return {
    appId,
    accessKey,
    configured: Boolean(appId && accessKey),
  };
}

export function isAppSheetConfigured(): boolean {
  return getEffectiveAppSheetConfig().configured;
}

export function isGoogleSheetsConfigured(): boolean {
  const cfg = getRuntimeAppConfig();
  const sheetId =
    process.env.GOOGLE_SHEET_ID?.trim() || cfg.googleSheetId?.trim() || '';
  const serviceEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    cfg.googleServiceAccountEmail?.trim() ||
    '';
  const privateKey =
    process.env.GOOGLE_PRIVATE_KEY?.trim() ||
    cfg.googlePrivateKey?.trim() ||
    '';
  return Boolean(sheetId && serviceEmail && privateKey);
}

export function getStorageMode(): 'google_sheets' | 'demo_local' {
  return isGoogleSheetsConfigured() ? 'google_sheets' : 'demo_local';
}

function cloneInitialState(): DatabaseState {
  return {
    users: JSON.parse(JSON.stringify(INITIAL_USERS)),
    leaveRequests: JSON.parse(JSON.stringify(INITIAL_LEAVE_REQUESTS)),
    holidays: JSON.parse(JSON.stringify(INITIAL_HOLIDAYS)),
    attendance: JSON.parse(JSON.stringify(INITIAL_ATTENDANCE)),
  };
}

function readLocalStore(): DatabaseState {
  if (memoryStore) {
    return memoryStore;
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    memoryStore = cloneInitialState();
    return memoryStore;
  }
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (
        Array.isArray(parsed.users) &&
        Array.isArray(parsed.leaveRequests) &&
        Array.isArray(parsed.holidays) &&
        parsed.users.every((u) => 'startDate' in u && 'englishName' in u)
      ) {
        if (!Array.isArray(parsed.attendance)) {
          parsed.attendance = JSON.parse(JSON.stringify(INITIAL_ATTENDANCE));
        }
        for (const u of parsed.users) {
          u.quotas = { ...STANDARD_LEAVE_QUOTAS };
        }
        memoryStore = parsed;
        return memoryStore;
      }
    }
  } catch {
    // Ignore file read errors and use initial state
  }
  memoryStore = cloneInitialState();
  writeLocalStore(memoryStore);
  return memoryStore;
}

function writeLocalStore(state: DatabaseState): void {
  memoryStore = state;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // On read-only serverless environments, memoryStore still persists in the warm lambda
  }
}

export function resetLocalDemoStore(preserveUser?: User): DatabaseState {
  const fresh = cloneInitialState();
  if (
    preserveUser &&
    !fresh.users.some(
      (u) =>
        u.id.toLowerCase() === preserveUser.id.toLowerCase() ||
        u.email.toLowerCase() === preserveUser.email.toLowerCase()
    )
  ) {
    fresh.users.push(JSON.parse(JSON.stringify(preserveUser)));
  }
  writeLocalStore(fresh);
  return fresh;
}

// ============================================================================
// Google Sheets Row Mapping Helpers (PDPA Compliant & AppSheet Ready)
// ============================================================================

export const USER_SHEET_HEADERS = [
  'id',
  'name',
  'englishName',
  'email',
  'role',
  'department',
  'position',
  'startDate',
  'sickQuota',
  'personalQuota',
  'vacationQuota',
  'wfhQuota',
  'wfaQuota',
];

export function userToRow(u: User): (string | number)[] {
  return [
    u.id,
    u.name,
    u.englishName || '',
    u.email || '',
    u.role,
    u.department,
    u.position,
    u.startDate || '2023-01-01',
    STANDARD_LEAVE_QUOTAS.sick,
    STANDARD_LEAVE_QUOTAS.personal,
    STANDARD_LEAVE_QUOTAS.vacation,
    0,
    0,
  ];
}

export function rowToUser(row: string[]): User {
  const email = row[3] || '';
  const derivedUsername = email.includes('@')
    ? email.split('@')[0].split('.')[0]
    : (row[0] || '').toLowerCase();

  return {
    id: row[0] || '',
    name: row[1] || '',
    englishName: row[2] || '',
    email,
    role: ((row[4] as Role) || 'employee'),
    department: (row[5] || '').trim() || 'General',
    position: row[6] || 'Staff',
    startDate: row[7] || '2023-01-01',
    username: derivedUsername,
    quotas: {
      sick: STANDARD_LEAVE_QUOTAS.sick,
      personal: STANDARD_LEAVE_QUOTAS.personal,
      vacation: STANDARD_LEAVE_QUOTAS.vacation,
      wfh: 0,
      wfa: 0,
      offsite: 0,
    },
  };
}

export const LEAVE_SHEET_HEADERS = [
  'id',
  'userId',
  'userName',
  'requesterRole',
  'department',
  'leaveType',
  'durationType',
  'startDate',
  'endDate',
  'totalDays',
  'reason',
  'locationDetail',
  'attachmentUrl',
  'attachmentName',
  'status',
  'managerApprovalJson',
  'cLevelApprovalJson',
  'hrApprovalJson',
  'cLevelNotifiedAt',
  'rejectedByJson',
  'createdAt',
];

export const MAX_SHEET_CELL_LENGTH = 49000;

export function leaveToRow(l: LeaveRequest): (string | number)[] {
  const rawAttachment = l.attachmentUrl || '';
  const safeAttachment =
    rawAttachment.length > MAX_SHEET_CELL_LENGTH ? '' : rawAttachment;

  return [
    l.id,
    l.userId,
    l.userName,
    l.requesterRole || 'employee',
    l.department,
    l.leaveType,
    l.durationType,
    l.startDate,
    l.endDate,
    l.totalDays,
    (l.reason || '').slice(0, MAX_SHEET_CELL_LENGTH),
    (l.locationDetail || '').slice(0, 2000),
    safeAttachment,
    l.attachmentName || '',
    l.status,
    l.managerApproval ? JSON.stringify(l.managerApproval) : '',
    l.cLevelApproval ? JSON.stringify(l.cLevelApproval) : '',
    l.hrApproval ? JSON.stringify(l.hrApproval) : '',
    l.cLevelNotifiedAt || '',
    l.rejectedBy ? JSON.stringify(l.rejectedBy) : '',
    l.createdAt,
  ];
}

export function rowToLeave(row: string[]): LeaveRequest {
  const safeParse = (val?: string) => {
    if (!val) return undefined;
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  };

  return {
    id: row[0] || '',
    userId: row[1] || '',
    userName: row[2] || '',
    requesterRole: ((row[3] as Role) || 'employee'),
    department: (row[4] || '').trim(),
    leaveType: (row[5] as LeaveType) || 'vacation',
    durationType: (row[6] as LeaveDuration) || 'full',
    startDate: row[7] || '',
    endDate: row[8] || row[7] || '',
    totalDays: Number(row[9] ?? 1),
    reason: row[10] || '',
    locationDetail: row[11] || undefined,
    attachmentUrl: row[12] || undefined,
    attachmentName: row[13] || undefined,
    status: (row[14] as LeaveStatus) || 'pending_manager',
    managerApproval: safeParse(row[15]),
    cLevelApproval: safeParse(row[16]),
    hrApproval: safeParse(row[17]),
    cLevelNotifiedAt: row[18] || undefined,
    rejectedBy: safeParse(row[19]),
    createdAt: row[20] || new Date().toISOString(),
  };
}

export const HOLIDAY_SHEET_HEADERS = ['id', 'date', 'name'];

export function holidayToRow(h: Holiday): string[] {
  return [h.id, h.date, h.name];
}

export function rowToHoliday(row: string[]): Holiday {
  return {
    id: row[0] || '',
    date: row[1] || '',
    name: row[2] || '',
  };
}

export const ATTENDANCE_SHEET_HEADERS = [
  'id',
  'userId',
  'userName',
  'department',
  'date',
  'checkInTime',
  'checkOutTime',
  'workLocation',
  'note',
];

export function attendanceToRow(a: AttendanceRecord): string[] {
  return [
    a.id,
    a.userId,
    a.userName,
    a.department,
    a.date,
    a.checkInTime,
    a.checkOutTime || '',
    a.workLocation,
    (a.note || '').slice(0, 2000),
  ];
}

export function rowToAttendance(row: string[]): AttendanceRecord {
  return {
    id: row[0] || '',
    userId: row[1] || '',
    userName: row[2] || '',
    department: (row[3] || '').trim(),
    date: row[4] || '',
    checkInTime: row[5] || '',
    checkOutTime: row[6] || undefined,
    workLocation: ((row[7] as WorkLocationType) || 'office'),
    note: row[8] || undefined,
  };
}

export function userToAppSheetRow(u: User): Record<string, string | number> {
  const row = userToRow(u);
  const obj: Record<string, string | number> = {};
  USER_SHEET_HEADERS.forEach((h, idx) => {
    obj[h] = row[idx] ?? '';
  });
  return obj;
}

export function leaveToAppSheetRow(
  l: LeaveRequest
): Record<string, string | number> {
  const row = leaveToRow(l);
  const obj: Record<string, string | number> = {};
  LEAVE_SHEET_HEADERS.forEach((h, idx) => {
    obj[h] = row[idx] ?? '';
  });
  return obj;
}

export function holidayToAppSheetRow(h: Holiday): Record<string, string> {
  const row = holidayToRow(h);
  const obj: Record<string, string> = {};
  HOLIDAY_SHEET_HEADERS.forEach((header, idx) => {
    obj[header] = row[idx] ?? '';
  });
  return obj;
}

export function attendanceToAppSheetRow(
  a: AttendanceRecord
): Record<string, string> {
  const row = attendanceToRow(a);
  const obj: Record<string, string> = {};
  ATTENDANCE_SHEET_HEADERS.forEach((header, idx) => {
    obj[header] = row[idx] ?? '';
  });
  return obj;
}

/**
 * เชื่อมต่อ AppSheet REST API v2 แบบ Parallel (เมื่อมีการตั้งค่า APPSHEET_APP_ID และ APPSHEET_ACCESS_KEY)
 * เพื่อให้การยื่น/อนุมัติใบลา หรือ Check-in/Check-out บนหน้าเว็บไปกระตุ้น Automation Bots บน AppSheet ด้วย
 */
export async function syncToAppSheetTable(
  tableName: 'Users' | 'LeaveRequests' | 'Holidays' | 'Attendance',
  action: 'Add' | 'Edit' | 'Delete',
  rows: Record<string, string | number>[],
  runAsUserEmail?: string
): Promise<{ synced: boolean; error?: string }> {
  const { appId, accessKey, configured } = getEffectiveAppSheetConfig();
  if (!configured || rows.length === 0) {
    return { synced: false };
  }

  const endpoint = `https://api.appsheet.com/api/v2/apps/${encodeURIComponent(
    appId
  )}/tables/${encodeURIComponent(tableName)}/Action`;

  const postAction = async (
    targetAction: 'Add' | 'Edit' | 'Delete'
  ): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ApplicationAccessKey: accessKey,
        },
        body: JSON.stringify({
          Action: targetAction,
          Properties: {
            Locale: 'th-TH',
            Timezone: 'Asia/Bangkok',
            ...(runAsUserEmail ? { RunAsUserEmail: runAsUserEmail } : {}),
          },
          Rows: rows,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await postAction(action);

    // หากบันทึกแถวลง Google Sheets ไปก่อนแล้วและ AppSheet ตอบกลับว่ามี Key ซ้ำตอน Add ให้สลับเป็น Edit อัตโนมัติเพื่อกระตุ้น Bot
    if (!response.ok && action === 'Add') {
      const retryEdit = await postAction('Edit');
      if (retryEdit.ok) {
        return { synced: true };
      }
      response = retryEdit;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        synced: false,
        error: `AppSheet API HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    return { synced: true };
  } catch (err) {
    return {
      synced: false,
      error: err instanceof Error ? err.message : 'AppSheet API network error',
    };
  }
}

// ============================================================================
// Google Sheets API Client
// ============================================================================

function getGoogleServiceAccountAuth() {
  const cfg = getRuntimeAppConfig();
  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    cfg.googleServiceAccountEmail?.trim();
  const rawKey =
    process.env.GOOGLE_PRIVATE_KEY?.trim() ||
    cfg.googlePrivateKey?.trim() ||
    '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  return new JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getGoogleSheetsClient() {
  const cfg = getRuntimeAppConfig();
  const spreadsheetId =
    process.env.GOOGLE_SHEET_ID?.trim() || cfg.googleSheetId?.trim();
  const auth = getGoogleServiceAccountAuth();
  const sheets = createSheetsClient({ version: 'v4', auth });
  return { sheets, spreadsheetId: spreadsheetId! };
}

async function ensureGoogleSheetsStructure() {
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(
    (meta.data.sheets || []).map((s) => s.properties?.title || '')
  );

  const requiredTabs = ['Users', 'LeaveRequests', 'Holidays', 'Attendance'];
  const requests = requiredTabs
    .filter((t) => !existingTitles.has(t))
    .map((title) => ({
      addSheet: { properties: { title } },
    }));

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }
}

async function readFromGoogleSheets(): Promise<DatabaseState> {
  await ensureGoogleSheetsStructure();
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      'Users!A2:M1000',
      'LeaveRequests!A2:U5000',
      'Holidays!A2:C500',
      'Attendance!A2:I5000',
    ],
  });

  const valueRanges = res.data.valueRanges || [];
  const userRows = (valueRanges[0]?.values as string[][] | undefined) || [];
  const leaveRows = (valueRanges[1]?.values as string[][] | undefined) || [];
  const holidayRows = (valueRanges[2]?.values as string[][] | undefined) || [];
  const attendanceRows =
    (valueRanges[3]?.values as string[][] | undefined) || [];

  if (userRows.length === 0) {
    const initial = cloneInitialState();
    await writeToGoogleSheets(initial);
    return initial;
  }

  return {
    users: userRows.filter((r) => r[0]).map(rowToUser),
    leaveRequests: leaveRows.filter((r) => r[0]).map(rowToLeave),
    holidays: holidayRows.filter((r) => r[0]).map(rowToHoliday),
    attendance: attendanceRows.filter((r) => r[0]).map(rowToAttendance),
  };
}

async function writeToGoogleSheets(state: DatabaseState): Promise<void> {
  await ensureGoogleSheetsStructure();
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: [
        'Users!A1:M1000',
        'LeaveRequests!A1:U5000',
        'Holidays!A1:C500',
        'Attendance!A1:I5000',
      ],
    },
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: 'Users!A1',
          values: [USER_SHEET_HEADERS, ...state.users.map(userToRow)],
        },
        {
          range: 'LeaveRequests!A1',
          values: [
            LEAVE_SHEET_HEADERS,
            ...state.leaveRequests.map(leaveToRow),
          ],
        },
        {
          range: 'Holidays!A1',
          values: [HOLIDAY_SHEET_HEADERS, ...state.holidays.map(holidayToRow)],
        },
        {
          range: 'Attendance!A1',
          values: [
            ATTENDANCE_SHEET_HEADERS,
            ...state.attendance.map(attendanceToRow),
          ],
        },
      ],
    },
  });
}

// ============================================================================
// Unified Public Storage API
// ============================================================================

export async function getDatabaseState(): Promise<{
  state: DatabaseState;
  mode: 'google_sheets' | 'demo_local';
  syncError?: string;
}> {
  if (isGoogleSheetsConfigured()) {
    try {
      const state = await readFromGoogleSheets();
      return { state, mode: 'google_sheets' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google Sheets connection error';
      return {
        state: readLocalStore(),
        mode: 'demo_local',
        syncError: `ไม่สามารถเชื่อมต่อ Google Sheets ได้ (${message}) ระบบสลับมาใช้ฐานข้อมูลจำลองชั่วคราว`,
      };
    }
  }
  return { state: readLocalStore(), mode: 'demo_local' };
}

export async function saveDatabaseState(state: DatabaseState): Promise<{
  mode: 'google_sheets' | 'demo_local';
  syncError?: string;
}> {
  writeLocalStore(state);

  if (isGoogleSheetsConfigured()) {
    try {
      await writeToGoogleSheets(state);
      return { mode: 'google_sheets' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google Sheets write error';
      return {
        mode: 'demo_local',
        syncError: `บันทึกข้อมูลลง Google Sheets ไม่สำเร็จ (${message}) บันทึกในโหมด Local แทนแล้ว`,
      };
    }
  }
  return { mode: 'demo_local' };
}
