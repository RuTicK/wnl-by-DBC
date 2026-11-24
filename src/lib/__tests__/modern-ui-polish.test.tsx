import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound from '@/app/not-found';
import ApprovalAndHistoryView from '@/components/ApprovalAndHistoryView';
import HrDashboardView from '@/components/HrDashboardView';
import LeaveCalendar from '@/components/LeaveCalendar';
import LeaveRequestModal from '@/components/LeaveRequestModal';
import LoginView from '@/components/LoginView';
import {
  calculateUserQuotaSummary,
  getBangkokNow,
  STANDARD_LEAVE_QUOTAS,
} from '@/lib/leave-utils';
import { LeaveRequest, SafeUser } from '@/lib/types';

describe('Modern Clean UI Redesign & Edge-Case Verification', () => {
  const today = getBangkokNow().dateStr;

  const probationEmployee: SafeUser = {
    id: 'EMP099',
    name: 'ธนา ทดลองงาน',
    englishName: 'Thana Probation',
    email: 'thana@dbcgroup.asia',
    role: 'employee',
    department: 'Consult',
    position: 'Junior Consultant',
    startDate: today,
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const veteranEmployee: SafeUser = {
    id: 'EMP050',
    name: 'พิมพ์ชนก มั่นคง',
    englishName: 'Pimchanok Mankong',
    email: 'pimchanok@digitalbusinessconsult.asia',
    role: 'employee',
    department: 'AE',
    position: 'Account Executive',
    startDate: '2022-01-10',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const hrUser: SafeUser = {
    id: 'EMP001',
    name: 'ศิริพร บริหารงาน',
    englishName: 'Siriporn Borihanngan',
    email: 'siriporn.hr@dbcgroup.asia',
    role: 'hr',
    department: 'สำนักงาน',
    position: 'HR Manager',
    startDate: '2021-01-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const cLevelUser: SafeUser = {
    id: 'EMP009',
    name: 'ดร.อนันต์ วิสัยทัศน์ไกล',
    englishName: 'Dr. Anan Wisaithatklai',
    email: 'anan.ceo@dbcgroup.asia',
    role: 'c_level',
    department: 'Executive (C-Level)',
    position: 'CEO',
    startDate: '2020-01-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  it('shows probation block status (never contradictory "พร้อมยื่นคำขอ") in LeaveRequestModal and avoids truncating WFH/WFA labels', () => {
    const probationQuota = calculateUserQuotaSummary(
      probationEmployee,
      [],
      2026,
      []
    );
    const probationHtml = renderToStaticMarkup(
      <LeaveRequestModal
        isOpen={true}
        onClose={() => {}}
        initialDate="2026-11-24"
        currentUser={probationEmployee}
        leaves={[]}
        holidays={[]}
        myQuota={probationQuota}
        onSubmitLeave={async () => ({ success: true })}
      />
    );

    expect(probationHtml).toContain('ติดเงื่อนไขทดลองงาน');
    expect(probationHtml).not.toContain('พร้อมยื่นคำขอ');
    // WFH & WFA labels should not be clipped by truncate on mobile cards
    expect(probationHtml).not.toContain(
      'leading-snug truncate">Work From Home'
    );
    expect(probationHtml).not.toContain(
      'leading-snug truncate">Work From Anywhere'
    );

    const veteranQuota = calculateUserQuotaSummary(
      veteranEmployee,
      [],
      2026,
      []
    );
    const veteranHtml = renderToStaticMarkup(
      <LeaveRequestModal
        isOpen={true}
        onClose={() => {}}
        initialDate="2026-11-24"
        currentUser={veteranEmployee}
        leaves={[]}
        holidays={[]}
        myQuota={veteranQuota}
        onSubmitLeave={async () => ({ success: true })}
      />
    );

    expect(veteranHtml).toContain('พร้อมยื่นคำขอ');
    expect(veteranHtml).not.toContain('ติดเงื่อนไขทดลองงาน');
  });

  it('renders accurate stepper states for cancelled, rejected, and C-Level leaves in ApprovalAndHistoryView', () => {
    const cancelledLeave: LeaveRequest = {
      id: 'LV-CANCEL-1',
      userId: veteranEmployee.id,
      userName: veteranEmployee.name,
      requesterRole: 'employee',
      department: veteranEmployee.department,
      leaveType: 'vacation',
      durationType: 'full',
      startDate: '2026-12-01',
      endDate: '2026-12-01',
      totalDays: 1,
      reason: 'เปลี่ยนแผนการเดินทาง',
      status: 'cancelled',
      createdAt: '2026-11-20T08:00:00.000Z',
    };

    const cancelledHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={veteranEmployee}
        leaves={[cancelledLeave]}
        onProcessLeaveAction={async () => ({ success: true })}
      />
    );
    expect(cancelledHtml).toContain('ผู้ยื่นคำขอได้ยกเลิกใบลาแล้ว');
    expect(cancelledHtml).toContain('คำขอถูกยกเลิกแล้ว');
    expect(cancelledHtml).not.toContain('รออนุมัติ');

    const rejectedLeave: LeaveRequest = {
      ...cancelledLeave,
      id: 'LV-REJECT-1',
      status: 'rejected',
      rejectedBy: {
        userId: 'EMP002',
        userName: 'หัวหน้าแผนก',
        role: 'manager',
        rejectedAt: '2026-11-21T09:00:00.000Z',
        reason: 'ติดช่วงส่งมอบงานสำคัญ',
      },
    };

    const rejectedHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={veteranEmployee}
        leaves={[rejectedLeave]}
        onProcessLeaveAction={async () => ({ success: true })}
      />
    );
    expect(rejectedHtml).toContain('คำขอไม่ได้รับการอนุมัติในขั้นที่ 1');
    expect(rejectedHtml).toContain('สิ้นสุดขั้น 1');
    expect(rejectedHtml).toContain('คำขอสิ้นสุดที่ขั้นที่ 1 (ไม่ถึงขั้นตอน HR)');
    expect(rejectedHtml).toContain('ติดช่วงส่งมอบงานสำคัญ');
    expect(rejectedHtml).not.toContain('รออนุมัติ');

    const cLevelRejectedByHr: LeaveRequest = {
      id: 'LV-CEO-REJECT-2',
      userId: cLevelUser.id,
      userName: cLevelUser.name,
      requesterRole: 'c_level',
      department: cLevelUser.department,
      leaveType: 'wfh',
      durationType: 'full',
      startDate: '2026-12-03',
      endDate: '2026-12-03',
      totalDays: 1,
      reason: 'ประชุมผู้ถือหุ้น',
      status: 'rejected',
      rejectedBy: {
        userId: hrUser.id,
        userName: hrUser.name,
        role: 'hr',
        rejectedAt: '2026-11-22T09:00:00.000Z',
        reason: 'ลงวันผิดเดือน',
      },
      createdAt: '2026-11-20T09:00:00.000Z',
    };

    const cLevelRejectedHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={{ ...cLevelUser, role: 'employee' }}
        leaves={[cLevelRejectedByHr]}
        onProcessLeaveAction={async () => ({ success: true })}
      />
    );
    expect(cLevelRejectedHtml).toContain('ข้ามขั้น 1');
    expect(cLevelRejectedHtml).toContain('คำขอไม่ได้รับการอนุมัติในขั้นที่ 2');
    expect(cLevelRejectedHtml).not.toContain('คำขอไม่ได้รับการอนุมัติในขั้นที่ 1');
    // Only Step 2 should carry the rose rejection card background, not Step 1
    expect((cLevelRejectedHtml.match(/bg-rose-50\/35/g) || []).length).toBe(1);

    const cLevelLeave: LeaveRequest = {
      id: 'LV-CEO-1',
      userId: cLevelUser.id,
      userName: cLevelUser.name,
      requesterRole: 'c_level',
      department: cLevelUser.department,
      leaveType: 'wfa',
      durationType: 'full',
      startDate: '2026-12-02',
      endDate: '2026-12-02',
      totalDays: 1,
      reason: 'ปฏิบัติงานที่สาขาเชียงใหม่',
      status: 'pending_hr',
      createdAt: '2026-11-20T09:00:00.000Z',
    };

    const cLevelHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={hrUser}
        leaves={[cLevelLeave]}
        onProcessLeaveAction={async () => ({ success: true })}
      />
    );
    expect(cLevelHtml).toContain('ข้ามขั้น 1');
    expect(cLevelHtml).toContain('ส่งตรงให้ฝ่ายบุคคล (HR) รับทราบ/บันทึกข้อมูล');
    expect(cLevelHtml).toContain('รอ HR อนุมัติ');
  });

  it('renders empty state row and scrollable monthly chart in HrDashboardView', () => {
    const html = renderToStaticMarkup(
      <HrDashboardView
        currentUser={hrUser}
        leaves={[]}
        holidays={[]}
        allQuotas={[]}
        year={2026}
        onNavigateToApprovals={() => {}}
      />
    );
    expect(html).toContain('ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา');
    expect(html).toContain('min-w-[440px]');
  });

  it('renders keyboard-accessible calendar day cells and scroll-margin inspector in LeaveCalendar', () => {
    const html = renderToStaticMarkup(
      <LeaveCalendar
        currentUser={veteranEmployee}
        leaves={[]}
        holidays={[]}
        onOpenRequestModal={() => {}}
      />
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('scroll-mt-28');
    expect(html).toContain('focus-visible:ring-[#0066FF]');
  });

  it('renders clean NotFound and LoginView pages and keeps CSS/header/modal stacking invariants sound', () => {
    const notFoundHtml = renderToStaticMarkup(<NotFound />);
    expect(notFoundHtml).toContain('Error 404');
    expect(notFoundHtml).toContain('ไม่พบหน้าที่ต้องการ');
    expect(notFoundHtml).toContain('กลับหน้าหลัก');

    const loginHtml = renderToStaticMarkup(
      <LoginView onLoginSuccess={() => {}} />
    );
    expect(loginHtml).toContain('เข้าสู่ระบบด้วย Google');
    expect(loginHtml).toContain('@digitalbusinessconsult.asia');
    expect(loginHtml).toContain('@dbcgroup.asia');

    const pageSource = fs.readFileSync(
      path.resolve(__dirname, '../../app/page.tsx'),
      'utf-8'
    );
    expect(pageSource).not.toContain("'อนุมัติใบลา &amp; ประวัติคำขอ'");
    expect(pageSource).toContain("'อนุมัติใบลา & ประวัติคำขอ'");
    expect(pageSource).toContain('aria-expanded={isMobileQuotaOpen}');
    // Ensure <header> does not apply backdrop-blur directly on <header>, keeping fixed backdrop viewport-relative
    expect(pageSource).not.toMatch(/<header[^>]*backdrop-blur/);
    // Ensure <main> does not create a stacking context via animate-ui-fade (which would trap z-50 modals below sidebar/header/nav)
    expect(pageSource).not.toMatch(/<main[^>]*animate-ui-fade/);

    const cssSource = fs.readFileSync(
      path.resolve(__dirname, '../../app/globals.css'),
      'utf-8'
    );
    expect(cssSource).toContain('@layer base');
    expect(cssSource).toContain('overflow-x: clip;');
    expect(cssSource).not.toContain('overflow-x: hidden;');
    expect(cssSource).toContain('backwards;');
    expect(cssSource).not.toMatch(/animation: ui(?:FadeIn|SlideUp|ScaleIn)[^;]*both;/);
  });
});
