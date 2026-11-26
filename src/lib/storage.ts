import { JWT } from 'google-auth-library';
import { sheets as createSheetsClient } from 'googleapis/build/src/apis/sheets';
import fs from 'fs';
import path from 'path';
import {
  AttendanceRecord,
  Holiday,
  LeaveDuration,
  LeaveQuotas,
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
import {
  doesUserMatchEmail,
  extractWfhMeetLinkAndNote,
  normalizeAndValidateMeetLink,
  parseEmailList,
  STANDARD_LEAVE_QUOTAS,
} from './leave-utils';

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
  googleChatWebhookUrl?: string;
  googleChatWebhookUrl2?: string;
}

export type SheetTab = 'Users' | 'LeaveRequests' | 'Holidays' | 'Attendance';

export type SheetMutation =
  | {
      type: 'append';
      tab: SheetTab;
      rows: (string | number)[][];
    }
  | {
      type: 'upsertById';
      tab: SheetTab;
      items: Array<{ id: string; row: (string | number)[] }>;
    }
  | {
      type: 'deleteByIds';
      tab: SheetTab;
      ids: string[];
    };

export class GoogleSheetsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsUnavailableError';
  }
}

export class GoogleSheetsWriteGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsWriteGuardError';
  }
}

// Never hardcode webhook URLs or secrets in source code; configure via GOOGLE_CHAT_WEBHOOK_URL / GOOGLE_CHAT_WEBHOOK_URL_2 env vars.
export const DEFAULT_GOOGLE_CHAT_WEBHOOK_URL = '';
export const DEFAULT_GOOGLE_CHAT_WEBHOOK_URL_2 = '';

const DATA_FILE_PATH = path.join(process.cwd(), '.data', 'hr-store.json');
const CONFIG_FILE_PATH = path.join(process.cwd(), '.data', 'app-config.json');

let memoryStore: DatabaseState | null = null;
let memoryConfig: RuntimeAppConfig | null = null;

// Tracks DatabaseState instances genuinely loaded from Google Sheets so fallback/mock
// states can NEVER overwrite production Google Sheets data.
const googleSheetsOriginStates = new WeakSet<DatabaseState>();

// In-process async mutex to serialize read-modify-write mutations and prevent lost updates.
let databaseLockTail: Promise<void> = Promise.resolve();

export async function withDatabaseLock<T>(task: () => Promise<T>): Promise<T> {
  const prev = databaseLockTail;
  let release!: () => void;
  databaseLockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await task();
  } finally {
    release();
  }
}

