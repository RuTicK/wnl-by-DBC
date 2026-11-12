'use client';

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Building2,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  FileText,
  Filter,
  Sparkles,
} from 'lucide-react';
import {
  DURATION_TYPE_META,
  formatThaiDate,
  LEAVE_TYPE_META,
  STATUS_META,
} from '@/lib/leave-utils';
import {
  COMPANY_DEPARTMENTS,
  Holiday,
  LeaveRequest,
  SafeUser,
} from '@/lib/types';

interface LeaveCalendarProps {
  currentUser: SafeUser;
  leaves: LeaveRequest[];
  holidays: Holiday[];
  onOpenRequestModal: (dateStr?: string) => void;
  onOpenPolicyModal?: () => void;
}

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function LeaveCalendar({
  currentUser,
  leaves,
  holidays,
  onOpenRequestModal,
  onOpenPolicyModal,
}: LeaveCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState<number>(now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'APPROVED_ONLY'>(
    'ACTIVE'
  );
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>(COMPANY_DEPARTMENTS);
    for (const l of leaves) {
      const dept = (l.department || '').trim();
      if (dept) set.add(dept);
    }
    return Array.from(set);
  }, [leaves]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidays) {
      map.set(h.date, h);
    }
    return map;
  }, [holidays]);

  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (l.status === 'rejected' || l.status === 'cancelled') return false;
      if (statusFilter === 'APPROVED_ONLY' && l.status !== 'approved') {
        return false;
      }
      if (deptFilter !== 'ALL' && (l.department || '').trim() !== deptFilter) {
        return false;
      }
      return true;
    });
  }, [leaves, deptFilter, statusFilter]);

  // สร้างตารางวันในเดือนที่เลือก
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
    const startOffset = firstDayOfMonth.getUTCDay(); // 0..6
    const daysInMonth = new Date(
      Date.UTC(viewYear, viewMonth + 1, 0)
    ).getUTCDate();

    const cells: {
      dateStr: string | null;
      dayNumber: number | null;
      isWeekend: boolean;
      holiday?: Holiday;
      dayLeaves: LeaveRequest[];
    }[] = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({
        dateStr: null,
        dayNumber: null,
        isWeekend: false,
        dayLeaves: [],
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${viewYear}-${mStr}-${dStr}`;
      const dt = new Date(Date.UTC(viewYear, viewMonth, day));
      const dow = dt.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const holiday = holidayMap.get(dateStr);

      // แสดงใบลาเฉพาะในวันทำงาน (ไม่แสดงทับวันเสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์)
      const dayLeaves =
        isWeekend || holiday
          ? []
          : filteredLeaves.filter(
              (l) => l.startDate <= dateStr && l.endDate >= dateStr
            );

      cells.push({
        dateStr,
        dayNumber: day,
        isWeekend,
        holiday,
        dayLeaves,
      });
    }

    return cells;
  }, [viewYear, viewMonth, holidayMap, filteredLeaves]);

  const selectedDayInfo = useMemo(() => {
    const holiday = holidayMap.get(selectedDate);
    const dt = new Date(selectedDate + 'T00:00:00Z');
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayLeaves =
      isWeekend || holiday
        ? []
        : filteredLeaves.filter(
            (l) => l.startDate <= selectedDate && l.endDate >= selectedDate
          );

    return {
      holiday,
      isWeekend,
      dayLeaves,
    };
  }, [selectedDate, holidayMap, filteredLeaves]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  return (
    <div className="space-y-5">

      {/* Main Layout: Calendar Grid (Left 8 cols) + Selected Day Inspector (Right 4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Calendar Grid Card */}
        <div className="xl:col-span-8 rounded-3xl bg-white shadow-xs border border-slate-200/90 overflow-hidden">
          {/* Calendar Toolbar: Month Navigation & Minimal Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 px-3.5 sm:px-5 py-3 sm:py-3.5 bg-slate-50/70">
            {/* Month Navigation */}
            <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs min-h-[38px] min-w-[38px] flex items-center justify-center active:scale-95 shrink-0"
                  aria-label="เดือนก่อนหน้า"
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </button>
                <h3 className="text-base sm:text-lg font-black text-slate-900 min-w-[130px] sm:min-w-[160px] text-center tracking-tight">
                  {THAI_MONTHS[viewMonth]} {viewYear + 543}
                </h3>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs min-h-[38px] min-w-[38px] flex items-center justify-center active:scale-95 shrink-0"
                  aria-label="เดือนถัดไป"
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleToday}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer shadow-2xs min-h-[38px] shrink-0 active:scale-95"
              >
                วันนี้
              </button>
            </div>

            {/* Controls: Department & Status Filters + Quick Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {(currentUser.role === 'admin' ||
                currentUser.role === 'hr' ||
                currentUser.role === 'c_level') && (
                <div className="relative flex items-center bg-white border border-slate-200 rounded-xl shadow-2xs min-h-[38px] hover:border-blue-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute left-2.5" />
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="appearance-none bg-transparent pl-8 pr-8 py-1.5 font-bold text-slate-700 focus:outline-hidden cursor-pointer text-xs"
                    aria-label="กรองตามแผนก"
                  >
                    <option value="ALL">ทุกแผนก</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500 pointer-events-none absolute right-2" />
                </div>
              )}

              <div className="relative flex items-center bg-white border border-slate-200 rounded-xl shadow-2xs min-h-[38px] hover:border-blue-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition">
                <Filter className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute left-2.5" />
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'ACTIVE' | 'APPROVED_ONLY')
                  }
                  className="appearance-none bg-transparent pl-8 pr-8 py-1.5 font-bold text-slate-700 focus:outline-hidden cursor-pointer text-xs"
                  aria-label="กรองตามสถานะใบลา"
                >
                  <option value="ACTIVE">ทั้งหมดที่ใช้งาน</option>
                  <option value="APPROVED_ONLY">เฉพาะที่อนุมัติแล้ว</option>
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 pointer-events-none absolute right-2" />
              </div>

              {onOpenPolicyModal && (
                <button
                  type="button"
                  onClick={onOpenPolicyModal}
                  className="rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs min-h-[38px]"
                  title="ดูเงื่อนไขและระเบียบการลางาน"
                >
                  <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                  <span className="hidden sm:inline">เงื่อนไข</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenRequestModal(selectedDate)}
                className="rounded-xl bg-gradient-to-r from-[#0066FF] to-[#1D4ED8] hover:from-blue-700 hover:to-[#0A2540] px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:shadow-md transition flex items-center gap-1.5 cursor-pointer min-h-[38px] active:scale-95"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>+ ยื่นใบลา</span>
              </button>
            </div>
          </div>

          {/* Color Legend Bar */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 overflow-x-auto no-scrollbar momentum-scroll px-3.5 sm:px-5 py-2 bg-slate-50/40 border-b border-slate-100 flex-nowrap sm:flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-rose-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> ลาป่วย
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> ลากิจ
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-sky-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> พักร้อน
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[#0A2540] shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> WFH
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 text-violet-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> WFA
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-teal-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> นอกสถานที่
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-900 shrink-0 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> วันหยุด
            </span>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200/80 bg-slate-100/70 text-center text-xs sm:text-sm font-extrabold text-slate-700 py-2 sm:py-3">
            {WEEKDAYS.map((day, idx) => (
              <div
                key={day}
                className={
                  idx === 0
                    ? 'text-rose-600 bg-rose-50/50'
                    : idx === 6
                      ? 'text-blue-600 bg-blue-50/40'
                      : 'text-slate-800'
                }
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {calendarCells.map((cell, idx) => {
              if (!cell.dateStr || !cell.dayNumber) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[64px] sm:min-h-[135px] border-b border-r border-slate-100 bg-slate-50/40"
                  />
                );
              }

              const isSelected = cell.dateStr === selectedDate;
              const isToday =
                cell.dateStr ===
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
                  2,
                  '0'
                )}-${String(now.getDate()).padStart(2, '0')}`;

              const maxBadges = 3;
              const leaveBadges = cell.dayLeaves.slice(0, maxBadges);
              const hiddenCount = cell.dayLeaves.length - leaveBadges.length;

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => {
                    setSelectedDate(cell.dateStr!);
                  }}
                  className={`min-h-[64px] sm:min-h-[135px] border-b border-r border-slate-100 p-1 sm:p-2.5 transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-50/90 ring-2 ring-inset ring-blue-600'
                      : cell.holiday
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                        : cell.isWeekend
                          ? 'bg-slate-50/70 hover:bg-slate-100/60'
                          : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* Day Number + Counters */}
                  <div className="flex items-center justify-between gap-0.5 sm:gap-1">
                    <span
                      className={`inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-xs sm:text-sm font-black ${
                        isToday
                          ? 'bg-[#0066FF] text-white shadow-xs'
                          : cell.isWeekend
                            ? 'text-rose-500'
                            : 'text-slate-800'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {cell.dayLeaves.length > 0 && (
                      <span className="hidden sm:inline-block rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700">
                        ลา {cell.dayLeaves.length}
                      </span>
                    )}
                  </div>

                  {/* Leaves List inside cell */}
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {/* Desktop & Tablet: Badges */}
                    <div className="hidden sm:block space-y-1">
                      {cell.holiday && (
                        <div
                          className="truncate rounded-lg bg-emerald-100 border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-800"
                          title={cell.holiday.name}
                        >
                          🎉 {cell.holiday.name}
                        </div>
                      )}

                      {/* Leave badges */}
                      {leaveBadges.map((lv) => {
                        const typeMeta = LEAVE_TYPE_META[lv.leaveType];
                        const isPending = lv.status !== 'approved';
                        return (
                          <div
                            key={lv.id}
                            className={`truncate rounded-lg border px-2 py-1 text-xs font-semibold flex items-center justify-between gap-1 ${
                              typeMeta.badgeClass
                            } ${isPending ? 'border-dashed opacity-85' : ''}`}
                            title={`${lv.userName} (${typeMeta.label} - ${
                              DURATION_TYPE_META[lv.durationType].shortLabel
                            })`}
                          >
                            <span className="truncate">
                              {lv.userName.split(' ')[0]}
                            </span>
                            <span className="shrink-0 text-xs font-semibold opacity-85 hidden md:inline">
                              {lv.durationType === 'full'
                                ? typeMeta.shortLabel
                                : DURATION_TYPE_META[lv.durationType].shortLabel}
                            </span>
                          </div>
                        );
                      })}

                      {hiddenCount > 0 && (
                        <div className="text-xs font-bold text-blue-600 pl-1">
                          + อีก {hiddenCount} คน
                        </div>
                      )}
                    </div>

                    {/* Mobile (< 640px): Indicator dots */}
                    <div className="sm:hidden flex flex-wrap items-center justify-center gap-1 mt-0.5">
                      {cell.holiday && (
                        <span
                          className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 ring-1 ring-emerald-300"
                          title={`วันหยุด: ${cell.holiday.name}`}
                        />
                      )}
                      {cell.dayLeaves.slice(0, 3).map((lv) => {
                        const dotColor =
                          lv.leaveType === 'sick'
                            ? 'bg-rose-500'
                            : lv.leaveType === 'personal'
                              ? 'bg-amber-500'
                              : lv.leaveType === 'vacation'
                                ? 'bg-sky-500'
                                : lv.leaveType === 'wfh'
                                  ? 'bg-blue-500'
                                  : lv.leaveType === 'offsite'
                                    ? 'bg-teal-500'
                                    : 'bg-violet-500';
                        return (
                          <span
                            key={lv.id}
                            className={`h-2 w-2 rounded-full shrink-0 ${dotColor} ring-1 ring-white`}
                            title={`${lv.userName} - ${LEAVE_TYPE_META[lv.leaveType]?.label}`}
                          />
                        );
                      })}
                      {cell.dayLeaves.length > 3 && (
                        <span className="text-xs font-black text-slate-600 leading-normal">
                          +{cell.dayLeaves.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile Quick Inspector Scroll Anchor */}
          <button
            type="button"
            onClick={() => {
              document.getElementById('selected-day-inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="w-full xl:hidden bg-blue-50/90 hover:bg-blue-100 border-t border-blue-100 p-3 text-center text-xs font-bold text-blue-800 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-99 min-h-[44px]"
          >
            <span>👇 ดูรายละเอียด {formatThaiDate(selectedDate)} (มี {selectedDayInfo.dayLeaves.length} รายการ)</span>
          </button>
        </div>

        {/* Right Column: Selected Date Details */}
        <div id="selected-day-inspector" className="xl:col-span-4 rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/90 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                รายละเอียดวันที่เลือก
              </div>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">
                {formatThaiDate(selectedDate)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenRequestModal(selectedDate)}
              className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-100 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>ทำรายการวันนี้</span>
            </button>
          </div>

          {selectedDayInfo.holiday && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs sm:text-sm text-emerald-950 flex items-start gap-3 shadow-2xs">
              <Sparkles className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-emerald-950">วันหยุดนักขัตฤกษ์ / วันหยุดบริษัท</div>
                <div className="mt-0.5 font-bold text-emerald-900">{selectedDayInfo.holiday.name}</div>
                <div className="text-xs text-emerald-700 mt-1 font-medium">
                  * ระบบตัดวันนี้ออกจากการคำนวณวันลาอัตโนมัติ (ไม่เสียโควต้าวันลา)
                </div>
              </div>
            </div>
          )}

          {selectedDayInfo.isWeekend && !selectedDayInfo.holiday && (
            <div className="rounded-2xl bg-slate-100/90 border border-slate-200 px-4 py-3 text-xs sm:text-sm text-slate-700 flex items-center justify-between">
              <strong className="font-bold text-slate-900">วันหยุดสุดสัปดาห์ (เสาร์ - อาทิตย์)</strong>
              <span className="text-xs text-slate-500 font-medium">ไม่นับเป็นวันลา</span>
            </div>
          )}

          {/* Leaves on Selected Date */}
          <div className="space-y-3">
            <div className="text-sm font-black text-slate-900 flex items-center justify-between">
              <span>
                ผู้ลางาน / WFH / ปฏิบัติงานนอกสถานที่ ({selectedDayInfo.dayLeaves.length} คน)
              </span>
            </div>

            {selectedDayInfo.dayLeaves.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 px-4 text-center text-sm text-slate-400 font-medium">
                ไม่มีรายการลางานหรือปฏิบัติงานนอกสถานที่ในวันที่เลือก
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {selectedDayInfo.dayLeaves.map((lv) => {
                  const typeMeta =
                    LEAVE_TYPE_META[lv.leaveType] || LEAVE_TYPE_META.vacation;
                  const durMeta =
                    DURATION_TYPE_META[lv.durationType] ||
                    DURATION_TYPE_META.full;
                  const statusMeta =
                    STATUS_META[lv.status] || STATUS_META.pending_manager;
                  return (
                    <div
                      key={lv.id}
                      className="rounded-2xl border border-slate-200 p-4 space-y-2.5 bg-slate-50/70"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-base text-slate-900">
                            {lv.userName}
                          </div>
                          <div className="text-xs text-slate-500 font-medium">
                            แผนก {lv.department}
                          </div>
                        </div>
                        <span
                          className={`rounded-xl border px-2.5 py-1 text-xs font-bold ${typeMeta.badgeClass}`}
                        >
                          {typeMeta.shortLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 font-semibold">
                          <Clock className="h-3.5 w-3.5 text-blue-600" />
                          {durMeta.label} (รวม {lv.totalDays} วัน)
                        </span>
                        <span
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.shortLabel}
                        </span>
                      </div>

                      <div className="text-xs sm:text-sm text-slate-700 bg-white rounded-xl p-3 border border-slate-100 space-y-1.5 font-medium">
                        {lv.locationDetail && (
                          <div className="font-bold text-teal-800">
                            📍 สถานที่/ลูกค้า: {lv.locationDetail}
                          </div>
                        )}
                        {lv.isRedacted ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 italic">
                            <EyeOff className="h-4 w-4" />
                            <span>
                              เหตุผลส่วนตัว (ซ่อนข้อมูลสำหรับเพื่อนร่วมแผนกตาม PDPA)
                            </span>
                          </span>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-900">
                              รายละเอียด:{' '}
                            </span>
                            <span>{lv.reason}</span>
                          </div>
                        )}

                        {!lv.isRedacted && lv.attachmentUrl && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            {lv.attachmentUrl.startsWith('data:image/') ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewAttachment({
                                    url: lv.attachmentUrl!,
                                    name:
                                      lv.attachmentName || 'ใบรับรองแพทย์แนบ',
                                  })
                                }
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold cursor-pointer"
                              >
                                <FileText className="h-4 w-4" />
                                <span>
                                  ดูรูปใบรับรองแพทย์ (
                                  {lv.attachmentName || 'คลิกเพื่อขยาย'})
                                </span>
                              </button>
                            ) : (
                              <a
                                href={lv.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold"
                              >
                                <FileText className="h-4 w-4" />
                                <span>
                                  ดูเอกสารแนบ / ใบรับรองแพทย์ (
                                  {lv.attachmentName || 'เปิดดูไฟล์'})
                                </span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Preview Medical Certificate Image */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-w-lg w-full rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span>{previewAttachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 rounded-xl p-3 border border-slate-200/80 max-h-[70vh] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAttachment.url}
                alt={previewAttachment.name}
                className="max-w-full h-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

