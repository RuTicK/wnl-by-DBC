import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as authPost } from '@/app/api/auth/route';
import { GET as systemGet, POST as systemPost } from '@/app/api/system/route';
import { POST as leavesPost, PATCH as leavesPatch } from '@/app/api/leaves/route';
import { POST as employeesPost } from '@/app/api/employees/route';
import {
  POST as attendancePost,
  PATCH as attendancePatch,
} from '@/app/api/attendance/route';
import {
  areEmailsEquivalent,
  calculateLeaveDays,
  calculateUserQuotaSummary,
  checkApprovalPermission,
  checkProbationLeaveEligibility,
  checkRejectionPermission,
  COMPANY_EMAIL_DOMAINS,
  doesUserMatchEmail,
  escapeCsvCell,
  filterLeavesForViewer,
  generateAttendanceCsv,
  generateLeavesCsv,
  generateQuotaSummaryCsv,
  getAdditionalUserEmails,
  getBangkokNow,
  getCompanyAliasEmail,
  getEquivalentEmails,
  getProbationInfo,
  getUserEmails,
  isSuperAdminEmail,
  isSuperAdminUser,
  isValidEmailFormat,
  STANDARD_LEAVE_QUOTAS,
  SUPER_ADMIN_ALT_EMAIL,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_EMAILS,
} from '../leave-utils';
import {
  authenticateUser,
  createLeaveRequest,
  deleteEmployee,
  deleteHoliday,
  getSystemDataForUser,
  isNotifiableLeaveType,
  loginWithGoogleProfile,
  processLeaveAction,
  recordCheckIn,
  recordCheckOut,
  registerGoogleUser,
  resetDemoData,
  updateOwnTestingProfile,
  upsertEmployee,
  upsertHoliday,
  verifyGoogleOAuthCredentials,
} from '../hr-service';
import {
  ATTENDANCE_SHEET_HEADERS,
  appSheetRowToLeave,
  appSheetRowToUser,
  DEFAULT_GOOGLE_CHAT_WEBHOOK_URL,
  attendanceToAppSheetRow,
  attendanceToRow,
  getEffectiveGoogleClientId,
  getRuntimeAppConfig,
  holidayToAppSheetRow,
  holidayToRow,
  LEAVE_SHEET_HEADERS,
  leaveToAppSheetRow,
  leaveToRow,
  MAX_SHEET_CELL_LENGTH,
  rowToAttendance,
  rowToHoliday,
  rowToLeave,
  rowToUser,
  saveRuntimeAppConfig,
  syncToAppSheetTable,
  USER_SHEET_HEADERS,
  userToAppSheetRow,
  userToRow,
} from '../storage';
import { createSessionToken, SESSION_COOKIE_NAME } from '../session';

