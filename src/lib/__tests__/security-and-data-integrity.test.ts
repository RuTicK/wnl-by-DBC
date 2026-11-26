import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as authPost, DELETE as authDelete } from '@/app/api/auth/route';
import { GET as systemGet, POST as systemPost } from '@/app/api/system/route';
import { POST as leavesPost, PATCH as leavesPatch } from '@/app/api/leaves/route';
import {
  POST as attendancePost,
  PATCH as attendancePatch,
} from '@/app/api/attendance/route';
import {
  POST as employeesPost,
  DELETE as employeesDelete,
} from '@/app/api/employees/route';
import {
  POST as holidaysPost,
  DELETE as holidaysDelete,
} from '@/app/api/holidays/route';
import {
  authenticateUser,
  createLeaveRequest,
  deleteEmployee,
  deleteHoliday,
  processLeaveAction,
  recordCheckIn,
  resetDemoData,
  updateOwnTestingProfile,
  upsertEmployee,
  upsertHoliday,
  verifyGoogleOAuthCredentials,
} from '../hr-service';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../session';
import {
  appSheetRowToUser,
  ATTENDANCE_SHEET_HEADERS,
  attendanceToRow,
  DatabaseState,
  DEFAULT_GOOGLE_CHAT_WEBHOOK_URL,
  DEFAULT_GOOGLE_CHAT_WEBHOOK_URL_2,
  getDatabaseState,
  getRuntimeAppConfig,
  GoogleSheetsClientLike,
  GoogleSheetsUnavailableError,
  GoogleSheetsWriteGuardError,
  HOLIDAY_SHEET_HEADERS,
  holidayToRow,
  LEAVE_SHEET_HEADERS,
  leaveToRow,
  loadLocalStoreFromFile,
  rowToUser,
  saveDatabaseState,
  saveRuntimeAppConfig,
  setGoogleSheetsClientFactoryForTest,
  USER_SHEET_HEADERS,
  userToAppSheetRow,
  userToRow,
} from '../storage';
import { INITIAL_HOLIDAYS, INITIAL_LEAVE_REQUESTS, INITIAL_USERS } from '../mock-data';
import { STANDARD_LEAVE_QUOTAS } from '../leave-utils';