export function getRuntimeAppConfig(): RuntimeAppConfig {
  if (memoryConfig) {
    return memoryConfig;
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    memoryConfig = {};
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
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return updated;
  }
  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = JSON.stringify(updated, null, 2);
    const tmpPath = `${CONFIG_FILE_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    try {
      fs.writeFileSync(tmpPath, payload, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmpPath, CONFIG_FILE_PATH);
    } catch {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure
      }
      fs.writeFileSync(CONFIG_FILE_PATH, payload, {
        encoding: 'utf-8',
        mode: 0o600,
      });
    }
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

function normalizeWebhookEnvValue(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function isValidGoogleChatWebhookUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const candidate = normalizeWebhookEnvValue(raw);
  if (!candidate) return false;
  try {
    const parsedUrl = new URL(candidate);
    return (
      parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname === 'chat.googleapis.com' &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      !parsedUrl.port &&
      parsedUrl.pathname.startsWith('/v1/spaces/')
    );
  } catch {
    return false;
  }
}

export function getEffectiveGoogleChatWebhookUrl(): string {
  const cfg = getRuntimeAppConfig();
  return (
    normalizeWebhookEnvValue(process.env.GOOGLE_CHAT_WEBHOOK_URL) ||
    normalizeWebhookEnvValue(cfg.googleChatWebhookUrl) ||
    ''
  );
}

export function getEffectiveGoogleChatWebhookUrl2(): string {
  const cfg = getRuntimeAppConfig();
  return (
    normalizeWebhookEnvValue(process.env.GOOGLE_CHAT_WEBHOOK_URL_2) ||
    normalizeWebhookEnvValue(cfg.googleChatWebhookUrl2) ||
    ''
  );
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

function parseQuotaNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return num;
}

export function normalizeUserQuotas(
  raw?: Partial<LeaveQuotas> | null
): LeaveQuotas {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    sick: parseQuotaNumber(src.sick, STANDARD_LEAVE_QUOTAS.sick),
    personal: parseQuotaNumber(src.personal, STANDARD_LEAVE_QUOTAS.personal),
    vacation: parseQuotaNumber(src.vacation, STANDARD_LEAVE_QUOTAS.vacation),
    wfh: parseQuotaNumber(src.wfh, STANDARD_LEAVE_QUOTAS.wfh),
    wfa: parseQuotaNumber(src.wfa, STANDARD_LEAVE_QUOTAS.wfa),
    offsite: parseQuotaNumber(src.offsite, STANDARD_LEAVE_QUOTAS.offsite),
  };
}

function cloneInitialState(): DatabaseState {
  return {
    users: JSON.parse(JSON.stringify(INITIAL_USERS)),
    leaveRequests: JSON.parse(JSON.stringify(INITIAL_LEAVE_REQUESTS)),
    holidays: JSON.parse(JSON.stringify(INITIAL_HOLIDAYS)),
    attendance: JSON.parse(JSON.stringify(INITIAL_ATTENDANCE)),
  };
}

export function loadLocalStoreFromFile(
  filePath: string = DATA_FILE_PATH
): DatabaseState | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
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
      // Preserve custom quotas configured on each user; only fill missing/invalid fields with defaults.
      for (const u of parsed.users) {
        u.quotas = normalizeUserQuotas(u.quotas);
      }
      return parsed;
    }
  } catch {
    // Ignore file read/parse errors
  }
  return null;
}

function cloneState(state: DatabaseState): DatabaseState {
  return JSON.parse(JSON.stringify(state)) as DatabaseState;
}

function readLocalStore(): DatabaseState {
  if (memoryStore) {
    return cloneState(memoryStore);
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    memoryStore = cloneInitialState();
    return cloneState(memoryStore);
  }
  const loaded = loadLocalStoreFromFile(DATA_FILE_PATH);
  if (loaded) {
    memoryStore = loaded;
    return cloneState(memoryStore);
  }
  memoryStore = cloneInitialState();
  writeLocalStore(memoryStore);
  return cloneState(memoryStore);
}

function writeLocalStore(state: DatabaseState): void {
  memoryStore = cloneState(state);
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = JSON.stringify(state, null, 2);
    const tmpPath = `${DATA_FILE_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    try {
      fs.writeFileSync(tmpPath, payload, 'utf-8');
      fs.renameSync(tmpPath, DATA_FILE_PATH);
    } catch {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure
      }
      fs.writeFileSync(DATA_FILE_PATH, payload, 'utf-8');
    }
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
        doesUserMatchEmail(u, preserveUser.email) ||
        (preserveUser.secondaryEmail &&
          doesUserMatchEmail(u, preserveUser.secondaryEmail))
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
  'cLevelApproverId',
  'avatarUrl',
];

export function userToRow(u: User): (string | number)[] {
  const serializedEmail =
    u.secondaryEmail &&
    u.secondaryEmail.trim().toLowerCase() !== (u.email || '').trim().toLowerCase()
      ? `${u.email || ''}, ${u.secondaryEmail.trim().toLowerCase()}`
      : u.email || '';
  const q = normalizeUserQuotas(u.quotas);
  return [
    u.id,
    u.name,
    u.englishName || '',
    serializedEmail,
    u.role,
    u.department,
    u.position,
    u.startDate || '2023-01-01',
    q.sick,
    q.personal,
    q.vacation,
    q.wfh,
    q.wfa,
    u.cLevelApproverId || '',
    u.avatarUrl || '',
  ];
}