function cookieHeaderFor(user: { id: string; email: string }): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(user)}`;
}
import { COMPANY_DEPARTMENTS, Holiday, LeaveRequest } from '../types';
import {
  INITIAL_ATTENDANCE,
  INITIAL_HOLIDAYS,
  INITIAL_LEAVE_REQUESTS,
  INITIAL_USERS,
  PROD_USERS,
} from '../mock-data';
import fs from 'fs';
import path from 'path';

describe('HR Leave, WFH/Offsite & PDPA Attendance System Tests', () => {
  const sampleHolidays: Holiday[] = [
    { id: 'H1', date: '2026-11-10', name: 'วันหยุดพิเศษบริษัท' },
  ];

  beforeEach(async () => {
    await resetDemoData();
  });

  describe('1. Smart Working Days & Holiday Calculation (calculateLeaveDays)', () => {
    it('excludes Saturday and Sunday automatically (Friday to Monday = 2 days)', () => {
      const res = calculateLeaveDays('2026-11-06', '2026-11-09', 'full', []);
      expect(res.isValid).toBe(true);
      expect(res.calendarDays).toBe(4);
      expect(res.totalDays).toBe(2);
      expect(res.workingDates).toEqual(['2026-11-06', '2026-11-09']);
      expect(res.skippedWeekendDates).toEqual(['2026-11-07', '2026-11-08']);
    });

    it('excludes both weekends and company public holidays automatically', () => {
      const res = calculateLeaveDays(
        '2026-11-06',
        '2026-11-10',
        'full',
        sampleHolidays
      );
      expect(res.isValid).toBe(true);
      expect(res.calendarDays).toBe(5);
      expect(res.totalDays).toBe(2);
      expect(res.skippedHolidayDates).toEqual([
        { date: '2026-11-10', name: 'วันหยุดพิเศษบริษัท' },
      ]);
    });

    it('calculates 0.5 days for half_morning and half_afternoon on a working day', () => {
      const morning = calculateLeaveDays(
        '2026-11-06',
        '2026-11-06',
        'half_morning',
        sampleHolidays
      );
      const afternoon = calculateLeaveDays(
        '2026-11-06',
        '2026-11-06',
        'half_afternoon',
        sampleHolidays
      );
      expect(morning.isValid).toBe(true);
      expect(morning.totalDays).toBe(0.5);
      expect(afternoon.isValid).toBe(true);
      expect(afternoon.totalDays).toBe(0.5);
    });

    it('rejects half-day leave spanning multiple dates', () => {
      const res = calculateLeaveDays(
        '2026-11-06',
        '2026-11-09',
        'half_morning',
        []
      );
      expect(res.isValid).toBe(false);
      expect(res.totalDays).toBe(0);
      expect(res.error).toContain('ครึ่งวัน');
    });

    it('rejects leave when selected dates are all weekends or holidays', () => {
      const weekendRes = calculateLeaveDays(
        '2026-11-07',
        '2026-11-08',
        'full',
        []
      );
      expect(weekendRes.isValid).toBe(false);
      expect(weekendRes.totalDays).toBe(0);

      const holidayRes = calculateLeaveDays(
        '2026-11-10',
        '2026-11-10',
        'half_morning',
        sampleHolidays
      );
      expect(holidayRes.isValid).toBe(false);
      expect(holidayRes.totalDays).toBe(0);
    });

    it('rejects invalid dates and reversed date ranges', () => {
      expect(
        calculateLeaveDays('2026-11-10', '2026-11-05', 'full', []).isValid
      ).toBe(false);
      expect(
        calculateLeaveDays('2026-02-30', '2026-03-01', 'full', []).isValid
      ).toBe(false);
      expect(calculateLeaveDays('', '', 'full', []).isValid).toBe(false);
    });
  });

  describe('2. Overlapping Leave Detection (findOverlappingLeave)', () => {
    it('allows half_morning and half_afternoon on the same date for the same employee', async () => {
      const first = await createLeaveRequest('EMP003', {
        leaveType: 'personal',
        durationType: 'half_morning',
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        reason: 'ธุระเช้า',
      });
      expect(first.success).toBe(true);

      const duplicateMorning = await createLeaveRequest('EMP003', {
        leaveType: 'personal',
        durationType: 'half_morning',
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        reason: 'ธุระเช้าซ้ำ',
      });
      expect(duplicateMorning.success).toBe(false);

      const afternoon = await createLeaveRequest('EMP003', {
        leaveType: 'personal',
        durationType: 'half_afternoon',
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        reason: 'ธุระบ่าย',
      });
      expect(afternoon.success).toBe(true);
    });
  });

  describe('3. 4-Role Approval Workflow Matrix (Employee / Manager / HR1-HR2 / C-Level)', () => {
    it('Chain 1 (Employee): Employee -> Manager (Step 1) -> HR (Step 2) + C-Level Notified', async () => {
      const initialData = await getSystemDataForUser('EMP003', 2026);
      const initialVacationUsed = initialData.myQuota.quotas.vacation.usedDays;

      const created = await createLeaveRequest('EMP003', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-03',
        endDate: '2026-12-04',
        reason: 'เที่ยวปลายปี',
      });
      expect(created.success).toBe(true);
      expect(created.leave?.status).toBe('pending_manager');
      const leaveId = created.leave!.id;

      // Wrong department manager (EMP005 Sales) cannot approve
      const wrongMgr = await processLeaveAction(
        'EMP005',
        leaveId,
        'approve',
        'อนุมัติข้ามแผนก'
      );
      expect(wrongMgr.success).toBe(false);

      // Step 1: IT Manager (EMP002) approves -> pending_hr
      const step1 = await processLeaveAction(
        'EMP002',
        leaveId,
        'approve',
        'หัวหน้าอนุมัติครับ'
      );
      expect(step1.success).toBe(true);
      expect(step1.leave?.status).toBe('pending_hr');

      // Step 2: HR 1 (EMP001) approves -> approved + cLevelNotifiedAt set
      const step2 = await processLeaveAction(
        'EMP001',
        leaveId,
        'approve',
        'HR อนุมัติตัดโควต้า'
      );
      expect(step2.success).toBe(true);
      expect(step2.leave?.status).toBe('approved');
      expect(step2.leave?.cLevelNotifiedAt).toBeDefined();

      const afterStep2 = await getSystemDataForUser('EMP003', 2026);
      expect(afterStep2.myQuota.quotas.vacation.usedDays).toBe(
        initialVacationUsed + 2
      );
    });

    it('Chain 2 (Manager): Manager -> C-Level (Step 1) -> HR (Step 2) + C-Level Notified', async () => {
      // IT Manager (EMP002) requests leave -> starts at pending_c_level
      const mgrCreated = await createLeaveRequest('EMP002', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-08',
        endDate: '2026-12-09',
        reason: 'Manager พาครอบครัวไปต่างจังหวัด',
      });
      expect(mgrCreated.success).toBe(true);
      expect(mgrCreated.leave?.status).toBe('pending_c_level');
      expect(mgrCreated.leave?.requesterRole).toBe('manager');
      const leaveId = mgrCreated.leave!.id;

      // Manager cannot approve their own leave, and HR cannot approve Step 1 (pending_c_level)
      expect(
        (await processLeaveAction('EMP002', leaveId, 'approve')).success
      ).toBe(false);
      expect(
        (await processLeaveAction('EMP001', leaveId, 'approve')).success
      ).toBe(false);

      // Step 1: C-Level (EMP009) approves -> status becomes pending_hr
      const step1 = await processLeaveAction(
        'EMP009',
        leaveId,
        'approve',
        'C-Level อนุมัติขั้นที่ 1'
      );
      expect(step1.success).toBe(true);
      expect(step1.leave?.status).toBe('pending_hr');
      expect(step1.leave?.cLevelApproval?.approvedByName).toContain('อนันต์');

      // Step 2: HR (EMP001) approves -> status becomes approved + C-Level notified
      const step2 = await processLeaveAction(
        'EMP001',
        leaveId,
        'approve',
        'HR บันทึกตัดโควต้าเรียบร้อย'
      );
      expect(step2.success).toBe(true);
      expect(step2.leave?.status).toBe('approved');
      expect(step2.leave?.cLevelNotifiedAt).toBeDefined();
    });

    it('Chain 3 (HR): HR1 -> C-Level (Step 1) -> HR2 Backup (Step 2, HR1 blocked from self-approval)', async () => {
      // HR 1 (EMP001) requests personal leave -> starts at pending_c_level
      const hrCreated = await createLeaveRequest('EMP001', {
        leaveType: 'personal',
        durationType: 'full',
        startDate: '2026-12-16',
        endDate: '2026-12-16',
        reason: 'HR1 ติดต่อราชการ',
      });
      expect(hrCreated.success).toBe(true);
      expect(hrCreated.leave?.status).toBe('pending_c_level');
      expect(hrCreated.leave?.requesterRole).toBe('hr');
      const leaveId = hrCreated.leave!.id;

      // Step 1: C-Level (EMP009) approves -> status becomes pending_hr
      const step1 = await processLeaveAction(
        'EMP009',
        leaveId,
        'approve',
        'C-Level อนุมัติให้ HR1'
      );
      expect(step1.success).toBe(true);
      expect(step1.leave?.status).toBe('pending_hr');

      // HR 1 (EMP001) tries to approve their own Step 2 -> MUST FAIL!
      const selfApproveAttempt = await processLeaveAction(
        'EMP001',
        leaveId,
        'approve',
        'HR1 กดอนุมัติตัวเอง'
      );
      expect(selfApproveAttempt.success).toBe(false);
      expect(selfApproveAttempt.error).toContain('HR สำรองอีกท่าน');

      // HR 2 Backup (EMP008) approves Step 2 -> SUCCEEDS!
      const hr2Approve = await processLeaveAction(
        'EMP008',
        leaveId,
        'approve',
        'HR2 สำรองอนุมัติขั้นที่ 2 ให้ HR1 เรียบร้อยค่ะ'
      );
      expect(hr2Approve.success).toBe(true);
      expect(hr2Approve.leave?.status).toBe('approved');
      expect(hr2Approve.leave?.hrApproval?.approvedByName).toContain('พิมพ์ชนก');
    });

    it('isolates employee leave routing strictly to their own department manager', async () => {
      // 1. IT Employee (EMP003, Department 'IT & Digital') submits leave request
      const itLeaveRes = await createLeaveRequest('EMP003', {
        leaveType: 'sick',
        durationType: 'full',
        startDate: '2026-12-21',
        endDate: '2026-12-21',
        reason: 'ปวดศีรษะมีไข้',
      });
      expect(itLeaveRes.success).toBe(true);
      const itLeave = itLeaveRes.leave!;
      expect(itLeave.status).toBe('pending_manager');
      expect(itLeave.department).toBe('IT & Digital');

      // 2. Sales Employee (EMP006, Department 'Sales & Marketing') submits leave request
      const salesLeaveRes = await createLeaveRequest('EMP006', {
        leaveType: 'personal',
        durationType: 'full',
        startDate: '2026-12-22',
        endDate: '2026-12-22',
        reason: 'ติดต่อธุระธนาคาร',
      });
      expect(salesLeaveRes.success).toBe(true);
      const salesLeave = salesLeaveRes.leave!;
      expect(salesLeave.status).toBe('pending_manager');
      expect(salesLeave.department).toBe('Sales & Marketing');

      // 3. IT Manager (EMP002) view:
      // - Must see IT employee leave (EMP003)
      // - Must NOT see Sales employee leave (EMP006)
      const itManagerData = await getSystemDataForUser('EMP002', 2026);
      expect(itManagerData.leaves.some((l) => l.id === itLeave.id)).toBe(true);
      expect(itManagerData.leaves.some((l) => l.id === salesLeave.id)).toBe(false);

      // IT Manager permission on IT leave -> allowed
      const itMgrOnItLeave = checkApprovalPermission(itLeave, itManagerData.currentUser);
      expect(itMgrOnItLeave.allowed).toBe(true);
      expect(itMgrOnItLeave.step).toBe('manager');

      // IT Manager permission on Sales leave -> blocked
      const itMgrOnSalesLeave = checkApprovalPermission(salesLeave, itManagerData.currentUser);
      expect(itMgrOnSalesLeave.allowed).toBe(false);
      expect(itMgrOnSalesLeave.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // IT Manager attempting to approve Sales leave -> MUST FAIL
      const itMgrApproveSales = await processLeaveAction(
        'EMP002',
        salesLeave.id,
        'approve',
        'IT manager พยายามอนุมัติให้ Sales'
      );
      expect(itMgrApproveSales.success).toBe(false);
      expect(itMgrApproveSales.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // IT Manager attempting to reject Sales leave -> MUST FAIL
      const itMgrRejectSales = await processLeaveAction(
        'EMP002',
        salesLeave.id,
        'reject',
        'IT manager พยายามปฏิเสธให้ Sales'
      );
      expect(itMgrRejectSales.success).toBe(false);
      expect(itMgrRejectSales.error).toContain('คุณไม่มีสิทธิ์ปฏิเสธใบลานี้');

      // 4. Sales Manager (EMP005) view:
      // - Must see Sales employee leave (EMP006)
      // - Must NOT see IT employee leave (EMP003)
      const salesManagerData = await getSystemDataForUser('EMP005', 2026);
      expect(salesManagerData.leaves.some((l) => l.id === salesLeave.id)).toBe(true);
      expect(salesManagerData.leaves.some((l) => l.id === itLeave.id)).toBe(false);

      // Sales Manager permission on Sales leave -> allowed
      const salesMgrOnSalesLeave = checkApprovalPermission(salesLeave, salesManagerData.currentUser);
      expect(salesMgrOnSalesLeave.allowed).toBe(true);
      expect(salesMgrOnSalesLeave.step).toBe('manager');

      // Sales Manager permission on IT leave -> blocked
      const salesMgrOnItLeave = checkApprovalPermission(itLeave, salesManagerData.currentUser);
      expect(salesMgrOnItLeave.allowed).toBe(false);
      expect(salesMgrOnItLeave.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // Sales Manager attempting to approve IT leave -> MUST FAIL
      const salesMgrApproveIt = await processLeaveAction(
        'EMP005',
        itLeave.id,
        'approve',
        'Sales manager พยายามอนุมัติให้ IT'
      );
      expect(salesMgrApproveIt.success).toBe(false);
      expect(salesMgrApproveIt.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // Sales Manager attempting to reject IT leave -> MUST FAIL
      const salesMgrRejectIt = await processLeaveAction(
        'EMP005',
        itLeave.id,
        'reject',
        'Sales manager พยายามปฏิเสธให้ IT'
      );
      expect(salesMgrRejectIt.success).toBe(false);
      expect(salesMgrRejectIt.error).toContain('คุณไม่มีสิทธิ์ปฏิเสธใบลานี้');

      // 5. Correct Managers approve their own department employees
      const itApproveRes = await processLeaveAction(
        'EMP002',
        itLeave.id,
        'approve',
        'หัวหน้า IT อนุมัติให้ลูกทีม IT ครับ'
      );
      expect(itApproveRes.success).toBe(true);
      expect(itApproveRes.leave?.status).toBe('pending_hr');
      expect(itApproveRes.leave?.managerApproval?.approvedByName).toContain('กิตติพงศ์');

      const salesApproveRes = await processLeaveAction(
        'EMP005',
        salesLeave.id,
        'approve',
        'หัวหน้า Sales อนุมัติให้ลูกทีม Sales ครับ'
      );
      expect(salesApproveRes.success).toBe(true);
      expect(salesApproveRes.leave?.status).toBe('pending_hr');
      expect(salesApproveRes.leave?.managerApproval?.approvedByName).toContain('วรพล');
    });

    it('filterLeavesForViewer strictly isolates leaves for managers to their own department', () => {
      const mockLeaves = [
        {
          id: 'LV-IT-01',
          userId: 'EMP003',
          userName: 'สมชาย',
          department: 'IT & Digital',
          leaveType: 'sick' as const,
          durationType: 'full' as const,
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          totalDays: 1,
          reason: 'ป่วย',
          status: 'pending_manager' as const,
          createdAt: '2026-11-20T00:00:00.000Z',
        },
        {
          id: 'LV-SALES-01',
          userId: 'EMP006',
          userName: 'ณัฐพงศ์',
          department: 'Sales & Marketing',
          leaveType: 'sick' as const,
          durationType: 'full' as const,
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          totalDays: 1,
          reason: 'ป่วย',
          status: 'pending_manager' as const,
          createdAt: '2026-11-20T00:00:00.000Z',
        },
      ];

      const itManager = {
        id: 'EMP002',
        name: 'กิตติพงศ์',
        englishName: 'Kittipong',
        email: 'it.mgr@company.com',
        role: 'manager' as const,
        department: 'IT & Digital',
        position: 'Engineering Manager',
        startDate: '2021-01-01',
        quotas: STANDARD_LEAVE_QUOTAS,
      };

      const salesManager = {
        id: 'EMP005',
        name: 'วรพล',
        englishName: 'Worapon',
        email: 'sales.mgr@company.com',
        role: 'manager' as const,
        department: 'Sales & Marketing',
        position: 'Sales Director',
        startDate: '2021-01-01',
        quotas: STANDARD_LEAVE_QUOTAS,
      };

      const itFiltered = filterLeavesForViewer(mockLeaves, itManager);
      expect(itFiltered.length).toBe(1);
      expect(itFiltered[0].id).toBe('LV-IT-01');

      const salesFiltered = filterLeavesForViewer(mockLeaves, salesManager);
      expect(salesFiltered.length).toBe(1);
      expect(salesFiltered[0].id).toBe('LV-SALES-01');
    });

    it('strictly prevents HR and C-Level from approving/rejecting employee leave at pending_manager (Step 1)', async () => {
      // 1. IT Employee creates leave -> pending_manager
      const leaveRes = await createLeaveRequest('EMP003', {
        leaveType: 'sick',
        durationType: 'full',
        startDate: '2026-12-28',
        endDate: '2026-12-28',
        reason: 'ป่วยเป็นไข้หวัดใหญ่',
      });
      expect(leaveRes.success).toBe(true);
      const leave = leaveRes.leave!;
      expect(leave.status).toBe('pending_manager');

      // 2. HR (EMP001) cannot approve or reject at step 1
      const hrApproveAttempt = await processLeaveAction(
        'EMP001',
        leave.id,
        'approve',
        'HR พยายามอนุมัติแทนหัวหน้า IT'
      );
      expect(hrApproveAttempt.success).toBe(false);
      expect(hrApproveAttempt.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      const hrRejectAttempt = await processLeaveAction(
        'EMP001',
        leave.id,
        'reject',
        'HR พยายามปฏิเสธแทนหัวหน้า IT'
      );
      expect(hrRejectAttempt.success).toBe(false);
      expect(hrRejectAttempt.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // 3. C-Level (EMP009) cannot approve or reject at step 1
      const cLevelApproveAttempt = await processLeaveAction(
        'EMP009',
        leave.id,
        'approve',
        'C-Level พยายามอนุมัติแทนหัวหน้า IT'
      );
      expect(cLevelApproveAttempt.success).toBe(false);
      expect(cLevelApproveAttempt.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      const cLevelRejectAttempt = await processLeaveAction(
        'EMP009',
        leave.id,
        'reject',
        'C-Level พยายามปฏิเสธแทนหัวหน้า IT'
      );
      expect(cLevelRejectAttempt.success).toBe(false);
      expect(cLevelRejectAttempt.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');

      // 4. Check action queue isolation:
      // - IT Manager has this leave in their actionable queue
      const itManagerData = await getSystemDataForUser('EMP002', 2026);
      const itManagerActionable = itManagerData.leaves.filter(
        (l) => checkApprovalPermission(l, itManagerData.currentUser).allowed
      );
      expect(itManagerActionable.some((l) => l.id === leave.id)).toBe(true);

      // - HR does NOT have this leave in their actionable queue at Step 1
      const hrData = await getSystemDataForUser('EMP001', 2026);
      const hrActionableStep1 = hrData.leaves.filter(
        (l) => checkApprovalPermission(l, hrData.currentUser).allowed
      );
      expect(hrActionableStep1.some((l) => l.id === leave.id)).toBe(false);

      // - C-Level does NOT have this leave in their actionable queue at Step 1
      const cLevelData = await getSystemDataForUser('EMP009', 2026);
      const cLevelActionableStep1 = cLevelData.leaves.filter(
        (l) => checkApprovalPermission(l, cLevelData.currentUser).allowed
      );
      expect(cLevelActionableStep1.some((l) => l.id === leave.id)).toBe(false);

      // 5. IT Manager approves -> status becomes pending_hr
      const mgrApprove = await processLeaveAction(
        'EMP002',
        leave.id,
        'approve',
        'หัวหน้า IT อนุมัติผ่านไปยัง HR'
      );
      expect(mgrApprove.success).toBe(true);
      expect(mgrApprove.leave?.status).toBe('pending_hr');

      // 6. Now HR can see it in actionable queue (Step 2)
      const hrDataAfterStep1 = await getSystemDataForUser('EMP001', 2026);
      const hrActionableStep2 = hrDataAfterStep1.leaves.filter(
        (l) => checkApprovalPermission(l, hrDataAfterStep1.currentUser).allowed
      );
      expect(hrActionableStep2.some((l) => l.id === leave.id)).toBe(true);

      // 7. IT Manager no longer has it in actionable queue (Step 1 is done)
      const itMgrDataAfter = await getSystemDataForUser('EMP002', 2026);
      const itMgrActionableAfter = itMgrDataAfter.leaves.filter(
        (l) => checkApprovalPermission(l, itMgrDataAfter.currentUser).allowed
      );
      expect(itMgrActionableAfter.some((l) => l.id === leave.id)).toBe(false);

      // 8. HR approves in Step 2 -> status becomes approved
      const hrApprove = await processLeaveAction(
        'EMP001',
        leave.id,
        'approve',
        'HR ตัดโควต้าเรียบร้อย'
      );
      expect(hrApprove.success).toBe(true);
      expect(hrApprove.leave?.status).toBe('approved');
    });
  });

  describe('4. 119-Day Probation Enforcement & 6 Leave Types (WFH / WFA / Offsite)', () => {
    it('blocks probation employee (< 119 days) from Vacation, WFH, and WFA, but allows Sick and Offsite', async () => {
      // EMP007 started on 2026-10-01 (<119 days on 2026-11-09)
      const probInfo = getProbationInfo('2026-10-01', '2026-11-09');
      expect(probInfo.passed).toBe(false);
      expect(probInfo.probationDaysRequired).toBe(119);
      expect(probInfo.daysWorked).toBe(39);
      expect(probInfo.daysRemaining).toBe(80);
      expect(
        checkProbationLeaveEligibility('2026-10-01', 'vacation', '2026-11-09')
          .allowed
      ).toBe(false);
      expect(
        checkProbationLeaveEligibility('2026-10-01', 'wfh', '2026-11-09')
          .allowed
      ).toBe(false);
      expect(
        checkProbationLeaveEligibility('2026-10-01', 'wfa', '2026-11-09')
          .allowed
      ).toBe(false);
      expect(
        checkProbationLeaveEligibility('2026-10-01', 'sick', '2026-11-09')
          .allowed
      ).toBe(true);
      expect(
        checkProbationLeaveEligibility('2026-10-01', 'offsite', '2026-11-09')
          .allowed
      ).toBe(true);

      // Service-level check: EMP007 requesting Vacation on 2026-11-12 must fail due to probation
      const vacAttempt = await createLeaveRequest('EMP007', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-11-12',
        endDate: '2026-11-12',
        reason: 'ขอลาพักร้อนช่วงทดลองงาน',
      });
      expect(vacAttempt.success).toBe(false);
      expect(vacAttempt.error).toContain('ทดลองงาน');

      // WFH is check-in only (not a leave request) and also blocked during probation on check-in
      const wfhLeaveAttempt = await createLeaveRequest('EMP007', {
        leaveType: 'wfh',
        durationType: 'full',
        startDate: '2026-11-12',
        endDate: '2026-11-12',
        reason: 'ขอ WFH ช่วงทดลองงาน',
      });
      expect(wfhLeaveAttempt.success).toBe(false);
      expect(wfhLeaveAttempt.error).toContain('Check-in');

      const wfhCheckInProbAttempt = await recordCheckIn('EMP007', {
        workLocation: 'wfh',
        meetLink: 'https://meet.google.com/abc-defg-hij',
        date: '2026-11-12',
      });
      expect(wfhCheckInProbAttempt.success).toBe(false);
      expect(wfhCheckInProbAttempt.error).toContain('ทดลองงาน');

      // EMP007 requesting Offsite (ไปหาลูกค้า) with locationDetail on 2026-11-12 must SUCCEED
      const offsiteSuccess = await createLeaveRequest('EMP007', {
        leaveType: 'offsite',
        durationType: 'full',
        startDate: '2026-11-12',
        endDate: '2026-11-12',
        locationDetail: 'ออกบูธงาน Tech Expo ที่ไบเทคบางนา',
        reason: 'ไปช่วยทีม Sales ออกบูธ',
      });
      expect(offsiteSuccess.success).toBe(true);
      expect(offsiteSuccess.leave?.locationDetail).toContain('ไบเทคบางนา');
    });

    it('handles exact boundary transition between 118 days (restricted) and 119 days (passed probation)', () => {
      // Start date: 2026-01-01
      // Exactly 118 days worked -> 2026-04-29
      const day118 = getProbationInfo('2026-01-01', '2026-04-29');
      expect(day118.daysWorked).toBe(118);
      expect(day118.passed).toBe(false);
      expect(day118.daysRemaining).toBe(1);
      expect(
        checkProbationLeaveEligibility('2026-01-01', 'vacation', '2026-04-29')
          .allowed
      ).toBe(false);
      expect(
        checkProbationLeaveEligibility('2026-01-01', 'wfh', '2026-04-29').allowed
      ).toBe(false);

      // Exactly 119 days worked -> 2026-04-30
      const day119 = getProbationInfo('2026-01-01', '2026-04-30');
      expect(day119.daysWorked).toBe(119);
      expect(day119.passed).toBe(true);
      expect(day119.daysRemaining).toBe(0);
      expect(
        checkProbationLeaveEligibility('2026-01-01', 'vacation', '2026-04-30')
          .allowed
      ).toBe(true);
      expect(
        checkProbationLeaveEligibility('2026-01-01', 'wfh', '2026-04-30').allowed
      ).toBe(true);
    });

    it('requires locationDetail when requesting offsite work and treats offsite quota as unlimited', async () => {
      const missingLoc = await createLeaveRequest('EMP003', {
        leaveType: 'offsite',
        durationType: 'full',
        startDate: '2026-12-11',
        endDate: '2026-12-11',
        reason: 'ไปประชุมกับลูกค้า',
      });
      expect(missingLoc.success).toBe(false);
      expect(missingLoc.error).toContain('ระบุสถานที่');

      const withLoc = await createLeaveRequest('EMP003', {
        leaveType: 'offsite',
        durationType: 'full',
        startDate: '2026-12-11',
        endDate: '2026-12-11',
        locationDetail: 'บริษัท ABC จำกัด (อาคารสาทรสแควร์)',
        reason: 'ไปประชุมเก็บ Requirement ลูกค้า',
      });
      expect(withLoc.success).toBe(true);

      const sysData = await getSystemDataForUser('EMP003', 2026);
      expect(sysData.myQuota.quotas.offsite.isUnlimited).toBe(true);
    });
  });

  describe('5. PDPA Check-in / Check-out & Office Dashboard', () => {
    it('records Check-in and Check-out without GPS/Photo, blocks WFH during probation, and exports Attendance CSV', async () => {
      // Probation employee EMP007 tries to check-in as WFH on 2026-11-11 -> blocked
      const probWfhCheckIn = await recordCheckIn('EMP007', {
        workLocation: 'wfh',
        note: 'ขอ WFH',
        date: '2026-11-11',
        checkInTime: '08:50',
      });
      expect(probWfhCheckIn.success).toBe(false);
      expect(probWfhCheckIn.error).toContain('ทดลองงาน');

      // EMP007 checks in at Office -> succeeds
      const officeCheckIn = await recordCheckIn('EMP007', {
        workLocation: 'office',
        note: 'นั่งทำงานโซนบัญชี',
        date: '2026-11-11',
        checkInTime: '08:52',
      });
      expect(officeCheckIn.success).toBe(true);
      expect(officeCheckIn.record?.workLocation).toBe('office');
      expect(officeCheckIn.record?.checkInTime).toBe('08:52');

      // EMP007 checks out -> succeeds
      const officeCheckOut = await recordCheckOut('EMP007', {
        note: 'กลับบ้านเรียบร้อย',
        date: '2026-11-11',
        checkOutTime: '18:05',
      });
      expect(officeCheckOut.success).toBe(true);
      expect(officeCheckOut.record?.checkOutTime).toBe('18:05');

      // Test API routes POST & PATCH /api/attendance (with signed session cookie)
      const emp004Cookie = cookieHeaderFor({
        id: 'EMP004',
        email: 'praew.it@company.co.th',
      });
      const postReq = new NextRequest('http://localhost:3000/api/attendance', {
        method: 'POST',
        headers: { cookie: emp004Cookie },
        body: JSON.stringify({
          workLocation: 'office',
          note: 'เข้าออฟฟิศชั้น 12',
          date: '2026-11-16',
          checkInTime: '08:45',
        }),
      });
      const postRes = await attendancePost(postReq);
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.record.checkInTime).toBe('08:45');
      expect(postData.record.date).toBe('2026-11-16');

      const patchReq = new NextRequest('http://localhost:3000/api/attendance', {
        method: 'PATCH',
        headers: { cookie: emp004Cookie },
        body: JSON.stringify({
          date: '2026-11-16',
          checkOutTime: '17:30',
          note: 'เลิกงานแล้วค่ะ',
        }),
      });
      const patchRes = await attendancePatch(patchReq);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.record.checkOutTime).toBe('17:30');

      // Verify automatic Thailand (Asia/Bangkok) time stamping when client does not supply explicit time
      const bkkNow = getBangkokNow();
      expect(bkkNow.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(bkkNow.timeStr).toMatch(/^\d{2}:\d{2}$/);
      expect(bkkNow.year).toBeGreaterThanOrEqual(2026);

      const autoCheckIn = await recordCheckIn('EMP005', {
        workLocation: 'office',
      });
      expect(autoCheckIn.success).toBe(true);
      expect(autoCheckIn.record?.checkInTime).toBe(bkkNow.timeStr);
      expect(autoCheckIn.record?.date).toBe(bkkNow.dateStr);

      const autoCheckOut = await recordCheckOut('EMP005');
      expect(autoCheckOut.success).toBe(true);
      expect(autoCheckOut.record?.checkOutTime).toBe(bkkNow.timeStr);

      const sysData = await getSystemDataForUser('EMP001', 2026);
      const attCsv = generateAttendanceCsv(sysData.attendance);
      expect(attCsv.startsWith('\uFEFF')).toBe(true);
      expect(attCsv).toContain('รหัสลงเวลา,วันที่,รหัสพนักงาน');
    });
  });

  describe('6. PDPA Data Minimization & Google Login Authentication', () => {
    it('supports Google Login (email + englishName sync) and ensures NO phone, NO password, and NO googleCalendarId in Sheet headers', async () => {
      // Verify strict PDPA headers
      expect(USER_SHEET_HEADERS).not.toContain('phone');
      expect(USER_SHEET_HEADERS).not.toContain('password');
      expect(USER_SHEET_HEADERS).not.toContain('googleCalendarId');
      expect(USER_SHEET_HEADERS).toContain('englishName');
      expect(USER_SHEET_HEADERS).toContain('email');
      expect(USER_SHEET_HEADERS).toContain('startDate');

      expect(ATTENDANCE_SHEET_HEADERS).not.toContain('gps');
      expect(ATTENDANCE_SHEET_HEADERS).not.toContain('photoUrl');

      // Google Login via authenticateUser
      const googleAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'somchai.it@company.co.th',
        googleEnglishName: 'Somchai Jaidee (Google Verified)',
        googlePicture: 'https://lh3.googleusercontent.com/a/somchai-photo',
      });
      expect(googleAuth.success).toBe(true);
      expect(googleAuth.user?.id).toBe('EMP003');
      expect(googleAuth.user?.englishName).toBe(
        'Somchai Jaidee (Google Verified)'
      );
      expect(googleAuth.user?.avatarUrl).toBe(
        'https://lh3.googleusercontent.com/a/somchai-photo'
      );
    });

    it('round-trips User, LeaveRequest, Holiday, and Attendance through Google Sheets row mappers', async () => {
      const hrData = await getSystemDataForUser('EMP001', 2026);

      const sampleUser = {
        ...INITIAL_USERS[0],
        avatarUrl: 'https://lh3.googleusercontent.com/a/test-avatar',
      };
      const mappedUser = rowToUser(userToRow(sampleUser).map(String));
      expect(mappedUser.id).toBe(sampleUser.id);
      expect(mappedUser.englishName).toBe(sampleUser.englishName);
      expect(mappedUser.startDate).toBe(sampleUser.startDate);
      expect(mappedUser.avatarUrl).toBe(sampleUser.avatarUrl);

      const appSheetUser = appSheetRowToUser(userToAppSheetRow(sampleUser));
      expect(appSheetUser.avatarUrl).toBe(sampleUser.avatarUrl);

      const storageContent = fs.readFileSync(
        path.resolve(__dirname, '../storage.ts'),
        'utf-8'
      );
      // Verify open-ended ranges including column O (avatarUrl) without 500/1000/5000 row caps
      expect(storageContent).toContain("'Users!A1:O'");
      expect(storageContent).toContain("'LeaveRequests!A1:V'");
      expect(storageContent).toContain("'Attendance!A1:I'");
      expect(storageContent).not.toContain('A2:O1000');
      expect(storageContent).not.toContain('A2:V5000');
      expect(storageContent).not.toContain('A2:I5000');

      const sampleLeave = hrData.leaves[0];
      const mappedLeave = rowToLeave(leaveToRow(sampleLeave).map(String));
      expect(mappedLeave.id).toBe(sampleLeave.id);
      expect(mappedLeave.totalDays).toBe(sampleLeave.totalDays);

      const sampleHoliday = hrData.holidays[0];
      const mappedHoliday = rowToHoliday(holidayToRow(sampleHoliday));
      expect(mappedHoliday).toEqual(sampleHoliday);

      const sampleAtt = hrData.attendance[0];
      const mappedAtt = rowToAttendance(attendanceToRow(sampleAtt));
      expect(mappedAtt).toEqual(sampleAtt);
    });
  });

  describe('7. Next.js API Route Handlers & Edge Cases', () => {
    it('handles POST /api/auth (verified Google OAuth Login + session cookie), GET /api/system, and POST /api/employees', async () => {
      const originalFetch = globalThis.fetch;
      try {
        // Mock Google tokeninfo verification for somchai.it@company.co.th
        const expectedAud = getEffectiveGoogleClientId();
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'somchai.it@company.co.th',
              name: 'Somchai Jaidee',
              email_verified: 'true',
              ...(expectedAud ? { aud: expectedAud } : {}),
            }),
            { status: 200 }
          )) as typeof fetch;

        const loginReq = new NextRequest('http://localhost:3000/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            googleIdToken: 'mock-valid-google-id-token',
          }),
        });
        const loginRes = await authPost(loginReq);
        expect(loginRes.status).toBe(200);
        const loginJson = await loginRes.json();
        expect(loginJson.user.id).toBe('EMP003');

        // Verify signed HttpOnly session cookie is issued
        const setCookie = loginRes.headers.get('set-cookie') || '';
        expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
        const sessionCookiePair = setCookie.split(';')[0];

        const sysReq = new NextRequest(
          'http://localhost:3000/api/system?year=2026',
          { headers: { cookie: sessionCookiePair } }
        );
        const sysRes = await systemGet(sysReq);
        expect(sysRes.status).toBe(200);
        const sysJson = await sysRes.json();
        expect(sysJson.currentUser.id).toBe('EMP003');
      } finally {
        globalThis.fetch = originalFetch;
      }

      const hrCookie = cookieHeaderFor({
        id: 'EMP001',
        email: 'siriporn.hr@company.co.th',
      });
      const empReq = new NextRequest('http://localhost:3000/api/employees', {
        method: 'POST',
        headers: { cookie: hrCookie },
        body: JSON.stringify({
          employee: {
            username: 'newdev',
            name: 'ธนกร พัฒนาดี',
            englishName: 'Thanakorn Pattanadee',
            email: 'thanakorn.dev@dbc.co.th',
            role: 'employee',
            department: 'IT & Digital',
            position: 'Backend Developer',
            startDate: '2025-05-01',
            quotas: {
              sick: 30,
              personal: 7,
              vacation: 10,
              wfh: 50,
              wfa: 15,
            },
          },
        }),
      });
      const empRes = await employeesPost(empReq);
      expect(empRes.status).toBe(200);
      const empJson = await empRes.json();
      expect(empJson.user.id).toBe('EMP010');
      expect(empJson.user.englishName).toBe('Thanakorn Pattanadee');
      expect(empJson.user.quotas.sick).toBe(30);
      expect(empJson.user.quotas.personal).toBe(3);
      expect(empJson.user.quotas.vacation).toBe(6);
    });

    it('enforces organization-wide standard fixed quotas: Sick 30, Personal 3, Vacation 6, Unlimited WFH/WFA/Offsite', async () => {
      const data = await getSystemDataForUser('EMP003', 2026);
      expect(data.myQuota.quotas.sick.totalQuota).toBe(30);
      expect(data.myQuota.quotas.personal.totalQuota).toBe(3);
      expect(data.myQuota.quotas.vacation.totalQuota).toBe(6);
      expect(data.myQuota.quotas.wfh.isUnlimited).toBe(true);
      expect(data.myQuota.quotas.wfa.isUnlimited).toBe(true);
      expect(data.myQuota.quotas.offsite.isUnlimited).toBe(true);
    });

    it('calculateUserQuotaSummary strictly enforces standard fixed quotas even if a legacy user object has non-standard quotas', () => {
      const legacyUser = {
        id: 'EMP999',
        name: 'นาย เก่าเก็บ',
        englishName: 'Kao Kep',
        email: 'kao@company.co.th',
        role: 'employee' as const,
        department: 'IT',
        position: 'Dev',
        startDate: '2023-01-01',
        quotas: {
          sick: 50,
          personal: 6,
          vacation: 15,
          wfh: 100,
          wfa: 50,
          offsite: 30,
        },
      };

      const summary = calculateUserQuotaSummary(legacyUser, [], 2026);
      expect(summary.quotas.sick.totalQuota).toBe(30);
      expect(summary.quotas.personal.totalQuota).toBe(3);
      expect(summary.quotas.vacation.totalQuota).toBe(6);
      expect(summary.quotas.wfh.totalQuota).toBe(0);
      expect(summary.quotas.wfh.isUnlimited).toBe(true);
      expect(summary.quotas.wfa.totalQuota).toBe(0);
      expect(summary.quotas.wfa.isUnlimited).toBe(true);
      expect(summary.quotas.offsite.totalQuota).toBe(0);
      expect(summary.quotas.offsite.isUnlimited).toBe(true);
    });

    it('guards leaveToRow against exceeding Google Sheets 50,000-character cell limit and prevents self-rejection', async () => {
      const hrData = await getSystemDataForUser('EMP001', 2026);
      const hugeAttachmentLeave = {
        ...hrData.leaves[0],
        attachmentUrl: 'data:image/jpeg;base64,' + 'A'.repeat(60000),
      };
      const row = leaveToRow(hugeAttachmentLeave);
      // attachmentUrl is at column index 12 in LEAVE_SHEET_HEADERS
      expect(LEAVE_SHEET_HEADERS[12]).toBe('attachmentUrl');
      expect(String(row[12]).length).toBeLessThanOrEqual(MAX_SHEET_CELL_LENGTH);

      // Manager submitting their own leave cannot reject their own leave
      const mgrLeave = await createLeaveRequest('EMP002', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-21',
        endDate: '2026-12-21',
        reason: 'หัวหน้าลาพักร้อน',
      });
      expect(mgrLeave.success).toBe(true);
      const mgrData = await getSystemDataForUser('EMP002', 2026);
      const selfRejectPerm = checkRejectionPermission(
        mgrLeave.leave!,
        mgrData.currentUser
      );
      expect(selfRejectPerm.allowed).toBe(false);
    });

    it('splits cross-year leave requests accurately across 2026 and 2027 quotas and recalculates on holiday changes', async () => {
      const before2026 = await getSystemDataForUser('EMP003', 2026);
      const initialUsed2026 = before2026.myQuota.quotas.vacation.usedDays;

      const crossLeave = await createLeaveRequest('EMP003', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-30',
        endDate: '2027-01-04',
        reason: 'ลาพักร้อนข้ามปี',
      });
      expect(crossLeave.success).toBe(true);
      expect(crossLeave.leave?.totalDays).toBe(3);

      await processLeaveAction('EMP002', crossLeave.leave!.id, 'approve');
      await processLeaveAction('EMP001', crossLeave.leave!.id, 'approve');

      const after2026 = await getSystemDataForUser('EMP003', 2026);
      const after2027 = await getSystemDataForUser('EMP003', 2027);
      expect(after2026.myQuota.quotas.vacation.usedDays).toBe(
        initialUsed2026 + 1
      );
      expect(after2027.myQuota.quotas.vacation.usedDays).toBe(2);

      // Holiday recalculation check
      const addedHol = await upsertHoliday('EMP001', {
        date: '2027-01-04',
        name: 'วันหยุดชดเชยปีใหม่',
      });
      expect(addedHol.success).toBe(true);
      const afterHol = await getSystemDataForUser('EMP003', 2027);
      expect(afterHol.myQuota.quotas.vacation.usedDays).toBe(1);

      const delHol = await deleteHoliday('EMP001', addedHol.holiday!.id);
      expect(delHol.success).toBe(true);
    });
  });

  describe('8. Real Google OAuth Onboarding, Self Role/Probation Switcher & AppSheet Bridge', () => {
    it('enforces Whitelist Policy: rejects unknown Google login, blocks public self-onboarding, and allows login once HR/C-Level adds employee', async () => {
      // 1. Unknown Google email is rejected with unregisteredEmail and cannot self-onboard
      const unknownGoogleAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'newmember.google@dbc.co.th',
        googleEnglishName: 'Newmember Google',
      });
      expect(unknownGoogleAuth.success).toBe(false);
      expect(unknownGoogleAuth.unregisteredEmail).toBe(
        'newmember.google@dbc.co.th'
      );
      expect(unknownGoogleAuth.error).toContain('ไม่พบบัญชีอีเมล');

      // 2. Direct attempt to self-onboard via POST /api/auth is blocked with 403 Forbidden
      const unauthorizedOnboardReq = new NextRequest(
        'http://localhost:3000/api/auth',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'onboard_google_user',
            id: 'EMP010',
            name: 'นวพล คนขยัน',
            englishName: 'Nawaphon Konkhayan',
            email: 'newmember.google@dbc.co.th',
          }),
        }
      );
      const unauthorizedRes = await authPost(unauthorizedOnboardReq);
      expect(unauthorizedRes.status).toBe(403);

      // 3. Unauthorized non-HR/non-C-Level employee (EMP003) cannot add employees
      const employeeAttempt = await upsertEmployee('EMP003', {
        name: 'พนักงาน นอกระบบ',
        englishName: 'Hacker',
        email: 'hacker@company.co.th',
        role: 'employee',
        department: 'IT & Digital',
        position: 'Tester',
        startDate: '2025-01-15',
        quotas: { sick: 30, personal: 6, vacation: 6 },
      });
      expect(employeeAttempt.success).toBe(false);
      expect(employeeAttempt.error).toContain('เฉพาะฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level)');

      // 4. Authorized HR (EMP001) or C-Level adds the employee (supporting external domain emails too)
      const hrAddEmployeeRes = await upsertEmployee('EMP001', {
        id: 'EMP010',
        name: 'นวพล คนขยัน',
        englishName: 'Nawaphon Konkhayan',
        email: 'newmember.google@dbc.co.th',
        role: 'employee',
        department: 'IT & Digital',
        position: 'Full Stack Developer',
        startDate: '2025-01-15',
        quotas: { sick: 30, personal: 6, vacation: 6, wfh: 50, wfa: 20 },
      });
      expect(hrAddEmployeeRes.success).toBe(true);
      expect(hrAddEmployeeRes.user?.id).toBe('EMP010');
      expect(hrAddEmployeeRes.user?.email).toBe('newmember.google@dbc.co.th');

      // 5. Subsequent Google login with the added email succeeds and syncs verified English name
      const secondAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'newmember.google@dbc.co.th',
        googleEnglishName: 'Nawaphon K. (Verified)',
      });
      expect(secondAuth.success).toBe(true);
      expect(secondAuth.user?.id).toBe('EMP010');
      expect(secondAuth.user?.englishName).toBe('Nawaphon K. (Verified)');
    });

    it('forbids self role escalation via POST /api/auth (action: update_self_role) and updateOwnTestingProfile', async () => {
      const switchReq = new NextRequest('http://localhost:3000/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update_self_role',
          userId: 'EMP003',
          role: 'c_level',
          startDate: '2026-10-25',
        }),
      });
      const switchRes = await authPost(switchReq);
      expect(switchRes.status).toBe(403);

      const directRes = await updateOwnTestingProfile('EMP003', {
        role: 'c_level',
        startDate: '2026-10-25',
      });
      expect(directRes.success).toBe(false);

      // Verify EMP003 role remains unchanged as 'employee'
      const empData = await getSystemDataForUser('EMP003', 2026);
      expect(empData.currentUser.role).toBe('employee');
    });

    it('restricts POST /api/system (save_config) to Admin only, hides secrets in GET ?action=config, and maps AppSheet REST API rows cleanly', async () => {
      const originalConfig = getRuntimeAppConfig();
      try {
        // Unauthenticated save_config is rejected (401)
        const unauthReq = new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_config',
            googleClientId: 'attacker-client-id',
          }),
        });
        const unauthRes = await systemPost(unauthReq);
        expect(unauthRes.status).toBe(401);

        // Register Admin user in test store so Admin session can update config
        const adminRes = await upsertEmployee('EMP001', {
          id: 'EMP011',
          name: 'รุจน์ วัชรประดิษฐ์',
          englishName: 'Rut Watcharapadit',
          email: 'rut.wa@digitalbusinessconsult.asia',
          role: 'admin',
          department: 'Management (Admin)',
          position: 'System Administrator',
          startDate: '2023-01-01',
        });
        expect(adminRes.success).toBe(true);
        const adminCookie = cookieHeaderFor({
          id: 'EMP011',
          email: 'rut.wa@digitalbusinessconsult.asia',
        });

        const saveCfgReq = new NextRequest('http://localhost:3000/api/system', {
          method: 'POST',
          headers: { cookie: adminCookie },
          body: JSON.stringify({
            action: 'save_config',
            googleClientId: '123456789-test.apps.googleusercontent.com',
            appsheetAppId: 'app-id-test-123',
            appsheetAccessKey: 'V2-access-key-xyz',
            googleChatWebhookUrl: 'https://chat.googleapis.com/v1/spaces/SECRET/messages?key=k&token=t',
          }),
        });
        const saveCfgRes = await systemPost(saveCfgReq);
        expect(saveCfgRes.status).toBe(200);
        const saveCfgJson = await saveCfgRes.json();
        expect(saveCfgJson.googleClientId).toBe(
          '123456789-test.apps.googleusercontent.com'
        );
        expect(saveCfgJson.appsheetConfigured).toBe(true);
        expect(saveCfgJson.googleChatWebhookUrl).toBeUndefined();

        // Public GET ?action=config returns only googleClientId & storageMode (never webhook URL or secrets)
        const getPublicCfgReq = new NextRequest(
          'http://localhost:3000/api/system?action=config'
        );
        const getPublicCfgRes = await systemGet(getPublicCfgReq);
        expect(getPublicCfgRes.status).toBe(200);
        const getPublicCfgJson = await getPublicCfgRes.json();
        expect(getPublicCfgJson.googleClientId).toBe(
          '123456789-test.apps.googleusercontent.com'
        );
        expect(getPublicCfgJson.googleChatWebhookUrl).toBeUndefined();
        expect(getPublicCfgJson.googleSheetId).toBeUndefined();

        // Admin GET ?action=config includes boolean status flags without exposing secrets
        const getAdminCfgReq = new NextRequest(
          'http://localhost:3000/api/system?action=config',
          { headers: { cookie: adminCookie } }
        );
        const getAdminCfgRes = await systemGet(getAdminCfgReq);
        expect(getAdminCfgRes.status).toBe(200);
        const getAdminCfgJson = await getAdminCfgRes.json();
        expect(getAdminCfgJson.appsheetConfigured).toBe(true);
        expect(getAdminCfgJson.googleChatConfigured).toBe(true);
        expect(getAdminCfgJson.googleChatWebhookUrl).toBeUndefined();
      } finally {
        saveRuntimeAppConfig({
          googleClientId: originalConfig.googleClientId || '',
          appsheetAppId: originalConfig.appsheetAppId || '',
          appsheetAccessKey: originalConfig.appsheetAccessKey || '',
          googleChatWebhookUrl: originalConfig.googleChatWebhookUrl || '',
        });
      }

      // Verify AppSheet row mappers match PDPA headers
      const userObj = userToAppSheetRow(INITIAL_USERS[0]);
      expect(userObj.id).toBe('EMP001');
      expect(userObj.email).toBe('siriporn.hr@company.co.th');
      expect('phone' in userObj).toBe(false);
      expect('password' in userObj).toBe(false);

      const leaveObj = leaveToAppSheetRow(INITIAL_LEAVE_REQUESTS[0]);
      expect(leaveObj.id).toBe('LV-2026-001');
      expect(leaveObj.leaveType).toBe('vacation');

      const attObj = attendanceToAppSheetRow(INITIAL_ATTENDANCE[0]);
      expect(attObj.userId).toBe('EMP001');
      expect('gps' in attObj).toBe(false);

      const holObj = holidayToAppSheetRow(INITIAL_HOLIDAYS[0]);
      expect(holObj.id).toBe('HOL-01');
    });

    it('verifies Google OAuth id_token audience (aud), email_verified flag, and access_token userinfo', async () => {
      const originalConfig = getRuntimeAppConfig();
      const originalFetch = globalThis.fetch;
      try {
        saveRuntimeAppConfig({
          googleClientId: 'expected-client-id.apps.googleusercontent.com',
        });

        // 1. Reject id_token with mismatched audience (aud)
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'attacker@dbc.co.th',
              name: 'Attacker User',
              aud: 'wrong-client-id.apps.googleusercontent.com',
              email_verified: 'true',
            }),
            { status: 200 }
          )) as typeof fetch;

        const wrongAudRes = await verifyGoogleOAuthCredentials({
          googleIdToken: 'mock-id-token-wrong-aud',
        });
        expect(wrongAudRes.success).toBe(false);
        expect(wrongAudRes.error).toContain('Audience Mismatch');

        // 2. Reject id_token with unverified email
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'unverified@dbc.co.th',
              name: 'Unverified User',
              aud: 'expected-client-id.apps.googleusercontent.com',
              email_verified: 'false',
            }),
            { status: 200 }
          )) as typeof fetch;

        const unverifiedRes = await verifyGoogleOAuthCredentials({
          googleIdToken: 'mock-id-token-unverified',
        });
        expect(unverifiedRes.success).toBe(false);
        expect(unverifiedRes.error).toContain('ยังไม่ได้รับการยืนยัน');

        // 3. Accept valid id_token with matching aud and verified email
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'Valid.User@DBC.co.th',
              name: 'Valid Google User',
              aud: 'expected-client-id.apps.googleusercontent.com',
              email_verified: 'true',
            }),
            { status: 200 }
          )) as typeof fetch;

        const validIdRes = await verifyGoogleOAuthCredentials({
          googleIdToken: 'mock-id-token-valid',
        });
        expect(validIdRes.success).toBe(true);
        expect(validIdRes.profile?.email).toBe('valid.user@dbc.co.th');
        expect(validIdRes.profile?.englishName).toBe('Valid Google User');

        // 4. Accept valid access_token from Google OAuth 2.0 popup (tokeninfo aud + userinfo)
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/tokeninfo')) {
            return new Response(
              JSON.stringify({
                aud: 'expected-client-id.apps.googleusercontent.com',
                azp: 'expected-client-id.apps.googleusercontent.com',
                email: 'popup.user@dbc.co.th',
                email_verified: 'true',
              }),
              { status: 200 }
            );
          }
          return new Response(
            JSON.stringify({
              email: 'popup.user@dbc.co.th',
              name: 'Popup OAuth User',
              email_verified: true,
            }),
            { status: 200 }
          );
        }) as typeof fetch;

        const validAccessRes = await verifyGoogleOAuthCredentials({
          googleAccessToken: 'mock-access-token',
        });
        expect(validAccessRes.success).toBe(true);
        expect(validAccessRes.profile?.email).toBe('popup.user@dbc.co.th');
        expect(validAccessRes.profile?.englishName).toBe('Popup OAuth User');
      } finally {
        globalThis.fetch = originalFetch;
        saveRuntimeAppConfig({
          googleClientId: originalConfig.googleClientId || '',
          appsheetAppId: originalConfig.appsheetAppId || '',
          appsheetAccessKey: originalConfig.appsheetAccessKey || '',
        });
      }
    });

    it('invokes AppSheet REST API v2 in parallel and automatically retries Add as Edit when shared Google Sheet row already exists', async () => {
      const originalConfig = getRuntimeAppConfig();
      const originalFetch = globalThis.fetch;
      const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
      try {
        saveRuntimeAppConfig({
          appsheetAppId: 'appsheet-app-999',
          appsheetAccessKey: 'appsheet-secret-key',
        });

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const parsedBody = JSON.parse(String(init?.body || '{}'));
          calls.push({
            url: String(input),
            headers: (init?.headers || {}) as Record<string, string>,
            body: parsedBody,
          });
          // Simulate HTTP 409 key conflict on 'Add' (since row was already written to shared Google Sheet), then 200 on 'Edit' fallback
          if (parsedBody.Action === 'Add') {
            return new Response('Row key already exists in sheet', { status: 409 });
          }
          return new Response(JSON.stringify({ Rows: parsedBody.Rows }), {
            status: 200,
          });
        }) as typeof fetch;

        await syncToAppSheetTable(
          'LeaveRequests',
          'Add',
          [leaveToAppSheetRow(INITIAL_LEAVE_REQUESTS[0])],
          'siriporn.hr@company.co.th'
        );

        expect(calls.length).toBe(2);
        expect(calls[0].url).toBe(
          'https://api.appsheet.com/api/v2/apps/appsheet-app-999/tables/LeaveRequests/Action'
        );
        expect(calls[0].headers.ApplicationAccessKey).toBe('appsheet-secret-key');
        expect(calls[0].body.Action).toBe('Add');
        expect(
          (calls[0].body.Properties as Record<string, string>).RunAsUserEmail
        ).toBe('siriporn.hr@company.co.th');
        expect(calls[1].body.Action).toBe('Edit');
      } finally {
        globalThis.fetch = originalFetch;
        saveRuntimeAppConfig({
          googleClientId: originalConfig.googleClientId || '',
          appsheetAppId: originalConfig.appsheetAppId || '',
          appsheetAccessKey: originalConfig.appsheetAccessKey || '',
        });
      }
    });

    it('prevents duplicate Google Login emails in upsertEmployee, preserves onboarded Google user across resetDemoData, and propagates self department switches', async () => {
      // 1. Reject duplicate email in upsertEmployee
      const dupEmailEmp = await upsertEmployee('EMP001', {
        id: 'EMP099',
        name: 'พนักงาน อีเมลซ้ำ',
        englishName: 'Duplicate Email',
        email: 'SOMCHAI.IT@COMPANY.CO.TH', // already owned by EMP003
        role: 'employee',
        department: 'IT & Digital',
        position: 'Tester',
        startDate: '2025-01-10',
        quotas: { sick: 30, personal: 6, vacation: 6, wfh: 100, wfa: 50 },
      });
      expect(dupEmailEmp.success).toBe(false);
      expect(dupEmailEmp.error).toContain('ถูกผูกกับพนักงานรหัส EMP003');

      // 2. Register an onboarded Google user EMP010, then resetDemoData preserving EMP010
      const onboarded = await registerGoogleUser({
        id: 'EMP010',
        name: 'กานดา ทดสอบจริง',
        englishName: 'Kanda RealGoogle',
        email: 'kanda.real@dbc.co.th',
        role: 'hr',
        department: 'IT & Digital',
        position: 'HR Tech Lead',
        startDate: '2024-05-01',
      });
      expect(onboarded.success).toBe(true);

      const checkInRes = await recordCheckIn('EMP010', {
        workLocation: 'office',
        note: 'เข้าออฟฟิศ',
      });
      expect(checkInRes.success).toBe(true);

      // Switch department via HR upsertEmployee and verify attendance department updates too
      const switchedDept = await upsertEmployee('EMP001', {
        id: 'EMP010',
        department: 'Sales & Marketing',
      });
      expect(switchedDept.success).toBe(true);
      expect(switchedDept.user?.department).toBe('Sales & Marketing');

      const sysBeforeReset = await getSystemDataForUser('EMP010');
      const emp010Att = sysBeforeReset.attendance.find(
        (a) => a.userId === 'EMP010'
      );
      expect(emp010Att?.department).toBe('Sales & Marketing');

      // Reset demo data while preserving EMP010
      await resetDemoData('EMP010');
      const sysAfterReset = await getSystemDataForUser('EMP010');
      expect(sysAfterReset.currentUser.id).toBe('EMP010');
      expect(sysAfterReset.currentUser.email).toBe('kanda.real@dbc.co.th');
    });

    it('enforces PROD_USERS clean setup: only EMP011 as admin, no mockup users', () => {
      expect(PROD_USERS).toHaveLength(1);
      expect(PROD_USERS[0].id).toBe('EMP011');
      expect(PROD_USERS[0].email).toBe('rut.wa@digitalbusinessconsult.asia');
      expect(PROD_USERS[0].role).toBe('admin');
      expect(PROD_USERS[0].position).toBe('System Administrator (Admin)');
    });

    it('strictly forbids employee role from approving or rejecting any leave request', async () => {
      // Create a pending leave request from EMP004
      const createRes = await createLeaveRequest('EMP004', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        reason: 'ขอลาพักผ่อน',
      });
      expect(createRes.success).toBe(true);
      const leaveId = createRes.leave!.id;

      // EMP003 (employee) attempts to approve EMP004's leave -> MUST FAIL
      const empApprove = await processLeaveAction('EMP003', leaveId, 'approve');
      expect(empApprove.success).toBe(false);
      expect(empApprove.error).toBeDefined();

      // EMP003 (employee) attempts to reject EMP004's leave -> MUST FAIL
      const empReject = await processLeaveAction('EMP003', leaveId, 'reject');
      expect(empReject.success).toBe(false);
      expect(empReject.error).toBeDefined();

      // But EMP004 (owner employee) can cancel their own pending request
      const empCancel = await processLeaveAction('EMP004', leaveId, 'cancel');
      expect(empCancel.success).toBe(true);
      expect(empCancel.leave?.status).toBe('cancelled');
    });

    it('ensures dashboard and allQuotas access is restricted by role in getSystemDataForUser', async () => {
      // 1. Employee: only sees their own quota in allQuotas
      const empData = await getSystemDataForUser('EMP003');
      expect(empData.allQuotas).toHaveLength(1);
      expect(empData.allQuotas[0].user.id).toBe('EMP003');

      // 2. Manager: only sees quotas for their own department
      const mgrData = await getSystemDataForUser('EMP002');
      expect(mgrData.allQuotas.every((q) => q.user.department === 'IT & Digital')).toBe(true);

      // 3. HR / C-Level: sees full quotas for all company employees
      const hrData = await getSystemDataForUser('EMP001');
      expect(hrData.allQuotas.length).toBeGreaterThan(1);
    });

    it('allows C-Level and HR to add employees with external domain emails (@pdpathailand.co.th, @gmail.com) and permits login only after addition', async () => {
      // 1. Employee with external domain (@pdpathailand.co.th) tries to login before being added -> REJECTED
      const preAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'somchai.pdpa@pdpathailand.co.th',
      });
      expect(preAuth.success).toBe(false);
      expect(preAuth.unregisteredEmail).toBe('somchai.pdpa@pdpathailand.co.th');

      // 2. C-Level (EMP009 in test / EMP011 in prod) adds this external employee
      const addRes = await upsertEmployee('EMP009', {
        id: 'EMP015',
        name: 'สมชาย รักความปลอดภัย',
        englishName: 'Somchai Security',
        email: 'somchai.pdpa@pdpathailand.co.th',
        role: 'employee',
        department: 'Operations',
        position: 'DPO Consultant',
        startDate: '2025-02-01',
        quotas: { sick: 30, personal: 6, vacation: 8, wfh: 50, wfa: 20 },
      });
      expect(addRes.success).toBe(true);
      expect(addRes.user?.id).toBe('EMP015');

      // 3. Now Somchai can log in with Google OAuth using his external email
      const postAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'somchai.pdpa@pdpathailand.co.th',
        googleEnglishName: 'Somchai (Google)',
      });
      expect(postAuth.success).toBe(true);
      expect(postAuth.user?.id).toBe('EMP015');
      expect(postAuth.user?.email).toBe('somchai.pdpa@pdpathailand.co.th');
      expect(postAuth.user?.name).toBe('สมชาย รักความปลอดภัย');

      // 4. Also supports personal Gmail accounts (e.g. outsourced or freelance) added by HR
      const addGmailRes = await upsertEmployee('EMP001', {
        id: 'EMP016',
        name: 'วิภาวี อิสระ',
        englishName: 'Wipawi Freelance',
        email: 'wipawi.freelance@gmail.com',
        role: 'employee',
        department: 'IT & Digital',
        position: 'Contract Developer',
        startDate: '2025-03-01',
        quotas: { sick: 30, personal: 6, vacation: 6, wfh: 100, wfa: 50 },
      });
      expect(addGmailRes.success).toBe(true);

      const gmailAuth = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'wipawi.freelance@gmail.com',
      });
      expect(gmailAuth.success).toBe(true);
      expect(gmailAuth.user?.id).toBe('EMP016');
    });

    it('enforces exclusive Admin role for rut.wa@digitalbusinessconsult.asia with universal access', async () => {
      // 1. Trying to assign admin to another employee fails
      const invalidAdmin = await upsertEmployee('EMP001', {
        id: 'EMP017',
        name: 'คนอื่น อยากเป็นแอดมิน',
        englishName: 'Fake Admin',
        email: 'fake.admin@company.co.th',
        role: 'admin',
        department: 'IT',
        position: 'Admin',
        startDate: '2025-01-01',
        quotas: { sick: 30, personal: 6, vacation: 6, wfh: 50, wfa: 20 },
      });
      expect(invalidAdmin.success).toBe(false);
      expect(invalidAdmin.error).toContain('สงวนสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด');

      // 2. Creating Rut with admin succeeds
      const rutRes = await upsertEmployee('EMP001', {
        id: 'EMP011',
        name: 'รุจน์ วัชรประดิษฐ์',
        englishName: 'Rut (Rut) Watcharapadit',
        email: 'rut.wa@digitalbusinessconsult.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'System Administrator (Admin)',
        startDate: '2023-01-01',
        quotas: { sick: 30, personal: 6, vacation: 10, wfh: 50, wfa: 20 },
      });
      expect(rutRes.success).toBe(true);
      expect(rutRes.user?.role).toBe('admin');

      // 3. Trying to delete Rut fails
      const deleteRut = await deleteEmployee('EMP001', 'EMP011');
      expect(deleteRut.success).toBe(false);
      expect(deleteRut.error).toContain('ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด');

      // 4. Admin has access to all system data
      const rutSystem = await getSystemDataForUser('EMP011', 2026);
      expect(rutSystem.currentUser.role).toBe('admin');
      expect(rutSystem.allQuotas.length).toBeGreaterThan(1);
    });

    it('creates employees cleanly via POST /api/employees for all 4 fixed COMPANY_DEPARTMENTS', async () => {
      const hrCookie = cookieHeaderFor({
        id: 'EMP001',
        email: 'siriporn.hr@company.co.th',
      });
      for (const [idx, dept] of COMPANY_DEPARTMENTS.entries()) {
        const empId = `EMP09${idx}`;
        const req = new NextRequest('http://localhost:3000/api/employees', {
          method: 'POST',
          headers: { cookie: hrCookie },
          body: JSON.stringify({
            employee: {
              id: empId,
              name: `พนักงาน ${dept}`,
              englishName: `Staff ${idx}`,
              email: `staff.${idx}@digitalbusinessconsult.asia`,
              role: 'employee',
              department: dept,
              position: 'Staff',
              startDate: '2025-01-15',
            },
          }),
        });
        const res = await employeesPost(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.user.id).toBe(empId);
        expect(json.user.department).toBe(dept);
      }

      const hrView = await getSystemDataForUser('EMP001', 2026);
      for (const dept of COMPANY_DEPARTMENTS) {
        expect(hrView.users.some((u) => u.department === dept)).toBe(true);
      }
    });

    it('allows adding C-Level with only email (no department, no startDate, no englishName) and auto-syncs englishName on Google login', async () => {
      // 1. Add C-Level with ONLY email + role
      const cLevelRes = await upsertEmployee('EMP001', {
        id: 'EMP081',
        email: 'new.exec@digitalbusinessconsult.asia',
        role: 'c_level',
      });
      expect(cLevelRes.success).toBe(true);
      expect(cLevelRes.user?.department).toBe('Executive (C-Level)');
      expect(cLevelRes.user?.startDate).toBe('');
      expect(cLevelRes.user?.englishName).toBe('');

      // 2. C-Level bypasses probation when requesting vacation immediately
      const cLevelLeave = await createLeaveRequest('EMP081', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-11-23',
        endDate: '2026-11-23',
        reason: 'ประชุมต่างประเทศ',
      });
      expect(cLevelLeave.success).toBe(true);

      // 3. Add regular employee with ONLY email + department + startDate (no englishName, no manual name/position)
      const regEmpRes = await upsertEmployee('EMP001', {
        id: 'EMP082',
        email: 'somying.ae@digitalbusinessconsult.asia',
        role: 'employee',
        department: 'AE',
        startDate: '2026-11-01',
      });
      expect(regEmpRes.success).toBe(true);
      expect(regEmpRes.user?.englishName).toBe('');
      expect(regEmpRes.user?.name).toBe('somying.ae');
      expect(regEmpRes.user?.department).toBe('AE');
      expect(regEmpRes.user?.startDate).toBe('2026-11-01');

      // 4. Require startDate for non-C-Level new employees
      const missingStartRes = await upsertEmployee('EMP001', {
        id: 'EMP083',
        email: 'missing.date@digitalbusinessconsult.asia',
        role: 'employee',
        department: 'Consult',
      });
      expect(missingStartRes.success).toBe(false);
      expect(missingStartRes.error).toContain('วันเริ่มทำงาน');

      // 5. When employee logs in via Google, englishName and placeholder name auto-populate from Google profile
      const googleLogin = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'somying.ae@digitalbusinessconsult.asia',
        googleEnglishName: 'Somying Rattanakorn',
      });
      expect(googleLogin.success).toBe(true);
      expect(googleLogin.user?.englishName).toBe('Somying Rattanakorn');
      expect(googleLogin.user?.name).toBe('Somying Rattanakorn');
    });

    it('supports multiple Super Admins with root account protection, self-promotion hierarchy, and deletion safeguards', async () => {
      // 0. Ensure root Super Admin (Rut) exists
      const seedRut = await upsertEmployee('EMP001', {
        id: 'EMP011',
        name: 'รุจน์ วัชรประดิษฐ์',
        englishName: 'Rut (Rut) Watcharapadit',
        email: 'rut.wa@digitalbusinessconsult.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'System Administrator (Admin)',
        startDate: '2023-01-01',
      });
      expect(seedRut.success).toBe(true);

      // 1. Root Super Admin (Rut) adds a second Super Admin
      const secondAdminRes = await upsertEmployee('EMP011', {
        id: 'EMP020',
        name: 'แอดมินคนที่สอง',
        englishName: 'Second Super Admin',
        email: 'second.admin@digitalbusinessconsult.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'Co-Administrator',
        startDate: '2024-01-01',
      });
      expect(secondAdminRes.success).toBe(true);
      expect(secondAdminRes.user?.role).toBe('admin');

      // 2. The second Super Admin can promote a third employee to Super Admin
      const thirdAdminRes = await upsertEmployee('EMP020', {
        id: 'EMP021',
        name: 'แอดมินคนที่สาม',
        englishName: 'Third Super Admin',
        email: 'third.admin@digitalbusinessconsult.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'Assistant Admin',
        startDate: '2024-06-01',
      });
      expect(thirdAdminRes.success).toBe(true);
      expect(thirdAdminRes.user?.role).toBe('admin');

      // 3. Attempting to demote root Super Admin (rut.wa@digitalbusinessconsult.asia) is blocked
      const demoteRoot = await upsertEmployee('EMP020', {
        id: 'EMP011',
        email: 'rut.wa@digitalbusinessconsult.asia',
        role: 'employee',
      });
      expect(demoteRoot.success).toBe(false);
      expect(demoteRoot.error).toContain('ไม่สามารถเปลี่ยนตำแหน่งหรือลดสิทธิ์ของผู้ดูแลระบบสูงสุดได้');

      // 4. Attempting to delete root Super Admin is blocked
      const deleteRoot = await deleteEmployee('EMP020', 'EMP011');
      expect(deleteRoot.success).toBe(false);
      expect(deleteRoot.error).toContain('ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด');

      // 5. Non-admin (HR) attempting to delete a Super Admin is blocked
      const hrDeleteAdmin = await deleteEmployee('EMP001', 'EMP020');
      expect(hrDeleteAdmin.success).toBe(false);
      expect(hrDeleteAdmin.error).toContain('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบบัญชีผู้ดูแลระบบได้');

      // 6. Non-admin (HR) attempting to demote or edit a Super Admin is blocked
      const hrDemoteAdmin = await upsertEmployee('EMP001', {
        id: 'EMP020',
        role: 'employee',
      });
      expect(hrDemoteAdmin.success).toBe(false);
      expect(hrDemoteAdmin.error).toContain('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขหรือเปลี่ยนแปลงสิทธิ์ของผู้ดูแลระบบได้');

      // 7. Deleting a non-root Super Admin by another admin succeeds
      const deleteThird = await deleteEmployee('EMP020', 'EMP021');
      expect(deleteThird.success).toBe(true);
    });

    it('enforces designated C-Level routing for Manager leave requests, permission checks, and viewer filtering', async () => {
      // Setup Root Admin (EMP011)
      await upsertEmployee('EMP001', {
        id: 'EMP011',
        name: 'รุจน์ วัชรประดิษฐ์',
        englishName: 'Rut (Rut) Watcharapadit',
        email: 'rut.wa@digitalbusinessconsult.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'System Administrator (Admin)',
        startDate: '2023-01-01',
      });

      // Setup C-Level 1 (EMP009) and C-Level 2 (EMP010)
      const cLevel2Res = await upsertEmployee('EMP001', {
        id: 'EMP010',
        name: 'ดร.สมเกียรติ วิสัยทัศน์กว้าง (C-Level 2)',
        englishName: 'Dr. Somkiat Wisaithatkwang',
        email: 'somkiat.coo@company.co.th',
        role: 'c_level',
      });
      expect(cLevel2Res.success).toBe(true);

      // Create Manager A with designated approver EMP009
      const mgrARes = await upsertEmployee('EMP001', {
        id: 'EMP030',
        name: 'ผู้จัดการ เอ',
        englishName: 'Manager A',
        email: 'manager.a@company.co.th',
        role: 'manager',
        department: 'Consult',
        position: 'Consulting Manager',
        startDate: '2022-01-01',
        cLevelApproverId: 'EMP009',
      });
      expect(mgrARes.success).toBe(true);
      expect(mgrARes.user?.cLevelApproverId).toBe('EMP009');

      // Update Manager A position WITHOUT passing role -> role and cLevelApproverId must be preserved
      const updateMgrPos = await upsertEmployee('EMP001', {
        id: 'EMP030',
        position: 'Senior Consulting Manager',
      });
      expect(updateMgrPos.success).toBe(true);
      expect(updateMgrPos.user?.role).toBe('manager');
      expect(updateMgrPos.user?.cLevelApproverId).toBe('EMP009');
      expect(updateMgrPos.user?.position).toBe('Senior Consulting Manager');

      // Create Manager B without designated approver (fallback)
      const mgrBRes = await upsertEmployee('EMP001', {
        id: 'EMP031',
        name: 'ผู้จัดการ บี',
        englishName: 'Manager B',
        email: 'manager.b@company.co.th',
        role: 'manager',
        department: 'AE',
        position: 'AE Manager',
        startDate: '2022-01-01',
      });
      expect(mgrBRes.success).toBe(true);
      expect(mgrBRes.user?.cLevelApproverId).toBeUndefined();

      // Manager A submits leave -> targetApproverId is automatically EMP009
      const leaveARes = await createLeaveRequest('EMP030', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-21',
        endDate: '2026-12-21',
        reason: 'พักผ่อนประจำปี',
      });
      expect(leaveARes.success).toBe(true);
      const leaveA = leaveARes.leave!;
      expect(leaveA.targetApproverId).toBe('EMP009');
      expect(leaveA.status).toBe('pending_c_level');

      // Manager B submits leave -> targetApproverId is undefined
      const leaveBRes = await createLeaveRequest('EMP031', {
        leaveType: 'vacation',
        durationType: 'full',
        startDate: '2026-12-22',
        endDate: '2026-12-22',
        reason: 'พักผ่อนประจำปี',
      });
      expect(leaveBRes.success).toBe(true);
      const leaveB = leaveBRes.leave!;
      expect(leaveB.targetApproverId).toBeUndefined();

      // Check approval permission on Leave A:
      // Designated C-Level (EMP009) -> Allowed
      const c1OnA = checkApprovalPermission(leaveA, (await getSystemDataForUser('EMP009', 2026)).currentUser);
      expect(c1OnA.allowed).toBe(true);
      expect(c1OnA.nextStatus).toBe('pending_hr');

      // Non-designated C-Level (EMP010) -> Disallowed
      const c2OnA = checkApprovalPermission(leaveA, (await getSystemDataForUser('EMP010', 2026)).currentUser);
      expect(c2OnA.allowed).toBe(false);
      expect(c2OnA.error).toContain('ผู้บริหารระดับสูงที่สังกัด');

      // Super Admin (EMP011) -> Allowed
      const adminOnA = checkApprovalPermission(leaveA, (await getSystemDataForUser('EMP011', 2026)).currentUser);
      expect(adminOnA.allowed).toBe(true);

      // Check rejection permission on Leave A:
      const c2RejectA = checkRejectionPermission(leaveA, (await getSystemDataForUser('EMP010', 2026)).currentUser);
      expect(c2RejectA.allowed).toBe(false);
      const c1RejectA = checkRejectionPermission(leaveA, (await getSystemDataForUser('EMP009', 2026)).currentUser);
      expect(c1RejectA.allowed).toBe(true);

      // Check fallback on Leave B (no targetApproverId): both C-Levels can approve
      const c1OnB = checkApprovalPermission(leaveB, (await getSystemDataForUser('EMP009', 2026)).currentUser);
      expect(c1OnB.allowed).toBe(true);
      const c2OnB = checkApprovalPermission(leaveB, (await getSystemDataForUser('EMP010', 2026)).currentUser);
      expect(c2OnB.allowed).toBe(true);

      // Check filterLeavesForViewer:
      const c1Viewer = (await getSystemDataForUser('EMP009', 2026)).currentUser;
      const c2Viewer = (await getSystemDataForUser('EMP010', 2026)).currentUser;
      const adminViewer = (await getSystemDataForUser('EMP011', 2026)).currentUser;

      const c1Visible = filterLeavesForViewer([leaveA, leaveB], c1Viewer);
      expect(c1Visible.some((l) => l.id === leaveA.id)).toBe(true);
      expect(c1Visible.some((l) => l.id === leaveB.id)).toBe(true);

      const c2Visible = filterLeavesForViewer([leaveA, leaveB], c2Viewer);
      expect(c2Visible.some((l) => l.id === leaveA.id)).toBe(false);
      expect(c2Visible.some((l) => l.id === leaveB.id)).toBe(true);

      const adminVisible = filterLeavesForViewer([leaveA, leaveB], adminViewer);
      expect(adminVisible.some((l) => l.id === leaveA.id)).toBe(true);
      expect(adminVisible.some((l) => l.id === leaveB.id)).toBe(true);
    });

    it('serializes and deserializes AppSheet rows with CLevelApproverId and TargetApproverId', () => {
      const sampleUser = {
        ...INITIAL_USERS[1], // manager
        cLevelApproverId: 'EMP009',
      };
      const userAppSheetObj = userToAppSheetRow(sampleUser);
      expect(userAppSheetObj.CLevelApproverId).toBe('EMP009');

      const deserializedUser = appSheetRowToUser(userAppSheetObj);
      expect(deserializedUser.id).toBe(sampleUser.id);
      expect(deserializedUser.cLevelApproverId).toBe('EMP009');

      const sampleLeave = {
        ...INITIAL_LEAVE_REQUESTS[0],
        targetApproverId: 'EMP009',
      };
      const leaveAppSheetObj = leaveToAppSheetRow(sampleLeave);
      expect(leaveAppSheetObj.TargetApproverId).toBe('EMP009');

      const deserializedLeave = appSheetRowToLeave(leaveAppSheetObj);
      expect(deserializedLeave.id).toBe(sampleLeave.id);
      expect(deserializedLeave.targetApproverId).toBe('EMP009');
    });

    it('allows C-Level to also act as Manager of a designated department (approving pending_manager Step 1 for their department only)', async () => {
      // 1. Create a C-Level who is also assigned as head of Consult department
      const consultCLevel = await upsertEmployee('EMP001', {
        id: 'EMP050',
        name: 'พัชรา ผู้บริหารฝ่าย Consult',
        email: 'patchara.exec@company.co.th',
        role: 'c_level',
        department: 'Consult',
      });
      expect(consultCLevel.success).toBe(true);
      expect(consultCLevel.user?.role).toBe('c_level');
      expect(consultCLevel.user?.department).toBe('Consult');

      // 2. Create an employee in Consult
      const consultEmp = await upsertEmployee('EMP001', {
        id: 'EMP051',
        name: 'สมชาย ที่ปรึกษา',
        email: 'somchai.consult@company.co.th',
        role: 'employee',
        department: 'Consult',
        startDate: '2025-01-01',
      });
      expect(consultEmp.success).toBe(true);

      // 3. Consult employee requests leave -> pending_manager
      const leaveRes = await createLeaveRequest('EMP051', {
        leaveType: 'sick',
        durationType: 'full',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        reason: 'ปวดศีรษะ พักผ่อนตามคำสั่งแพทย์',
      });
      expect(leaveRes.success).toBe(true);
      expect(leaveRes.leave?.status).toBe('pending_manager');

      // 4. Consult C-Level can approve Step 1 for their department
      const consultPerm = checkApprovalPermission(leaveRes.leave!, consultCLevel.user!);
      expect(consultPerm.allowed).toBe(true);
      expect(consultPerm.nextStatus).toBe('pending_hr');

      const approveRes = await processLeaveAction('EMP050', leaveRes.leave!.id, 'approve');
      expect(approveRes.success).toBe(true);
      expect(approveRes.leave?.status).toBe('pending_hr');

      // 5. Consult C-Level CANNOT approve Step 1 for IT & Digital employee (department isolation preserved)
      const itEmployeeLeave: LeaveRequest = {
        id: 'LV-TEST-IT-001',
        userId: 'EMP003',
        userName: 'อนุชา ไอที',
        requesterRole: 'employee',
        department: 'IT & Digital',
        leaveType: 'personal',
        durationType: 'full',
        startDate: '2026-11-25',
        endDate: '2026-11-25',
        totalDays: 1,
        reason: 'ติดต่อราชการ',
        status: 'pending_manager',
        createdAt: '2026-11-16T10:00:00Z',
      };
      const itPerm = checkApprovalPermission(itEmployeeLeave, consultCLevel.user!);
      expect(itPerm.allowed).toBe(false);
      expect(itPerm.error).toContain('เฉพาะหัวหน้าแผนกในสังกัดเท่านั้น');
    });

    it('sends Google Chat webhook notifications for leave requests (sick, personal, vacation, wfh, offsite) and skips WFA', async () => {
      expect(isNotifiableLeaveType('sick')).toBe(true);
      expect(isNotifiableLeaveType('personal')).toBe(true);
      expect(isNotifiableLeaveType('vacation')).toBe(true);
      expect(isNotifiableLeaveType('wfh')).toBe(true);
      expect(isNotifiableLeaveType('offsite')).toBe(true);
      expect(isNotifiableLeaveType('wfa')).toBe(false);
      // Ensure NO hardcoded webhook secret remains in source code
      expect(DEFAULT_GOOGLE_CHAT_WEBHOOK_URL).toBe('');

      const originalFetch = global.fetch;
      const calls: { url: string; body: string }[] = [];

      saveRuntimeAppConfig({
        googleChatWebhookUrl:
          'https://chat.googleapis.com/v1/spaces/TEST_SPACE/messages?key=test-key&token=test-token',
      });

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat.googleapis.com')) {
          calls.push({ url, body: String(init?.body || '') });
          return new Response(JSON.stringify({ name: 'spaces/AAQAxhyo86I/messages/1' }), {
            status: 200,
          });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        // 1. WFA request is disabled & MUST NOT trigger Google Chat notification
        const wfaRes = await createLeaveRequest('EMP003', {
          leaveType: 'wfa',
          durationType: 'full',
          startDate: '2026-12-01',
          endDate: '2026-12-01',
          reason: 'ทำงานต่างจังหวัด',
        });
        expect(wfaRes.success).toBe(false);
        expect(calls.length).toBe(0);

        // 2. WFH via Check-in (with Google Meet link) MUST trigger Google Chat notification
        const wfhCheckInRes = await recordCheckIn('EMP003', {
          date: '2026-12-02',
          checkInTime: '08:55',
          workLocation: 'wfh',
          meetLink: 'https://meet.google.com/abc-defg-hij',
          note: 'ทำงานที่บ้าน',
        });
        expect(wfhCheckInRes.success).toBe(true);
        expect(calls.length).toBe(1);
        expect(calls[0].body).toContain('Work From Home');
        expect(calls[0].body).toContain('https://meet.google.com/abc-defg-hij');

        // 3. Offsite (พบลูกค้า) MUST trigger Google Chat notification
        const offsiteRes = await createLeaveRequest('EMP003', {
          leaveType: 'offsite',
          durationType: 'full',
          startDate: '2026-12-03',
          endDate: '2026-12-03',
          locationDetail: 'บริษัท ลูกค้า ABC สาทร',
          reason: 'ประชุม Requirement ระบบใหม่',
        });
        expect(offsiteRes.success).toBe(true);
        expect(calls.length).toBe(2);
        expect(calls[1].body).toContain('นอกสถานที่');
        expect(calls[1].body).toContain('บริษัท ลูกค้า ABC สาทร');

        // 4. Sick leave request MUST trigger Google Chat notification
        const sickRes = await createLeaveRequest('EMP003', {
          leaveType: 'sick',
          durationType: 'full',
          startDate: '2026-12-04',
          endDate: '2026-12-04',
          reason: 'มีไข้สูง พบแพทย์',
        });
        expect(sickRes.success).toBe(true);
        expect(calls.length).toBe(3);
        expect(calls[2].body).toContain('ลาป่วย');
        expect(calls[2].body).toContain('สมชาย ใจดี');
      } finally {
        global.fetch = originalFetch;
        saveRuntimeAppConfig({ googleChatWebhookUrl: '', googleChatWebhookUrl2: '' });
      }
    });

    it('supports dual-domain corporate emails (@digitalbusinessconsult.asia <-> @dbcgroup.asia) and secondary emails for the same user', async () => {
      expect(COMPANY_EMAIL_DOMAINS).toEqual([
        'digitalbusinessconsult.asia',
        'dbcgroup.asia',
      ]);
      expect(SUPER_ADMIN_EMAIL).toBe('rut.wa@digitalbusinessconsult.asia');
      expect(SUPER_ADMIN_ALT_EMAIL).toBe('rut.wa@dbcgroup.asia');
      expect(SUPER_ADMIN_EMAILS).toContain('rut.wa@digitalbusinessconsult.asia');
      expect(SUPER_ADMIN_EMAILS).toContain('rut.wa@dbcgroup.asia');

      // 1. Domain alias resolution & equivalence checks
      expect(getCompanyAliasEmail('somying.ae@digitalbusinessconsult.asia')).toBe(
        'somying.ae@dbcgroup.asia'
      );
      expect(getCompanyAliasEmail('somying.ae@dbcgroup.asia')).toBe(
        'somying.ae@digitalbusinessconsult.asia'
      );
      expect(getCompanyAliasEmail('external@gmail.com')).toBeNull();
      expect(getCompanyAliasEmail('')).toBeNull();
      expect(getCompanyAliasEmail('   ')).toBeNull();
      expect(getCompanyAliasEmail('invalid-email')).toBeNull();
      expect(getCompanyAliasEmail('@dbcgroup.asia')).toBeNull();
      expect(getCompanyAliasEmail('user@')).toBeNull();
      expect(getCompanyAliasEmail('a@b@dbcgroup.asia')).toBeNull();

      expect(
        areEmailsEquivalent(
          'Rut.Wa@DigitalBusinessConsult.asia',
          'rut.wa@dbcgroup.asia'
        )
      ).toBe(true);
      expect(
        areEmailsEquivalent(
          'rut.wa@digitalbusinessconsult.asia',
          'other.wa@dbcgroup.asia'
        )
      ).toBe(false);
      expect(areEmailsEquivalent('', '')).toBe(false);
      expect(
        areEmailsEquivalent(
          'rut.wa@dbcgroup.asia',
          'rut.wa@fake-dbcgroup.asia'
        )
      ).toBe(false);
      expect(
        areEmailsEquivalent(
          'rut.wa@dbcgroup.asia',
          'rut.wa@sub.dbcgroup.asia'
        )
      ).toBe(false);

      // 2. Employee registered with @digitalbusinessconsult.asia can log in using @dbcgroup.asia
      const addPrimaryRes = await upsertEmployee('EMP001', {
        id: 'EMP060',
        email: 'nida.consult@digitalbusinessconsult.asia',
        role: 'employee',
        department: 'Consult',
        startDate: '2025-01-10',
      });
      expect(addPrimaryRes.success).toBe(true);
      expect(addPrimaryRes.user?.name).toBe('nida.consult');

      // Login via @dbcgroup.asia child email auto-matches EMP060 and syncs Google English Name & Avatar
      const loginViaChild = await loginWithGoogleProfile({
        email: 'Nida.Consult@dbcgroup.asia',
        englishName: 'Nida Rattana',
        picture: 'https://lh3.googleusercontent.com/a/nida-avatar',
      });
      expect(loginViaChild.success).toBe(true);
      expect(loginViaChild.user?.id).toBe('EMP060');
      expect(loginViaChild.user?.englishName).toBe('Nida Rattana');
      expect(loginViaChild.user?.name).toBe('Nida Rattana');
      expect(loginViaChild.user?.avatarUrl).toBe(
        'https://lh3.googleusercontent.com/a/nida-avatar'
      );

      // Login via POST /api/auth with verified Google OAuth token for @digitalbusinessconsult.asia matches EMP060
      const originalFetch = globalThis.fetch;
      try {
        const expectedAud = getEffectiveGoogleClientId();
        globalThis.fetch = (async () =>
          new Response(
            JSON.stringify({
              email: 'nida.consult@digitalbusinessconsult.asia',
              name: 'Nida Rattana',
              email_verified: 'true',
              ...(expectedAud ? { aud: expectedAud } : {}),
            }),
            { status: 200 }
          )) as typeof fetch;

        const apiAuthPrimaryReq = new NextRequest('http://localhost:3000/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            googleIdToken: 'mock-valid-nida-token',
          }),
        });
        const apiAuthPrimaryRes = await authPost(apiAuthPrimaryReq);
        expect(apiAuthPrimaryRes.status).toBe(200);
        const apiAuthPrimaryJson = await apiAuthPrimaryRes.json();
        expect(apiAuthPrimaryJson.user.id).toBe('EMP060');
      } finally {
        globalThis.fetch = originalFetch;
      }

      // 3. Employee registered with @dbcgroup.asia can log in using @digitalbusinessconsult.asia
      const addChildRes = await upsertEmployee('EMP001', {
        id: 'EMP061',
        name: 'ภาณุวัฒน์ การตลาด',
        email: 'panuwat.mkt@dbcgroup.asia',
        role: 'employee',
        department: 'Marketing&BD',
        startDate: '2025-02-01',
      });
      expect(addChildRes.success).toBe(true);

      const loginViaParent = await authenticateUser('', undefined, {
        isGoogleLogin: true,
        googleEmail: 'panuwat.mkt@digitalbusinessconsult.asia',
        googleEnglishName: 'Panuwat M.',
      });
      expect(loginViaParent.success).toBe(true);
      expect(loginViaParent.user?.id).toBe('EMP061');
      expect(loginViaParent.user?.englishName).toBe('Panuwat M.');

      // Hardcoded password '1234' login MUST be rejected
      const passLoginViaParent = await authenticateUser(
        'panuwat.mkt@digitalbusinessconsult.asia',
        '1234'
      );
      expect(passLoginViaParent.success).toBe(false);

      // 4. Duplicate prevention across @digitalbusinessconsult.asia and @dbcgroup.asia
      const crossDomainDup1 = await upsertEmployee('EMP001', {
        id: 'EMP062',
        name: 'คนซ้ำ โดเมนลูก',
        email: 'nida.consult@dbcgroup.asia',
        role: 'employee',
        department: 'Consult',
        startDate: '2025-03-01',
      });
      expect(crossDomainDup1.success).toBe(false);
      expect(crossDomainDup1.error).toContain('ถูกผูกกับพนักงานรหัส EMP060');

      const crossDomainDup2 = await upsertEmployee('EMP001', {
        id: 'EMP063',
        name: 'คนซ้ำ โดเมนหลัก',
        email: 'panuwat.mkt@digitalbusinessconsult.asia',
        role: 'employee',
        department: 'Marketing&BD',
        startDate: '2025-03-01',
      });
      expect(crossDomainDup2.success).toBe(false);
      expect(crossDomainDup2.error).toContain('ถูกผูกกับพนักงานรหัส EMP061');

      // Updating EMP060's own email from @digitalbusinessconsult.asia to @dbcgroup.asia is allowed
      const selfSwitchDomain = await upsertEmployee('EMP001', {
        id: 'EMP060',
        email: 'nida.consult@dbcgroup.asia',
      });
      expect(selfSwitchDomain.success).toBe(true);
      expect(selfSwitchDomain.user?.email).toBe('nida.consult@dbcgroup.asia');

      // 5. Explicit secondaryEmail support (even when local-parts differ) + Sheet/AppSheet round-trip
      const dualCustomRes = await upsertEmployee('EMP001', {
        id: 'EMP064',
        name: 'กมลชนก สองอีเมล',
        email: 'kamonchanok.wa@digitalbusinessconsult.asia',
        secondaryEmail: 'kamon.dbc@dbcgroup.asia',
        role: 'employee',
        department: 'AE',
        startDate: '2025-01-15',
      });
      expect(dualCustomRes.success).toBe(true);
      expect(dualCustomRes.user?.email).toBe(
        'kamonchanok.wa@digitalbusinessconsult.asia'
      );
      expect(dualCustomRes.user?.secondaryEmail).toBe('kamon.dbc@dbcgroup.asia');

      const allKamonEmails = getUserEmails(dualCustomRes.user);
      expect(allKamonEmails).toContain('kamonchanok.wa@digitalbusinessconsult.asia');
      expect(allKamonEmails).toContain('kamonchanok.wa@dbcgroup.asia');
      expect(allKamonEmails).toContain('kamon.dbc@dbcgroup.asia');
      expect(allKamonEmails).toContain('kamon.dbc@digitalbusinessconsult.asia');
      expect(getAdditionalUserEmails(dualCustomRes.user)).toContain(
        'kamonchanok.wa@dbcgroup.asia'
      );
      expect(getAdditionalUserEmails(dualCustomRes.user)).toContain(
        'kamon.dbc@dbcgroup.asia'
      );

      // Can log in with secondary email or its alias
      const loginSecondary = await loginWithGoogleProfile(
        'kamon.dbc@dbcgroup.asia',
        'Kamonchanok W.'
      );
      expect(loginSecondary.success).toBe(true);
      expect(loginSecondary.user?.id).toBe('EMP064');

      // Google Sheets & AppSheet mapper round-trip preserves secondaryEmail
      const sheetRow = userToRow(dualCustomRes.user!).map(String);
      const parsedFromSheet = rowToUser(sheetRow);
      expect(parsedFromSheet.email).toBe(
        'kamonchanok.wa@digitalbusinessconsult.asia'
      );
      expect(parsedFromSheet.secondaryEmail).toBe('kamon.dbc@dbcgroup.asia');
      expect(doesUserMatchEmail(parsedFromSheet, 'kamon.dbc@dbcgroup.asia')).toBe(
        true
      );

      const appSheetRow = userToAppSheetRow(dualCustomRes.user!);
      expect(appSheetRow.email).toBe('kamonchanok.wa@digitalbusinessconsult.asia');
      expect(appSheetRow.SecondaryEmail).toBe('kamon.dbc@dbcgroup.asia');
      const parsedFromAppSheet = appSheetRowToUser(appSheetRow);
      expect(parsedFromAppSheet.secondaryEmail).toBe('kamon.dbc@dbcgroup.asia');

      // 6. Clearing secondaryEmail via empty string (as when cleared in HrManagementView modal) removes it cleanly
      const clearedSecondaryRes = await upsertEmployee('EMP001', {
        id: 'EMP064',
        email: 'kamonchanok.wa@digitalbusinessconsult.asia',
        secondaryEmail: '',
      });
      expect(clearedSecondaryRes.success).toBe(true);
      expect(clearedSecondaryRes.user?.secondaryEmail).toBeUndefined();

      // 7. Rejects malformed email formats containing '@' (e.g. '@dbcgroup.asia', 'user@', 'a@b@dbcgroup.asia')
      expect(isValidEmailFormat('rut.wa@digitalbusinessconsult.asia')).toBe(true);
      expect(isValidEmailFormat('rut.wa@dbcgroup.asia')).toBe(true);
      expect(isValidEmailFormat('@dbcgroup.asia')).toBe(false);
      expect(isValidEmailFormat('user@')).toBe(false);
      expect(isValidEmailFormat('a@b@dbcgroup.asia')).toBe(false);
      expect(isValidEmailFormat('user@dbcgroup')).toBe(false);
      expect(isValidEmailFormat('user@.asia')).toBe(false);

      for (const badEmail of [
        '@dbcgroup.asia',
        'user@',
        'a@b@dbcgroup.asia',
        'user@dbcgroup',
        'user@.asia',
      ]) {
        const badUpsert = await upsertEmployee('EMP001', {
          id: 'EMP069',
          email: badEmail,
          role: 'employee',
          department: 'AE',
          startDate: '2025-01-15',
        });
        expect(badUpsert.success).toBe(false);
        expect(badUpsert.error).toContain('รูปแบบอีเมล Google ไม่ถูกต้อง');

        const badSecondaryUpsert = await upsertEmployee('EMP001', {
          id: 'EMP069',
          email: 'valid.user@digitalbusinessconsult.asia',
          secondaryEmail: badEmail,
          role: 'employee',
          department: 'AE',
          startDate: '2025-01-15',
        });
        expect(badSecondaryUpsert.success).toBe(false);
        expect(badSecondaryUpsert.error).toContain('รูปแบบอีเมล Google ไม่ถูกต้อง');
      }
    });

    it('recognizes Super Admin across both rut.wa@digitalbusinessconsult.asia and rut.wa@dbcgroup.asia', async () => {
      expect(isSuperAdminEmail('rut.wa@digitalbusinessconsult.asia')).toBe(true);
      expect(isSuperAdminEmail('rut.wa@dbcgroup.asia')).toBe(true);
      expect(isSuperAdminEmail('RUT.WA@DBCGROUP.ASIA')).toBe(true);
      expect(isSuperAdminEmail('someone.else@dbcgroup.asia')).toBe(false);

      // HR can seed/upsert Super Admin using child domain rut.wa@dbcgroup.asia
      const seedRutChild = await upsertEmployee('EMP001', {
        id: 'EMP011',
        name: 'รุจน์ วัชรประดิษฐ์',
        englishName: 'Rut (Rut) Watcharapadit',
        email: 'rut.wa@dbcgroup.asia',
        role: 'admin',
        department: 'Management (Admin)',
        position: 'System Administrator (Admin)',
        startDate: '2023-01-01',
      });
      expect(seedRutChild.success).toBe(true);
      expect(seedRutChild.user?.role).toBe('admin');
      expect(isSuperAdminUser(seedRutChild.user)).toBe(true);

      // Rut can log in using rut.wa@digitalbusinessconsult.asia even when stored as rut.wa@dbcgroup.asia
      const loginRutParent = await loginWithGoogleProfile({
        email: 'rut.wa@digitalbusinessconsult.asia',
        englishName: 'Rut (Rut) Watcharapadit',
      });
      expect(loginRutParent.success).toBe(true);
      expect(loginRutParent.user?.id).toBe('EMP011');
      expect(loginRutParent.user?.role).toBe('admin');

      // Rut can also log in using rut.wa@dbcgroup.asia
      const loginRutChild = await loginWithGoogleProfile({
        email: 'rut.wa@dbcgroup.asia',
        englishName: 'Rut (Rut) Watcharapadit',
      });
      expect(loginRutChild.success).toBe(true);
      expect(loginRutChild.user?.id).toBe('EMP011');

      // Root Super Admin with @dbcgroup.asia cannot be deleted or demoted
      const secondAdmin = await upsertEmployee('EMP011', {
        id: 'EMP070',
        name: 'แอดมินรอง',
        email: 'co.admin@dbcgroup.asia',
        role: 'admin',
      });
      expect(secondAdmin.success).toBe(true);

      const attemptDemoteRut = await upsertEmployee('EMP070', {
        id: 'EMP011',
        role: 'employee',
      });
      expect(attemptDemoteRut.success).toBe(false);
      expect(attemptDemoteRut.error).toContain(
        'ไม่สามารถเปลี่ยนตำแหน่งหรือลดสิทธิ์ของผู้ดูแลระบบสูงสุดได้'
      );

      const attemptDeleteRut = await deleteEmployee('EMP070', 'EMP011');
      expect(attemptDeleteRut.success).toBe(false);
      expect(attemptDeleteRut.error).toContain(
        'ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด'
      );

      // Another admin cannot hijack or strip root Super Admin's email to a non-Super-Admin email
      const attemptStripRutEmail = await upsertEmployee('EMP070', {
        id: 'EMP011',
        email: 'hijacked@company.co.th',
      });
      expect(attemptStripRutEmail.success).toBe(false);
      expect(attemptStripRutEmail.error).toContain(
        'ไม่สามารถเปลี่ยนอีเมลของผู้ดูแลระบบสูงสุด'
      );

      // Switching root Super Admin's email back and forth between @dbcgroup.asia and @digitalbusinessconsult.asia is allowed
      const switchRutToPrimary = await upsertEmployee('EMP011', {
        id: 'EMP011',
        email: 'rut.wa@digitalbusinessconsult.asia',
      });
      expect(switchRutToPrimary.success).toBe(true);
      expect(switchRutToPrimary.user?.email).toBe(
        'rut.wa@digitalbusinessconsult.asia'
      );
    });
  });
});