function cookieFor(user: { id: string; email: string }): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(user)}`;
}

// ============================================================================
// In-Memory Google Sheets API v4 Simulator for Deep Storage Integrity Testing
// ============================================================================
function createMockGoogleSheetsBackend(initialTabs?: {
  Users?: (string | number)[][];
  LeaveRequests?: (string | number)[][];
  Holidays?: (string | number)[][];
  Attendance?: (string | number)[][];
}) {
  const tabs = new Map<string, { sheetId: number; rows: string[][] }>([
    [
      'Users',
      {
        sheetId: 1,
        rows: (initialTabs?.Users || [USER_SHEET_HEADERS, ...INITIAL_USERS.map(userToRow)]).map(
          (r) => r.map(String)
        ),
      },
    ],
    [
      'LeaveRequests',
      {
        sheetId: 2,
        rows: (
          initialTabs?.LeaveRequests || [
            LEAVE_SHEET_HEADERS,
            ...INITIAL_LEAVE_REQUESTS.map(leaveToRow),
          ]
        ).map((r) => r.map(String)),
      },
    ],
    [
      'Holidays',
      {
        sheetId: 3,
        rows: (
          initialTabs?.Holidays || [
            HOLIDAY_SHEET_HEADERS,
            ...INITIAL_HOLIDAYS.map(holidayToRow),
          ]
        ).map((r) => r.map(String)),
      },
    ],
    [
      'Attendance',
      {
        sheetId: 4,
        rows: (initialTabs?.Attendance || [ATTENDANCE_SHEET_HEADERS]).map((r) =>
          r.map(String)
        ),
      },
    ],
  ]);

  const callLog: string[] = [];
  let failOnBatchGet = false;
  let failOnValuesBatchUpdate = false;
  let artificialDelayMs = 0;

  const parseRange = (range: string) => {
    const [tabName, a1 = 'A1'] = range.split('!');
    const match = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/i.exec(a1);
    const startRow = match?.[2] ? Number(match[2]) : 1;
    const endRow = match?.[4] ? Number(match[4]) : Infinity;
    const isColAOnly = a1.toUpperCase() === 'A:A';
    return { tabName, startRow, endRow, isColAOnly };
  };

  const maybeDelay = async () => {
    if (artificialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, artificialDelayMs));
    }
  };

  const client: GoogleSheetsClientLike = {
    spreadsheets: {
      get: async () => {
        callLog.push('spreadsheets.get');
        return {
          data: {
            sheets: Array.from(tabs.entries()).map(([title, info]) => ({
              properties: { title, sheetId: info.sheetId },
            })),
          },
        };
      },
      batchUpdate: async ({ requestBody }) => {
        callLog.push('spreadsheets.batchUpdate');
        await maybeDelay();
        for (const req of requestBody.requests || []) {
          if (req.addSheet?.properties?.title) {
            const title = req.addSheet.properties.title;
            if (!tabs.has(title)) {
              tabs.set(title, { sheetId: tabs.size + 1, rows: [] });
            }
          }
          if (req.deleteDimension?.range) {
            const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
            for (const info of tabs.values()) {
              if (info.sheetId === sheetId) {
                info.rows.splice(startIndex, endIndex - startIndex);
              }
            }
          }
        }
        return { data: {} };
      },
      values: {
        get: async ({ range }) => {
          callLog.push(`values.get:${range}`);
          await maybeDelay();
          const { tabName, startRow, endRow, isColAOnly } = parseRange(range);
          const tab = tabs.get(tabName);
          if (!tab) return { data: { values: [] } };
          const sliced = tab.rows.slice(
            startRow - 1,
            Number.isFinite(endRow) ? endRow : undefined
          );
          return {
            data: {
              values: isColAOnly ? sliced.map((r) => [r[0] ?? '']) : sliced,
            },
          };
        },
        batchGet: async ({ ranges }) => {
          callLog.push(`values.batchGet:${ranges.join(',')}`);
          await maybeDelay();
          if (failOnBatchGet) {
            throw new Error('Simulated Google Sheets 503 Unavailable');
          }
          return {
            data: {
              valueRanges: ranges.map((range) => {
                const { tabName, startRow, endRow, isColAOnly } = parseRange(range);
                const tab = tabs.get(tabName);
                if (!tab) return { values: [] };
                const sliced = tab.rows.slice(
                  startRow - 1,
                  Number.isFinite(endRow) ? endRow : undefined
                );
                return {
                  values: isColAOnly ? sliced.map((r) => [r[0] ?? '']) : sliced,
                };
              }),
            },
          };
        },
        update: async ({ range, requestBody }) => {
          callLog.push(`values.update:${range}`);
          await maybeDelay();
          const { tabName, startRow } = parseRange(range);
          const tab = tabs.get(tabName);
          if (!tab) return { data: {} };
          requestBody.values.forEach((row, idx) => {
            tab.rows[startRow - 1 + idx] = row.map(String);
          });
          return { data: {} };
        },
        append: async ({ range, requestBody }) => {
          callLog.push(`values.append:${range}`);
          await maybeDelay();
          const { tabName } = parseRange(range);
          const tab = tabs.get(tabName);
          if (!tab) return { data: {} };
          for (const row of requestBody.values) {
            tab.rows.push(row.map(String));
          }
          return { data: {} };
        },
        batchUpdate: async ({ requestBody }) => {
          callLog.push('values.batchUpdate');
          await maybeDelay();
          if (failOnValuesBatchUpdate) {
            throw new Error('Simulated Google Sheets Write Quota Exceeded');
          }
          for (const entry of requestBody.data) {
            const { tabName, startRow } = parseRange(entry.range);
            const tab = tabs.get(tabName);
            if (!tab) continue;
            entry.values.forEach((row, idx) => {
              tab.rows[startRow - 1 + idx] = row.map(String);
            });
          }
          return { data: {} };
        },
        batchClear: async ({ requestBody }) => {
          callLog.push(`values.batchClear:${requestBody.ranges.join(',')}`);
          await maybeDelay();
          for (const range of requestBody.ranges) {
            const { tabName, startRow, endRow } = parseRange(range);
            const tab = tabs.get(tabName);
            if (!tab) continue;
            const limit = Number.isFinite(endRow)
              ? Math.min(endRow, tab.rows.length)
              : tab.rows.length;
            for (let i = startRow - 1; i < limit; i++) {
              tab.rows[i] = [];
            }
            while (tab.rows.length > 0 && tab.rows[tab.rows.length - 1].length === 0) {
              tab.rows.pop();
            }
          }
          return { data: {} };
        },
      },
    },
  };

  return {
    tabs,
    callLog,
    client,
    setFailOnBatchGet: (v: boolean) => {
      failOnBatchGet = v;
    },
    setFailOnValuesBatchUpdate: (v: boolean) => {
      failOnValuesBatchUpdate = v;
    },
    setArtificialDelayMs: (ms: number) => {
      artificialDelayMs = ms;
    },
  };
}

describe('Security Hardening & Data Integrity Regression Suite (Items 1–10)', () => {
  beforeEach(async () => {
    setGoogleSheetsClientFactoryForTest(null);
    saveRuntimeAppConfig({
      googleSheetId: '',
      googleServiceAccountEmail: '',
      googlePrivateKey: '',
      googleChatWebhookUrl: '',
      googleChatWebhookUrl2: '',
      googleClientId: '',
      appsheetAppId: '',
      appsheetAccessKey: '',
    });
    await resetDemoData();
  });

  afterEach(() => {
    setGoogleSheetsClientFactoryForTest(null);
    saveRuntimeAppConfig({
      googleSheetId: '',
      googleServiceAccountEmail: '',
      googlePrivateKey: '',
      googleChatWebhookUrl: '',
      googleChatWebhookUrl2: '',
      googleClientId: '',
      appsheetAppId: '',
      appsheetAccessKey: '',
    });
  });

  describe('Item 1: Signed HttpOnly Session & Anti-Spoofing across all API routes', () => {
    it('rejects unauthenticated requests to every protected API endpoint with 401', async () => {
      const checks = [
        systemGet(new NextRequest('http://localhost:3000/api/system?userId=EMP001')),
        leavesPost(
          new NextRequest('http://localhost:3000/api/leaves', {
            method: 'POST',
            body: JSON.stringify({
              actorId: 'EMP001',
              leaveType: 'sick',
              durationType: 'full',
              startDate: '2026-12-07',
              endDate: '2026-12-07',
              reason: 'test',
            }),
          })
        ),
        leavesPatch(
          new NextRequest('http://localhost:3000/api/leaves', {
            method: 'PATCH',
            body: JSON.stringify({
              actorId: 'EMP001',
              leaveId: 'LV-2026-003',
              action: 'approve',
            }),
          })
        ),
        attendancePost(
          new NextRequest('http://localhost:3000/api/attendance', {
            method: 'POST',
            body: JSON.stringify({ actorId: 'EMP001', workLocation: 'office' }),
          })
        ),
        attendancePatch(
          new NextRequest('http://localhost:3000/api/attendance', {
            method: 'PATCH',
            body: JSON.stringify({ actorId: 'EMP001' }),
          })
        ),
        employeesPost(
          new NextRequest('http://localhost:3000/api/employees', {
            method: 'POST',
            body: JSON.stringify({
              actorId: 'EMP001',
              employee: { email: 'evil@dbc.co.th', role: 'hr', department: 'AE', startDate: '2025-01-01' },
            }),
          })
        ),
        employeesDelete(
          new NextRequest('http://localhost:3000/api/employees?actorId=EMP001&userId=EMP003', {
            method: 'DELETE',
          })
        ),
        holidaysPost(
          new NextRequest('http://localhost:3000/api/holidays', {
            method: 'POST',
            body: JSON.stringify({
              actorId: 'EMP001',
              holiday: { date: '2026-12-28', name: 'Evil Holiday' },
            }),
          })
        ),
        holidaysDelete(
          new NextRequest('http://localhost:3000/api/holidays?actorId=EMP001&holidayId=HOL-01', {
            method: 'DELETE',
          })
        ),
      ];

      const responses = await Promise.all(checks);
      for (const res of responses) {
        expect(res.status).toBe(401);
      }
    });

    it('rejects forged, tampered, and expired session tokens', () => {
      const valid = createSessionToken({ id: 'EMP001', email: 'siriporn.hr@company.co.th' });
      expect(verifySessionToken(valid)?.uid).toBe('EMP001');

      // Tamper with payload
      const [payloadPart, sigPart] = valid.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ uid: 'EMP001', email: 'attacker@evil.com', iat: 1, exp: 9999999999, v: 1 })
      ).toString('base64url');
      expect(verifySessionToken(`${tamperedPayload}.${sigPart}`)).toBeNull();

      // Tamper with signature
      expect(verifySessionToken(`${payloadPart}.invalidSig`)).toBeNull();

      // Expired token
      const expired = createSessionToken(
        { id: 'EMP001', email: 'siriporn.hr@company.co.th' },
        -10
      );
      expect(verifySessionToken(expired)).toBeNull();
    });

    it('ignores spoofed userId/actorId parameters and enforces the authenticated session user identity', async () => {
      const emp003Cookie = cookieFor({
        id: 'EMP003',
        email: 'somchai.it@company.co.th',
      });

      // 1. Spoofing GET /api/system?userId=EMP001 still returns ONLY EMP003's view
      const sysRes = await systemGet(
        new NextRequest('http://localhost:3000/api/system?userId=EMP001&year=2026', {
          headers: { cookie: emp003Cookie },
        })
      );
      expect(sysRes.status).toBe(200);
      const sysJson = await sysRes.json();
      expect(sysJson.currentUser.id).toBe('EMP003');
      expect(sysJson.allQuotas).toHaveLength(1);
      expect(sysJson.allQuotas[0].user.id).toBe('EMP003');

      // 2. Spoofing actorId: 'EMP001' (HR) to approve a leave fails because session is EMP003 (employee)
      const approveRes = await leavesPatch(
        new NextRequest('http://localhost:3000/api/leaves', {
          method: 'PATCH',
          headers: { cookie: emp003Cookie },
          body: JSON.stringify({
            actorId: 'EMP001',
            leaveId: 'LV-2026-003',
            action: 'approve',
          }),
        })
      );
      expect(approveRes.status).toBe(400);

      // 3. Spoofing actorId: 'EMP001' to delete another employee fails
      const delEmpRes = await employeesDelete(
        new NextRequest(
          'http://localhost:3000/api/employees?actorId=EMP001&userId=EMP004',
          { method: 'DELETE', headers: { cookie: emp003Cookie } }
        )
      );
      expect(delEmpRes.status).toBe(400);

      // 4. Spoofing actorId: 'EMP001' to add a holiday fails
      const addHolRes = await holidaysPost(
        new NextRequest('http://localhost:3000/api/holidays', {
          method: 'POST',
          headers: { cookie: emp003Cookie },
          body: JSON.stringify({
            actorId: 'EMP001',
            holiday: { date: '2026-12-29', name: 'Unauthorized Holiday' },
          }),
        })
      );
      expect(addHolRes.status).toBe(400);

      // 5. Spoofing actorId: 'EMP001' on check-in records attendance ONLY for EMP003
      const attRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: emp003Cookie },
          body: JSON.stringify({
            actorId: 'EMP001',
            date: '2026-12-15',
            checkInTime: '08:50',
            workLocation: 'office',
          }),
        })
      );
      expect(attRes.status).toBe(200);
      const attJson = await attRes.json();
      expect(attJson.record.userId).toBe('EMP003');
    });

    it('clears session cookie on DELETE /api/auth and immediately invalidates deleted users', async () => {
      const delRes = await authDelete(
        new NextRequest('http://localhost:3000/api/auth', { method: 'DELETE' })
      );
      expect(delRes.status).toBe(200);
      expect(delRes.headers.get('set-cookie') || '').toContain('Max-Age=0');

      // User EMP004 holds a valid session cookie, then HR deletes EMP004 -> cookie must be rejected (401)
      const emp004Cookie = cookieFor({
        id: 'EMP004',
        email: 'praew.it@company.co.th',
      });
      const del = await deleteEmployee('EMP001', 'EMP004');
      expect(del.success).toBe(true);

      const sysAfterDelete = await systemGet(
        new NextRequest('http://localhost:3000/api/system?year=2026', {
          headers: { cookie: emp004Cookie },
        })
      );
      expect(sysAfterDelete.status).toBe(401);
    });

    it('gracefully handles malformed percent-encoded Cookie headers (401, never 500) and never derives session secret from GOOGLE_SHEET_ID', async () => {
      const badCookieReq = new NextRequest('http://localhost:3000/api/system?year=2026', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` },
      });
      const protectedRes = await systemGet(badCookieReq);
      expect(protectedRes.status).toBe(401);

      const publicCfgRes = await systemGet(
        new NextRequest('http://localhost:3000/api/system?action=config', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` },
        })
      );
      expect(publicCfgRes.status).toBe(200);

      const sessionSrc = fs.readFileSync(
        path.resolve(__dirname, '../session.ts'),
        'utf-8'
      );
      expect(sessionSrc).not.toContain('process.env.GOOGLE_SHEET_ID');
    });
  });

  describe('Item 2: Blocks hardcoded passwords (1234 / GOOGLE_SSO) and unverified isGoogleLogin', () => {
    it('rejects password 1234, GOOGLE_SSO, and unverified isGoogleLogin at both API and service layers', async () => {
      const p1 = await authenticateUser('EMP001', '1234');
      expect(p1.success).toBe(false);

      const p2 = await authenticateUser('siriporn.hr@company.co.th', 'GOOGLE_SSO');
      expect(p2.success).toBe(false);

      const apiPass = await authPost(
        new NextRequest('http://localhost:3000/api/auth', {
          method: 'POST',
          body: JSON.stringify({ identifier: 'EMP001', password: '1234' }),
        })
      );
      expect(apiPass.status).toBe(401);

      const apiUnverifiedGoogle = await authPost(
        new NextRequest('http://localhost:3000/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            isGoogleLogin: true,
            googleEmail: 'siriporn.hr@company.co.th',
          }),
        })
      );
      expect(apiUnverifiedGoogle.status).toBe(401);
    });

    it('rejects Google access_token with mismatched audience (aud) when Client ID is configured', async () => {
      const originalFetch = globalThis.fetch;
      try {
        saveRuntimeAppConfig({
          googleClientId: 'my-real-client-id.apps.googleusercontent.com',
        });
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              aud: 'other-evil-app.apps.googleusercontent.com',
              email: 'siriporn.hr@company.co.th',
              email_verified: true,
            }),
            { status: 200 }
          )) as typeof fetch;

        const res = await verifyGoogleOAuthCredentials({
          googleAccessToken: 'stolen-access-token-from-other-app',
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Audience Mismatch');

        // Also reject access_token when tokeninfo omits both aud and azp!
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'siriporn.hr@company.co.th',
              email_verified: true,
            }),
            { status: 200 }
          )) as typeof fetch;

        const missingAudRes = await verifyGoogleOAuthCredentials({
          googleAccessToken: 'access-token-without-aud-or-azp',
        });
        expect(missingAudRes.success).toBe(false);
        expect(missingAudRes.error).toContain('Audience Mismatch');

        // Also reject id_token with non-Google issuer (iss)
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              iss: 'https://evil-issuer.example.com',
              aud: 'my-real-client-id.apps.googleusercontent.com',
              email: 'siriporn.hr@company.co.th',
              email_verified: 'true',
            }),
            { status: 200 }
          )) as typeof fetch;

        const badIssRes = await verifyGoogleOAuthCredentials({
          googleIdToken: 'token-with-bad-issuer',
        });
        expect(badIssRes.success).toBe(false);
        expect(badIssRes.error).toContain('Invalid Issuer');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Item 3: Prevents privilege escalation via update_self_role', () => {
    it('blocks update_self_role even for an authenticated user', async () => {
      const emp003Cookie = cookieFor({
        id: 'EMP003',
        email: 'somchai.it@company.co.th',
      });
      const res = await authPost(
        new NextRequest('http://localhost:3000/api/auth', {
          method: 'POST',
          headers: { cookie: emp003Cookie },
          body: JSON.stringify({
            action: 'update_self_role',
            userId: 'EMP003',
            role: 'hr',
          }),
        })
      );
      expect(res.status).toBe(403);

      const svcRes = await updateOwnTestingProfile('EMP003', { role: 'c_level' });
      expect(svcRes.success).toBe(false);
    });
  });

  describe('Item 4 & 5: Secures /api/system, removes hardcoded secrets, and keeps packaging clean', () => {
    it('restricts POST /api/system (reset_demo & save_config) to Admin only (403 for HR/C-Level/Employee)', async () => {
      const nonAdminCookies = [
        cookieFor({ id: 'EMP003', email: 'somchai.it@company.co.th' }), // employee
        cookieFor({ id: 'EMP002', email: 'kittipong.it@company.co.th' }), // manager
        cookieFor({ id: 'EMP001', email: 'siriporn.hr@company.co.th' }), // hr
        cookieFor({ id: 'EMP009', email: 'anan.ceo@company.co.th' }), // c_level
      ];

      for (const cookie of nonAdminCookies) {
        const resetRes = await systemPost(
          new NextRequest('http://localhost:3000/api/system', {
            method: 'POST',
            headers: { cookie },
            body: JSON.stringify({ action: 'reset_demo' }),
          })
        );
        expect(resetRes.status).toBe(403);

        const cfgRes = await systemPost(
          new NextRequest('http://localhost:3000/api/system', {
            method: 'POST',
            headers: { cookie },
            body: JSON.stringify({
              action: 'save_config',
              googleSheetId: 'evil-sheet',
              googlePrivateKey: 'evil-key',
              googleChatWebhookUrl: 'https://evil.example.com/hook',
            }),
          })
        );
        expect(cfgRes.status).toBe(403);
      }
    });

    it('never leaks webhook URLs, keys, or hardcoded Sheet IDs in GET /api/system?action=config or source files', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl:
          'https://chat.googleapis.com/v1/spaces/SECRET/messages?key=SECRETKEY&token=SECRETTOKEN',
        googleChatWebhookUrl2:
          'https://chat.googleapis.com/v1/spaces/SECRET2/messages?key=SECRETKEY2&token=SECRETTOKEN2',
        googleSheetId: 'REAL_PRIVATE_SHEET_ID',
        googlePrivateKey: '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----',
      });

      const cfgRes = await systemGet(
        new NextRequest('http://localhost:3000/api/system?action=config')
      );
      expect(cfgRes.status).toBe(200);
      const rawText = await cfgRes.text();
      expect(rawText).not.toContain('SECRETKEY');
      expect(rawText).not.toContain('SECRETTOKEN');
      expect(rawText).not.toContain('SECRETKEY2');
      expect(rawText).not.toContain('SECRETTOKEN2');
      expect(rawText).not.toContain('googleChatWebhookUrl');
      expect(rawText).not.toContain('googleChatWebhookUrl2');
      expect(rawText).not.toContain('REAL_PRIVATE_SHEET_ID');
      expect(rawText).not.toContain('1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c');

      expect(DEFAULT_GOOGLE_CHAT_WEBHOOK_URL).toBe('');
      expect(DEFAULT_GOOGLE_CHAT_WEBHOOK_URL_2).toBe('');

      const storageSrc = fs.readFileSync(
        path.resolve(__dirname, '../storage.ts'),
        'utf-8'
      );
      expect(storageSrc).not.toContain('AAQAxhyo86I');
      expect(storageSrc).not.toContain('AIzaSy');
      expect(storageSrc).not.toContain('chat.googleapis.com/v1/spaces/');

      const hrServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '../hr-service.ts'),
        'utf-8'
      );
      expect(hrServiceSrc).not.toContain('AIzaSy');
      expect(hrServiceSrc).not.toContain('chat.googleapis.com/v1/spaces/');

      const systemRouteSrc = fs.readFileSync(
        path.resolve(__dirname, '../../app/api/system/route.ts'),
        'utf-8'
      );
      expect(systemRouteSrc).not.toContain(
        '1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c'
      );

      const appSheetGuide = fs.readFileSync(
        path.resolve(__dirname, '../../../APPSHEET_PLAN_AND_GUIDE.md'),
        'utf-8'
      );
      expect(appSheetGuide).not.toContain(
        '1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c'
      );
    });

    it('rejects non-Google-Chat webhook URLs in Admin POST /api/system save_config (SSRF protection) and rejects invalid JSON with 400', async () => {
      const adminUser = INITIAL_USERS.find((u) => u.role === 'admin');
      // Add super admin if not present in INITIAL_USERS
      const adminActor =
        adminUser ||
        (
          await upsertEmployee('EMP001', {
            name: 'Super Admin',
            email: 'rut.wa@digitalbusinessconsult.asia',
            role: 'admin',
            department: 'Executive (C-Level)',
          })
        ).user!;
      const adminCookie = cookieFor({ id: adminActor.id, email: adminActor.email });

      const ssrfRes = await systemPost(
        new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: JSON.stringify({
            action: 'save_config',
            googleChatWebhookUrl: 'http://169.254.169.254/latest/meta-data/',
          }),
        })
      );
      expect(ssrfRes.status).toBe(400);

      const ssrfRes2 = await systemPost(
        new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: JSON.stringify({
            action: 'save_config',
            googleChatWebhookUrl2: 'https://evil.example.com/steal',
          }),
        })
      );
      expect(ssrfRes2.status).toBe(400);

      const validChat2Res = await systemPost(
        new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: JSON.stringify({
            action: 'save_config',
            googleChatWebhookUrl2:
              'https://chat.googleapis.com/v1/spaces/ROOM2/messages?key=k2&token=t2',
          }),
        })
      );
      expect(validChat2Res.status).toBe(200);
      const validChat2Json = await validChat2Res.json();
      expect(validChat2Json.googleChat2Configured).toBe(true);
      expect(validChat2Json.googleChatWebhookUrl2).toBeUndefined();

      const invalidJsonRes = await systemPost(
        new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: '{not-valid-json',
        })
      );
      expect(invalidJsonRes.status).toBe(400);
    });

    it('ensures scripts/package-standalone.mjs never copies .env.local secrets and sets PM2 instances: 1 (Items 5 & 9)', () => {
      const pkgScript = fs.readFileSync(
        path.resolve(__dirname, '../../../scripts/package-standalone.mjs'),
        'utf-8'
      );
      expect(pkgScript).not.toContain('copyFileSync(envLocalPath');
      expect(pkgScript).toContain("instances: 1");
      expect(pkgScript).toContain("exec_mode: 'fork'");
      expect(pkgScript).not.toContain("instances: 'max'");
      expect(pkgScript).not.toContain("exec_mode: 'cluster'");
    });
  });

  describe('Items 6, 7, 8: Safe Google Sheets Writes, Concurrency, Fallback Guard, and >5,000-Row Support', () => {
    const enableMockGoogleSheets = (
      backend: ReturnType<typeof createMockGoogleSheetsBackend>
    ) => {
      saveRuntimeAppConfig({
        googleSheetId: 'mock-sheet-id',
        googleServiceAccountEmail: 'mock@project.iam.gserviceaccount.com',
        googlePrivateKey: 'mock-private-key',
      });
      setGoogleSheetsClientFactoryForTest(async () => ({
        sheets: backend.client,
        spreadsheetId: 'mock-sheet-id',
      }));
    };

    it('Item 6A: full write never clears sheet before writing; failed write leaves sheet 100% intact', async () => {
      const backend = createMockGoogleSheetsBackend();
      enableMockGoogleSheets(backend);

      const { state } = await getDatabaseState();
      const rowsBefore = backend.tabs.get('Users')!.rows.length;
      expect(rowsBefore).toBeGreaterThan(1);

      backend.setFailOnValuesBatchUpdate(true);
      await expect(saveDatabaseState(state)).rejects.toThrow(
        'Simulated Google Sheets Write Quota Exceeded'
      );

      // batchClear must NEVER have been called, and all original rows must remain intact!
      expect(
        backend.callLog.some((c) => c.startsWith('values.batchClear'))
      ).toBe(false);
      expect(backend.tabs.get('Users')!.rows.length).toBe(rowsBefore);
    });

    it('Item 6B & 6C: targeted row-level mutations never call batchClear and preserve concurrent operations', async () => {
      const backend = createMockGoogleSheetsBackend();
      backend.setArtificialDelayMs(10);
      enableMockGoogleSheets(backend);

      // Fire 3 concurrent mutations across LeaveRequests and Attendance simultaneously
      const [leaveRes, att1Res, att2Res] = await Promise.all([
        createLeaveRequest('EMP003', {
          leaveType: 'sick',
          durationType: 'full',
          startDate: '2026-12-08',
          endDate: '2026-12-08',
          reason: 'Concurrent leave submission',
        }),
        recordCheckIn('EMP003', {
          date: '2026-12-08',
          checkInTime: '08:30',
          workLocation: 'office',
        }),
        recordCheckIn('EMP004', {
          date: '2026-12-08',
          checkInTime: '08:35',
          workLocation: 'office',
        }),
      ]);

      expect(leaveRes.success).toBe(true);
      expect(att1Res.success).toBe(true);
      expect(att2Res.success).toBe(true);

      // Verify ZERO batchClear calls occurred!
      expect(
        backend.callLog.some((c) => c.startsWith('values.batchClear'))
      ).toBe(false);

      // Re-read from simulated Google Sheets and confirm ALL 3 records persisted!
      const fresh = await getDatabaseState();
      expect(
        fresh.state.leaveRequests.some((l) => l.id === leaveRes.leave?.id)
      ).toBe(true);
      expect(
        fresh.state.attendance.some((a) => a.id === 'ATT-2026-12-08-EMP003')
      ).toBe(true);
      expect(
        fresh.state.attendance.some((a) => a.id === 'ATT-2026-12-08-EMP004')
      ).toBe(true);

      // Test targeted update (approve) & delete (deleteHoliday, deleteEmployee) also never call batchClear
      const approveRes = await processLeaveAction(
        'EMP002',
        leaveRes.leave!.id,
        'approve',
        'OK'
      );
      expect(approveRes.success).toBe(true);

      const addHol = await upsertHoliday('EMP001', {
        date: '2026-12-28',
        name: 'Special Company Day',
      });
      expect(addHol.success).toBe(true);
      const delHol = await deleteHoliday('EMP001', addHol.holiday!.id);
      expect(delHol.success).toBe(true);

      const addEmp = await upsertEmployee('EMP001', {
        id: 'EMP099',
        name: 'ทดสอบ ลบแถว',
        email: 'temp.delete@dbcgroup.asia',
        role: 'employee',
        department: 'AE',
        startDate: '2025-01-01',
      });
      expect(addEmp.success).toBe(true);
      const delEmp = await deleteEmployee('EMP001', 'EMP099');
      expect(delEmp.success).toBe(true);

      expect(
        backend.callLog.some((c) => c.startsWith('values.batchClear'))
      ).toBe(false);

      const afterDeletes = await getDatabaseState();
      expect(afterDeletes.state.users.some((u) => u.id === 'EMP099')).toBe(false);
      expect(afterDeletes.state.holidays.some((h) => h.id === addHol.holiday!.id)).toBe(false);
      expect(
        afterDeletes.state.leaveRequests.find((l) => l.id === leaveRes.leave!.id)
          ?.status
      ).toBe('pending_hr');
    });

    it('Item 7: throws GoogleSheetsUnavailableError on read failure (never falls back to mock) and blocks mock state from overwriting Sheets', async () => {
      const backend = createMockGoogleSheetsBackend();
      enableMockGoogleSheets(backend);

      backend.setFailOnBatchGet(true);
      await expect(getDatabaseState()).rejects.toThrow(
        GoogleSheetsUnavailableError
      );

      // API route returns 503 instead of silently serving/mutating mock data
      const hrCookie = cookieFor({
        id: 'EMP001',
        email: 'siriporn.hr@company.co.th',
      });
      const sysRes = await systemGet(
        new NextRequest('http://localhost:3000/api/system?year=2026', {
          headers: { cookie: hrCookie },
        })
      );
      expect(sysRes.status).toBe(503);

      // Even if a caller somehow constructs a local/mock DatabaseState and passes it to saveDatabaseState,
      // the origin write guard MUST block it from ever writing to Google Sheets!
      backend.setFailOnBatchGet(false);
      const fakeMockState: DatabaseState = {
        users: [INITIAL_USERS[0]],
        leaveRequests: [],
        holidays: [],
        attendance: [],
      };
      const callsBefore = backend.callLog.length;
      await expect(saveDatabaseState(fakeMockState)).rejects.toThrow(
        GoogleSheetsWriteGuardError
      );
      expect(backend.callLog.length).toBe(callsBefore);

      // resetDemoData must also refuse when Google Sheets is configured
      const resetRes = await resetDemoData();
      expect(resetRes.success).toBe(false);
    });

    it('Item 7B: refuses to auto-seed/overwrite when batchGet returns partial valueRanges or when Holidays tab has existing rows, and GET /api/system reads Sheets only once', async () => {
      // Case 1: Incomplete batchGet response (e.g. 0 valueRanges) must throw GoogleSheetsUnavailableError, NEVER auto-seed!
      const backend = createMockGoogleSheetsBackend();
      const partialClient: GoogleSheetsClientLike = {
        ...backend.client,
        spreadsheets: {
          ...backend.client.spreadsheets,
          values: {
            ...backend.client.spreadsheets.values,
            batchGet: async () => {
              backend.callLog.push('values.batchGet:partial');
              return { data: { valueRanges: [] } };
            },
          },
        },
      };
      saveRuntimeAppConfig({
        googleSheetId: 'mock-sheet-id',
        googleServiceAccountEmail: 'mock@project.iam.gserviceaccount.com',
        googlePrivateKey: 'mock-private-key',
      });
      setGoogleSheetsClientFactoryForTest(async () => ({
        sheets: partialClient,
        spreadsheetId: 'mock-sheet-id',
      }));

      await expect(getDatabaseState()).rejects.toThrow(
        GoogleSheetsUnavailableError
      );
      expect(backend.callLog).not.toContain('values.batchUpdate');

      // Case 2: Spreadsheet with existing Holidays only must NOT be overwritten with INITIAL_USERS/INITIAL_HOLIDAYS
      const holidayOnlyBackend = createMockGoogleSheetsBackend({
        Users: [USER_SHEET_HEADERS],
        LeaveRequests: [LEAVE_SHEET_HEADERS],
        Holidays: [
          HOLIDAY_SHEET_HEADERS,
          ['HOL-CUSTOM-1', '2026-08-12', 'Custom Company Holiday'],
        ],
        Attendance: [ATTENDANCE_SHEET_HEADERS],
      });
      enableMockGoogleSheets(holidayOnlyBackend);
      const holidayState = await getDatabaseState();
      expect(holidayState.state.holidays).toHaveLength(1);
      expect(holidayState.state.holidays[0].id).toBe('HOL-CUSTOM-1');
      expect(holidayState.state.users).toHaveLength(0);
      expect(holidayOnlyBackend.callLog).not.toContain('values.batchUpdate');

      // Case 3: GET /api/system reuses authenticated DatabaseState (only 1 batchGet per request)
      const normalBackend = createMockGoogleSheetsBackend();
      enableMockGoogleSheets(normalBackend);
      const hrCookie = cookieFor({
        id: 'EMP001',
        email: 'siriporn.hr@company.co.th',
      });
      const sysRes = await systemGet(
        new NextRequest('http://localhost:3000/api/system?year=2026', {
          headers: { cookie: hrCookie },
        })
      );
      expect(sysRes.status).toBe(200);
      const batchGetCalls = normalBackend.callLog.filter((c) =>
        c.startsWith('values.batchGet')
      );
      expect(batchGetCalls).toHaveLength(1);
    });

    it('Item 8: reads and appends beyond 5,000 rows without truncation', async () => {
      const bigAttendanceRows: (string | number)[][] = [
        ATTENDANCE_SHEET_HEADERS,
      ];
      for (let i = 1; i <= 5600; i++) {
        bigAttendanceRows.push(
          attendanceToRow({
            id: `ATT-HIST-${i}`,
            userId: 'EMP003',
            userName: 'สมชาย ใจดี',
            department: 'IT & Digital',
            date: '2025-01-01',
            checkInTime: '08:30',
            workLocation: 'office',
          })
        );
      }

      const backend = createMockGoogleSheetsBackend({
        Attendance: bigAttendanceRows,
      });
      enableMockGoogleSheets(backend);

      const loaded = await getDatabaseState();
      expect(loaded.state.attendance.length).toBe(5600);
      expect(loaded.state.attendance[5599].id).toBe('ATT-HIST-5600');

      const newCheckIn = await recordCheckIn('EMP003', {
        date: '2026-12-20',
        checkInTime: '08:45',
        workLocation: 'office',
      });
      expect(newCheckIn.success).toBe(true);

      const afterAppend = await getDatabaseState();
      expect(afterAppend.state.attendance.length).toBe(5601);
      expect(
        afterAppend.state.attendance.some((a) => a.id === 'ATT-2026-12-20-EMP003')
      ).toBe(true);
    });
  });

  describe('Item 10: Preserves custom user quotas when loading local store and round-tripping rows', () => {
    it('loadLocalStoreFromFile preserves custom HR-configured quotas and fills only missing fields', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-quota-test-'));
      const tmpFile = path.join(tmpDir, 'hr-store.json');
      try {
        const customState = {
          users: [
            {
              ...INITIAL_USERS[0],
              quotas: {
                sick: 45,
                personal: 8,
                vacation: 12,
                wfh: 24,
                wfa: 10,
                offsite: 0,
              },
            },
            {
              ...INITIAL_USERS[1],
              quotas: {
                vacation: 15,
              },
            },
          ],
          leaveRequests: [],
          holidays: INITIAL_HOLIDAYS,
          attendance: [],
        };
        fs.writeFileSync(tmpFile, JSON.stringify(customState), 'utf-8');

        const loaded = loadLocalStoreFromFile(tmpFile);
        expect(loaded).not.toBeNull();
        expect(loaded!.users[0].quotas).toEqual({
          sick: 45,
          personal: 8,
          vacation: 12,
          wfh: 24,
          wfa: 10,
          offsite: 0,
        });
        expect(loaded!.users[1].quotas).toEqual({
          sick: STANDARD_LEAVE_QUOTAS.sick,
          personal: STANDARD_LEAVE_QUOTAS.personal,
          vacation: 15,
          wfh: STANDARD_LEAVE_QUOTAS.wfh,
          wfa: STANDARD_LEAVE_QUOTAS.wfa,
          offsite: STANDARD_LEAVE_QUOTAS.offsite,
        });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('round-trips custom user quotas through Google Sheets and AppSheet row mappers', () => {
      const customUser = {
        ...INITIAL_USERS[0],
        quotas: {
          sick: 40,
          personal: 5,
          vacation: 10,
          wfh: 20,
          wfa: 12,
          offsite: 0,
        },
      };
      const sheetMapped = rowToUser(userToRow(customUser).map(String));
      expect(sheetMapped.quotas).toEqual(customUser.quotas);

      const appSheetMapped = appSheetRowToUser(userToAppSheetRow(customUser));
      expect(appSheetMapped.quotas).toEqual(customUser.quotas);
    });

    it('isolates in-memory demo_local store from uncommitted mutations on readLocalStore', async () => {
      const firstRead = await getDatabaseState();
      const originalCount = firstRead.state.users.length;
      // Simulate an aborted mutation before saveDatabaseState
      firstRead.state.users.pop();

      const secondRead = await getDatabaseState();
      expect(secondRead.state.users.length).toBe(originalCount);
    });
  });
});
