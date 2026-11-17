import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { POST as attendancePost } from '@/app/api/attendance/route';
import {
  ALL_LEAVE_TYPES,
  getBangkokNow,
  REQUESTABLE_LEAVE_TYPES,
  STANDARD_LEAVE_QUOTAS,
} from '../leave-utils';
import {
  recordCheckIn,
  resetDemoData,
  sendGoogleChatOffsiteCheckInNotification,
} from '../hr-service';
import {
  DEFAULT_GOOGLE_CHAT_WEBHOOK_URL,
  saveRuntimeAppConfig,
} from '../storage';
import { AttendanceRecord, SafeUser } from '../types';
import LeaveRequestModal from '@/components/LeaveRequestModal';
import AttendanceAndOfficeView from '@/components/AttendanceAndOfficeView';

describe('Offsite Check-in Consolidation & Google Chat Notification Tests', () => {
  const testUser: SafeUser = {
    id: 'EMP001',
    name: 'ศิริพร บริหารงาน (HR 1)',
    englishName: 'Siriporn Borihanngan',
    email: 'siriporn.hr1@company.co.th',
    role: 'hr',
    department: 'HR & Admin',
    position: 'HR Specialist',
    startDate: '2024-01-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  beforeEach(async () => {
    await resetDemoData();
  });

  describe('1. Leave Request Modal Constraints', () => {
    it('excludes offsite from REQUESTABLE_LEAVE_TYPES while preserving ALL_LEAVE_TYPES for backward compatibility', () => {
      expect(REQUESTABLE_LEAVE_TYPES).not.toContain('offsite');
      expect(REQUESTABLE_LEAVE_TYPES).toEqual([
        'sick',
        'personal',
        'vacation',
        'wfh',
        'wfa',
      ]);
      expect(ALL_LEAVE_TYPES).toContain('offsite');
    });

    it('does not render "ทำงานนอกสถานที่" option in LeaveRequestModal and shows guidance note', () => {
      const quotaOverview = {
        userId: testUser.id,
        userName: testUser.name,
        department: testUser.department,
        year: 2026,
        quotas: {
          sick: {
            leaveType: 'sick' as const,
            label: 'ลาป่วย',
            totalQuota: 30,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 30,
            availableAfterPending: 30,
            isUnlimited: false,
          },
          personal: {
            leaveType: 'personal' as const,
            label: 'ลากิจ',
            totalQuota: 3,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 3,
            availableAfterPending: 3,
            isUnlimited: false,
          },
          vacation: {
            leaveType: 'vacation' as const,
            label: 'ลาพักร้อน',
            totalQuota: 6,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 6,
            availableAfterPending: 6,
            isUnlimited: false,
          },
          wfh: {
            leaveType: 'wfh' as const,
            label: 'WFH',
            totalQuota: 0,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 0,
            availableAfterPending: 0,
            isUnlimited: true,
          },
          wfa: {
            leaveType: 'wfa' as const,
            label: 'WFA',
            totalQuota: 0,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 0,
            availableAfterPending: 0,
            isUnlimited: true,
          },
          offsite: {
            leaveType: 'offsite' as const,
            label: 'ทำงานนอกสถานที่',
            totalQuota: 0,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 0,
            availableAfterPending: 0,
            isUnlimited: true,
          },
        },
      };

      const html = renderToStaticMarkup(
        <LeaveRequestModal
          isOpen={true}
          onClose={() => {}}
          currentUser={testUser}
          holidays={[]}
          myQuota={quotaOverview}
          onSubmitLeave={async () => ({ success: true })}
        />
      );

      // Should contain 5 options
      expect(html).toContain('ลาป่วย');
      expect(html).toContain('ลากิจ');
      expect(html).toContain('ลาพักร้อน');
      expect(html).toContain('Work From Home');
      expect(html).toContain('Work From Anywhere');

      // Should NOT contain the option button for offsite leave
      expect(html).not.toContain('ทำงานนอกสถานที่ (พบลูกค้า/ประชุม/ออกบูธ)');

      // Should explain to employees that offsite is handled on check-in
      expect(html).toContain('การทำงานนอกสถานที่ (พบลูกค้า/ออกบูธ) ไม่ต้องยื่นขออนุมัติล่วงหน้า');
      expect(html).toContain('Check-in นอกสถานที่');
    });
  });

  describe('2. Check-in Service & Offsite Validation', () => {
    it('rejects offsite check-in if neither locationName nor note is provided', async () => {
      const res = await recordCheckIn(testUser.id, {
        workLocation: 'offsite',
        locationName: '',
        note: '',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('กรุณาระบุสถานที่');
    });

    it('successfully records offsite check-in with locationName and optional extra note', async () => {
      const res = await recordCheckIn(testUser.id, {
        workLocation: 'offsite',
        locationName: 'บจก. สยามเทคโนโลยี (สีลม)',
        note: 'เข้าพบฝ่ายไอทีเพื่อเสนองาน',
      });
      expect(res.success).toBe(true);
      expect(res.record?.workLocation).toBe('offsite');
      expect(res.record?.locationName).toBe('บจก. สยามเทคโนโลยี (สีลม)');
      expect(res.record?.note).toContain('บจก. สยามเทคโนโลยี (สีลม)');
      expect(res.record?.note).toContain('เข้าพบฝ่ายไอทีเพื่อเสนองาน');
    });

    it('accepts note as effective location if locationName is omitted (backward compatibility)', async () => {
      const res = await recordCheckIn(testUser.id, {
        workLocation: 'offsite',
        note: 'ศูนย์การประชุมแห่งชาติสิริกิติ์ บูธ A10',
      });
      expect(res.success).toBe(true);
      expect(res.record?.workLocation).toBe('offsite');
      expect(res.record?.note).toBe('ศูนย์การประชุมแห่งชาติสิริกิติ์ บูธ A10');
    });

    it('clears locationName and does not leak offsite note when updating location from offsite to office', async () => {
      // 1. Initial check-in offsite
      const firstCheckIn = await recordCheckIn(testUser.id, {
        workLocation: 'offsite',
        locationName: 'บจก. ลูกค้าเอเชีย (สุขุมวิท)',
        note: 'ประชุมเซ็นสัญญา',
      });
      expect(firstCheckIn.success).toBe(true);
      expect(firstCheckIn.record?.workLocation).toBe('offsite');
      expect(firstCheckIn.record?.locationName).toBe('บจก. ลูกค้าเอเชีย (สุขุมวิท)');

      // 2. Later returns to office and switches to office without note
      const returnToOffice = await recordCheckIn(testUser.id, {
        workLocation: 'office',
      });
      expect(returnToOffice.success).toBe(true);
      expect(returnToOffice.record?.workLocation).toBe('office');
      expect(returnToOffice.record?.locationName).toBeUndefined();
      expect(returnToOffice.record?.note).toBeUndefined();
    });

    it('rowToAttendance successfully parses locationName from Google Sheet offsite rows', async () => {
      const { rowToAttendance } = await import('../storage');

      // Combined note format: "สถานที่ • หมายเหตุ"
      const parsedCombined = rowToAttendance([
        'ATT-001',
        testUser.id,
        testUser.name,
        testUser.department,
        '2026-11-17',
        '09:00',
        '',
        'offsite',
        'ศูนย์ประชุมแห่งชาติสิริกิติ์ • บูธ B12',
      ]);
      expect(parsedCombined.workLocation).toBe('offsite');
      expect(parsedCombined.locationName).toBe('ศูนย์ประชุมแห่งชาติสิริกิติ์');
      expect(parsedCombined.note).toBe('ศูนย์ประชุมแห่งชาติสิริกิติ์ • บูธ B12');

      // Standalone note format: "สถานที่"
      const parsedSingle = rowToAttendance([
        'ATT-002',
        testUser.id,
        testUser.name,
        testUser.department,
        '2026-11-17',
        '09:30',
        '',
        'offsite',
        'บจก. เคมีคอลไทยแลนด์',
      ]);
      expect(parsedSingle.workLocation).toBe('offsite');
      expect(parsedSingle.locationName).toBe('บจก. เคมีคอลไทยแลนด์');
      expect(parsedSingle.note).toBe('บจก. เคมีคอลไทยแลนด์');

      // Non-offsite row should not populate locationName
      const parsedOffice = rowToAttendance([
        'ATT-003',
        testUser.id,
        testUser.name,
        testUser.department,
        '2026-11-17',
        '08:45',
        '',
        'office',
        'ชั้น 18',
      ]);
      expect(parsedOffice.workLocation).toBe('office');
      expect(parsedOffice.locationName).toBeUndefined();
      expect(parsedOffice.note).toBe('ชั้น 18');
    });
  });

  describe('3. Google Chat Webhook Triggering on Offsite Check-in', () => {
    it('triggers Google Chat webhook formatted message on offsite check-in and skips for office check-in', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl: DEFAULT_GOOGLE_CHAT_WEBHOOK_URL,
      });

      const originalFetch = global.fetch;
      const calls: { url: string; body: string }[] = [];

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          calls.push({ url, body: String(init?.body || '') });
          return new Response(JSON.stringify({ name: 'spaces/AAQAxhyo86I/messages/test-offsite' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        // 1. Regular office check-in should NOT trigger chat notification
        const officeRes = await recordCheckIn(testUser.id, {
          workLocation: 'office',
          note: 'ทำงานปกติ',
        });
        expect(officeRes.success).toBe(true);
        expect(calls.length).toBe(0);

        // 2. Offsite check-in MUST trigger Google Chat notification immediately
        const offsiteRes = await recordCheckIn(testUser.id, {
          workLocation: 'offsite',
          locationName: 'อาคารเอ็มไพร์ทาวเวอร์ สาทร (บจก. ดิจิทัล โซลูชั่นส์)',
          note: 'ประชุม Kickoff โครงการระบบบริหารทรัพยากรบุคคล',
        });
        expect(offsiteRes.success).toBe(true);
        expect(calls.length).toBe(1);

        const chatPayload = JSON.parse(calls[0].body);
        expect(chatPayload.text).toContain('แจ้งเตือนการลงเวลาปฏิบัติงานนอกสถานที่');
        expect(chatPayload.text).toContain(testUser.name);
        expect(chatPayload.text).toContain(testUser.id);
        expect(chatPayload.text).toContain(testUser.department);
        expect(chatPayload.text).toContain('อาคารเอ็มไพร์ทาวเวอร์ สาทร');
        expect(chatPayload.text).toContain('ประชุม Kickoff โครงการระบบบริหารทรัพยากรบุคคล');
        expect(chatPayload.text).toContain('เช็คอินนอกสถานที่เรียบร้อยแล้ว (ไม่ต้องรออนุมัติ)');
      } finally {
        global.fetch = originalFetch;
        saveRuntimeAppConfig({ googleChatWebhookUrl: '' });
      }
    });

    it('sendGoogleChatOffsiteCheckInNotification handles network failures gracefully without throwing', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl: 'https://chat.googleapis.com/v1/spaces/AAQAxhyo86I/messages?key=invalid&token=invalid',
      });

      const originalFetch = global.fetch;
      global.fetch = (async () => {
        throw new Error('Network offline or webhook unreachable');
      }) as typeof fetch;

      try {
        const record: AttendanceRecord = {
          id: 'ATT-2026-11-17-EMP001',
          userId: testUser.id,
          userName: testUser.name,
          department: testUser.department,
          date: '2026-11-17',
          checkInTime: '09:00',
          workLocation: 'offsite',
          note: 'ลูกค้า ABC',
        };

        const res = await sendGoogleChatOffsiteCheckInNotification(record, {
          ...testUser,
          role: 'employee',
        });
        expect(res.sent).toBe(false);
        expect(res.error).toContain('Network offline');
      } finally {
        global.fetch = originalFetch;
        saveRuntimeAppConfig({ googleChatWebhookUrl: '' });
      }
    });

    it('correctly formats message and strips location prefix from note when only record is supplied', async () => {
      saveRuntimeAppConfig({
        googleChatWebhookUrl: DEFAULT_GOOGLE_CHAT_WEBHOOK_URL,
      });

      const originalFetch = global.fetch;
      let sentText = '';

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          const body = JSON.parse(String(init?.body || '{}'));
          sentText = body.text || '';
          return new Response(JSON.stringify({ name: 'messages/test' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const record: AttendanceRecord = {
          id: 'ATT-2026-11-17-EMP001',
          userId: testUser.id,
          userName: testUser.name,
          department: testUser.department,
          date: '2026-11-17',
          checkInTime: '09:00',
          workLocation: 'offsite',
          locationName: 'บจก. ดิจิทัล โซลูชั่นส์',
          note: 'บจก. ดิจิทัล โซลูชั่นส์ • ประชุมสรุปผลประจำไตรมาส',
        };

        const res = await sendGoogleChatOffsiteCheckInNotification(record, testUser);
        expect(res.sent).toBe(true);
        expect(sentText).toContain('📌 *สถานที่ / ลูกค้า:* บจก. ดิจิทัล โซลูชั่นส์');
        // Extra note should only be the note content, without duplicated location prefix
        expect(sentText).toContain('💬 *หมายเหตุ / รายละเอียดงาน:* ประชุมสรุปผลประจำไตรมาส');
        expect(sentText).not.toContain('บจก. ดิจิทัล โซลูชั่นส์ • ประชุมสรุปผลประจำไตรมาส');
      } finally {
        global.fetch = originalFetch;
        saveRuntimeAppConfig({ googleChatWebhookUrl: '' });
      }
    });
  });

  describe('4. /api/attendance Endpoint Integration', () => {
    it('accepts locationName in POST body and passes through to offsite check-in', async () => {
      const req = new NextRequest('http://localhost/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: testUser.id,
          date: '2026-11-17',
          checkInTime: '08:45',
          workLocation: 'offsite',
          locationName: 'BITEC บางนา Hall 101',
          note: 'ร่วมออกบูธแสดงสินค้า Tech Innovators',
        }),
      });

      const res = await attendancePost(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.record.workLocation).toBe('offsite');
      expect(data.record.locationName).toBe('BITEC บางนา Hall 101');
      expect(data.record.note).toContain('BITEC บางนา');
    });

    it('returns status 400 when offsite check-in is submitted without location details', async () => {
      const req = new NextRequest('http://localhost/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: testUser.id,
          date: '2026-11-17',
          checkInTime: '08:45',
          workLocation: 'offsite',
          locationName: '',
          note: '',
        }),
      });

      const res = await attendancePost(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('กรุณาระบุสถานที่');
    });
  });

  describe('5. AttendanceAndOfficeView Offsite Integration', () => {
    it('renders offsite button and offsite attendance information on board', () => {
      const offsiteRecord: AttendanceRecord = {
        id: 'ATT-2026-11-17-EMP001',
        userId: testUser.id,
        userName: testUser.name,
        department: testUser.department,
        date: getBangkokNow().dateStr,
        checkInTime: '09:15',
        workLocation: 'offsite',
        locationName: 'บจก. สยามพารากอน ดีเวลลอปเม้นท์',
        note: 'บจก. สยามพารากอน ดีเวลลอปเม้นท์ • ติดตั้งระบบและทดสอบหน้างาน',
      };

      const html = renderToStaticMarkup(
        <AttendanceAndOfficeView
          currentUser={testUser}
          users={[testUser]}
          attendance={[offsiteRecord]}
          leaves={[]}
          onCheckIn={async () => ({ success: true })}
          onCheckOut={async () => ({ success: true })}
        />
      );

      // Check that offsite button is rendered
      expect(html).toContain('นอกสถานที่');
      expect(html).toContain('พบลูกค้า/ออกบูธ');

      // Check that active offsite record shows up in the attendance view
      expect(html).toContain('09:15 น.');
      expect(html).toContain('สยามพารากอน');
    });

    it('displays locationName in today record card and daily board even when record.note is undefined', () => {
      const offsiteOnlyLocation: AttendanceRecord = {
        id: 'ATT-2026-11-17-EMP001',
        userId: testUser.id,
        userName: testUser.name,
        department: testUser.department,
        date: getBangkokNow().dateStr,
        checkInTime: '08:50',
        workLocation: 'offsite',
        locationName: 'ศูนย์แสดงสินค้าและการประชุม อิมแพ็ค เมืองทองธานี',
        note: undefined,
      };

      const html = renderToStaticMarkup(
        <AttendanceAndOfficeView
          currentUser={testUser}
          users={[testUser]}
          attendance={[offsiteOnlyLocation]}
          leaves={[]}
          onCheckIn={async () => ({ success: true })}
          onCheckOut={async () => ({ success: true })}
        />
      );

      // Should display the locationName in the today status card
      expect(html).toContain('หมายเหตุ / สถานที่:');
      expect(html).toContain('อิมแพ็ค เมืองทองธานี');

      // Should display the locationName on the daily board
      expect(html).toContain('อิมแพ็ค เมืองทองธานี');
    });
  });
});