export function rowToUser(row: string[]): User {
  const rawEmailCell = (row[3] || '').trim();
  const parsedEmails = parseEmailList(rawEmailCell);
  const email = parsedEmails[0] || rawEmailCell;
  const secondaryEmail = parsedEmails[1] || undefined;
  const derivedUsername = email.includes('@')
    ? email.split('@')[0].split('.')[0]
    : (row[0] || '').toLowerCase();

  return {
    id: row[0] || '',
    name: row[1] || '',
    englishName: row[2] || '',
    email,
    ...(secondaryEmail ? { secondaryEmail } : {}),
    role: ((row[4] as Role) || 'employee'),
    department: (row[5] || '').trim() || 'General',
    position: row[6] || 'Staff',
    startDate: row[7] || '2023-01-01',
    username: derivedUsername,
    cLevelApproverId: row[13] || undefined,
    avatarUrl: (row[14] || '').trim() || undefined,
    quotas: {
      sick: parseQuotaNumber(row[8], STANDARD_LEAVE_QUOTAS.sick),
      personal: parseQuotaNumber(row[9], STANDARD_LEAVE_QUOTAS.personal),
      vacation: parseQuotaNumber(row[10], STANDARD_LEAVE_QUOTAS.vacation),
      wfh: parseQuotaNumber(row[11], STANDARD_LEAVE_QUOTAS.wfh),
      wfa: parseQuotaNumber(row[12], STANDARD_LEAVE_QUOTAS.wfa),
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
  'targetApproverId',
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
    l.targetApproverId || '',
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
    targetApproverId: row[21] || undefined,
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
  let serializedNote = (a.note || '').trim();
  if (a.workLocation === 'wfh') {
    const { meetLink, extraNote } = extractWfhMeetLinkAndNote(a);
    if (meetLink) {
      serializedNote = extraNote ? `${meetLink} • ${extraNote}` : meetLink;
    }
  } else if (a.workLocation === 'offsite' && a.locationName?.trim() && !serializedNote) {
    serializedNote = a.locationName.trim();
  }

  return [
    a.id,
    a.userId,
    a.userName,
    a.department,
    a.date,
    a.checkInTime,
    a.checkOutTime || '',
    a.workLocation,
    serializedNote.slice(0, 2000),
  ];
}

export function rowToAttendance(row: string[]): AttendanceRecord {
  const note = row[8] || undefined;
  const workLocation = ((row[7] as WorkLocationType) || 'office');
  let locationName: string | undefined = undefined;
  let meetLink: string | undefined = undefined;
  if (workLocation === 'offsite' && note) {
    locationName = note.includes(' • ') ? note.split(' • ')[0].trim() : note.trim();
  } else if (workLocation === 'wfh' && note) {
    const firstPart = note.includes(' • ') ? note.split(' • ')[0].trim() : note.trim();
    const checked = normalizeAndValidateMeetLink(firstPart);
    if (checked.valid && checked.normalizedUrl) {
      meetLink = checked.normalizedUrl;
    }
  }
  return {
    id: row[0] || '',
    userId: row[1] || '',
    userName: row[2] || '',
    department: (row[3] || '').trim(),
    date: row[4] || '',
    checkInTime: row[5] || '',
    checkOutTime: row[6] || undefined,
    workLocation,
    locationName,
    ...(meetLink ? { meetLink } : {}),
    note,
  };
}

export function userToAppSheetRow(u: User): Record<string, string | number> {
  const row = userToRow(u);
  const obj: Record<string, string | number> = {};
  USER_SHEET_HEADERS.forEach((h, idx) => {
    obj[h] = row[idx] ?? '';
  });
  obj['email'] = u.email || '';
  if (u.secondaryEmail) {
    obj['SecondaryEmail'] = u.secondaryEmail;
  }
  obj['CLevelApproverId'] = u.cLevelApproverId || '';
  obj['AvatarUrl'] = u.avatarUrl || '';
  return obj;
}

export function appSheetRowToUser(row: Record<string, any>): User {
  const rawEmail = (row.email || row.Email || '').toString().trim();
  const parsedEmails = parseEmailList(rawEmail);
  const email = parsedEmails[0] || rawEmail;
  const explicitSecondary = (
    row.SecondaryEmail ||
    row.secondaryEmail ||
    parsedEmails[1] ||
    ''
  )
    .toString()
    .trim()
    .toLowerCase();
  const secondaryEmail =
    explicitSecondary && explicitSecondary !== email.toLowerCase()
      ? explicitSecondary
      : undefined;
  const derivedUsername = email.includes('@')
    ? email.split('@')[0].split('.')[0]
    : (row.id || row.Id || row.ID || '').toString().toLowerCase();

  const cLevelApproverId = (
    row.CLevelApproverId ||
    row.cLevelApproverId ||
    row.clevelapproverid ||
    ''
  ).toString().trim();

  return {
    id: (row.id || row.Id || row.ID || '').toString().trim(),
    name: (row.name || row.Name || '').toString().trim(),
    englishName: (row.englishName || row.EnglishName || '').toString().trim(),
    email,
    ...(secondaryEmail ? { secondaryEmail } : {}),
    role: ((row.role || row.Role || 'employee') as Role),
    department: ((row.department || row.Department || '').toString()).trim() || 'General',
    position: (row.position || row.Position || 'Staff').toString().trim(),
    startDate: (row.startDate || row.StartDate || '2023-01-01').toString().trim(),
    username: (row.username || row.Username || derivedUsername).toString().trim(),
    cLevelApproverId: cLevelApproverId || undefined,
    avatarUrl: (row.avatarUrl || row.AvatarUrl || '').toString().trim() || undefined,
    quotas: {
      sick: parseQuotaNumber(
        row.sickQuota ?? row.SickQuota,
        STANDARD_LEAVE_QUOTAS.sick
      ),
      personal: parseQuotaNumber(
        row.personalQuota ?? row.PersonalQuota,
        STANDARD_LEAVE_QUOTAS.personal
      ),
      vacation: parseQuotaNumber(
        row.vacationQuota ?? row.VacationQuota,
        STANDARD_LEAVE_QUOTAS.vacation
      ),
      wfh: parseQuotaNumber(
        row.wfhQuota ?? row.WfhQuota,
        STANDARD_LEAVE_QUOTAS.wfh
      ),
      wfa: parseQuotaNumber(
        row.wfaQuota ?? row.WfaQuota,
        STANDARD_LEAVE_QUOTAS.wfa
      ),
      offsite: 0,
    },
  };
}

export function leaveToAppSheetRow(
  l: LeaveRequest
): Record<string, string | number> {
  const row = leaveToRow(l);
  const obj: Record<string, string | number> = {};
  LEAVE_SHEET_HEADERS.forEach((h, idx) => {
    obj[h] = row[idx] ?? '';
  });
  obj['TargetApproverId'] = l.targetApproverId || '';
  return obj;
}

export function appSheetRowToLeave(row: Record<string, any>): LeaveRequest {
  const safeParse = (val?: any) => {
    if (!val) return undefined;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  };

  const targetApproverId = (
    row.TargetApproverId ||
    row.targetApproverId ||
    row.targetapproverid ||
    ''
  ).toString().trim();

  return {
    id: (row.id || row.Id || row.ID || '').toString().trim(),
    userId: (row.userId || row.UserId || '').toString().trim(),
    userName: (row.userName || row.UserName || '').toString().trim(),
    requesterRole: ((row.requesterRole || row.RequesterRole || 'employee') as Role),
    department: ((row.department || row.Department || '').toString()).trim(),
    leaveType: ((row.leaveType || row.LeaveType || 'vacation') as LeaveType),
    durationType: ((row.durationType || row.DurationType || 'full') as LeaveDuration),
    startDate: (row.startDate || row.StartDate || '').toString().trim(),
    endDate: (
      row.endDate ||
      row.EndDate ||
      row.startDate ||
      row.StartDate ||
      ''
    ).toString().trim(),
    totalDays: Number(row.totalDays ?? row.TotalDays ?? 1),
    reason: (row.reason || row.Reason || '').toString(),
    locationDetail: (row.locationDetail || row.LocationDetail || undefined)?.toString(),
    attachmentUrl: (row.attachmentUrl || row.AttachmentUrl || undefined)?.toString(),
    attachmentName: (row.attachmentName || row.AttachmentName || undefined)?.toString(),
    status: ((row.status || row.Status || 'pending_manager') as LeaveStatus),
    targetApproverId: targetApproverId || undefined,
    managerApproval: safeParse(
      row.managerApproval || row.managerApprovalJson || row.ManagerApprovalJson
    ),
    cLevelApproval: safeParse(
      row.cLevelApproval || row.cLevelApprovalJson || row.CLevelApprovalJson
    ),
    hrApproval: safeParse(
      row.hrApproval || row.hrApprovalJson || row.HrApprovalJson
    ),
    cLevelNotifiedAt: (
      row.cLevelNotifiedAt ||
      row.CLevelNotifiedAt ||
      undefined
    )?.toString(),
    rejectedBy: safeParse(
      row.rejectedBy || row.rejectedByJson || row.RejectedByJson
    ),
    createdAt: (
      row.createdAt ||
      row.CreatedAt ||
      new Date().toISOString()
    ).toString(),
  };
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
// Google Sheets API Client (Unbounded Ranges + Row-Level Safe Mutations)
// ============================================================================

export const SHEET_TAB_CONFIG: Record<
  SheetTab,
  { headers: string[]; lastCol: string; fullRange: string; dataRange: string }
> = {
  Users: {
    headers: USER_SHEET_HEADERS,
    lastCol: 'O',
    fullRange: 'Users!A1:O',
    dataRange: 'Users!A2:O',
  },
  LeaveRequests: {
    headers: LEAVE_SHEET_HEADERS,
    lastCol: 'V',
    fullRange: 'LeaveRequests!A1:V',
    dataRange: 'LeaveRequests!A2:V',
  },
  Holidays: {
    headers: HOLIDAY_SHEET_HEADERS,
    lastCol: 'C',
    fullRange: 'Holidays!A1:C',
    dataRange: 'Holidays!A2:C',
  },
  Attendance: {
    headers: ATTENDANCE_SHEET_HEADERS,
    lastCol: 'I',
    fullRange: 'Attendance!A1:I',
    dataRange: 'Attendance!A2:I',
  },
};

export interface GoogleSheetsClientLike {
  spreadsheets: {
    get: (params: { spreadsheetId: string }) => Promise<{
      data: {
        sheets?: Array<{ properties?: { title?: string | null; sheetId?: number | null } }>;
      };
    }>;
    batchUpdate: (params: {
      spreadsheetId: string;
      requestBody: any;
    }) => Promise<any>;
    values: {
      get: (params: {
        spreadsheetId: string;
        range: string;
      }) => Promise<{ data: { values?: any[][] | null } }>;
      batchGet: (params: {
        spreadsheetId: string;
        ranges: string[];
      }) => Promise<{
        data: { valueRanges?: Array<{ values?: any[][] | null }> };
      }>;
      update: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: { values: (string | number)[][] };
      }) => Promise<any>;
      append: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        insertDataOption?: string;
        requestBody: { values: (string | number)[][] };
      }) => Promise<any>;
      batchUpdate: (params: {
        spreadsheetId: string;
        requestBody: {
          valueInputOption: string;
          data: Array<{ range: string; values: (string | number)[][] }>;
        };
      }) => Promise<any>;
      batchClear: (params: {
        spreadsheetId: string;
        requestBody: { ranges: string[] };
      }) => Promise<any>;
    };
  };
}

