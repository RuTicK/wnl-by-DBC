import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { POST as attendancePost } from '@/app/api/attendance/route';
import { POST as leavesPost } from '@/app/api/leaves/route';
import { POST as systemPost } from '@/app/api/system/route';
import AttendanceAndOfficeView from '@/components/AttendanceAndOfficeView';
import HrDashboardView from '@/components/HrDashboardView';
import LeaveCalendar from '@/components/LeaveCalendar';
import LeavePolicyModal from '@/components/LeavePolicyModal';
import LeaveRequestModal from '@/components/LeaveRequestModal';
import LoginView from '@/components/LoginView';
import TermsOfServicePage from '@/app/terms/page';
import {
  createLeaveRequest,
  processLeaveAction,
  recordCheckIn,
  recordCheckOut,
  resetDemoData,
  sendGoogleChatWfhCheckInNotification,
  upsertEmployee,
} from '../hr-service';
import {
  calculateUserQuotaSummary,
  ENABLE_WFA,
  extractWfhMeetLinkAndNote,
  generateAttendanceCsv,
  getBangkokNow,
  normalizeAndValidateMeetLink,
  REQUESTABLE_LEAVE_TYPES,
  STANDARD_LEAVE_QUOTAS,
  VISIBLE_WORK_LOCATIONS,
} from '../leave-utils';
import { INITIAL_USERS } from '../mock-data';
import { createSessionToken, SESSION_COOKIE_NAME } from '../session';
import {
  attendanceToRow,
  getEffectiveGoogleChatWebhookUrl2,
  isValidGoogleChatWebhookUrl,
  rowToAttendance,
  saveRuntimeAppConfig,
} from '../storage';
import { AttendanceRecord, LeaveRequest, SafeUser } from '../types';

