'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  getBangkokNow,
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
  const todayStr = useMemo(() => getBangkokNow().dateStr, []);
  const [viewYear, setViewYear] = useState<number>(() => getBangkokNow().year);
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const [, m] = getBangkokNow().dateStr.split('-').map(Number);
    return m - 1;
  }); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getBangkokNow().dateStr;
  });
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'APPROVED_ONLY'>(
    'ACTIVE'
  );
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!previewAttachment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewAttachment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewAttachment]);

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
      if (l.leaveType === 'offsite') return false;
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
    const bkk = getBangkokNow();
    setViewYear(bkk.year);
    const [, m] = bkk.dateStr.split('-').map(Number);
    setViewMonth(m - 1);
    setSelectedDate(bkk.dateStr);
  };

  return (
    <div className="space-y-5">
      {/* Main Layout: Calendar Grid (Left 8 cols) + Sticky Selected Day Inspector (Right 4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Calendar Grid Card */}
        <div className="xl:col-span-8 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] border border-slate-200/75 overflow-hidden">
          {/* Calendar Toolbar: Month Navigation & Minimal Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 px-4 sm:px-5 py-3.5 bg-white">
            {/* Month Navigation */}
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="rounded-xl border border-slate-200/80 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center active:scale-95 shrink-0"
                  aria-label="เดือนก่อนหน้า"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-base sm:text-[17px] font-bold text-slate-900 min-w-[138px] sm:min-w-[164px] text-center tracking-tight tabular-nums">
                  {THAI_MONTHS[viewMonth]} {viewYear}
                </h3>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="rounded-xl border border-slate-200/80 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center active:scale-95 shrink-0"
                  aria-label="เดือนถัดไป"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleToday}
                className="rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition cursor-pointer min-h-[36px] shrink-0 active:scale-95"
              >
                วันนี้
              </button>
            </div>

            {/* Controls: Department & Status Filters + Quick Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {(currentUser.role === 'admin' ||
                currentUser.role === 'hr' ||
                currentUser.role === 'c_level') && (
                <div className="relative flex items-center bg-slate-50/70 border border-slate-200/80 rounded-xl min-h-[36px] hover:border-slate-300 focus-within:border-[#0066FF] focus-within:bg-white transition">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute left-2.5" />
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="appearance-none bg-transparent pl-8 pr-7 py-1.5 font-semibold text-slate-700 focus:outline-hidden cursor-pointer text-xs"
                    aria-label="กรองตามแผนก"
                  >
                    <option value="ALL">ทุกแผนก</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute right-2" />
                </div>
              )}

              <div className="relative flex items-center bg-slate-50/70 border border-slate-200/80 rounded-xl min-h-[36px] hover:border-slate-300 focus-within:border-[#0066FF] focus-within:bg-white transition">
                <Filter className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute left-2.5" />
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'ACTIVE' | 'APPROVED_ONLY')
                  }
                  className="appearance-none bg-transparent pl-8 pr-7 py-1.5 font-semibold text-slate-700 focus:outline-hidden cursor-pointer text-xs"
                  aria-label="กรองตามสถานะใบลา"
                >
                  <option value="ACTIVE">ทั้งหมดที่ใช้งาน</option>
                  <option value="APPROVED_ONLY">เฉพาะที่อนุมัติแล้ว</option>
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute right-2" />
              </div>

              {onOpenPolicyModal && (
                <button
                  type="button"
                  onClick={onOpenPolicyModal}
                  className="rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 px-2.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                  title="ดูเงื่อนไขและระเบียบการลางาน"
                >
                  <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                  <span className="hidden sm:inline">เงื่อนไข</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenRequestModal(selectedDate)}
                className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer min-h-[36px] active:scale-95"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                <span>+ ยื่นใบลา</span>
              </button>
            </div>
          </div>

          {/* Minimal Color Legend Bar */}
          <div className="flex items-center gap-3.5 text-[11px] font-medium text-slate-500 overflow-x-auto no-scrollbar momentum-scroll px-4 sm:px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex-nowrap sm:flex-wrap">
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> ลาป่วย
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> ลากิจ
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> พักร้อน
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-[#0066FF]" /> WFH
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> WFA
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> วันหยุด
            </span>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-white text-center text-xs font-semibold py-2.5">
            {WEEKDAYS.map((day, idx) => (
              <div
                key={day}
                className={
                  idx === 0
                    ? 'text-rose-500'
                    : idx === 6
                      ? 'text-blue-500'
                      : 'text-slate-400'
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
                    className="min-h-[60px] sm:min-h-[124px] border-b border-r border-slate-100 [&:nth-child(7n)]:border-r-0 bg-slate-50/35"
                  />
                );
              }

              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === todayStr;

              const maxBadges = 3;
              const leaveBadges = cell.dayLeaves.slice(0, maxBadges);
              const hiddenCount = cell.dayLeaves.length - leaveBadges.length;

              return (
                <div
                  key={cell.dateStr}
                  role="button"
                  tabIndex={0}
                  aria-label={`วันที่ ${formatThaiDate(cell.dateStr)}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedDate(cell.dateStr!);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDate(cell.dateStr!);
                    }
                  }}
                  className={`min-h-[60px] sm:min-h-[124px] border-b border-r border-slate-100 [&:nth-child(7n)]:border-r-0 p-1.5 sm:p-2 transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-50/55 ring-2 ring-inset ring-[#0066FF]/75'
                      : cell.holiday
                        ? 'bg-emerald-50/30 hover:bg-emerald-50/55'
                        : cell.isWeekend
                          ? 'bg-slate-50/55 hover:bg-slate-100/50'
                          : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  {/* Day Number + Counters */}
                  <div className="flex items-center justify-center sm:justify-between gap-0.5 sm:gap-1">
                    <span
                      className={`inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        isToday
                          ? 'bg-[#0066FF] text-white font-bold shadow-xs'
                          : cell.isWeekend
                            ? 'text-rose-400'
                            : 'text-slate-700'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {cell.dayLeaves.length > 0 && (
                      <span className="hidden sm:inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 tabular-nums">
                        {cell.dayLeaves.length}
                      </span>
                    )}
                  </div>

                  {/* Leaves List inside cell */}
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {/* Desktop & Tablet: Compact Clean Badges */}
                    <div className="hidden sm:block space-y-1">
                      {cell.holiday && (
                        <div
                          className="truncate rounded-md bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
                          title={cell.holiday.name}
                        >
                          {cell.holiday.name}
                        </div>
                      )}

                      {/* Leave badges */}
                      {leaveBadges.map((lv) => {
                        const typeMeta = LEAVE_TYPE_META[lv.leaveType];
                        const isPending = lv.status !== 'approved';
                        return (
                          <div
                            key={lv.id}
                            className={`truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium flex items-center justify-between gap-1 ${
                              typeMeta.badgeClass
                            } ${isPending ? 'border-dashed opacity-80' : ''}`}
                            title={`${lv.userName} (${typeMeta.label} - ${
                              DURATION_TYPE_META[lv.durationType].shortLabel
                            })`}
                          >
                            <span className="truncate font-semibold">
                              {lv.userName.split(' ')[0]}
                            </span>
                            <span className="shrink-0 text-[10px] opacity-80 hidden md:inline">
                              {lv.durationType === 'full'
                                ? typeMeta.shortLabel
                                : DURATION_TYPE_META[lv.durationType].shortLabel}
                            </span>
                          </div>
                        );
                      })}

                      {hiddenCount > 0 && (
                        <div className="text-[11px] font-semibold text-[#0066FF] pl-1">
                          + อีก {hiddenCount} คน
                        </div>
                      )}
                    </div>

                    {/* Mobile (< 640px): Indicator dots */}
                    <div className="sm:hidden flex flex-wrap items-center justify-center gap-1 mt-0.5">
                      {cell.holiday && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
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
                                  ? 'bg-[#0066FF]'
                                  : lv.leaveType === 'offsite'
                                    ? 'bg-teal-500'
                                    : 'bg-violet-500';
                        return (
                          <span
                            key={lv.id}
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
                            title={`${lv.userName} - ${LEAVE_TYPE_META[lv.leaveType]?.label}`}
                          />
                        );
                      })}
                      {cell.dayLeaves.length > 3 && (
                        <span className="text-[10px] font-bold text-slate-500 leading-none tabular-nums">
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
            className="w-full xl:hidden bg-slate-50/90 hover:bg-blue-50/60 border-t border-slate-100 p-3 text-center text-xs font-semibold text-[#0066FF] transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
          >
            <span>ดูรายละเอียดวันที่เลือก ({selectedDayInfo.dayLeaves.length} รายการ)</span>
          </button>
        </div>

        {/* Right Column: Sticky Selected Date Details */}
        <div
          id="selected-day-inspector"
          className="xl:col-span-4 xl:sticky xl:top-20 rounded-2xl bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] border border-slate-200/75 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                รายละเอียดวันที่เลือก
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-0.5">
                {formatThaiDate(selectedDate)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenRequestModal(selectedDate)}
              className="rounded-xl bg-blue-50 border border-blue-200/70 px-3 py-2 text-xs font-semibold text-[#0066FF] hover:bg-blue-100/80 transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>ทำรายการวันนี้</span>
            </button>
          </div>

          {selectedDayInfo.holiday && (
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 px-3.5 py-2.5 text-xs sm:text-sm text-emerald-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold truncate">{selectedDayInfo.holiday.name}</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold bg-white/80 border border-emerald-200/70 px-2 py-0.5 rounded-md shrink-0">
                วันหยุด
              </span>
            </div>
          )}

          {selectedDayInfo.isWeekend && !selectedDayInfo.holiday && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
              <strong className="font-semibold text-slate-800">วันหยุดสุดสัปดาห์</strong>
              <span className="text-slate-400">เสาร์ - อาทิตย์</span>
            </div>
          )}

          {/* Leaves on Selected Date */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
              <span>รายการลางานและปฏิบัติงาน</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                {selectedDayInfo.dayLeaves.length} รายการ
              </span>
            </div>

            {selectedDayInfo.dayLeaves.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-10 px-4 text-center text-xs sm:text-sm text-slate-400">
                ไม่มีรายการวันลาหรือ WFH/WFA ในวันนี้
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto momentum-scroll pr-0.5">
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
                      className="rounded-xl border border-slate-200/75 p-3.5 space-y-2.5 bg-slate-50/40 hover:bg-slate-50/80 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">
                            {lv.userName}
                          </div>
                          <div className="text-xs text-slate-400">
                            แผนก {lv.department}
                          </div>
                        </div>
                        <span
                          className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${typeMeta.badgeClass}`}
                        >
                          {typeMeta.shortLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200/80 px-2 py-0.5 font-medium tabular-nums">
                          <Clock className="h-3 w-3 text-[#0066FF]" />
                          {durMeta.label} (รวม {lv.totalDays} วัน)
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 font-semibold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.shortLabel}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 bg-white rounded-lg p-2.5 border border-slate-100 space-y-1.5">
                        {lv.locationDetail && (
                          <div className="font-semibold text-teal-700">
                            สถานที่/ลูกค้า: {lv.locationDetail}
                          </div>
                        )}
                        {lv.isRedacted ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 italic">
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>
                              เหตุผลส่วนตัว (ซ่อนข้อมูลตาม PDPA)
                            </span>
                          </span>
                        ) : (
                          <div>
                            <span className="font-semibold text-slate-800">
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
                                className="inline-flex items-center gap-1 text-[#0066FF] hover:underline font-semibold cursor-pointer"
                              >
                                <FileText className="h-3.5 w-3.5" />
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
                                className="inline-flex items-center gap-1 text-[#0066FF] hover:underline font-semibold"
                              >
                                <FileText className="h-3.5 w-3.5" />
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
          role="dialog"
          aria-modal="true"
          aria-label="ดูเอกสารแนบ"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4 animate-ui-fade"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-w-lg w-full rounded-2xl bg-white p-5 shadow-2xl border border-slate-200/80 space-y-3 animate-ui-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="font-semibold text-sm text-slate-900 flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-[#0066FF] shrink-0" />
                <span className="truncate">{previewAttachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer shrink-0"
              >
                ปิดหน้าต่าง
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 rounded-xl p-3 border border-slate-200/70 max-h-[70vh] overflow-auto">
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