type GoogleSheetsClientFactory = () => Promise<{
  sheets: GoogleSheetsClientLike;
  spreadsheetId: string;
}>;

let testSheetsClientFactory: GoogleSheetsClientFactory | null = null;

export function setGoogleSheetsClientFactoryForTest(
  factory: GoogleSheetsClientFactory | null
): void {
  testSheetsClientFactory = factory;
}

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

async function getGoogleSheetsClient(): Promise<{
  sheets: GoogleSheetsClientLike;
  spreadsheetId: string;
}> {
  if (testSheetsClientFactory) {
    return testSheetsClientFactory();
  }
  const cfg = getRuntimeAppConfig();
  const spreadsheetId =
    process.env.GOOGLE_SHEET_ID?.trim() || cfg.googleSheetId?.trim();
  const auth = getGoogleServiceAccountAuth();
  const sheets = createSheetsClient({ version: 'v4', auth }) as unknown as GoogleSheetsClientLike;
  return { sheets, spreadsheetId: spreadsheetId! };
}

async function ensureGoogleSheetsStructure(): Promise<Map<SheetTab, number>> {
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetIdByTitle = new Map<string, number>();

  for (const s of meta.data.sheets || []) {
    const title = s.properties?.title || '';
    const sheetId = s.properties?.sheetId;
    if (title && typeof sheetId === 'number') {
      sheetIdByTitle.set(title, sheetId);
    }
  }

  const requiredTabs: SheetTab[] = [
    'Users',
    'LeaveRequests',
    'Holidays',
    'Attendance',
  ];
  const missingTabs = requiredTabs.filter((t) => !sheetIdByTitle.has(t));

  if (missingTabs.length > 0) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missingTabs.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });
    const replies = res?.data?.replies || [];
    missingTabs.forEach((title, idx) => {
      const addedId = replies[idx]?.addSheet?.properties?.sheetId;
      if (typeof addedId === 'number') {
        sheetIdByTitle.set(title, addedId);
      }
    });

    // If any newly added tab ID wasn't returned in replies, refresh metadata once
    if (missingTabs.some((t) => !sheetIdByTitle.has(t))) {
      const refreshed = await sheets.spreadsheets.get({ spreadsheetId });
      for (const s of refreshed.data.sheets || []) {
        const title = s.properties?.title || '';
        const sheetId = s.properties?.sheetId;
        if (title && typeof sheetId === 'number') {
          sheetIdByTitle.set(title, sheetId);
        }
      }
    }

    // Write headers to newly created tabs
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: missingTabs.map((tab) => ({
          range: `${tab}!A1`,
          values: [SHEET_TAB_CONFIG[tab].headers],
        })),
      },
    });
  }

  const result = new Map<SheetTab, number>();
  for (const tab of requiredTabs) {
    const id = sheetIdByTitle.get(tab);
    if (typeof id === 'number') {
      result.set(tab, id);
    }
  }
  return result;
}

