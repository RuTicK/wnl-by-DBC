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
  X,
} from 'lucide-react';
import {
  formatThaiDate,
  generateLeavesCsv,
  generateQuotaSummaryCsv,
  getAdditionalUserEmails,
  getLeaveDaysByMonthInYear,
  getLeaveDaysInYear,
  getUserEmails,
  LEAVE_TYPE_META,
  REQUESTABLE_LEAVE_TYPES,
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
      if (l.leaveType === 'offsite') continue;
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

  // สถิติการลารายเดือน (12 เดือน แยกตามประเภทคำขอ 5 ประเภท)
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
      if (l.status !== 'approved' || l.leaveType === 'offsite') continue;
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
      entry.total +=
        q.quotas.sick.usedDays +
        q.quotas.personal.usedDays +
        q.quotas.vacation.usedDays +
        q.quotas.wfh.usedDays +
        q.quotas.wfa.usedDays;
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
        (item.user.englishName || '').toLowerCase().includes(q) ||
        item.user.email.toLowerCase().includes(q) ||
        getUserEmails(item.user).some((e) => e.includes(q)) ||
        item.user.id.toLowerCase().includes(q) ||
        (item.user.position || '').toLowerCase().includes(q)
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
    <div className="space-y-5 sm:space-y-6">
      {/* Header & Export Buttons */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] border border-slate-200/75 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                สถิติการลา &amp; โควต้าพนักงาน
              </h2>
              <span className="rounded-full bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 text-xs font-semibold text-[#0066FF] tabular-nums whitespace-nowrap shrink-0">
                ประจำปี {year}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ภาพรวมสถิติการลาและโควต้าคงเหลือทั้งองค์กร
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportQuotasCsv}
            className="rounded-xl border border-slate-200/90 bg-white hover:bg-emerald-50/70 hover:border-emerald-200 hover:text-emerald-800 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition flex items-center gap-2 cursor-pointer min-h-[40px]"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export สรุปโควต้า (Excel/CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleExportLeavesCsv}
            className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition flex items-center gap-2 cursor-pointer shadow-xs min-h-[40px]"
          >
            <Download className="h-4 w-4" />
            <span>Export ประวัติการลา (Excel/CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>อนุมัติแล้วรวม (ปีนี้)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
            {kpis.approvedDays}{' '}
            <span className="text-xs font-medium text-slate-400">
              วัน ({kpis.approvedCount} รายการ)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-medium">
            อนุมัติครบ 2 ขั้นตอน &amp; แจ้ง C-Level แล้ว
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateToApprovals}
          className="text-left rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/75 hover:border-amber-300 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-amber-50/20 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>รออนุมัติขั้นที่ 1 (Manager/C-Level)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60 shrink-0 group-hover:scale-105 transition-transform">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold text-amber-700 tracking-tight tabular-nums">
            {kpis.pendingStep1Count}{' '}
            <span className="text-xs font-medium text-slate-400">รายการ</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-semibold group-hover:underline">
            คลิกเพื่อไปหน้าอนุมัติใบลา &rarr;
          </div>
        </button>

        <button
          type="button"
          onClick={onNavigateToApprovals}
          className="text-left rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/75 hover:border-blue-300 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-blue-50/20 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>รอ HR อนุมัติ (ขั้นที่ 2/2)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0 group-hover:scale-105 transition-transform">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold text-[#0066FF] tracking-tight tabular-nums">
            {kpis.pendingHrCount}{' '}
            <span className="text-xs font-medium text-slate-400">รายการ</span>
          </div>
          <div className="mt-2 text-[11px] text-[#0066FF] font-semibold group-hover:underline">
            ผ่านขั้นที่ 1 แล้ว รอ HR ยืนยัน &rarr;
          </div>
        </button>

        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>จำนวนพนักงานในสังกัด</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 border border-slate-200/70 shrink-0">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
            {kpis.totalEmployees}{' '}
            <span className="text-xs font-medium text-slate-400">คน</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">
            ครอบคลุม {departments.length} แผนกในองค์กร
          </div>
        </div>
      </div>

      {/* Charts Row: Monthly Chart + Department Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Monthly Leave Bar Chart (7 cols) */}
        <div className="xl:col-span-7 rounded-2xl bg-white p-5 sm:p-6 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-4.5 w-4.5 text-[#0066FF] shrink-0" />
                <span>กราฟสรุปจำนวนวันลา &amp; WFH/WFA รายเดือน (ม.ค. - ธ.ค.)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                แสดงจำนวนวันแยกตามประเภททั้ง 5 ประเภทในแต่ละเดือน
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500 font-medium shrink-0">
              {REQUESTABLE_LEAVE_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: LEAVE_TYPE_META[t].color }}
                  />
                  {LEAVE_TYPE_META[t].shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto momentum-scroll pb-1">
            <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-56 min-w-[440px] pt-6 pb-2 px-1 border-b border-slate-100">
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
                  <div className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-900 mb-1 tabular-nums transition-colors">
                    {m.total > 0 ? m.total : ''}
                  </div>
                  <div className="w-full max-w-[28px] bg-slate-100/80 rounded-t-md h-36 flex flex-col justify-end overflow-hidden">
                    {m.total > 0 && (
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full flex flex-col justify-end rounded-t-md overflow-hidden transition-all group-hover:brightness-95"
                        title={`${m.label}: รวม ${m.total} วัน (ป่วย ${m.sick}, กิจ ${m.personal}, พักร้อน ${m.vacation}, WFH ${m.wfh}, WFA ${m.wfa})`}
                      >
                        {REQUESTABLE_LEAVE_TYPES.map((t) =>
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
                  <div className="mt-2 text-[11px] sm:text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors whitespace-nowrap">
                    {m.label}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Department Leave Breakdown (5 cols) */}
        <div className="xl:col-span-5 rounded-2xl bg-white p-5 sm:p-6 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="h-4.5 w-4.5 text-[#0066FF] shrink-0" />
              <span>สถิติแยกตามแผนก (Department Summary)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              เปรียบเทียบจำนวนวันลาและ WFH/WFA ในแต่ละแผนก
            </p>
          </div>

          <div className="space-y-4">
            {departmentStats.list.map((d) => {
              const widthPct =
                d.total > 0
                  ? Math.max(8, (d.total / departmentStats.maxDeptTotal) * 100)
                  : 0;
              return (
                <div key={d.department} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{d.department}</span>{' '}
                      <span className="font-normal text-slate-400 text-xs tabular-nums shrink-0 whitespace-nowrap">
                        ({d.headcount} คน)
                      </span>
                    </span>
                    <span className="font-bold text-[#0066FF] tabular-nums shrink-0 whitespace-nowrap">
                      รวม {d.total} วัน
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className="h-full bg-[#0066FF] rounded-full transition-all duration-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 font-medium tabular-nums">
                    <span>ป่วย {d.sick}</span>
                    <span>กิจ {d.personal}</span>
                    <span>พักร้อน {d.vacation}</span>
                    <span>WFH {d.wfh}</span>
                    <span>WFA {d.wfa}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Employee Remaining Quota Table */}
      <div className="rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              ตารางสรุปโควต้าวันลาคงเหลือ &amp; สถานะผ่านโปรรายบุคคล (ประจำปี {year})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              เก็บเฉพาะข้อมูลตามหลัก PDPA (ไม่มีเบอร์โทรศัพท์) พร้อมคำนวณวันเริ่มงานและโควต้าอัตโนมัติ
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            {filterDepartments.length > 0 && (
              <div className="relative">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full sm:w-auto appearance-none rounded-xl border border-slate-200 bg-slate-50/70 pl-3.5 pr-9 py-2 text-base sm:text-xs font-semibold text-slate-700 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden cursor-pointer min-h-[40px] transition"
                  aria-label="กรองตารางโควต้าตามแผนก"
                >
                  <option value="ALL">ทุกแผนก ({allQuotas.length} คน)</option>
                  {filterDepartments.map((d) => (
                    <option key={d} value={d}>
                      แผนก {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            )}

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อไทย/อังกฤษ/อีเมล..."
                className="w-full sm:w-56 rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 py-2 text-base sm:text-xs text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden min-h-[40px] transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto momentum-scroll pb-2">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold text-xs whitespace-nowrap">
                <th className="py-3.5 px-5 min-w-[220px]">พนักงาน (TH / EN / Email)</th>
                <th className="py-3.5 px-4 min-w-[180px]">แผนก / เริ่มงาน (โปร 119 วัน)</th>
                <th className="py-3.5 px-3 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    ลาป่วย
                  </span>
                </th>
                <th className="py-3.5 px-3 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    ลากิจ
                  </span>
                </th>
                <th className="py-3.5 px-3 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    ลาพักร้อน
                  </span>
                </th>
                <th className="py-3.5 px-3 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#0066FF]" />
                    WFH / WFA
                  </span>
                </th>
                <th className="py-3.5 px-4 text-center">รออนุมัติ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuotas.map((row) => (
                <tr key={row.user.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3.5 px-5">
                    <div className="font-semibold text-sm text-slate-900">
                      {row.user.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {row.user.englishName ? `${row.user.englishName} · ` : ''}
                      {row.user.email}
                    </div>
                    {getAdditionalUserEmails(row.user).map((altEmail) => (
                      <div
                        key={altEmail}
                        className="text-xs font-medium text-indigo-600 mt-0.5"
                      >
                        ↳ {altEmail}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-mono text-[11px] text-slate-400">
                        {row.user.id}
                      </span>
                      <span
                        className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          ROLE_META[row.user.role].badgeClass
                        }`}
                      >
                        {ROLE_META[row.user.role].label}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                      {row.user.department || 'ผู้บริหาร (C-Level)'}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {row.user.position}
                    </div>
                    <div className="mt-1.5">
                      {row.user.role === 'c_level' ||
                      row.user.role === 'admin' ||
                      !row.user.startDate ? (
                        <span className="inline-flex whitespace-nowrap items-center rounded-md bg-purple-50 border border-purple-200/70 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                          ผู้บริหาร (ไม่ติดเงื่อนไขโปร)
                        </span>
                      ) : row.probation.passed ? (
                        <span className="inline-flex whitespace-nowrap items-center rounded-md bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          ผ่านโปรแล้ว ({formatThaiDate(row.user.startDate, true)})
                        </span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap items-center rounded-md bg-amber-50 border border-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          ทดลองงาน (เหลือ {row.probation.daysRemaining} วัน)
                        </span>
                      )}
                    </div>
                  </td>
                  {(['sick', 'personal', 'vacation'] as LeaveType[]).map((t) => {
                    const q = row.quotas[t];
                    return (
                      <td key={t} className="py-3.5 px-3 text-center tabular-nums whitespace-nowrap">
                        <span className="font-bold text-sm sm:text-base text-slate-900">
                          {q.remainingDays}
                        </span>
                        <span className="text-slate-400 text-xs">
                          {' '}
                          / {q.totalQuota}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ใช้แล้ว {q.usedDays} วัน
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-3 text-center tabular-nums whitespace-nowrap">
                    <div className="text-xs font-semibold text-blue-700">
                      WFH: ใช้ {row.quotas.wfh.usedDays}
                      {row.quotas.wfh.isUnlimited
                        ? ' (ไม่จำกัด)'
                        : ` / ${row.quotas.wfh.totalQuota}`}
                    </div>
                    <div className="text-xs font-semibold text-violet-700 mt-1">
                      WFA: ใช้ {row.quotas.wfa.usedDays}
                      {row.quotas.wfa.isUnlimited
                        ? ' (ไม่จำกัด)'
                        : ` / ${row.quotas.wfa.totalQuota}`}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">
                    {row.totalPending > 0 ? (
                      <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-1 font-semibold text-amber-800 text-xs inline-block">
                        {row.totalPending} วัน
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredQuotas.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
