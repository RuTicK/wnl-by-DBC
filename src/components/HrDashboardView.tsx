'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  PieChart,
  Search,
  Users,
} from 'lucide-react';
import {
  ALL_LEAVE_TYPES,
  formatThaiDate,
  generateLeavesCsv,
  generateQuotaSummaryCsv,
  getLeaveDaysByMonthInYear,
  getLeaveDaysInYear,
  LEAVE_TYPE_META,
  ROLE_META,
} from '@/lib/leave-utils';
import {
  COMPANY_DEPARTMENTS,
  EmployeeQuotaOverview,
  Holiday,
  LeaveRequest,
  LeaveType,
  SafeUser,
} from '@/lib/types';

interface HrDashboardViewProps {
  currentUser: SafeUser;
  leaves: LeaveRequest[];
  holidays?: Holiday[];
  allQuotas: EmployeeQuotaOverview[];
  year: number;
  onNavigateToApprovals: () => void;
}

const MONTH_SHORT_LABELS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export default function HrDashboardView({
  currentUser,
  leaves,
  holidays = [],
  allQuotas,
  year,
  onNavigateToApprovals,
}: HrDashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  const scopedLeaves = useMemo(() => {
    if (currentUser.role === 'employee') {
      return leaves.filter((l) => l.userId === currentUser.id);
    }
    return leaves;
  }, [leaves, currentUser]);

  // KPIs
  const kpis = useMemo(() => {
    let approvedDays = 0;
    let approvedCount = 0;
    let pendingStep1Count = 0;
    let pendingHrCount = 0;

    for (const l of scopedLeaves) {
      const daysInYear = getLeaveDaysInYear(l, year, holidays);
      if (daysInYear <= 0) continue;

      if (l.status === 'approved') {
        approvedDays += daysInYear;
        approvedCount += 1;
      } else if (
        l.status === 'pending_manager' ||
        l.status === 'pending_c_level'
      ) {
        pendingStep1Count += 1;
      } else if (l.status === 'pending_hr') {
        pendingHrCount += 1;
      }
    }

    return {
      approvedDays,
      approvedCount,
      pendingStep1Count,
      pendingHrCount,
      totalEmployees: allQuotas.length,
    };
  }, [scopedLeaves, year, holidays, allQuotas]);

  // สถิติการลารายเดือน (12 เดือน แยกตามประเภท 6 ประเภท)
  const monthlyStats = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, idx) => ({
      monthIndex: idx,
      label: MONTH_SHORT_LABELS[idx],
      sick: 0,
      personal: 0,
      vacation: 0,
      wfh: 0,
      wfa: 0,
      offsite: 0,
      total: 0,
    }));

    for (const l of scopedLeaves) {
      if (l.status !== 'approved') continue;
      const monthBreakdown = getLeaveDaysByMonthInYear(l, year, holidays);
      for (let m = 0; m < 12; m++) {
        if (monthBreakdown[m] > 0) {
          const lt = l.leaveType;
          if (lt in months[m]) {
            months[m][lt] += monthBreakdown[m];
          }
          months[m].total += monthBreakdown[m];
        }
      }
    }

    const maxMonthTotal = Math.max(...months.map((m) => m.total), 4);
    return { months, maxMonthTotal };
  }, [scopedLeaves, year, holidays]);

  // สถิติแยกตามแผนก
  const departmentStats = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        sick: number;
        personal: number;
        vacation: number;
        wfh: number;
        wfa: number;
        offsite: number;
        total: number;
        headcount: number;
      }
    >();

    for (const q of allQuotas) {
      const dept = q.user.department;
      if (!map.has(dept)) {
        map.set(dept, {
          department: dept,
          sick: 0,
          personal: 0,
          vacation: 0,
          wfh: 0,
          wfa: 0,
          offsite: 0,
          total: 0,
          headcount: 0,
        });
      }
      const entry = map.get(dept)!;
      entry.headcount += 1;
      entry.sick += q.quotas.sick.usedDays;
      entry.personal += q.quotas.personal.usedDays;
      entry.vacation += q.quotas.vacation.usedDays;
      entry.wfh += q.quotas.wfh.usedDays;
      entry.wfa += q.quotas.wfa.usedDays;
      entry.offsite += q.quotas.offsite.usedDays;
      entry.total += q.totalUsed;
    }

    const list = Array.from(map.values()).sort((a, b) => b.total - a.total);
    const maxDeptTotal = Math.max(...list.map((d) => d.total), 4);
    return { list, maxDeptTotal };
  }, [allQuotas]);

  const departments = useMemo(() => {
    return Array.from(new Set(allQuotas.map((q) => q.user.department))).sort();
  }, [allQuotas]);

  const filterDepartments = useMemo(() => {
    const set = new Set<string>(COMPANY_DEPARTMENTS);
    allQuotas.forEach((q) => {
      const dept = (q.user.department || '').trim();
      if (dept) set.add(dept);
    });
    return Array.from(set);
  }, [allQuotas]);

  const filteredQuotas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allQuotas.filter((item) => {
      if (
        deptFilter !== 'ALL' &&
        (item.user.department || '').trim() !== deptFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.user.name.toLowerCase().includes(q) ||
        item.user.englishName.toLowerCase().includes(q) ||
        item.user.email.toLowerCase().includes(q) ||
        item.user.id.toLowerCase().includes(q) ||
        item.user.position.toLowerCase().includes(q)
      );
    });
  }, [allQuotas, deptFilter, searchQuery]);

  const triggerCsvDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportLeavesCsv = () => {
    const csv = generateLeavesCsv(scopedLeaves);
    triggerCsvDownload(csv, `wan-nee-la-dbc-leaves-${year}.csv`);
  };

  const handleExportQuotasCsv = () => {
    const csv = generateQuotaSummaryCsv(filteredQuotas);
    triggerCsvDownload(csv, `wan-nee-la-dbc-quotas-${year}.csv`);
  };

  if (
    currentUser.role !== 'hr' &&
    currentUser.role !== 'c_level' &&
    currentUser.role !== 'admin'
  ) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
        เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin)
        เท่านั้นที่สามารถเข้าถึงแดชบอร์ดสถิติวันลาได้
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Export Buttons */}
      <div className="rounded-3xl bg-white p-6 sm:p-7 shadow-xs border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0 shadow-xs">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  แดชบอร์ดสรุปสถิติการลา &amp; โควต้าพนักงาน (PDPA Compliant)
                </h2>
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white px-3 py-1 text-xs font-black tracking-wider shadow-xs">
                  วันนี้ลา by DBC
                </span>
                <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                  ประจำปี {year + 543}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                ภาพรวมสถิติวันลาและปฏิบัติงานนอกสถานที่ทั้งบริษัท สรุปรายเดือน รายแผนก สถานะผ่านโปร 120 วัน และโควต้ารายบุคคล
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportQuotasCsv}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-2 cursor-pointer shadow-xs min-h-[44px]"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export สรุปโควต้า (Excel/CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleExportLeavesCsv}
            className="rounded-xl bg-gradient-to-r from-[#0066FF] to-[#1D4ED8] hover:from-blue-700 hover:to-[#0A2540] px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition flex items-center gap-2 cursor-pointer shadow-xs ring-2 ring-blue-500/20 min-h-[44px]"
          >
            <Download className="h-4 w-4" />
            <span>Export ประวัติการลา (Excel/CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-500">
            <span>อนุมัติแล้วรวม (ปีนี้)</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {kpis.approvedDays}{' '}
            <span className="text-xs sm:text-sm font-semibold text-slate-500">
              วัน ({kpis.approvedCount} รายการ)
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-700 font-bold">
            อนุมัติครบ 2 ขั้นตอน &amp; แจ้ง C-Level แล้ว
          </div>
        </div>

        <div
          onClick={onNavigateToApprovals}
          className="rounded-3xl bg-white p-5 sm:p-6 border border-amber-200 shadow-xs cursor-pointer hover:bg-amber-50/40 transition group"
        >
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-amber-800">
            <span>รออนุมัติขั้นที่ 1 (Manager/C-Level)</span>
            <Clock className="h-5 w-5 text-amber-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 text-3xl sm:text-4xl font-black text-amber-700 tracking-tight">
            {kpis.pendingStep1Count}{' '}
            <span className="text-xs sm:text-sm font-semibold text-slate-500">รายการ</span>
          </div>
          <div className="mt-2 text-xs text-amber-700 font-bold underline group-hover:text-amber-900">
            คลิกเพื่อไปหน้าอนุมัติใบลา &rarr;
          </div>
        </div>

        <div
          onClick={onNavigateToApprovals}
          className="rounded-3xl bg-white p-5 sm:p-6 border border-blue-200 shadow-xs cursor-pointer hover:bg-blue-50/40 transition group"
        >
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-blue-800">
            <span>รอ HR อนุมัติ (ขั้นที่ 2/2)</span>
            <Clock className="h-5 w-5 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 text-3xl sm:text-4xl font-black text-blue-700 tracking-tight">
            {kpis.pendingHrCount}{' '}
            <span className="text-xs sm:text-sm font-semibold text-slate-500">รายการ</span>
          </div>
          <div className="mt-2 text-xs text-blue-700 font-bold underline group-hover:text-blue-900">
            ผ่านขั้นที่ 1 แล้ว รอ HR ยืนยัน &rarr;
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-500">
            <span>จำนวนพนักงานในสังกัด</span>
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-3 text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {kpis.totalEmployees}{' '}
            <span className="text-xs sm:text-sm font-semibold text-slate-500">คน</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-medium">
            ครอบคลุม {departments.length} แผนกในองค์กร
          </div>
        </div>
      </div>

      {/* Charts Row: Monthly Chart + Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Monthly Leave Bar Chart (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                <span>กราฟสรุปจำนวนวันลา &amp; นอกสถานที่รายเดือน (ม.ค. - ธ.ค.)</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                แสดงจำนวนวันแยกตามประเภททั้ง 6 ประเภทในแต่ละเดือน
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-semibold">
              {ALL_LEAVE_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-xs"
                    style={{ backgroundColor: LEAVE_TYPE_META[t].color }}
                  />
                  {LEAVE_TYPE_META[t].shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-56 pt-6 pb-2 px-1 border-b border-slate-100">
            {monthlyStats.months.map((m) => {
              const heightPct =
                m.total > 0
                  ? Math.max(12, (m.total / monthlyStats.maxMonthTotal) * 100)
                  : 0;

              return (
                <div
                  key={m.label}
                  className="flex flex-col items-center justify-end h-full group"
                >
                  <div className="text-xs font-bold text-slate-700 mb-1">
                    {m.total > 0 ? m.total : ''}
                  </div>
                  <div className="w-full max-w-[32px] bg-slate-100 rounded-t-lg h-36 flex flex-col justify-end overflow-hidden">
                    {m.total > 0 && (
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden transition-all"
                        title={`${m.label}: รวม ${m.total} วัน (ป่วย ${m.sick}, กิจ ${m.personal}, พักร้อน ${m.vacation}, WFH ${m.wfh}, WFA ${m.wfa}, นอกสถานที่ ${m.offsite})`}
                      >
                        {ALL_LEAVE_TYPES.map((t) =>
                          m[t] > 0 ? (
                            <div
                              key={t}
                              style={{
                                flexGrow: m[t],
                                backgroundColor: LEAVE_TYPE_META[t].color,
                              }}
                            />
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs sm:text-sm font-bold text-slate-700">
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Department Leave Breakdown (5 cols) */}
        <div className="lg:col-span-5 rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="h-5 w-5 text-blue-600" />
              <span>สถิติแยกตามแผนก (Department Summary)</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              เปรียบเทียบจำนวนวันลาและปฏิบัติงานนอกสถานที่ในแต่ละแผนก
            </p>
          </div>

          <div className="space-y-4">
            {departmentStats.list.map((d) => {
              const widthPct =
                d.total > 0
                  ? Math.max(8, (d.total / departmentStats.maxDeptTotal) * 100)
                  : 0;
              return (
                <div key={d.department} className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-bold text-slate-800 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      {d.department}{' '}
                      <span className="font-medium text-slate-400">
                        ({d.headcount} คน)
                      </span>
                    </span>
                    <span className="font-black text-blue-700">
                      รวม {d.total} วัน
                    </span>
                  </div>

                  <div className="h-3.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className="h-full bg-gradient-to-r from-[#0066FF] to-sky-500 rounded-full"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                    <span>ป่วย: {d.sick}</span>
                    <span>กิจ: {d.personal}</span>
                    <span>พักร้อน: {d.vacation}</span>
                    <span>WFH: {d.wfh}</span>
                    <span>WFA: {d.wfa}</span>
                    <span>นอกสถานที่: {d.offsite}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Employee Remaining Quota Table */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              ตารางสรุปโควต้าวันลาคงเหลือ &amp; สถานะผ่านโปรรายบุคคล (ประจำปี {year + 543})
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              เก็บเฉพาะข้อมูลตามหลัก PDPA (ไม่มีเบอร์โทรศัพท์) พร้อมคำนวณวันเริ่มงานและโควต้าอัตโนมัติ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {filterDepartments.length > 0 && (
              <div className="relative">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-10 py-2.5 text-base sm:text-sm font-bold text-slate-700 hover:border-blue-300 focus:border-blue-600 focus:bg-white focus:outline-hidden cursor-pointer min-h-[44px]"
                  aria-label="กรองตารางโควต้าตามแผนก"
                >
                  <option value="ALL">ทุกแผนก ({allQuotas.length} คน)</option>
                  {filterDepartments.map((d) => (
                    <option key={d} value={d}>
                      แผนก {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            )}

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อไทย/อังกฤษ/อีเมล..."
                className="rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden min-h-[44px] font-medium"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto momentum-scroll pb-2">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black">
                <th className="py-4 px-5">พนักงาน (TH / EN / Email)</th>
                <th className="py-4 px-4">แผนก / เริ่มงาน (โปร 120 วัน)</th>
                <th className="py-4 px-3 text-center bg-rose-50/60 text-rose-800">
                  ลาป่วย
                </th>
                <th className="py-4 px-3 text-center bg-amber-50/60 text-amber-800">
                  ลากิจ
                </th>
                <th className="py-4 px-3 text-center bg-sky-50/60 text-sky-800">
                  ลาพักร้อน
                </th>
                <th className="py-4 px-3 text-center bg-blue-50/60 text-blue-800">
                  WFH / WFA
                </th>
                <th className="py-4 px-3 text-center bg-teal-50/60 text-teal-800">
                  นอกสถานที่
                </th>
                <th className="py-4 px-4 text-center">รออนุมัติ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredQuotas.map((row) => (
                <tr key={row.user.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-4 px-5">
                    <div className="font-extrabold text-sm sm:text-base text-slate-900">
                      {row.user.name}
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      {row.user.englishName} • {row.user.email}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-mono text-xs text-slate-400 font-bold">
                        {row.user.id}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                          ROLE_META[row.user.role].badgeClass
                        }`}
                      >
                        {ROLE_META[row.user.role].label}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-bold text-slate-800">
                      {row.user.department}
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {row.user.position}
                    </div>
                    <div className="mt-1.5">
                      {row.probation.passed ? (
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          ผ่านโปรแล้ว ({formatThaiDate(row.user.startDate, true)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800">
                          ทดลองงาน (เหลือ {row.probation.daysRemaining} วัน)
                        </span>
                      )}
                    </div>
                  </td>
                  {(['sick', 'personal', 'vacation'] as LeaveType[]).map((t) => {
                    const q = row.quotas[t];
                    return (
                      <td key={t} className="py-4 px-3 text-center">
                        <span className="font-black text-base text-slate-900">
                          {q.remainingDays}
                        </span>
                        <span className="text-slate-400 text-xs font-semibold">
                          {' '}
                          / {q.totalQuota}
                        </span>
                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          ใช้แล้ว {q.usedDays} วัน
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-4 px-3 text-center">
                    <div className="text-xs font-bold text-blue-800">
                      WFH: ใช้ {row.quotas.wfh.usedDays}
                      {row.quotas.wfh.isUnlimited
                        ? ' (ไม่จำกัด)'
                        : ` / ${row.quotas.wfh.totalQuota}`}
                    </div>
                    <div className="text-xs font-bold text-violet-800 mt-1">
                      WFA: ใช้ {row.quotas.wfa.usedDays}
                      {row.quotas.wfa.isUnlimited
                        ? ' (ไม่จำกัด)'
                        : ` / ${row.quotas.wfa.totalQuota}`}
                    </div>
                  </td>
                  <td className="py-4 px-3 text-center">
                    <span className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 font-bold text-teal-800 text-xs inline-block">
                      ใช้ {row.quotas.offsite.usedDays} วัน
                    </span>
                    <div className="text-xs text-teal-600 mt-1 font-medium">
                      ไม่จำกัดโควต้า
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    {row.totalPending > 0 ? (
                      <span className="rounded-xl bg-amber-100 border border-amber-200 px-3 py-1.5 font-bold text-amber-900 text-xs sm:text-sm inline-block">
                        {row.totalPending} วัน
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