function stripHeaderRow(rows: string[][]): string[][] {
  if (rows.length === 0) return [];
  const firstCell = String(rows[0]?.[0] ?? '').trim().toLowerCase();
  if (firstCell === 'id') {
    return rows.slice(1);
  }
  return rows;
}

async function readFromGoogleSheets(): Promise<DatabaseState> {
  await ensureGoogleSheetsStructure();
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();

  // Open-ended ranges (no artificial 500/1000/5000 row limit)
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      SHEET_TAB_CONFIG.Users.fullRange,
      SHEET_TAB_CONFIG.LeaveRequests.fullRange,
      SHEET_TAB_CONFIG.Holidays.fullRange,
      SHEET_TAB_CONFIG.Attendance.fullRange,
    ],
  });

  const valueRanges = res.data.valueRanges;
  if (!Array.isArray(valueRanges) || valueRanges.length !== 4) {
    throw new Error(
      `Google Sheets API returned incomplete batchGet response (expected 4 tabs, got ${
        Array.isArray(valueRanges) ? valueRanges.length : 0
      })`
    );
  }
  const userRows = stripHeaderRow(
    (valueRanges[0]?.values as string[][] | undefined) || []
  ).filter((r) => Boolean(r[0]));
  const leaveRows = stripHeaderRow(
    (valueRanges[1]?.values as string[][] | undefined) || []
  ).filter((r) => Boolean(r[0]));
  const holidayRows = stripHeaderRow(
    (valueRanges[2]?.values as string[][] | undefined) || []
  ).filter((r) => Boolean(r[0]));
  const attendanceRows = stripHeaderRow(
    (valueRanges[3]?.values as string[][] | undefined) || []
  ).filter((r) => Boolean(r[0]));

  // Only seed initial state when ALL 4 tabs of the spreadsheet are genuinely brand-new & empty
  if (
    userRows.length === 0 &&
    leaveRows.length === 0 &&
    holidayRows.length === 0 &&
    attendanceRows.length === 0
  ) {
    const initial = cloneInitialState();
    googleSheetsOriginStates.add(initial);
    await writeToGoogleSheets(initial);
    return initial;
  }

  const state: DatabaseState = {
    users: userRows.map(rowToUser),
    leaveRequests: leaveRows.map(rowToLeave),
    holidays: holidayRows.map(rowToHoliday),
    attendance: attendanceRows.map(rowToAttendance),
  };
  googleSheetsOriginStates.add(state);
  return state;
}

