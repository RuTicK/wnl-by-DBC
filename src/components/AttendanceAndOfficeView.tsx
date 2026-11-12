'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Home,
  LogOut,
  MapPin,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  formatThaiDate,
  getProbationInfo,
  LEAVE_TYPE_META,
  ROLE_META,
  WORK_LOCATION_META,
} from '@/lib/leave-utils';
import {
  AttendanceRecord,
  COMPANY_DEPARTMENTS,
  LeaveRequest,
  SafeUser,
  WorkLocationType,
} from '@/lib/types';

interface AttendanceAndOfficeViewProps {
  currentUser: SafeUser;
  users: SafeUser[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  onCheckIn: (payload: {
    date?: string;
    checkInTime?: string;
    workLocation: WorkLocationType;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onCheckOut: (payload: {
    date?: string;
    checkOutTime?: string;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export default function AttendanceAndOfficeView({
  currentUser,
  users,
  attendance,
  leaves,
  onCheckIn,
  onCheckOut,
}: AttendanceAndOfficeViewProps) {
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [note, setNote] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showLocationPicker, setShowLocationPicker] = useState<boolean>(false);
  const [liveTime, setLiveTime] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [mobileBoardTab, setMobileBoardTab] = useState<'office' | 'remote' | 'leaves'>('office');

  // Real-time clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const myProbation = useMemo(() => {
    const info = getProbationInfo(currentUser.startDate, todayStr);
    if (currentUser.role === 'c_level' || currentUser.role === 'admin') {
      return { ...info, passed: true, daysRemaining: 0 };
    }
    return info;
  }, [currentUser.role, currentUser.startDate, todayStr]);

  const myTodayRecord = useMemo(
    () =>
      attendance.find(
        (a) => a.userId === currentUser.id && a.date === todayStr
      ),
    [attendance, currentUser.id, todayStr]
  );

  const departments = useMemo(() => {
    const set = new Set<string>(COMPANY_DEPARTMENTS);
    users.forEach((u) => {
      const dept = (u.department || '').trim();
      if (dept) set.add(dept);
    });
    return Array.from(set);
  }, [users]);

  // คำนวณสถานะพนักงานทุกคนในวันที่เลือก (ใครอยู่ Office / WFH / WFA / ออกนอกสถานที่ / ลางาน / ยังไม่ Check-in)
  const dailyBoard = useMemo(() => {
    const dayAttendanceMap = new Map<string, AttendanceRecord>();
    for (const a of attendance) {
      if (a.date === selectedDate) {
        dayAttendanceMap.set(a.userId, a);
      }
    }

    const activeDayLeaves = leaves.filter(
      (l) =>
        (l.status === 'approved' ||
          l.status === 'pending_hr' ||
          l.status === 'pending_manager' ||
          l.status === 'pending_c_level') &&
        l.startDate <= selectedDate &&
        l.endDate >= selectedDate
    );

    const filteredUsers = users.filter((u) => {
      if (deptFilter !== 'ALL' && (u.department || '').trim() !== deptFilter)
        return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.englishName || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q)
      );
    });

    const inOffice: { user: SafeUser; record: AttendanceRecord }[] = [];
    const remoteWfhWfa: {
      user: SafeUser;
      record?: AttendanceRecord;
      leave?: LeaveRequest;
      locationType: 'wfh' | 'wfa';
    }[] = [];
    const offsiteClient: {
      user: SafeUser;
      record?: AttendanceRecord;
      leave?: LeaveRequest;
    }[] = [];
    const onLeave: { user: SafeUser; leave: LeaveRequest }[] = [];
    const notCheckedIn: SafeUser[] = [];

    for (const u of filteredUsers) {
      const att = dayAttendanceMap.get(u.id);
      const userLeave = activeDayLeaves.find((l) => l.userId === u.id);

      if (att) {
        if (att.workLocation === 'office') {
          inOffice.push({ user: u, record: att });
        } else if (att.workLocation === 'wfh' || att.workLocation === 'wfa') {
          remoteWfhWfa.push({
            user: u,
            record: att,
            leave: userLeave,
            locationType: att.workLocation,
          });
        } else if (att.workLocation === 'offsite') {
          offsiteClient.push({ user: u, record: att, leave: userLeave });
        }
      } else if (userLeave) {
        if (userLeave.leaveType === 'wfh' || userLeave.leaveType === 'wfa') {
          remoteWfhWfa.push({
            user: u,
            leave: userLeave,
            locationType: userLeave.leaveType,
          });
        } else if (userLeave.leaveType === 'offsite') {
          offsiteClient.push({ user: u, leave: userLeave });
        } else {
          onLeave.push({ user: u, leave: userLeave });
        }
      } else {
        notCheckedIn.push(u);
      }
    }

    return {
      inOffice,
      remoteWfhWfa,
      offsiteClient,
      onLeave,
      notCheckedIn,
      totalFiltered: filteredUsers.length,
    };
  }, [users, attendance, leaves, selectedDate, deptFilter, searchQuery]);

  const getElapsedDuration = (inTimeStr: string, outTimeStr?: string): string => {
    if (!inTimeStr) return '';
    const [inH, inM] = inTimeStr.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM)) return '';
    let endH: number;
    let endM: number;
    if (outTimeStr) {
      const [oH, oM] = outTimeStr.split(':').map(Number);
      if (isNaN(oH) || isNaN(oM)) return '';
      endH = oH;
      endM = oM;
    } else {
      const now = new Date();
      endH = now.getHours();
      endM = now.getMinutes();
    }
    const totalMinutes = Math.max(0, (endH * 60 + endM) - (inH * 60 + inM));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} นาที`;
    return `${hours} ชม. ${minutes} นาที`;
  };

  const handleToggleLocationPicker = () => {
    setShowLocationPicker((prev) => {
      const next = !prev;
      if (next && myTodayRecord?.note && !note) {
        setNote(myTodayRecord.note);
      }
      return next;
    });
  };

  const handleDirectCheckIn = async (loc: WorkLocationType) => {
    setFeedback(null);
    if (!myProbation.passed && (loc === 'wfh' || loc === 'wfa')) {
      setFeedback({
        type: 'error',
        message: `ช่วงทดลองงาน (< 120 วัน) ยังไม่สามารถเลือกลงเวลา WFH หรือ WFA ได้ (เริ่มงาน ${formatThaiDate(myProbation.startDate, true)} ผ่านโปร ${formatThaiDate(myProbation.passDate, true)})`,
      });
      return;
    }
    if (loc === 'offsite' && !note.trim()) {
      setShowLocationPicker(true);
      setFeedback({
        type: 'error',
        message: 'กรุณาระบุสถานที่ / ชื่อลูกค้า ในช่องหมายเหตุด้านล่างก่อนกด Check-in นอกสถานที่',
      });
      setTimeout(() => {
        document.getElementById('attendance-note')?.focus();
      }, 100);
      return;
    }
    setSubmitting(true);
    try {
      const res = await onCheckIn({
        date: todayStr,
        workLocation: loc,
        note: note.trim() || undefined,
      });
      if (!res.success) {
        setFeedback({
          type: 'error',
          message: res.error || 'ไม่สามารถบันทึก Check-in ได้',
        });
      } else {
        setFeedback({
          type: 'success',
          message: `ลงเวลา Check-in สำเร็จ (${WORK_LOCATION_META[loc].label})`,
        });
        setNote('');
        setShowLocationPicker(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOutClick = async () => {
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await onCheckOut({
        date: todayStr,
        note: note.trim() || undefined,
      });
      if (!res.success) {
        setFeedback({
          type: 'error',
          message: res.error || 'ไม่สามารถบันทึก Check-out ได้',
        });
      } else {
        setFeedback({
          type: 'success',
          message: 'ลงเวลา Check-out เลิกงานเรียบร้อยแล้ว',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">

      {feedback && (
        <div
          className={`rounded-2xl border p-4 text-xs sm:text-sm font-bold flex items-center justify-between shadow-2xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline ml-4 cursor-pointer font-bold text-xs"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Top Grid: Left = Huge Check-in/Check-out Hero (5 cols), Right = Office Summary KPIs (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: My Check-in / Check-out Hero Card */}
        <div className="lg:col-span-5 rounded-3xl bg-white p-4 sm:p-7 border border-slate-200/90 shadow-md flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header: Date + Live Clock Display */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  ลงเวลาเข้า-ออกงาน ({formatThaiDate(todayStr, true)})
                </span>
                <h3 className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5">
                  คุณ {currentUser.name}
                  {currentUser.englishName && (
                    <span className="text-xs sm:text-sm font-medium text-slate-500 ml-1.5">
                      ({currentUser.englishName})
                    </span>
                  )}
                </h3>
              </div>

              {/* Big Digital Clock Display */}
              <div className="flex items-center justify-center gap-2 self-stretch sm:self-center bg-blue-50 border border-blue-200 px-4 py-2 rounded-2xl shadow-2xs">
                <Clock className="h-5 w-5 text-blue-600 animate-pulse shrink-0" />
                <span className="font-mono text-base sm:text-lg font-black text-slate-900 tracking-wide">
                  {liveTime || 'กำลังโหลด...'}
                </span>
              </div>
            </div>

            {!myProbation.passed && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs sm:text-sm text-amber-900 leading-relaxed shadow-2xs">
                <strong>⚠️ สถานะทดลองงาน (ยังไม่ครบ 120 วัน):</strong> เริ่มงาน{' '}
                {formatThaiDate(myProbation.startDate, true)} (เหลืออีก{' '}
                {myProbation.daysRemaining} วัน) • สามารถลงเวลา{' '}
                <strong>เข้า Office</strong> หรือ{' '}
                <strong>ทำงานนอกสถานที่ (พบลูกค้า/ออกบูธ)</strong> ได้ตามปกติ
              </div>
            )}

            {/* If Already Checked in Today */}
            {myTodayRecord ? (
              <div className="space-y-4">
                <div className="rounded-3xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/90 via-teal-50/60 to-white p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-emerald-800">
                          สถานะวันนี้ของคุณ:
                        </div>
                        <div className="text-lg sm:text-xl font-black text-slate-900">
                          {myTodayRecord.checkOutTime
                            ? 'เลิกงานเรียบร้อยแล้ว'
                            : 'เข้างานเรียบร้อยแล้ว'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded-2xl border px-3.5 py-1.5 text-xs sm:text-sm font-bold shadow-2xs ${
                        WORK_LOCATION_META[myTodayRecord.workLocation].badgeClass
                      }`}
                    >
                      {WORK_LOCATION_META[myTodayRecord.workLocation].label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 text-xs sm:text-sm text-slate-700">
                    <div className="rounded-2xl bg-white/95 p-3.5 border border-emerald-100 shadow-2xs">
                      <div className="text-slate-400 font-semibold text-xs">เวลาเข้างาน</div>
                      <div className="text-lg sm:text-xl font-black text-emerald-800 font-mono mt-0.5">
                        {myTodayRecord.checkInTime} น.
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/95 p-3.5 border border-emerald-100 shadow-2xs">
                      <div className="text-slate-400 font-semibold text-xs">เวลาออกงาน / ปฏิบัติงาน</div>
                      <div className="text-lg sm:text-xl font-black font-mono mt-0.5 text-slate-800">
                        {myTodayRecord.checkOutTime
                          ? `${myTodayRecord.checkOutTime} น.`
                          : `ทำงานแล้ว ${getElapsedDuration(myTodayRecord.checkInTime)}`}
                      </div>
                    </div>
                  </div>

                  {myTodayRecord.note && (
                    <div className="rounded-2xl bg-white/95 p-3.5 text-xs sm:text-sm text-slate-700 border border-emerald-100 shadow-2xs">
                      <span className="font-bold text-slate-900">หมายเหตุ / สถานที่:</span>{' '}
                      {myTodayRecord.note}
                    </div>
                  )}

                  {/* Check-Out Button if not yet checked out */}
                  {!myTodayRecord.checkOutTime ? (
                    <div className="space-y-2.5 pt-1">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleCheckOutClick}
                        className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-rose-600 via-rose-700 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-base sm:text-lg shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
                      >
                        <LogOut className="h-6 w-6" />
                        <span>
                          {submitting ? 'กำลังบันทึกเวลา...' : 'กด Check-out เลิกงาน'}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-3 px-4 text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-100/80 rounded-2xl">
                      🎉 บันทึกเวลาครบถ้วนแล้ว (รวม {getElapsedDuration(myTodayRecord.checkInTime, myTodayRecord.checkOutTime)}) พักผ่อนให้สบายใจครับ!
                    </div>
                  )}
                </div>

                {/* Toggle to update location/note */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleToggleLocationPicker}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer min-h-[44px] px-3 py-2 rounded-xl transition"
                  >
                    {showLocationPicker ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        <span>ซ่อนแบบฟอร์มแก้ไขสถานที่</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        <span>ต้องการเปลี่ยนสถานที่ หรือ แก้ไขหมายเหตุวันนี้?</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Direct Check-In Actions (Shown if NOT checked in, OR if user toggled to update) */}
            {(!myTodayRecord || showLocationPicker) && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="block text-sm sm:text-base font-extrabold text-slate-800">
                      {myTodayRecord
                        ? 'เลือกสถานที่ทำงานใหม่ หรือ อัปเดตหมายเหตุ:'
                        : 'เลือกสถานที่เพื่อลงเวลาเข้างาน:'}
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
                    {/* 1. Office Button */}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDirectCheckIn('office')}
                      className={`rounded-2xl border-2 p-3.5 sm:p-4 text-left transition min-h-[82px] sm:min-h-[88px] flex flex-col justify-between shadow-2xs hover:shadow-md active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed ${
                        myTodayRecord?.workLocation === 'office'
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/50'
                          : 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white hover:bg-emerald-100/80 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                            <Building2 className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </div>
                          <span className="font-black text-sm sm:text-base text-emerald-950 truncate">
                            เข้า Office
                          </span>
                        </div>
                        {myTodayRecord?.workLocation === 'office' && (
                          <span className="rounded-lg bg-emerald-700 text-white text-xs font-bold px-2 py-0.5 shadow-2xs shrink-0">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-emerald-700 font-semibold mt-1 truncate">
                        {submitting ? 'กำลังบันทึก...' : 'สำนักงาน'}
                      </div>
                    </button>

                    {/* 2. WFH Button */}
                    <button
                      type="button"
                      disabled={submitting || !myProbation.passed}
                      onClick={() => handleDirectCheckIn('wfh')}
                      className={`rounded-2xl border-2 p-3.5 sm:p-4 text-left transition min-h-[82px] sm:min-h-[88px] flex flex-col justify-between shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed ${
                        !myProbation.passed
                          ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                          : myTodayRecord?.workLocation === 'wfh'
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400/50 cursor-pointer hover:shadow-md active:scale-98'
                            : 'border-blue-300 bg-gradient-to-br from-blue-50 via-sky-50/50 to-white hover:bg-blue-100/80 cursor-pointer hover:shadow-md active:scale-98'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-[#0066FF] text-white shadow-2xs shrink-0">
                            <Home className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </div>
                          <span className="font-black text-sm sm:text-base text-slate-900 truncate">
                            WFH
                          </span>
                        </div>
                        {myTodayRecord?.workLocation === 'wfh' && (
                          <span className="rounded-lg bg-blue-700 text-white text-xs font-bold px-2 py-0.5 shadow-2xs shrink-0">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-blue-700 font-semibold mt-1 truncate">
                        {!myProbation.passed
                          ? 'รอผ่านโปร 120 วัน'
                          : submitting
                            ? 'กำลังบันทึก...'
                            : 'ทำงานที่บ้าน'}
                      </div>
                    </button>

                    {/* 3. Offsite Button */}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDirectCheckIn('offsite')}
                      className={`rounded-2xl border-2 p-3.5 sm:p-4 text-left transition min-h-[82px] sm:min-h-[88px] flex flex-col justify-between shadow-2xs hover:shadow-md active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed ${
                        myTodayRecord?.workLocation === 'offsite'
                          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-400/50'
                          : 'border-teal-300 bg-gradient-to-br from-teal-50 via-emerald-50/50 to-white hover:bg-teal-100/80 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                           <div className="p-2 rounded-xl bg-teal-600 text-white shadow-2xs shrink-0">
                            <Briefcase className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </div>
                          <span className="font-black text-sm sm:text-base text-teal-950 truncate">
                            นอกสถานที่
                          </span>
                        </div>
                        {myTodayRecord?.workLocation === 'offsite' && (
                          <span className="rounded-lg bg-teal-700 text-white text-xs font-bold px-2 py-0.5 shadow-2xs shrink-0">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-teal-700 font-semibold mt-1 truncate">
                        {submitting ? 'กำลังบันทึก...' : 'พบลูกค้า/ออกบูธ'}
                      </div>
                    </button>

                    {/* 4. WFA Button */}
                    <button
                      type="button"
                      disabled={submitting || !myProbation.passed}
                      onClick={() => handleDirectCheckIn('wfa')}
                      className={`rounded-2xl border-2 p-3.5 sm:p-4 text-left transition min-h-[82px] sm:min-h-[88px] flex flex-col justify-between shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed ${
                        !myProbation.passed
                          ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                          : myTodayRecord?.workLocation === 'wfa'
                            ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-400/50 cursor-pointer hover:shadow-md active:scale-98'
                            : 'border-violet-300 bg-gradient-to-br from-violet-50 via-purple-50/50 to-white hover:bg-violet-100/80 cursor-pointer hover:shadow-md active:scale-98'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-violet-600 text-white shadow-2xs shrink-0">
                            <Globe className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </div>
                          <span className="font-black text-sm sm:text-base text-violet-950 truncate">
                            WFA
                          </span>
                        </div>
                        {myTodayRecord?.workLocation === 'wfa' && (
                          <span className="rounded-lg bg-violet-700 text-white text-xs font-bold px-2 py-0.5 shadow-2xs shrink-0">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-violet-700 font-semibold mt-1 truncate">
                        {!myProbation.passed
                          ? 'รอผ่านโปร 120 วัน'
                          : submitting
                            ? 'กำลังบันทึก...'
                            : 'นอกสถานที่ทำงาน'}
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="attendance-note"
                    className="block text-sm font-bold text-slate-800 mb-1.5"
                  >
                    หมายเหตุ / ระบุสถานที่ลูกค้า / งานที่ทำวันนี้{' '}
                    <span className="text-slate-400 font-normal">
                      (พิมพ์ก่อนแตะปุ่ม Check-in ด้านบน):
                    </span>
                  </label>
                  <input
                    id="attendance-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="เช่น พบลูกค้า บจก. เอบีซี (สีลม) หรือ งานที่โฟกัสวันนี้..."
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Who's in Office Today Summary & Filters */}
        <div className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-7 border border-slate-200/90 shadow-md flex flex-col justify-between space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  สถานะพนักงานรายวัน
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                ข้อมูลวันที่ {formatThaiDate(selectedDate)} (จากพนักงานทั้งหมด{' '}
                {dailyBoard.totalFiltered} คน)
              </p>
            </div>

            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="เลือกวันที่ดูสถานะเข้าออฟฟิศ"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden min-h-[44px] flex-1 sm:flex-none shadow-2xs"
              />

              {selectedDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-100 cursor-pointer shadow-2xs min-h-[44px] shrink-0 transition active:scale-95"
                >
                  วันนี้
                </button>
              )}
            </div>
          </div>

          {/* 5 Status Counter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <div className="rounded-2xl bg-emerald-50/90 border border-emerald-200/90 p-3 sm:p-3.5 shadow-2xs transition hover:shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-emerald-800">
                <span>อยู่ Office</span>
                <Building2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight">
                {dailyBoard.inOffice.length}{' '}
                <span className="text-xs font-semibold text-emerald-700">คน</span>
              </div>
            </div>

            <div className="rounded-2xl bg-blue-50/90 border border-blue-200/90 p-3 sm:p-3.5 shadow-2xs transition hover:shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-blue-800">
                <span>WFH / WFA</span>
                <Home className="h-4.5 w-4.5 text-blue-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {dailyBoard.remoteWfhWfa.length}{' '}
                <span className="text-xs font-semibold text-blue-700">คน</span>
              </div>
            </div>

            <div className="rounded-2xl bg-teal-50/90 border border-teal-200/90 p-3 sm:p-3.5 shadow-2xs transition hover:shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-teal-800">
                <span>พบลูกค้า</span>
                <MapPin className="h-4.5 w-4.5 text-teal-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-black text-teal-950 tracking-tight">
                {dailyBoard.offsiteClient.length}{' '}
                <span className="text-xs font-semibold text-teal-700">คน</span>
              </div>
            </div>

            <div className="rounded-2xl bg-rose-50/90 border border-rose-200/90 p-3 sm:p-3.5 shadow-2xs transition hover:shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-rose-800">
                <span>ลางานวันนี้</span>
                <Clock className="h-4.5 w-4.5 text-rose-600 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-black text-rose-950 tracking-tight">
                {dailyBoard.onLeave.length}{' '}
                <span className="text-xs font-semibold text-rose-700">คน</span>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50/90 border border-slate-200/90 p-3 sm:p-3.5 shadow-2xs col-span-2 sm:col-span-1 transition hover:shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700">
                <span>ยังไม่ลงเวลา</span>
                <Users className="h-4.5 w-4.5 text-slate-500 shrink-0" />
              </div>
              <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {dailyBoard.notCheckedIn.length}{' '}
                <span className="text-xs font-semibold text-slate-600">คน</span>
              </div>
            </div>
          </div>

          {/* Attendance Progress Bar */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 flex-wrap gap-1">
              <span>อัตราการลงเวลาปฏิบัติงานวันนี้:</span>
              <span className="text-blue-700 font-black">
                ลงเวลาแล้ว {dailyBoard.inOffice.length + dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length} / {dailyBoard.totalFiltered} คน ({Math.round(((dailyBoard.inOffice.length + dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length) / (dailyBoard.totalFiltered || 1)) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 via-teal-500 to-[#0066FF] h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((dailyBoard.inOffice.length +
                        dailyBoard.remoteWfhWfa.length +
                        dailyBoard.offsiteClient.length) /
                        (dailyBoard.totalFiltered || 1)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Search & Department Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="relative w-full sm:w-auto">
              <Users className="h-4 w-4 text-slate-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full sm:w-auto appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-2.5 sm:py-2 text-base sm:text-sm font-semibold text-slate-700 hover:border-blue-300 focus:border-blue-600 focus:bg-white focus:outline-hidden cursor-pointer min-h-[44px]"
                aria-label="กรองตามแผนก"
              >
                <option value="ALL">ทุกแผนกในบริษัท</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    แผนก {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="relative w-full sm:max-w-xs">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อไทย / อังกฤษ / รหัสพนักงาน..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Columns: Mobile Segmented Switcher & 3-Column Desktop View */}
      <div className="space-y-3">
        {/* Mobile Segmented Switcher (< lg) */}
        <div className="lg:hidden flex items-center rounded-2xl bg-slate-100 p-1 border border-slate-200 gap-1">
          <button
            type="button"
            onClick={() => setMobileBoardTab('office')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-bold transition min-h-[44px] flex items-center justify-center gap-1 cursor-pointer active:scale-98 ${
              mobileBoardTab === 'office'
                ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Office ({dailyBoard.inOffice.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileBoardTab('remote')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-bold transition min-h-[44px] flex items-center justify-center gap-1 cursor-pointer active:scale-98 ${
              mobileBoardTab === 'remote'
                ? 'bg-white text-blue-800 shadow-xs ring-1 ring-blue-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              WFH/นอก ({dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileBoardTab('leaves')}
            className={`flex-1 py-2 px-1 text-center rounded-xl text-xs font-bold transition min-h-[44px] flex items-center justify-center gap-1 cursor-pointer active:scale-98 ${
              mobileBoardTab === 'leaves'
                ? 'bg-white text-rose-800 shadow-xs ring-1 ring-rose-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              ลา/รอ ({dailyBoard.onLeave.length + dailyBoard.notCheckedIn.length})
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Column 1: ใครอยู่ Office บ้าง */}
          <div
            className={`${
              mobileBoardTab === 'office' ? 'block' : 'hidden'
            } lg:block rounded-2xl bg-white border border-emerald-200/90 shadow-2xs overflow-hidden`}
          >
          <div className="bg-emerald-50/80 border-b border-emerald-200/80 px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-emerald-950">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <span>พนักงานที่อยู่ Office ({dailyBoard.inOffice.length} คน)</span>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto p-3.5 space-y-2.5">
            {dailyBoard.inOffice.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                ยังไม่มีผู้กด Check-in เข้า Office ในวันที่เลือก
              </div>
            ) : (
              dailyBoard.inOffice.map(({ user, record }) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900">
                        {user.name}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {user.englishName ? `${user.englishName} • ` : ''}
                        {user.department}
                      </div>
                    </div>
                    <span className="rounded-lg bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800 shrink-0">
                      เข้า {record.checkInTime}
                      {record.checkOutTime ? ` - ${record.checkOutTime}` : ''}
                    </span>
                  </div>
                  {record.note && (
                    <div className="text-xs text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-100 font-medium">
                      📌 {record.note}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: ทำงานนอกสถานที่ (พบลูกค้า/ออกบูธ) & WFH / WFA */}
        <div
          className={`${
            mobileBoardTab === 'remote' ? 'block' : 'hidden'
          } lg:block rounded-2xl bg-white border border-blue-200/90 shadow-2xs overflow-hidden`}
        >
          <div className="bg-blue-50/80 border-b border-blue-200/80 px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-slate-900">
              <MapPin className="h-5 w-5 text-blue-600" />
              <span>
                WFH / WFA &amp; พบลูกค้า (
                {dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length}{' '}
                คน)
              </span>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto p-3.5 space-y-2.5">
            {dailyBoard.offsiteClient.length === 0 &&
            dailyBoard.remoteWfhWfa.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                ไม่มีพนักงาน WFH / WFA หรือไปพบลูกค้านอกสถานที่ในวันนี้
              </div>
            ) : (
              <>
                {dailyBoard.offsiteClient.map(({ user, record, leave }) => (
                  <div
                    key={`offsite-${user.id}`}
                    className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900">
                          {user.name}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          {user.department} • {user.position}
                        </div>
                      </div>
                      <span className="rounded-lg bg-teal-100 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-800 shrink-0">
                        พบลูกค้า/ออกบูธ
                        {record ? ` (${record.checkInTime})` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-teal-900 bg-white rounded-lg px-3 py-2 border border-teal-100 font-medium">
                      📍{' '}
                      <strong>
                        {record?.note ||
                          leave?.locationDetail ||
                          leave?.reason ||
                          'ปฏิบัติงานนอกสถานที่'}
                      </strong>
                    </div>
                  </div>
                ))}

                {dailyBoard.remoteWfhWfa.map(
                  ({ user, record, leave, locationType }) => (
                    <div
                      key={`remote-${user.id}`}
                      className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-slate-900">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-500 font-medium">
                            {user.department} • {user.position}
                          </div>
                        </div>
                        <span
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold shrink-0 ${
                            WORK_LOCATION_META[locationType].badgeClass
                          }`}
                        >
                          {WORK_LOCATION_META[locationType].shortLabel}
                          {record ? ` (${record.checkInTime})` : ''}
                        </span>
                      </div>
                      {(record?.note || leave?.reason) && (
                        <div className="text-xs text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-100 font-medium">
                          💻 {record?.note || leave?.reason}
                        </div>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Column 3: ลางานวันนี้ & ยังไม่กด Check-in */}
        <div
          className={`${
            mobileBoardTab === 'leaves' ? 'block' : 'hidden'
          } lg:block rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-hidden`}
        >
          <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-slate-900">
              <UserCheck className="h-5 w-5 text-rose-600" />
              <span>
                ลางานวันนี้ ({dailyBoard.onLeave.length}) &amp; รอลงเวลา (
                {dailyBoard.notCheckedIn.length})
              </span>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto p-3.5 space-y-2.5">
            {dailyBoard.onLeave.length === 0 && dailyBoard.notCheckedIn.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                พนักงานทุกคนลงเวลาปฏิบัติงานเรียบร้อยแล้ว และไม่มีผู้ลางานในวันนี้
              </div>
            ) : (
              <>
                {dailyBoard.onLeave.map(({ user, leave }) => (
                  <div
                    key={`leave-${user.id}`}
                    className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {user.name}
                      </span>
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${
                          LEAVE_TYPE_META[leave.leaveType].badgeClass
                        }`}
                      >
                        {LEAVE_TYPE_META[leave.leaveType].label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      {user.englishName ? `${user.englishName} • ` : ''}แผนก {user.department}
                    </div>
                  </div>
                ))}

                {dailyBoard.notCheckedIn.map((user) => (
                  <div
                    key={`wait-${user.id}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        {user.name}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {user.englishName ? `${user.englishName} • ` : ''}{user.department} •{' '}
                        <span className="text-slate-400">
                          {ROLE_META[user.role].label}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-lg bg-slate-200/80 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      ยังไม่ Check-in
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
