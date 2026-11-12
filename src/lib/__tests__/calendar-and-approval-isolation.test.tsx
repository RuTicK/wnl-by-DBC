import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ApprovalAndHistoryView from '@/components/ApprovalAndHistoryView';
import AttendanceAndOfficeView from '@/components/AttendanceAndOfficeView';
import HrDashboardView from '@/components/HrDashboardView';
import HrManagementView, { DepartmentDropdown } from '@/components/HrManagementView';
import LeaveCalendar from '@/components/LeaveCalendar';
import { COMPANY_DEPARTMENTS, LeaveRequest, SafeUser } from '@/lib/types';
import { STANDARD_LEAVE_QUOTAS } from '@/lib/leave-utils';

describe('LeaveCalendar & Departmental Approval Isolation UI Tests', () => {
  const calendarPath = path.resolve(__dirname, '../../components/LeaveCalendar.tsx');
  const calendarContent = fs.readFileSync(calendarPath, 'utf-8');

  it('completely removes the bulky top card from LeaveCalendar.tsx', () => {
    // Must NOT contain the old bulky card title and subtitle
    expect(calendarContent).not.toContain('ปฏิทินวันลา & การปฏิบัติงาน');
    expect(calendarContent).not.toContain('คลิกเลือกวันที่บนปฏิทินเพื่อดูรายชื่อผู้ลา');
    expect(calendarContent).not.not.toBe(true);
  });

  it('integrates compact controls into the calendar toolbar', () => {
    expect(calendarContent).toContain('กรองตามแผนก');
    expect(calendarContent).toContain('กรองตามสถานะใบลา');
    expect(calendarContent).toContain('+ ยื่นใบลา');
    expect(calendarContent).toContain('วันนี้');
  });

  const itManager: SafeUser = {
    id: 'EMP002',
    name: 'กิตติพงศ์ วรโชติ',
    englishName: 'Kittipong Worachot',
    email: 'kittipong.it@company.co.th',
    role: 'manager',
    department: 'IT & Digital',
    position: 'Engineering Manager',
    startDate: '2021-06-15',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const salesManager: SafeUser = {
    id: 'EMP005',
    name: 'วรพล ยอดเยี่ยม',
    englishName: 'Worapon Yodyiam',
    email: 'worapon.sales@company.co.th',
    role: 'manager',
    department: 'Sales & Marketing',
    position: 'Sales Director',
    startDate: '2021-09-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const hrUser: SafeUser = {
    id: 'EMP001',
    name: 'ศิริพร บริหารงาน',
    englishName: 'Siriporn Boriharn',
    email: 'siriporn.hr@company.co.th',
    role: 'hr',
    department: 'HR & Admin',
    position: 'HR Manager',
    startDate: '2022-03-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const cLevelUser: SafeUser = {
    id: 'EMP009',
    name: 'ดร.อนันต์ วิสัยทัศน์ไกล',
    englishName: 'Dr. Anan Wisaithatklai',
    email: 'anan.ceo@company.co.th',
    role: 'c_level',
    department: 'Executive (C-Level)',
    position: 'CEO',
    startDate: '2020-01-01',
    quotas: STANDARD_LEAVE_QUOTAS,
  };

  const itEmployeeLeave: LeaveRequest = {
    id: 'LV-IT-001',
    userId: 'EMP003',
    userName: 'สมชาย ใจดี',
    requesterRole: 'employee',
    department: 'IT & Digital',
    leaveType: 'sick',
    durationType: 'full',
    startDate: '2026-12-10',
    endDate: '2026-12-10',
    totalDays: 1,
    reason: 'มีไข้สูง',
    status: 'pending_manager',
    createdAt: '2026-12-09T08:00:00.000Z',
  };

  const salesEmployeeLeave: LeaveRequest = {
    id: 'LV-SALES-001',
    userId: 'EMP006',
    userName: 'ณัฐพงศ์ ทองดี',
    requesterRole: 'employee',
    department: 'Sales & Marketing',
    leaveType: 'vacation',
    durationType: 'full',
    startDate: '2026-12-11',
    endDate: '2026-12-11',
    totalDays: 1,
    reason: 'พักผ่อน',
    status: 'pending_manager',
    createdAt: '2026-12-09T09:00:00.000Z',
  };

  const dummyAction = async () => ({ success: true });

  it('renders IT employee pending leave only for IT Manager, not Sales Manager', () => {
    // Render for IT Manager
    const itHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={itManager}
        leaves={[itEmployeeLeave, salesEmployeeLeave]}
        onProcessLeaveAction={dummyAction}
      />
    );
    expect(itHtml).toContain('สมชาย ใจดี');
    expect(itHtml).toContain('อนุมัติขั้นที่ 1 (Manager -&gt; HR)');
    expect(itHtml).not.toContain('ณัฐพงศ์ ทองดี');

    // Render for Sales Manager
    const salesHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={salesManager}
        leaves={[itEmployeeLeave, salesEmployeeLeave]}
        onProcessLeaveAction={dummyAction}
      />
    );
    expect(salesHtml).toContain('ณัฐพงศ์ ทองดี');
    expect(salesHtml).toContain('อนุมัติขั้นที่ 1 (Manager -&gt; HR)');
    expect(salesHtml).not.toContain('สมชาย ใจดี');
  });

  it('does NOT display employee pending_manager leaves in action queue for HR or C-Level', () => {
    // Render for HR
    const hrHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={hrUser}
        leaves={[itEmployeeLeave, salesEmployeeLeave]}
        onProcessLeaveAction={dummyAction}
      />
    );
    // HR's Action Queue is empty because both leaves are pending_manager (waiting for department managers)
    expect(hrHtml).toContain('ไม่มีรายการใบลาในหมวดหมู่นี้');
    expect(hrHtml).not.toContain('อนุมัติขั้นที่ 1');

    // Render for C-Level
    const cLevelHtml = renderToStaticMarkup(
      <ApprovalAndHistoryView
        currentUser={cLevelUser}
        leaves={[itEmployeeLeave, salesEmployeeLeave]}
        onProcessLeaveAction={dummyAction}
      />
    );
    // C-Level's Action Queue is empty because both leaves are pending_manager
    expect(cLevelHtml).toContain('ไม่มีรายการใบลาในหมวดหมู่นี้');
    expect(cLevelHtml).not.toContain('อนุมัติขั้นที่ 1');
  });

  it('renders LeaveCalendar cleanly without old bulky block', () => {
    const html = renderToStaticMarkup(
      <LeaveCalendar
        currentUser={itManager}
        leaves={[itEmployeeLeave]}
        holidays={[]}
        onOpenRequestModal={() => {}}
      />
    );
    expect(html).not.toContain('ปฏิทินวันลา &amp; การปฏิบัติงาน');
    expect(html).toContain('+ ยื่นใบลา');
    expect(html).toContain('วันนี้');
  });

  it('locks department selection when adding an employee to the 4 fixed departments (AE, สำนักงาน, Consult, Marketing&BD)', () => {
    expect(COMPANY_DEPARTMENTS).toEqual(['AE', 'สำนักงาน', 'Consult', 'Marketing&BD']);
    const hrMgmtPath = path.resolve(__dirname, '../../components/HrManagementView.tsx');
    const hrMgmtContent = fs.readFileSync(hrMgmtPath, 'utf-8');
    expect(hrMgmtContent).not.toContain('hr-dept-options');
    expect(hrMgmtContent).toContain('COMPANY_DEPARTMENTS.map');
    expect(hrMgmtContent).toContain('<select');
    expect(hrMgmtContent).not.toContain('eslint-disable-next-line');

    const mgmtHtml = renderToStaticMarkup(
      <HrManagementView
        currentUser={hrUser}
        users={[hrUser, itManager]}
        holidays={[]}
        onUpsertEmployee={async () => ({ success: true })}
        onDeleteEmployee={async () => ({ success: true })}
        onUpsertHoliday={async () => ({ success: true })}
        onDeleteHoliday={async () => ({ success: true })}
      />
    );
    expect(mgmtHtml).toContain('เพิ่มพนักงานใหม่');
  });

  it('audits all components for zero <datalist> and renders DepartmentDropdown as a downward non-typing dropdown with exactly the 4 fixed departments', () => {
    // 1. Audit all components in src/components for any <datalist or list= attribute
    const componentsDir = path.resolve(__dirname, '../../components');
    const componentFiles = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx'));
    for (const file of componentFiles) {
      const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
      expect(content).not.toContain('<datalist');
      expect(content).not.toMatch(/\blist=["'][^"']+["']/);
    }

    // 2. Closed empty state renders a combobox button (NO <input>, NO <datalist>) with prompt and visible helperText
    const closedEmptyHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value=""
        onChange={() => {}}
        helperText="เลือกฝ่ายจากรายการ"
      />
    );
    expect(closedEmptyHtml).not.toContain('<input');
    expect(closedEmptyHtml).not.toContain('<datalist');
    expect(closedEmptyHtml).toContain('role="combobox"');
    expect(closedEmptyHtml).toContain('aria-expanded="false"');
    expect(closedEmptyHtml).not.toContain('aria-activedescendant');
    expect(closedEmptyHtml).toContain('-- เลือกฝ่าย / แผนก --');
    expect(closedEmptyHtml).toContain('เลือกฝ่ายจากรายการ');
    expect(closedEmptyHtml).not.toContain('invisible');

    // 3. Open state drops downward (top-full) with role="listbox", aria-activedescendant, tabIndex=-1 on options, invisible helperText, and exactly 4 options
    const openAddHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value="Consult"
        onChange={() => {}}
        helperText="เลือกฝ่ายจากรายการ"
        defaultOpen={true}
      />
    );
    expect(openAddHtml).not.toContain('<input');
    expect(openAddHtml).toContain('aria-expanded="true"');
    expect(openAddHtml).toContain('aria-activedescendant="emp-department-option-2"');
    expect(openAddHtml).toContain('role="listbox"');
    expect(openAddHtml).toContain('top-full');
    expect(openAddHtml).toContain('scroll-mb-6');
    expect(openAddHtml).toContain('invisible select-none');
    const optionCount = (openAddHtml.match(/role="option"/g) || []).length;
    expect(optionCount).toBe(4);
    expect((openAddHtml.match(/tabindex="-1"/gi) || []).length).toBe(4);
    expect(openAddHtml).toContain('AE');
    expect(openAddHtml).toContain('สำนักงาน');
    expect(openAddHtml).toContain('Consult');
    expect(openAddHtml).toContain('Marketing&amp;BD');
    expect(openAddHtml).not.toContain('(ฝ่ายเดิม)');
  });

  it('handles DepartmentDropdown edit mode with legacy departments, whitespace edge cases, and validation error state', () => {
    // Legacy department preserved with "(ฝ่ายเดิม)" marker alongside 4 official options
    const legacyOpenHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value="IT Officer"
        legacyDepartment="IT Officer"
        onChange={() => {}}
        defaultOpen={true}
      />
    );
    expect(legacyOpenHtml).toContain('IT Officer (ฝ่ายเดิม)');
    expect((legacyOpenHtml.match(/role="option"/g) || []).length).toBe(5);

    // Trimmed official department value matches official option with aria-selected="true"
    const paddedOfficialHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value="  AE  "
        legacyDepartment="  AE  "
        onChange={() => {}}
        defaultOpen={true}
      />
    );
    expect(paddedOfficialHtml).not.toContain('(ฝ่ายเดิม)');
    expect(paddedOfficialHtml).toContain('aria-selected="true"');
    expect((paddedOfficialHtml.match(/role="option"/g) || []).length).toBe(4);

    // Whitespace-only legacyDepartment should NOT add a blank option
    const blankLegacyHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value=""
        legacyDepartment="   "
        onChange={() => {}}
        defaultOpen={true}
      />
    );
    expect((blankLegacyHtml.match(/role="option"/g) || []).length).toBe(4);

    // Closed validation error state marks aria-invalid and renders Thai error below trigger
    const closedErrorHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value=""
        onChange={() => {}}
        error="กรุณาเลือกฝ่าย / แผนก"
        helperText="เลือกฝ่ายจากรายการ"
      />
    );
    expect(closedErrorHtml).toContain('aria-invalid="true"');
    expect(closedErrorHtml).toContain('กรุณาเลือกฝ่าย / แผนก');
    expect(closedErrorHtml).not.toContain('เลือกฝ่ายจากรายการ');

    // Open validation error state places error inside listbox rather than overlapping underneath
    const openErrorHtml = renderToStaticMarkup(
      <DepartmentDropdown
        value=""
        onChange={() => {}}
        error="กรุณาเลือกฝ่าย / แผนก"
        defaultOpen={true}
      />
    );
    expect(openErrorHtml).toContain('aria-invalid="true"');
    expect(openErrorHtml).toContain('role="listbox"');
    expect(openErrorHtml).toContain('bg-rose-50 border border-rose-100');
    expect((openErrorHtml.match(/กรุณาเลือกฝ่าย \/ แผนก/g) || []).length).toBe(1);
  });

  it('includes all 4 fixed COMPANY_DEPARTMENTS without whitespace duplicates in filter dropdowns across AttendanceAndOfficeView, LeaveCalendar, and HrDashboardView', () => {
    const paddedUser: SafeUser = { ...hrUser, id: 'EMP998', department: '  AE  ' };
    const attendanceHtml = renderToStaticMarkup(
      <AttendanceAndOfficeView
        currentUser={hrUser}
        users={[hrUser, paddedUser]}
        attendance={[]}
        leaves={[]}
        onCheckIn={async () => ({ success: true })}
        onCheckOut={async () => ({ success: true })}
      />
    );
    for (const dept of COMPANY_DEPARTMENTS) {
      expect(attendanceHtml).toContain(dept.replace('&', '&amp;'));
    }
    expect((attendanceHtml.match(/value="AE"/g) || []).length).toBe(1);

    const calendarHtml = renderToStaticMarkup(
      <LeaveCalendar
        currentUser={hrUser}
        leaves={[{ ...itEmployeeLeave, department: '  Consult  ' }]}
        holidays={[]}
        onOpenRequestModal={() => {}}
      />
    );
    for (const dept of COMPANY_DEPARTMENTS) {
      expect(calendarHtml).toContain(dept.replace('&', '&amp;'));
    }
    expect((calendarHtml.match(/value="Consult"/g) || []).length).toBe(1);

    const dashboardHtml = renderToStaticMarkup(
      <HrDashboardView
        currentUser={hrUser}
        leaves={[]}
        holidays={[]}
        allQuotas={[]}
        year={2026}
        onNavigateToApprovals={() => {}}
      />
    );
    for (const dept of COMPANY_DEPARTMENTS) {
      expect(dashboardHtml).toContain(dept.replace('&', '&amp;'));
    }
  });

  it('removes manual English name input and skips department & startDate for C-Level in HrManagementView', () => {
    const hrMgmtPath = path.resolve(__dirname, '../../components/HrManagementView.tsx');
    const hrMgmtContent = fs.readFileSync(hrMgmtPath, 'utf-8');
    expect(hrMgmtContent).not.toContain('setEmpEnglishName');
    expect(hrMgmtContent).not.toContain('ชื่อภาษาอังกฤษ (Google Profile)');
    expect(hrMgmtContent).toContain('isExecutiveRole');
    expect(hrMgmtContent).toContain('ไม่ต้องเลือกฝ่าย และไม่ต้องระบุวันเริ่มทำงาน');
  });
});