/**
 * Non-destructive full-table write:
 * 1. Writes all new rows IN-PLACE first via values.batchUpdate (NEVER clears before writing).
 * 2. Only AFTER batchUpdate succeeds, clears excess trailing rows if a tab shrank.
 * If batchUpdate fails, existing sheet data remains 100% intact.
 */
async function writeToGoogleSheets(state: DatabaseState): Promise<void> {
  await ensureGoogleSheetsStructure();
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();

  // Measure existing row counts before overwriting so we can trim trailing excess rows AFTER write succeeds
  const existingCountsRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['Users!A:A', 'LeaveRequests!A:A', 'Holidays!A:A', 'Attendance!A:A'],
  });
  const prevCounts = (existingCountsRes.data.valueRanges || []).map(
    (vr) => (vr.values || []).length
  );

  const tabData: Array<{ tab: SheetTab; values: (string | number)[][] }> = [
    {
      tab: 'Users',
      values: [USER_SHEET_HEADERS, ...state.users.map(userToRow)],
    },
    {
      tab: 'LeaveRequests',
      values: [LEAVE_SHEET_HEADERS, ...state.leaveRequests.map(leaveToRow)],
    },
    {
      tab: 'Holidays',
      values: [HOLIDAY_SHEET_HEADERS, ...state.holidays.map(holidayToRow)],
    },
    {
      tab: 'Attendance',
      values: [
        ATTENDANCE_SHEET_HEADERS,
        ...state.attendance.map(attendanceToRow),
      ],
    },
  ];

  // Step 1: Write new values in-place FIRST (never clear beforehand!)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: tabData.map(({ tab, values }) => ({
        range: `${tab}!A1`,
        values,
      })),
    },
  });

  // Step 2: Only after write succeeds, clear any leftover trailing rows if a tab shrank
  const trailingClearRanges: string[] = [];
  tabData.forEach(({ tab, values }, idx) => {
    const prevRowCount = prevCounts[idx] || 0;
    const newRowCount = values.length;
    if (prevRowCount > newRowCount) {
      const lastCol = SHEET_TAB_CONFIG[tab].lastCol;
      trailingClearRanges.push(
        `${tab}!A${newRowCount + 1}:${lastCol}${prevRowCount}`
      );
    }
  });

  if (trailingClearRanges.length > 0) {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges: trailingClearRanges },
    });
  }
}