function cookieFor(user: { id: string; email: string }): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(user)}`;
}

describe('WFA Hidden, WFH Check-in with Google Meet Link, and Dual Google Chat Webhook Routing', () => {
  const originalEnvChat1 = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  const originalEnvChat2 = process.env.GOOGLE_CHAT_WEBHOOK_URL_2;

  const CHAT_1_URL =
    'https://chat.googleapis.com/v1/spaces/SPACE_CHAT_1/messages?key=k1&token=t1';
  const CHAT_2_URL =
    'https://chat.googleapis.com/v1/spaces/SPACE_CHAT_2/messages?key=k2&token=t2';

  const veteranUser: SafeUser = {
    id: 'EMP003',
    name: 'สมชาย ใจดี',
    englishName: 'Somchai Jaidee',
    email: 'somchai.it@company.co.th',
    role: 'employee',
    department: 'IT & Digital',
    position: 'Senior Frontend Developer',
    startDate: '2023-01-10',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const hrUser: SafeUser = {
    id: 'EMP001',
    name: 'ศิริพร บริหารงาน (HR 1)',
    englishName: 'Siriporn Boriharn',
    email: 'siriporn.hr@company.co.th',
    role: 'hr',
    department: 'HR & Admin',
    position: 'HR Manager',
    startDate: '2022-03-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  beforeEach(async () => {
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL_2;
    saveRuntimeAppConfig({
      googleChatWebhookUrl: '',
      googleChatWebhookUrl2: '',
    });
    await resetDemoData();
  });

  afterEach(() => {
    if (originalEnvChat1 === undefined) {
      delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    } else {
      process.env.GOOGLE_CHAT_WEBHOOK_URL = originalEnvChat1;
    }
    if (originalEnvChat2 === undefined) {
      delete process.env.GOOGLE_CHAT_WEBHOOK_URL_2;
    } else {
      process.env.GOOGLE_CHAT_WEBHOOK_URL_2 = originalEnvChat2;
    }
    saveRuntimeAppConfig({
      googleChatWebhookUrl: '',
      googleChatWebhookUrl2: '',
    });
  });

  describe('1. Requirement 1: WFA Hidden Across UI & Blocked in Service/API', () => {
    it('disables WFA via feature flag and excludes WFA from visible locations and requestable leave types', () => {
      expect(ENABLE_WFA).toBe(false);
      expect(VISIBLE_WORK_LOCATIONS).toEqual(['office', 'wfh', 'offsite']);
      expect(VISIBLE_WORK_LOCATIONS).not.toContain('wfa');
      expect(REQUESTABLE_LEAVE_TYPES).toEqual(['sick', 'personal', 'vacation']);
    });

    it('hides WFA completely from AttendanceAndOfficeView, LeaveRequestModal, LeavePolicyModal, LeaveCalendar, HrDashboardView, and Terms page', () => {
      const today = getBangkokNow().dateStr;
      const legacyWfaAttendance: AttendanceRecord = {
        id: `ATT-${today}-EMP009`,
        userId: 'EMP009',
        userName: 'ดร.อนันต์ วิสัยทัศน์ไกล (C-Level)',
        department: 'Executive (C-Level)',
        date: today,
        checkInTime: '09:10',
        workLocation: 'wfa',
        note: 'Legacy WFA record',
      };
      const legacyWfaLeave: LeaveRequest = {
        id: 'LV-WFA-LEGACY',
        userId: 'EMP003',
        userName: veteranUser.name,
        requesterRole: 'employee',
        department: veteranUser.department,
        leaveType: 'wfa',
        durationType: 'full',
        startDate: today,
        endDate: today,
        totalDays: 1,
        reason: 'Legacy WFA leave',
        status: 'approved',
        createdAt: `${today}T08:00:00.000Z`,
      };

      const attendanceHtml = renderToStaticMarkup(
        <AttendanceAndOfficeView
          currentUser={veteranUser}
          users={[veteranUser, INITIAL_USERS[8]]}
          attendance={[legacyWfaAttendance]}
          leaves={[legacyWfaLeave]}
          onCheckIn={async () => ({ success: true })}
          onCheckOut={async () => ({ success: true })}
        />
      );
      expect(attendanceHtml).not.toContain('WFA');
      expect(attendanceHtml).not.toContain('Work From Anywhere');
      expect(attendanceHtml).not.toContain('ทำงานต่างจังหวัด/ที่อื่น');

      const quota = calculateUserQuotaSummary(veteranUser, [], 2026, []);
      const leaveModalHtml = renderToStaticMarkup(
        <LeaveRequestModal
          isOpen={true}
          onClose={() => {}}
          currentUser={veteranUser}
          holidays={[]}
          myQuota={quota}
          onSubmitLeave={async () => ({ success: true })}
        />
      );
      expect(leaveModalHtml).not.toContain('WFA');
      expect(leaveModalHtml).not.toContain('Work From Anywhere');

      const policyHtml = renderToStaticMarkup(
        <LeavePolicyModal isOpen={true} onClose={() => {}} onlyView={true} />
      );
      expect(policyHtml).not.toContain('WFA');
      expect(policyHtml).not.toContain('Work From Anywhere');
      expect(policyHtml).toContain('ต้องแนบลิงก์ Google Meet');

      const calendarHtml = renderToStaticMarkup(
        <LeaveCalendar
          currentUser={hrUser}
          leaves={[legacyWfaLeave]}
          holidays={[]}
          onOpenRequestModal={() => {}}
        />
      );
      expect(calendarHtml).not.toContain('WFA');
      expect(calendarHtml).not.toContain('Legacy WFA leave');

      const dashboardHtml = renderToStaticMarkup(
        <HrDashboardView
          currentUser={hrUser}
          leaves={[legacyWfaLeave]}
          holidays={[]}
          allQuotas={[quota]}
          year={2026}
          onNavigateToApprovals={() => {}}
        />
      );
      expect(dashboardHtml).not.toContain('WFA');

      const termsHtml = renderToStaticMarkup(<TermsOfServicePage />);
      expect(termsHtml).not.toContain('WFA');
      expect(termsHtml).not.toContain('Work From Anywhere');
    });

    it('rejects WFA in both createLeaveRequest / POST /api/leaves and recordCheckIn / POST /api/attendance', async () => {
      const leaveRes = await createLeaveRequest('EMP003', {
        leaveType: 'wfa',
        durationType: 'full',
        startDate: '2026-12-07',
        endDate: '2026-12-07',
        reason: 'ขอ WFA',
      });
      expect(leaveRes.success).toBe(false);
      expect(leaveRes.error).toContain('WFA');

      const checkInRes = await recordCheckIn('EMP003', {
        date: '2026-12-07',
        checkInTime: '09:00',
        workLocation: 'wfa',
      });
      expect(checkInRes.success).toBe(false);
      expect(checkInRes.error).toContain('WFA');

      const empCookie = cookieFor({
        id: veteranUser.id,
        email: veteranUser.email,
      });

      const apiLeaveRes = await leavesPost(
        new NextRequest('http://localhost:3000/api/leaves', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: JSON.stringify({
            leaveType: 'wfa',
            durationType: 'full',
            startDate: '2026-12-07',
            endDate: '2026-12-07',
            reason: 'ขอ WFA ผ่าน API',
          }),
        })
      );
      expect(apiLeaveRes.status).toBe(400);

      const apiAttRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: JSON.stringify({
            date: '2026-12-07',
            checkInTime: '09:00',
            workLocation: 'wfa',
          }),
        })
      );
      expect(apiAttRes.status).toBe(400);
    });
  });

  describe('2. Requirement 2: WFH Check-in Only & Mandatory Google Meet Link', () => {
    it('blocks WFH leave requests via service and POST /api/leaves and directs users to Check-in', async () => {
      const svcRes = await createLeaveRequest('EMP003', {
        leaveType: 'wfh',
        durationType: 'full',
        startDate: '2026-12-08',
        endDate: '2026-12-08',
        reason: 'ทำงานที่บ้าน',
      });
      expect(svcRes.success).toBe(false);
      expect(svcRes.error).toContain('Check-in');
      expect(svcRes.error).toContain('Google Meet');

      const empCookie = cookieFor({
        id: veteranUser.id,
        email: veteranUser.email,
      });
      const apiRes = await leavesPost(
        new NextRequest('http://localhost:3000/api/leaves', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: JSON.stringify({
            leaveType: 'wfh',
            durationType: 'full',
            startDate: '2026-12-08',
            endDate: '2026-12-08',
            reason: 'ทำงานที่บ้านผ่าน API',
          }),
        })
      );
      expect(apiRes.status).toBe(400);
    });

    it('validates and normalizes Google Meet links strictly (accepting valid Meet URLs and rejecting invalid/XSS inputs)', () => {
      // Valid formats
      expect(
        normalizeAndValidateMeetLink('https://meet.google.com/abc-defg-hij')
      ).toEqual({
        valid: true,
        normalizedUrl: 'https://meet.google.com/abc-defg-hij',
      });
      expect(
        normalizeAndValidateMeetLink('  meet.google.com/abc-defg-hij  ')
      ).toEqual({
        valid: true,
        normalizedUrl: 'https://meet.google.com/abc-defg-hij',
      });
      expect(
        normalizeAndValidateMeetLink(
          'http://meet.google.com/abc-defg-hij?authuser=0'
        )
      ).toEqual({
        valid: true,
        normalizedUrl: 'https://meet.google.com/abc-defg-hij?authuser=0',
      });
      expect(
        normalizeAndValidateMeetLink('https://meet.google.com/lookup/daily-room')
          .valid
      ).toBe(true);
      expect(
        normalizeAndValidateMeetLink('https://g.co/meet/dbc-team').valid
      ).toBe(true);

      // Invalid / dangerous formats
      const invalidCases = [
        '',
        '   ',
        'อยู่บ้าน',
        'https://meet.google.com',
        'https://meet.google.com/',
        'https://meet.google.com/new',
        'https://meet.google.com/NEW',
        'https://zoom.us/j/123456789',
        'https://evil.com/meet.google.com/abc-defg-hij',
        'https://meet.google.com.evil.com/abc-defg-hij',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'https://meet.google.com/abc def',
      ];
      for (const bad of invalidCases) {
        const res = normalizeAndValidateMeetLink(bad);
        expect(res.valid, `expected "${bad}" to be invalid`).toBe(false);
        expect(res.error).toBeTruthy();
      }
    });

    it('enforces Meet link on WFH check-in (including for C-Level), handles location switches cleanly, and preserves Meet link on check-out & Sheets round-trip', async () => {
      // 1. Missing Meet link rejected for regular employee and C-Level alike
      const noLinkEmp = await recordCheckIn('EMP003', {
        date: '2026-12-09',
        checkInTime: '08:45',
        workLocation: 'wfh',
      });
      expect(noLinkEmp.success).toBe(false);
      expect(noLinkEmp.error).toContain('Google Meet');

      const noLinkCLevel = await recordCheckIn('EMP009', {
        date: '2026-12-09',
        checkInTime: '08:45',
        workLocation: 'wfh',
        meetLink: 'https://evil.example.com/fake',
      });
      expect(noLinkCLevel.success).toBe(false);
      expect(noLinkCLevel.error).toContain('Google Meet');

      // 2. Valid WFH check-in via POST /api/attendance (without https:// prefix)
      const empCookie = cookieFor({
        id: veteranUser.id,
        email: veteranUser.email,
      });
      const apiWfhRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: JSON.stringify({
            date: '2026-12-09',
            checkInTime: '08:50',
            workLocation: 'wfh',
            meetLink: 'meet.google.com/abc-defg-hij',
            note: 'ทำระบบรายงาน HR',
          }),
        })
      );
      expect(apiWfhRes.status).toBe(200);
      const apiWfhData = await apiWfhRes.json();
      expect(apiWfhData.record.workLocation).toBe('wfh');
      expect(apiWfhData.record.meetLink).toBe(
        'https://meet.google.com/abc-defg-hij'
      );
      expect(apiWfhData.record.note).toBe(
        'https://meet.google.com/abc-defg-hij • ทำระบบรายงาน HR'
      );

      // 3. Google Sheets row round-trip preserves meetLink & note cleanly
      const sheetRow = attendanceToRow(apiWfhData.record);
      const parsed = rowToAttendance(sheetRow);
      expect(parsed.workLocation).toBe('wfh');
      expect(parsed.meetLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(parsed.note).toBe(
        'https://meet.google.com/abc-defg-hij • ทำระบบรายงาน HR'
      );

      // Legacy WFH row with plain text note (no Meet URL) keeps meetLink undefined
      const legacyParsed = rowToAttendance([
        'ATT-LEGACY',
        'EMP003',
        'สมชาย ใจดี',
        'IT & Digital',
        '2026-11-01',
        '08:55',
        '',
        'wfh',
        'Work From Home พัฒนาโมดูลเดิม',
      ]);
      expect(legacyParsed.meetLink).toBeUndefined();
      expect(legacyParsed.note).toBe('Work From Home พัฒนาโมดูลเดิม');

      // 4. Check-out with extra note preserves meetLink in record & note
      const checkOutRes = await recordCheckOut('EMP003', {
        date: '2026-12-09',
        checkOutTime: '17:45',
        note: 'ส่งมอบงานเรียบร้อย',
      });
      expect(checkOutRes.success).toBe(true);
      expect(checkOutRes.record?.meetLink).toBe(
        'https://meet.google.com/abc-defg-hij'
      );
      expect(checkOutRes.record?.note).toBe(
        'https://meet.google.com/abc-defg-hij • ส่งมอบงานเรียบร้อย'
      );

      // 5. Switching from WFH -> Office clears meetLink & note (no leakage)
      const switchOffice = await recordCheckIn('EMP003', {
        date: '2026-12-09',
        checkInTime: '08:50',
        workLocation: 'office',
      });
      expect(switchOffice.success).toBe(true);
      expect(switchOffice.record?.workLocation).toBe('office');
      expect(switchOffice.record?.meetLink).toBeUndefined();
      expect(switchOffice.record?.note).toBeUndefined();

      // 6. Switching from Offsite -> WFH clears locationName & sets meetLink
      const offsiteFirst = await recordCheckIn('EMP003', {
        date: '2026-12-10',
        checkInTime: '09:00',
        workLocation: 'offsite',
        locationName: 'ลูกค้า XYZ',
      });
      expect(offsiteFirst.success).toBe(true);
      expect(offsiteFirst.record?.locationName).toBe('ลูกค้า XYZ');

      const switchToWfh = await recordCheckIn('EMP003', {
        date: '2026-12-10',
        checkInTime: '09:00',
        workLocation: 'wfh',
        meetLink: 'https://meet.google.com/xyz-pqrs-tuv',
      });
      expect(switchToWfh.success).toBe(true);
      expect(switchToWfh.record?.workLocation).toBe('wfh');
      expect(switchToWfh.record?.locationName).toBeUndefined();
      expect(switchToWfh.record?.meetLink).toBe(
        'https://meet.google.com/xyz-pqrs-tuv'
      );
    });

    it('renders clickable Google Meet links safely in AttendanceAndOfficeView and strips unsafe javascript: links', () => {
      const today = getBangkokNow().dateStr;
      const wfhRecord: AttendanceRecord = {
        id: `ATT-${today}-EMP003`,
        userId: veteranUser.id,
        userName: veteranUser.name,
        department: veteranUser.department,
        date: today,
        checkInTime: '08:55',
        workLocation: 'wfh',
        meetLink: 'https://meet.google.com/abc-defg-hij',
        note: 'https://meet.google.com/abc-defg-hij • โฟกัสงาน Frontend',
      };

      const html = renderToStaticMarkup(
        <AttendanceAndOfficeView
          currentUser={veteranUser}
          users={[veteranUser]}
          attendance={[wfhRecord]}
          leaves={[]}
          onCheckIn={async () => ({ success: true })}
          onCheckOut={async () => ({ success: true })}
        />
      );
      expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('โฟกัสงาน Frontend');

      // Unsafe javascript: meetLink MUST NOT be rendered as an anchor href
      const extractedBad = extractWfhMeetLinkAndNote({
        workLocation: 'wfh',
        meetLink: 'javascript:alert(1)',
        note: 'test',
      });
      expect(extractedBad.meetLink).toBeUndefined();
    });
  });

  describe('3. Requirement 3: Dual Google Chat Webhook Routing (Chat 1 vs Chat 2 Final Alerts)', () => {
    it('reads GOOGLE_CHAT_WEBHOOK_URL_2 from environment variables via getEffectiveGoogleChatWebhookUrl2', () => {
      process.env.GOOGLE_CHAT_WEBHOOK_URL_2 = CHAT_2_URL;
      expect(getEffectiveGoogleChatWebhookUrl2()).toBe(CHAT_2_URL);
    });

    it('routes leaves to Chat 2 ONLY on final approval (NOT created, NOT step 1, NOT rejected, NOT cancelled) across sick, personal, and vacation', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl: CHAT_1_URL,
        googleChatWebhookUrl2: CHAT_2_URL,
      });

      const originalFetch = global.fetch;
      const calls: Array<{ url: string; text: string }> = [];
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          const parsed = JSON.parse(String(init?.body || '{}'));
          calls.push({ url, text: parsed.text || '' });
          return new Response(JSON.stringify({ name: 'messages/ok' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const leaveCases = [
          { type: 'sick' as const, date: '2026-12-01', label: 'ลาป่วย' },
          { type: 'personal' as const, date: '2026-12-02', label: 'ลากิจ' },
          { type: 'vacation' as const, date: '2026-12-03', label: 'ลาพักร้อน' },
        ];

        for (const item of leaveCases) {
          calls.length = 0;

          // Step 0: Employee creates leave -> Chat 1 ONLY (Chat 2 silent)
          const created = await createLeaveRequest('EMP003', {
            leaveType: item.type,
            durationType: 'full',
            startDate: item.date,
            endDate: item.date,
            reason: `ทดสอบ ${item.label}`,
          });
          expect(created.success).toBe(true);
          expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
          expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

          calls.length = 0;

          // Step 1: Manager (EMP002) approves -> Chat 1 ONLY (Chat 2 silent!)
          const step1 = await processLeaveAction(
            'EMP002',
            created.leave!.id,
            'approve',
            'หัวหน้าอนุมัติขั้น 1'
          );
          expect(step1.success).toBe(true);
          expect(step1.leave?.status).toBe('pending_hr');
          expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
          expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

          calls.length = 0;

          // Step 2 (Final): HR (EMP001) approves -> BOTH Chat 1 AND Chat 2 notified!
          const step2 = await processLeaveAction(
            'EMP001',
            created.leave!.id,
            'approve',
            'HR อนุมัติขั้นสุดท้าย'
          );
          expect(step2.success).toBe(true);
          expect(step2.leave?.status).toBe('approved');
          expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
          const chat2Calls = calls.filter((c) => c.url === CHAT_2_URL);
          expect(chat2Calls).toHaveLength(1);
          expect(chat2Calls[0].text).toContain('อนุมัติคำขอเรียบร้อยแล้ว');
          expect(chat2Calls[0].text).toContain(item.label);
          expect(chat2Calls[0].text).toContain('สมชาย ใจดี');
        }

        // Manager flow: Manager -> C-Level (Step 1: NO Chat 2) -> HR (Final: YES Chat 2)
        calls.length = 0;
        const mgrLeave = await createLeaveRequest('EMP002', {
          leaveType: 'vacation',
          durationType: 'full',
          startDate: '2026-12-08',
          endDate: '2026-12-08',
          reason: 'Manager ลาพักร้อน',
        });
        expect(mgrLeave.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        calls.length = 0;
        await processLeaveAction('EMP009', mgrLeave.leave!.id, 'approve');
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        calls.length = 0;
        await processLeaveAction('EMP001', mgrLeave.leave!.id, 'approve');
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(1);

        // Rejected leave -> Chat 1 ONLY (Chat 2 silent)
        calls.length = 0;
        const rejectTarget = await createLeaveRequest('EMP003', {
          leaveType: 'sick',
          durationType: 'full',
          startDate: '2026-12-14',
          endDate: '2026-12-14',
          reason: 'ทดสอบปฏิเสธ',
        });
        calls.length = 0;
        await processLeaveAction(
          'EMP002',
          rejectTarget.leave!.id,
          'reject',
          'ไม่สะดวก'
        );
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        // Cancelled leave -> Chat 1 ONLY (Chat 2 silent)
        const cancelTarget = await createLeaveRequest('EMP003', {
          leaveType: 'sick',
          durationType: 'full',
          startDate: '2026-12-15',
          endDate: '2026-12-15',
          reason: 'ทดสอบยกเลิก',
        });
        calls.length = 0;
        await processLeaveAction('EMP003', cancelTarget.leave!.id, 'cancel');
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('sends WFH Check-in (with Google Meet link) and Offsite Check-in to BOTH Chat 1 and Chat 2, and skips Office check-in', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl: CHAT_1_URL,
        googleChatWebhookUrl2: CHAT_2_URL,
      });

      const originalFetch = global.fetch;
      const calls: Array<{ url: string; text: string }> = [];
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          const parsed = JSON.parse(String(init?.body || '{}'));
          calls.push({ url, text: parsed.text || '' });
          return new Response(JSON.stringify({ name: 'messages/ok' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        // 1. Office check-in -> NO webhook calls
        const officeRes = await recordCheckIn('EMP003', {
          date: '2026-12-16',
          checkInTime: '08:40',
          workLocation: 'office',
        });
        expect(officeRes.success).toBe(true);
        expect(calls).toHaveLength(0);

        // 2. WFH check-in -> BOTH Chat 1 & Chat 2 receive message with Meet link
        const wfhRes = await recordCheckIn('EMP003', {
          date: '2026-12-17',
          checkInTime: '08:50',
          workLocation: 'wfh',
          meetLink: 'https://meet.google.com/dbc-work-123',
          note: 'โฟกัสทำรายงานส่งลูกค้า',
        });
        expect(wfhRes.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(1);
        for (const call of calls) {
          expect(call.text).toContain('Work From Home (WFH)');
          expect(call.text).toContain('สมชาย ใจดี');
          expect(call.text).toContain('https://meet.google.com/dbc-work-123');
          expect(call.text).toContain('โฟกัสทำรายงานส่งลูกค้า');
        }

        // 3. Offsite check-in -> BOTH Chat 1 & Chat 2 receive message with location
        calls.length = 0;
        const offsiteRes = await recordCheckIn('EMP003', {
          date: '2026-12-18',
          checkInTime: '09:10',
          workLocation: 'offsite',
          locationName: 'บจก. สยามเทคโนโลยี (สาทร)',
          note: 'ประชุมลูกค้า Q4',
        });
        expect(offsiteRes.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(1);
        for (const call of calls) {
          expect(call.text).toContain('นอกสถานที่');
          expect(call.text).toContain('บจก. สยามเทคโนโลยี (สาทร)');
          expect(call.text).toContain('ประชุมลูกค้า Q4');
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('delivers to Chat 2 independently when Chat 1 is unset or fails, and deduplicates identical webhook URLs', async () => {
      const originalFetch = global.fetch;
      const calls: Array<{ url: string; text: string }> = [];

      // Case A: ONLY Chat 2 configured (Chat 1 empty)
      saveRuntimeAppConfig({
        googleChatWebhookUrl: '',
        googleChatWebhookUrl2: CHAT_2_URL,
      });

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          const parsed = JSON.parse(String(init?.body || '{}'));
          calls.push({ url, text: parsed.text || '' });
          return new Response(JSON.stringify({ name: 'messages/ok' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const lv = await createLeaveRequest('EMP003', {
          leaveType: 'sick',
          durationType: 'full',
          startDate: '2026-12-21',
          endDate: '2026-12-21',
          reason: 'ปวดศีรษะ',
        });
        await processLeaveAction('EMP002', lv.leave!.id, 'approve');
        expect(calls).toHaveLength(0); // Still 0 after create + step 1!

        await processLeaveAction('EMP001', lv.leave!.id, 'approve');
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(CHAT_2_URL);

        // Case B: Identical URLs in Chat 1 and Chat 2 -> deduplicated to 1 call
        calls.length = 0;
        saveRuntimeAppConfig({
          googleChatWebhookUrl: CHAT_2_URL,
          googleChatWebhookUrl2: CHAT_2_URL,
        });
        await recordCheckIn('EMP003', {
          date: '2026-12-22',
          checkInTime: '08:45',
          workLocation: 'wfh',
          meetLink: 'https://meet.google.com/dedup-test-1',
        });
        expect(calls).toHaveLength(1);

        // Case C: Chat 1 throws network error -> Chat 2 STILL succeeds!
        calls.length = 0;
        saveRuntimeAppConfig({
          googleChatWebhookUrl: CHAT_1_URL,
          googleChatWebhookUrl2: CHAT_2_URL,
        });
        global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === CHAT_1_URL) {
            throw new Error('Simulated Chat 1 outage');
          }
          if (url === CHAT_2_URL) {
            const parsed = JSON.parse(String(init?.body || '{}'));
            calls.push({ url, text: parsed.text || '' });
            return new Response(JSON.stringify({ name: 'messages/ok' }), {
              status: 200,
            });
          }
          return originalFetch(input, init);
        }) as typeof fetch;

        const wfhRecord: AttendanceRecord = {
          id: 'ATT-2026-12-23-EMP003',
          userId: veteranUser.id,
          userName: veteranUser.name,
          department: veteranUser.department,
          date: '2026-12-23',
          checkInTime: '08:55',
          workLocation: 'wfh',
          meetLink: 'https://meet.google.com/resilient-room',
        };
        const notifRes = await sendGoogleChatWfhCheckInNotification(
          wfhRecord,
          veteranUser
        );
        expect(notifRes.sent).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(CHAT_2_URL);
        expect(calls[0].text).toContain('https://meet.google.com/resilient-room');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('4. Hardened Edge-Case Regressions (Case Bypass, Legacy Owner WFA, Sheets Round-Trip, SSRF & All Role Flows)', () => {
    it('blocks uppercase/whitespace/invalid workLocation and leaveType bypasses with 400 (never bypassing WFA/WFH/probation or throwing 500)', async () => {
      const empCookie = cookieFor({
        id: veteranUser.id,
        email: veteranUser.email,
      });
      const emp007 = INITIAL_USERS.find((u) => u.id === 'EMP007')!;
      const probationCookie = cookieFor({
        id: emp007.id,
        email: emp007.email,
      });

      // Uppercase WFA / WFH / invalid workLocation on check-in
      const upperWfaCheckIn = await recordCheckIn('EMP003', {
        date: '2026-12-24',
        workLocation: 'WFA' as unknown as 'wfa',
      });
      expect(upperWfaCheckIn.success).toBe(false);
      expect(upperWfaCheckIn.error).toContain('WFA');

      // Probation employee sending uppercase "WFH" without Meet link MUST be blocked!
      const upperWfhProbCheckIn = await recordCheckIn('EMP007', {
        date: '2026-11-12',
        workLocation: 'WFH' as unknown as 'wfh',
      });
      expect(upperWfhProbCheckIn.success).toBe(false);

      const badLocApiRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: probationCookie },
          body: JSON.stringify({
            date: '2026-11-12',
            workLocation: 'WFH',
          }),
        })
      );
      expect(badLocApiRes.status).toBe(400);

      const unknownLocApiRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: JSON.stringify({
            date: '2026-12-24',
            workLocation: 'mars_base',
          }),
        })
      );
      expect(unknownLocApiRes.status).toBe(400);

      // Malformed JSON returns 400, not 500
      const malformedAttRes = await attendancePost(
        new NextRequest('http://localhost:3000/api/attendance', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: '{broken-json',
        })
      );
      expect(malformedAttRes.status).toBe(400);

      // Uppercase WFA / WFH / unknown leaveType on leave creation returns 400 (never 500)
      for (const badType of ['WFA', 'WFH', 'invalid_leave']) {
        const res = await leavesPost(
          new NextRequest('http://localhost:3000/api/leaves', {
            method: 'POST',
            headers: { cookie: empCookie },
            body: JSON.stringify({
              leaveType: badType,
              durationType: 'full',
              startDate: '2026-12-24',
              endDate: '2026-12-24',
              reason: 'test',
            }),
          })
        );
        expect(res.status, `leaveType=${badType}`).toBe(400);
      }

      const malformedLeaveRes = await leavesPost(
        new NextRequest('http://localhost:3000/api/leaves', {
          method: 'POST',
          headers: { cookie: empCookie },
          body: '{broken',
        })
      );
      expect(malformedLeaveRes.status).toBe(400);
    });

    it('hides WFA completely even when currentUser owns a legacy WFA record today, and keeps LoginView wording aligned with WFH Check-in', () => {
      const today = getBangkokNow().dateStr;
      const cLevelOwner = INITIAL_USERS[8]; // EMP009
      const ownLegacyWfaAttendance: AttendanceRecord = {
        id: `ATT-${today}-${cLevelOwner.id}`,
        userId: cLevelOwner.id,
        userName: cLevelOwner.name,
        department: cLevelOwner.department,
        date: today,
        checkInTime: '09:10',
        workLocation: 'wfa',
        note: 'Legacy WFA check-in',
      };
      const legacyWfaLeave: LeaveRequest = {
        id: 'LV-WFA-SHADOW',
        userId: veteranUser.id,
        userName: veteranUser.name,
        requesterRole: 'employee',
        department: veteranUser.department,
        leaveType: 'wfa',
        durationType: 'full',
        startDate: today,
        endDate: today,
        totalDays: 1,
        reason: 'Legacy WFA',
        status: 'approved',
        createdAt: `${today}T07:00:00.000Z`,
      };
      const realSickLeave: LeaveRequest = {
        id: 'LV-SICK-SAME-DAY',
        userId: veteranUser.id,
        userName: veteranUser.name,
        requesterRole: 'employee',
        department: veteranUser.department,
        leaveType: 'sick',
        durationType: 'full',
        startDate: today,
        endDate: today,
        totalDays: 1,
        reason: 'ไข้หวัด',
        status: 'approved',
        createdAt: `${today}T08:00:00.000Z`,
      };

      const ownerHtml = renderToStaticMarkup(
        <AttendanceAndOfficeView
          currentUser={cLevelOwner}
          users={[cLevelOwner, veteranUser]}
          attendance={[ownLegacyWfaAttendance]}
          leaves={[legacyWfaLeave, realSickLeave]}
          onCheckIn={async () => ({ success: true })}
          onCheckOut={async () => ({ success: true })}
        />
      );
      expect(ownerHtml).not.toContain('WFA');
      expect(ownerHtml).not.toContain('Work From Anywhere');
      expect(ownerHtml).not.toContain('ทำงานต่างจังหวัด/ที่อื่น');
      // Owner sees the 3 active check-in options and veteranUser's real sick leave is NOT shadowed by legacy WFA leave
      expect(ownerHtml).toContain('เลือกสถานที่ลงเวลาเข้างาน');
      expect(ownerHtml).toContain('ลาป่วย');

      // LoginView capability pills reflect WFH via Check-in, not leave filing
      const loginHtml = renderToStaticMarkup(
        <LoginView onLoginSuccess={() => {}} />
      );
      expect(loginHtml).not.toContain('ยื่นใบลา &amp; WFH');
      expect(loginHtml).toContain('Check-in &amp; WFH');
      expect(loginHtml).toContain('ยื่นใบลาออนไลน์');
    });

    it('rejects userinfo/port/non-room Meet URLs and preserves Meet links across checkout notes, unnormalized Sheet cells, and Attendance CSV', async () => {
      const subtleInvalidMeetUrls = [
        'https://evil.com@meet.google.com/abc-defg-hij',
        'https://user:pass@meet.google.com/abc-defg-hij',
        'https://meet.google.com:8443/abc-defg-hij',
        'https://meet.google.com/lookup',
        'https://meet.google.com/lookup/',
        'https://meet.google.com/landing',
        'https://meet.google.com/about',
        'https://meet.google.com/whoops',
        'https://meet.google.com/a',
        'https://meet.google.com/abc/def',
        'https://g.co/meet/ab',
      ];
      for (const bad of subtleInvalidMeetUrls) {
        expect(
          normalizeAndValidateMeetLink(bad).valid,
          `expected "${bad}" to be rejected`
        ).toBe(false);
      }

      // 1. Checkout note mentioning the Meet URL in the middle MUST NOT lose meetLink after Sheets round-trip
      const checkIn = await recordCheckIn('EMP003', {
        date: '2026-12-25',
        checkInTime: '08:50',
        workLocation: 'wfh',
        meetLink: 'https://meet.google.com/abc-defg-hij',
        note: 'เริ่มงาน',
      });
      expect(checkIn.success).toBe(true);

      const checkOut = await recordCheckOut('EMP003', {
        date: '2026-12-25',
        checkOutTime: '17:30',
        note: 'ปิดห้อง https://meet.google.com/abc-defg-hij เรียบร้อย',
      });
      expect(checkOut.success).toBe(true);
      const reloadedAfterOut = rowToAttendance(attendanceToRow(checkOut.record!));
      expect(reloadedAfterOut.meetLink).toBe(
        'https://meet.google.com/abc-defg-hij'
      );
      expect(extractWfhMeetLinkAndNote(reloadedAfterOut)).toEqual({
        meetLink: 'https://meet.google.com/abc-defg-hij',
        extraNote: 'ปิดห้อง https://meet.google.com/abc-defg-hij เรียบร้อย',
      });

      // 2. Unnormalized Meet link in Sheet cell (without https://) MUST NOT duplicate Meet link in extraNote or re-save
      const fromUnnormalizedSheet = rowToAttendance([
        'ATT-UNNORM',
        'EMP003',
        'สมชาย ใจดี',
        'IT & Digital',
        '2026-12-26',
        '08:55',
        '',
        'wfh',
        'meet.google.com/abc-defg-hij • ทำงานที่บ้าน',
      ]);
      expect(fromUnnormalizedSheet.meetLink).toBe(
        'https://meet.google.com/abc-defg-hij'
      );
      expect(extractWfhMeetLinkAndNote(fromUnnormalizedSheet)).toEqual({
        meetLink: 'https://meet.google.com/abc-defg-hij',
        extraNote: 'ทำงานที่บ้าน',
      });
      expect(attendanceToRow(fromUnnormalizedSheet)[8]).toBe(
        'https://meet.google.com/abc-defg-hij • ทำงานที่บ้าน'
      );

      // Unnormalized Meet link with no extra note
      const fromUnnormalizedOnly = rowToAttendance([
        'ATT-UNNORM-ONLY',
        'EMP003',
        'สมชาย ใจดี',
        'IT & Digital',
        '2026-12-27',
        '08:55',
        '',
        'wfh',
        'meet.google.com/abc-defg-hij',
      ]);
      expect(extractWfhMeetLinkAndNote(fromUnnormalizedOnly)).toEqual({
        meetLink: 'https://meet.google.com/abc-defg-hij',
        extraNote: undefined,
      });

      // 3. generateAttendanceCsv includes BOTH meetLink and note even when stored separately
      const csv = generateAttendanceCsv([
        {
          id: 'ATT-CSV-1',
          userId: veteranUser.id,
          userName: veteranUser.name,
          department: veteranUser.department,
          date: '2026-12-28',
          checkInTime: '08:45',
          workLocation: 'wfh',
          meetLink: 'https://meet.google.com/abc-defg-hij',
          note: 'ทำรายงาน Q4',
        },
      ]);
      expect(csv).toContain('https://meet.google.com/abc-defg-hij');
      expect(csv).toContain('ทำรายงาน Q4');
    });

    it('enforces SSRF webhook validation (env quotes, port/userinfo, post-time check) and verifies HR1->C-Level->HR2 and C-Level->HR Chat 2 routing', async () => {
      // Quoted env var normalized cleanly
      process.env.GOOGLE_CHAT_WEBHOOK_URL_2 = `"${CHAT_2_URL}"`;
      expect(getEffectiveGoogleChatWebhookUrl2()).toBe(CHAT_2_URL);
      delete process.env.GOOGLE_CHAT_WEBHOOK_URL_2;

      // Webhook URL validator rejects userinfo, port, non-/v1/spaces/ path
      expect(isValidGoogleChatWebhookUrl(CHAT_2_URL)).toBe(true);
      expect(
        isValidGoogleChatWebhookUrl(
          'https://evil@chat.googleapis.com/v1/spaces/X/messages'
        )
      ).toBe(false);
      expect(
        isValidGoogleChatWebhookUrl(
          'https://chat.googleapis.com:8443/v1/spaces/X/messages'
        )
      ).toBe(false);
      expect(
        isValidGoogleChatWebhookUrl('https://chat.googleapis.com/other')
      ).toBe(false);

      // Admin POST /api/system rejects port/userinfo bypass on googleChatWebhookUrl2
      const adminActor = (
        await upsertEmployee('EMP001', {
          name: 'Super Admin',
          email: 'rut.wa@digitalbusinessconsult.asia',
          role: 'admin',
          department: 'Executive (C-Level)',
        })
      ).user!;
      const adminCookie = cookieFor({
        id: adminActor.id,
        email: adminActor.email,
      });
      const ssrfBypassRes = await systemPost(
        new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: JSON.stringify({
            action: 'save_config',
            googleChatWebhookUrl2:
              'https://evil@chat.googleapis.com:8443/v1/spaces/X/messages',
          }),
        })
      );
      expect(ssrfBypassRes.status).toBe(400);

      const originalFetch = global.fetch;
      const calls: Array<{ url: string; text: string }> = [];
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const parsed = JSON.parse(String(init?.body || '{}'));
        calls.push({ url, text: parsed.text || '' });
        return new Response(JSON.stringify({ name: 'messages/ok' }), {
          status: 200,
        });
      }) as typeof fetch;

      try {
        // Defense-in-depth: postToGoogleChatWebhooks refuses tampered non-Google-Chat URL in runtime config
        saveRuntimeAppConfig({
          googleChatWebhookUrl: 'http://169.254.169.254/latest/meta-data/',
          googleChatWebhookUrl2: CHAT_2_URL,
        });
        const wfhRes = await sendGoogleChatWfhCheckInNotification(
          {
            id: 'ATT-SSRF-TEST',
            userId: veteranUser.id,
            userName: veteranUser.name,
            department: veteranUser.department,
            date: '2026-12-28',
            checkInTime: '09:00',
            workLocation: 'wfh',
          },
          veteranUser,
          'meet.google.com/abc-defg-hij' // unnormalized input -> normalized to https://
        );
        expect(wfhRes.sent).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(CHAT_2_URL);
        expect(calls[0].text).toContain('https://meet.google.com/abc-defg-hij');

        // Configure both Chat 1 & Chat 2
        saveRuntimeAppConfig({
          googleChatWebhookUrl: CHAT_1_URL,
          googleChatWebhookUrl2: CHAT_2_URL,
        });

        // Flow A: HR1 (EMP001) -> C-Level (EMP009) [Step 1: NO Chat 2] -> HR2 (EMP008) [Final: YES Chat 2]
        calls.length = 0;
        const hrLeave = await createLeaveRequest('EMP001', {
          leaveType: 'personal',
          durationType: 'full',
          startDate: '2026-12-28',
          endDate: '2026-12-28',
          reason: 'HR1 ลากิจ',
        });
        expect(hrLeave.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        calls.length = 0;
        const hrStep1 = await processLeaveAction('EMP009', hrLeave.leave!.id, 'approve');
        expect(hrStep1.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        calls.length = 0;
        const hrFinal = await processLeaveAction('EMP008', hrLeave.leave!.id, 'approve');
        expect(hrFinal.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(1);

        // Flow B: C-Level (EMP009) creates leave (pending_hr -> Chat 1 has pending_hr status, Chat 2 silent) -> HR (EMP001) approves (Chat 2 notified)
        calls.length = 0;
        const ceoLeave = await createLeaveRequest('EMP009', {
          leaveType: 'vacation',
          durationType: 'full',
          startDate: '2026-12-29',
          endDate: '2026-12-29',
          reason: 'พักผ่อนประจำปี',
        });
        expect(ceoLeave.success).toBe(true);
        expect(ceoLeave.leave?.status).toBe('pending_hr');
        const ceoChat1Create = calls.filter((c) => c.url === CHAT_1_URL);
        expect(ceoChat1Create).toHaveLength(1);
        expect(ceoChat1Create[0].text).toContain('รอฝ่ายบุคคล (HR) อนุมัติขั้นสุดท้าย');
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(0);

        calls.length = 0;
        const ceoFinal = await processLeaveAction('EMP001', ceoLeave.leave!.id, 'approve');
        expect(ceoFinal.success).toBe(true);
        expect(calls.filter((c) => c.url === CHAT_1_URL)).toHaveLength(1);
        expect(calls.filter((c) => c.url === CHAT_2_URL)).toHaveLength(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