/**
 * Targeted row-level mutations on Google Sheets (append / upsertById / deleteByIds).
 * Never clears the sheet and never touches unrelated rows or unrelated tabs.
 */
async function applySheetMutations(mutations: SheetMutation[]): Promise<void> {
  if (mutations.length === 0) return;

  const sheetIdMap = await ensureGoogleSheetsStructure();
  const { sheets, spreadsheetId } = await getGoogleSheetsClient();

  for (const mutation of mutations) {
    const cfg = SHEET_TAB_CONFIG[mutation.tab];

    if (mutation.type === 'append') {
      if (mutation.rows.length === 0) continue;

      // Ensure header row exists on empty tab before appending
      const headerCheck = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${mutation.tab}!A1:A1`,
      });
      if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${mutation.tab}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [cfg.headers] },
        });
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${mutation.tab}!A:${cfg.lastCol}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: mutation.rows },
      });
      continue;
    }

    if (mutation.type === 'upsertById') {
      if (mutation.items.length === 0) continue;

      const colARes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${mutation.tab}!A:A`,
      });
      const colARows = colARes.data.values || [];

      if (colARows.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${mutation.tab}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [cfg.headers] },
        });
      }

      const idToRowNum = new Map<string, number>();
      colARows.forEach((r, idx) => {
        const cellId = String(r?.[0] ?? '').trim();
        if (idx === 0 && cellId.toLowerCase() === 'id') return;
        if (cellId) {
          idToRowNum.set(cellId, idx + 1); // 1-based sheet row number
        }
      });

      const updates: Array<{ range: string; values: (string | number)[][] }> =
        [];
      const appends: (string | number)[][] = [];

      for (const item of mutation.items) {
        const paddedRow =
          item.row.length < cfg.headers.length
            ? [
                ...item.row,
                ...Array(cfg.headers.length - item.row.length).fill(''),
              ]
            : item.row;
        const rowNum = idToRowNum.get(item.id.trim());
        if (rowNum !== undefined) {
          updates.push({
            range: `${mutation.tab}!A${rowNum}:${cfg.lastCol}${rowNum}`,
            values: [paddedRow],
          });
        } else {
          appends.push(paddedRow);
        }
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: updates,
          },
        });
      }

      if (appends.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${mutation.tab}!A:${cfg.lastCol}`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: appends },
        });
      }
      continue;
    }

    if (mutation.type === 'deleteByIds') {
      if (mutation.ids.length === 0) continue;
      const targetIds = new Set(mutation.ids.map((id) => id.trim()).filter(Boolean));
      if (targetIds.size === 0) continue;

      const colARes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${mutation.tab}!A:A`,
      });
      const colARows = colARes.data.values || [];

      const zeroBasedIndices: number[] = [];
      colARows.forEach((r, idx) => {
        const cellId = String(r?.[0] ?? '').trim();
        if (idx === 0 && cellId.toLowerCase() === 'id') return;
        if (targetIds.has(cellId)) {
          zeroBasedIndices.push(idx);
        }
      });

      if (zeroBasedIndices.length === 0) continue;

      const sheetId = sheetIdMap.get(mutation.tab);
      if (sheetId === undefined) {
        throw new Error(`ไม่พบ sheetId ของแท็บ ${mutation.tab}`);
      }

      // Delete bottom-up (descending) so lower row indices never shift
      zeroBasedIndices.sort((a, b) => b - a);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: zeroBasedIndices.map((rowIdx) => ({
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIdx,
                endIndex: rowIdx + 1,
              },
            },
          })),
        },
      });
    }
  }
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
      // NEVER silently fall back to local mock data when Google Sheets is configured,
      // because a subsequent write would overwrite production Google Sheets with mock data.
      throw new GoogleSheetsUnavailableError(
        `ไม่สามารถเชื่อมต่อ Google Sheets ได้ชั่วคราว (${message}) กรุณาลองใหม่อีกครั้ง`
      );
    }
  }
  return { state: readLocalStore(), mode: 'demo_local' };
}

export async function saveDatabaseState(
  state: DatabaseState,
  mutations?: SheetMutation[]
): Promise<{
  mode: 'google_sheets' | 'demo_local';
  syncError?: string;
}> {
  if (isGoogleSheetsConfigured()) {
    if (!googleSheetsOriginStates.has(state)) {
      throw new GoogleSheetsWriteGuardError(
        'ปฏิเสธการบันทึก: ไม่อนุญาตให้เขียนข้อมูลจำลอง (Local/Mock) ทับ Google Sheets'
      );
    }
    if (mutations && mutations.length > 0) {
      await applySheetMutations(mutations);
    } else {
      await writeToGoogleSheets(state);
    }
    // Keep local mirror updated only after Google Sheets write succeeds
    writeLocalStore(state);
    return { mode: 'google_sheets' };
  }

  writeLocalStore(state);
  return { mode: 'demo_local' };
}
