'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Home,
  LogOut,
  MapPin,
  Search,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  ENABLE_WFA,
  extractWfhMeetLinkAndNote,
  formatThaiDate,
  getBangkokNow,
  getProbationInfo,
  LEAVE_TYPE_META,
  normalizeAndValidateMeetLink,
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
import UserAvatar from '@/components/UserAvatar';

interface AttendanceAndOfficeViewProps {
  currentUser: SafeUser;
  users: SafeUser[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  onCheckIn: (payload: {
    date?: string;
    checkInTime?: string;
    workLocation: WorkLocationType;
    locationName?: string;
    meetLink?: string;
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
    return getBangkokNow().dateStr;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
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
  const [isOffsiteModalOpen, setIsOffsiteModalOpen] = useState<boolean>(false);
  const [offsiteLocation, setOffsiteLocation] = useState<string>('');
  const [offsiteNote, setOffsiteNote] = useState<string>('');
  const [offsiteError, setOffsiteError] = useState<string | null>(null);
  const [isWfhModalOpen, setIsWfhModalOpen] = useState<boolean>(false);
  const [wfhMeetLink, setWfhMeetLink] = useState<string>('');
  const [wfhNote, setWfhNote] = useState<string>('');
  const [wfhError, setWfhError] = useState<string | null>(null);

  // Close offsite/WFH modal on Escape key press
  useEffect(() => {
    if (!isOffsiteModalOpen && !isWfhModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        setIsOffsiteModalOpen(false);
        setIsWfhModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOffsiteModalOpen, isWfhModalOpen, submitting]);

  // Real-time clock update (Thailand time Asia/Bangkok)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(
        now.toLocaleTimeString('th-TH', {
          timeZone: 'Asia/Bangkok',
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
        (a) =>
          a.userId === currentUser.id &&
          a.date === todayStr &&
          (ENABLE_WFA || a.workLocation !== 'wfa')
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
        (ENABLE_WFA || l.leaveType !== 'wfa') &&
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
        } else if (
          att.workLocation === 'wfh' ||
          (ENABLE_WFA && att.workLocation === 'wfa')
        ) {
          remoteWfhWfa.push({
            user: u,
            record: att,
            leave: userLeave,
            locationType: att.workLocation,
          });
        } else if (att.workLocation === 'offsite') {
          offsiteClient.push({ user: u, record: att, leave: userLeave });
        } else if (!ENABLE_WFA && att.workLocation === 'wfa') {
          notCheckedIn.push(u);
        }
      } else if (userLeave) {
        if (
          userLeave.leaveType === 'wfh' ||
          (ENABLE_WFA && userLeave.leaveType === 'wfa')
        ) {
          remoteWfhWfa.push({
            user: u,
            leave: userLeave,
            locationType: userLeave.leaveType,
          });
        } else if (userLeave.leaveType === 'offsite') {
          offsiteClient.push({ user: u, leave: userLeave });
        } else if (!ENABLE_WFA && userLeave.leaveType === 'wfa') {
          notCheckedIn.push(u);
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
      const bkk = getBangkokNow();
      const [bH, bM] = bkk.timeStr.split(':').map(Number);
      endH = bH;
      endM = bM;
    }
    const totalMinutes = Math.max(0, (endH * 60 + endM) - (inH * 60 + inM));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} นาที`;
    return `${hours} ชม. ${minutes} นาที`;
  };

  const handleToggleLocationPicker = () => {
    setShowLocationPicker((prev) => !prev);
  };

  const handleOpenOffsiteModal = () => {
    const isCurrentOffsite = myTodayRecord?.workLocation === 'offsite';
    let initLoc = myTodayRecord?.locationName || '';
    let initExtra = '';

    if (isCurrentOffsite && myTodayRecord?.note) {
      if (myTodayRecord.note.includes(' • ')) {
        const parts = myTodayRecord.note.split(' • ');
        if (!initLoc) initLoc = parts[0].trim();
        initExtra = parts.slice(1).join(' • ').trim();
      } else if (!initLoc) {
        initLoc = myTodayRecord.note.trim();
      }
    }

    setOffsiteLocation(initLoc);
    setOffsiteNote(initExtra);
    setOffsiteError(null);
    setIsOffsiteModalOpen(true);
  };

  const handleOpenWfhModal = () => {
    setFeedback(null);
    if (!myProbation.passed) {
      setFeedback({
        type: 'error',
        message: `ช่วงทดลองงาน (< 119 วัน) ยังไม่สามารถเลือกลงเวลา WFH ได้ (เริ่มงาน ${formatThaiDate(myProbation.startDate, true)} ผ่านโปร ${formatThaiDate(myProbation.passDate, true)})`,
      });
      return;
    }

    const isCurrentWfh = myTodayRecord?.workLocation === 'wfh';
    const extracted = isCurrentWfh
      ? extractWfhMeetLinkAndNote(myTodayRecord)
      : {};
    setWfhMeetLink(extracted.meetLink || '');
    setWfhNote(extracted.extraNote || '');
    setWfhError(null);
    setIsWfhModalOpen(true);
  };

  const handleDirectCheckIn = async (loc: WorkLocationType) => {
    setFeedback(null);
    if (loc === 'wfa' && !ENABLE_WFA) {
      return;
    }
    if (!myProbation.passed && (loc === 'wfh' || loc === 'wfa')) {
      setFeedback({
        type: 'error',
        message: `ช่วงทดลองงาน (< 119 วัน) ยังไม่สามารถเลือกลงเวลา ${
          ENABLE_WFA ? 'WFH หรือ WFA' : 'WFH'
        } ได้ (เริ่มงาน ${formatThaiDate(myProbation.startDate, true)} ผ่านโปร ${formatThaiDate(myProbation.passDate, true)})`,
      });
      return;
    }
    if (loc === 'wfh') {
      handleOpenWfhModal();
      return;
    }
    if (loc === 'offsite') {
      handleOpenOffsiteModal();
      return;
    }
    setSubmitting(true);
    try {
      const bkk = getBangkokNow();
      const effectiveCheckInTime = myTodayRecord?.checkInTime || bkk.timeStr;
      const res = await onCheckIn({
        date: todayStr || bkk.dateStr,
        checkInTime: effectiveCheckInTime,
        workLocation: loc,
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
        setShowLocationPicker(false);
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWfhSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const meetCheck = normalizeAndValidateMeetLink(wfhMeetLink);
    if (!meetCheck.valid || !meetCheck.normalizedUrl) {
      setWfhError(
        meetCheck.error ||
          'กรุณาแนบลิงก์ Google Meet ที่ถูกต้อง (เช่น https://meet.google.com/abc-defg-hij)'
      );
      return;
    }
    setSubmitting(true);
    setWfhError(null);
    try {
      const bkk = getBangkokNow();
      const effectiveCheckInTime = myTodayRecord?.checkInTime || bkk.timeStr;
      const res = await onCheckIn({
        date: todayStr || bkk.dateStr,
        checkInTime: effectiveCheckInTime,
        workLocation: 'wfh',
        meetLink: meetCheck.normalizedUrl,
        note: wfhNote.trim() || undefined,
      });
      if (!res.success) {
        setWfhError(res.error || 'ไม่สามารถบันทึก Check-in WFH ได้');
      } else {
        setIsWfhModalOpen(false);
        setWfhMeetLink('');
        setWfhNote('');
        setShowLocationPicker(false);
        setFeedback({
          type: 'success',
          message:
            'ลงเวลา Check-in WFH พร้อมแนบลิงก์ Google Meet สำเร็จ และส่งข้อความแจ้งเตือนเข้า Google Chat เรียบร้อยแล้ว',
        });
      }
    } catch {
      setWfhError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOffsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offsiteLocation.trim()) {
      setOffsiteError('กรุณาระบุสถานที่ปฏิบัติงาน หรือชื่อลูกค้า');
      return;
    }
    setSubmitting(true);
    setOffsiteError(null);
    try {
      const bkk = getBangkokNow();
      const effectiveCheckInTime = myTodayRecord?.checkInTime || bkk.timeStr;
      const res = await onCheckIn({
        date: todayStr || bkk.dateStr,
        checkInTime: effectiveCheckInTime,
        workLocation: 'offsite',
        locationName: offsiteLocation.trim(),
        note: offsiteNote.trim() || undefined,
      });
      if (!res.success) {
        setOffsiteError(res.error || 'ไม่สามารถบันทึก Check-in ได้');
      } else {
        setIsOffsiteModalOpen(false);
        setOffsiteLocation('');
        setOffsiteNote('');
        setShowLocationPicker(false);
        setFeedback({
          type: 'success',
          message:
            'ลงเวลา Check-in นอกสถานที่สำเร็จ และส่งข้อความแจ้งเตือนเข้า Google Chat เรียบร้อยแล้ว',
        });
      }
    } catch {
      setOffsiteError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOutClick = async () => {
    setFeedback(null);
    setSubmitting(true);
    try {
      const bkk = getBangkokNow();
      const res = await onCheckOut({
        date: todayStr || bkk.dateStr,
        checkOutTime: bkk.timeStr,
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
    } catch {
      setFeedback({
        type: 'error',
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 animate-ui-slide-up ${
            feedback.type === 'success'
              ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800'
              : 'border-rose-200/80 bg-rose-50/80 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold opacity-75 hover:opacity-100 transition cursor-pointer shrink-0 px-1.5 py-0.5 rounded-md hover:bg-black/5"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Top Grid: Left = My Check-in/Check-out Card (5 cols), Right = Office Summary KPIs (7 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Left: My Check-in / Check-out Hero Card */}
        <div className="xl:col-span-5 rounded-2xl bg-white p-5 sm:p-6 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header: Greeting + Live Clock */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  name={currentUser.name}
                  avatarUrl={currentUser.avatarUrl}
                  sizeClass="h-11 w-11"
                  roundedClass="rounded-xl"
                  textClass="text-sm"
                />
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    ลงเวลาเข้า-ออกงาน
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                    คุณ {currentUser.name}
                    {currentUser.englishName && (
                      <span className="text-xs font-normal text-slate-400 ml-1.5">
                        ({currentUser.englishName})
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              {/* Clean Digital Clock Pill */}
              <div className="inline-flex items-center justify-center gap-2 self-stretch sm:self-center bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-mono text-sm font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                  {liveTime || '--:--:--'}
                </span>
              </div>
            </div>

            {!myProbation.passed && (
              <div className="rounded-xl bg-amber-50/80 border border-amber-200/70 px-3.5 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  ช่วงทดลองงาน ({myProbation.daysWorked}/119 วัน): ยังไม่สามารถเลือก{' '}
                  {ENABLE_WFA ? 'WFH / WFA' : 'WFH'} ได้
                </span>
              </div>
            )}

            {/* If Already Checked in Today */}
            {myTodayRecord ? (
              <div className="space-y-3.5">
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-base font-bold text-slate-900 leading-tight">
                          {myTodayRecord.checkOutTime ? 'เลิกงานแล้ว' : 'เข้างานแล้ว'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {formatThaiDate(todayStr, true)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        (
                          WORK_LOCATION_META[myTodayRecord.workLocation] ||
                          WORK_LOCATION_META.office
                        ).badgeClass
                      }`}
                    >
                      {(
                        WORK_LOCATION_META[myTodayRecord.workLocation] ||
                        WORK_LOCATION_META.office
                      ).label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs sm:text-sm">
                    <div className="rounded-xl bg-white p-3.5 border border-slate-200/70">
                      <div className="text-slate-400 font-medium text-[11px]">เวลาเข้างาน</div>
                      <div className="text-base sm:text-lg font-bold text-emerald-700 font-mono tabular-nums whitespace-nowrap mt-0.5">
                        {myTodayRecord.checkInTime} น.
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-3.5 border border-slate-200/70">
                      <div className="text-slate-400 font-medium text-[11px]">เวลาออกงาน</div>
                      <div
                        className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 text-slate-800 ${
                          myTodayRecord.checkOutTime
                            ? 'font-mono whitespace-nowrap'
                            : 'leading-snug'
                        }`}
                      >
                        {myTodayRecord.checkOutTime
                          ? `${myTodayRecord.checkOutTime} น.`
                          : `ทำงานแล้ว ${getElapsedDuration(myTodayRecord.checkInTime)}`}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    if (myTodayRecord.workLocation === 'wfh') {
                      const { meetLink, extraNote } =
                        extractWfhMeetLinkAndNote(myTodayRecord);
                      if (!meetLink && !extraNote) return null;
                      return (
                        <div className="rounded-xl bg-white p-3 text-xs sm:text-sm text-slate-700 border border-blue-200/70 space-y-1.5">
                          {meetLink && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                                <Video className="h-3.5 w-3.5 text-[#0066FF] shrink-0" />
                                <span>Google Meet:</span>
                              </span>
                              <a
                                href={meetLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-[#0066FF] hover:text-blue-800 hover:underline break-all"
                              >
                                <span>{meetLink}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            </div>
                          )}
                          {extraNote && (
                            <div className="text-slate-600">
                              <span className="font-semibold text-slate-900">หมายเหตุ:</span>{' '}
                              {extraNote}
                            </div>
                          )}
                        </div>
                      );
                    }
                    if (myTodayRecord.note || myTodayRecord.locationName) {
                      return (
                        <div className="rounded-xl bg-white p-3 text-xs sm:text-sm text-slate-700 border border-slate-200/70">
                          <span className="font-semibold text-slate-900">หมายเหตุ / สถานที่:</span>{' '}
                          {myTodayRecord.note || myTodayRecord.locationName}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Check-Out Button if not yet checked out */}
                  {!myTodayRecord.checkOutTime ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleCheckOutClick}
                      className="w-full min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-semibold text-sm sm:text-[15px] shadow-sm shadow-rose-600/15 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <LogOut className="h-4.5 w-4.5" />
                      <span>
                        {submitting ? 'กำลังบันทึกเวลา...' : 'กด Check-out เลิกงาน'}
                      </span>
                    </button>
                  ) : (
                    <div className="text-center py-2.5 px-3.5 text-xs font-semibold text-emerald-700 bg-emerald-100/60 border border-emerald-200/60 rounded-xl tabular-nums">
                      บันทึกเวลาครบถ้วนแล้ว (รวม {getElapsedDuration(myTodayRecord.checkInTime, myTodayRecord.checkOutTime)})
                    </div>
                  )}
                </div>

                {/* Toggle to update location */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleToggleLocationPicker}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0066FF] hover:bg-slate-50 cursor-pointer min-h-[38px] px-3 py-1.5 rounded-xl transition"
                  >
                    {showLocationPicker ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        <span>ซ่อนตัวเลือกสถานที่</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        <span>เปลี่ยนสถานที่ปฏิบัติงาน</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Direct Check-In Actions (Shown if NOT checked in, OR if user toggled to update) */}
            {(!myTodayRecord || showLocationPicker) && (
              <div className="space-y-3">
                <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                  {myTodayRecord
                    ? 'เลือกสถานที่ทำงานใหม่'
                    : 'เลือกสถานที่ลงเวลาเข้างาน'}
                </label>
                <div
                  className={`grid gap-2.5 sm:gap-3 ${
                    ENABLE_WFA
                      ? 'grid-cols-2'
                      : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-2'
                  }`}
                >
                  {/* 1. Office Button */}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDirectCheckIn('office')}
                    className={`group rounded-xl border p-3.5 text-left transition min-h-[84px] flex flex-col justify-between active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                      myTodayRecord?.workLocation === 'office'
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/15'
                        : 'border-slate-200/90 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      {myTodayRecord?.workLocation === 'office' && (
                        <span className="rounded-full bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                          ปัจจุบัน
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        เข้า Office
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate">
                        {submitting ? 'กำลังบันทึก...' : 'สำนักงาน'}
                      </div>
                    </div>
                  </button>

                  {/* 2. WFH Button (opens WFH modal requiring Google Meet link) */}
                  <button
                    type="button"
                    disabled={submitting || !myProbation.passed}
                    onClick={handleOpenWfhModal}
                    className={`group rounded-xl border p-3.5 text-left transition min-h-[84px] flex flex-col justify-between disabled:opacity-55 disabled:cursor-not-allowed ${
                      !myProbation.passed
                        ? 'border-slate-200/70 bg-slate-50 cursor-not-allowed'
                        : myTodayRecord?.workLocation === 'wfh'
                          ? 'border-[#0066FF] bg-blue-50/60 ring-2 ring-blue-500/15 cursor-pointer active:scale-[0.98]'
                          : 'border-slate-200/90 bg-white hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60 group-hover:bg-[#0066FF] group-hover:text-white group-hover:border-[#0066FF] transition shrink-0">
                        <Home className="h-4 w-4" />
                      </div>
                      {myTodayRecord?.workLocation === 'wfh' && (
                        <span className="rounded-full bg-[#0066FF] text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                          ปัจจุบัน
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        WFH
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate">
                        {!myProbation.passed
                          ? 'รอผ่านโปร 119 วัน'
                          : submitting
                            ? 'กำลังบันทึก...'
                            : 'ทำงานที่บ้าน (แนบลิงก์ Meet)'}
                      </div>
                    </div>
                  </button>

                  {/* 3. Offsite Button */}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleOpenOffsiteModal}
                    className={`group rounded-xl border p-3.5 text-left transition min-h-[84px] flex flex-col justify-between active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                      !ENABLE_WFA ? 'col-span-2 sm:col-span-1 xl:col-span-2' : ''
                    } ${
                      myTodayRecord?.workLocation === 'offsite'
                        ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/15'
                        : 'border-slate-200/90 bg-white hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600 transition shrink-0">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      {myTodayRecord?.workLocation === 'offsite' && (
                        <span className="rounded-full bg-teal-600 text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                          ปัจจุบัน
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        นอกสถานที่
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate">
                        {submitting ? 'กำลังบันทึก...' : 'พบลูกค้า/ออกบูธ'}
                      </div>
                    </div>
                  </button>

                  {/* 4. WFA Button (hidden when ENABLE_WFA = false) */}
                  {ENABLE_WFA && (
                    <button
                      type="button"
                      disabled={submitting || !myProbation.passed}
                      onClick={() => handleDirectCheckIn('wfa')}
                      className={`group rounded-xl border p-3.5 text-left transition min-h-[84px] flex flex-col justify-between disabled:opacity-55 disabled:cursor-not-allowed ${
                        !myProbation.passed
                          ? 'border-slate-200/70 bg-slate-50 cursor-not-allowed'
                          : myTodayRecord?.workLocation === 'wfa'
                            ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/15 cursor-pointer active:scale-[0.98]'
                            : 'border-slate-200/90 bg-white hover:border-violet-300 hover:bg-violet-50/30 cursor-pointer active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 border border-violet-200/60 group-hover:bg-violet-600 group-hover:text-white group-hover:border-violet-600 transition shrink-0">
                          <Globe className="h-4 w-4" />
                        </div>
                        {myTodayRecord?.workLocation === 'wfa' && (
                          <span className="rounded-full bg-violet-600 text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5">
                        <div className="font-bold text-sm text-slate-900 truncate">
                          WFA
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium truncate">
                          {!myProbation.passed
                            ? 'รอผ่านโปร 119 วัน'
                            : submitting
                              ? 'กำลังบันทึก...'
                              : 'ทำงานต่างจังหวัด/ที่อื่น'}
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Who's in Office Today Summary & Filters */}
        <div className="xl:col-span-7 rounded-2xl bg-white p-5 sm:p-6 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-[#0066FF] shrink-0" />
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  สถานะพนักงานรายวัน
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatThaiDate(selectedDate)}
              </p>
            </div>

            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="เลือกวันที่ดูสถานะเข้าออฟฟิศ"
                className="rounded-xl border border-slate-200 bg-slate-50/70 hover:border-slate-300 px-3 py-2 text-base sm:text-xs font-semibold text-slate-800 focus:border-[#0066FF] focus:bg-white focus:outline-hidden min-h-[40px] flex-1 sm:flex-none transition"
              />

              {selectedDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className="rounded-xl bg-blue-50 border border-blue-200/80 px-3 py-2 text-xs font-semibold text-[#0066FF] hover:bg-blue-100/80 cursor-pointer min-h-[40px] shrink-0 transition active:scale-95"
                >
                  วันนี้
                </button>
              )}
            </div>
          </div>

          {/* 5 Clean Unified Status Counter Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5 gap-2.5">
            <div className="rounded-xl bg-slate-50/70 border border-slate-200/65 p-3.5 transition hover:border-emerald-200 hover:bg-emerald-50/25">
              <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-slate-500">
                <span className="whitespace-nowrap">อยู่ Office</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                {dailyBoard.inOffice.length}{' '}
                <span className="text-xs font-medium text-slate-400">คน</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/70 border border-slate-200/65 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/25">
              <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-slate-500">
                <span className="whitespace-nowrap">
                  {ENABLE_WFA ? 'WFH / WFA' : 'WFH'}
                </span>
                <span className="h-2 w-2 rounded-full bg-[#0066FF] shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                {dailyBoard.remoteWfhWfa.length}{' '}
                <span className="text-xs font-medium text-slate-400">คน</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/70 border border-slate-200/65 p-3.5 transition hover:border-teal-200 hover:bg-teal-50/25">
              <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-slate-500">
                <span className="whitespace-nowrap">พบลูกค้า</span>
                <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                {dailyBoard.offsiteClient.length}{' '}
                <span className="text-xs font-medium text-slate-400">คน</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/70 border border-slate-200/65 p-3.5 transition hover:border-rose-200 hover:bg-rose-50/25">
              <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-slate-500">
                <span className="whitespace-nowrap">ลางานวันนี้</span>
                <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                {dailyBoard.onLeave.length}{' '}
                <span className="text-xs font-medium text-slate-400">คน</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/70 border border-slate-200/65 p-3.5 col-span-2 lg:col-span-1 xl:col-span-2 2xl:col-span-1 transition hover:border-slate-300">
              <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-slate-500">
                <span className="whitespace-nowrap">ยังไม่ลงเวลา</span>
                <span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight whitespace-nowrap">
                {dailyBoard.notCheckedIn.length}{' '}
                <span className="text-xs font-medium text-slate-400">คน</span>
              </div>
            </div>
          </div>

          {/* Compositional Attendance Progress Bar */}
          <div className="rounded-xl bg-slate-50/70 border border-slate-200/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600 flex-wrap gap-1">
              <span>ลงเวลาแล้ว</span>
              <span className="text-slate-900 font-semibold tabular-nums">
                {dailyBoard.inOffice.length + dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length} / {dailyBoard.totalFiltered} คน (
                {Math.round(
                  ((dailyBoard.inOffice.length +
                    dailyBoard.remoteWfhWfa.length +
                    dailyBoard.offsiteClient.length) /
                    (dailyBoard.totalFiltered || 1)) *
                    100
                )}
                %)
              </span>
            </div>
            <div className="w-full bg-slate-200/70 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (dailyBoard.inOffice.length / (dailyBoard.totalFiltered || 1)) * 100
                  )}%`,
                }}
                title={`Office: ${dailyBoard.inOffice.length} คน`}
              />
              <div
                className="bg-[#0066FF] h-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (dailyBoard.remoteWfhWfa.length / (dailyBoard.totalFiltered || 1)) * 100
                  )}%`,
                }}
                title={`${ENABLE_WFA ? 'WFH/WFA' : 'WFH'}: ${dailyBoard.remoteWfhWfa.length} คน`}
              />
              <div
                className="bg-teal-500 h-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (dailyBoard.offsiteClient.length / (dailyBoard.totalFiltered || 1)) * 100
                  )}%`,
                }}
                title={`พบลูกค้า: ${dailyBoard.offsiteClient.length} คน`}
              />
            </div>
          </div>

          {/* Search & Department Filter Bar */}
          <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
            <div className="relative w-full sm:w-auto">
              <Users className="h-4 w-4 text-slate-400 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full sm:w-auto appearance-none rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-9 py-2 text-base sm:text-xs font-semibold text-slate-700 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden cursor-pointer min-h-[40px] transition"
                aria-label="กรองตามแผนก"
              >
                <option value="ALL">ทุกแผนกในบริษัท</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    แผนก {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="relative w-full sm:max-w-xs">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 py-2 text-base sm:text-xs text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden min-h-[40px] transition"
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
      </div>

      {/* Detailed Columns: Mobile Segmented Switcher & 3-Column Desktop View */}
      <div className="space-y-3">
        {/* Mobile/Tablet Segmented Switcher (< xl) */}
        <div className="xl:hidden flex items-center rounded-xl bg-slate-200/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => setMobileBoardTab('office')}
            className={`flex-1 py-2 px-2 text-center rounded-lg text-xs font-semibold transition min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileBoardTab === 'office'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate tabular-nums">Office ({dailyBoard.inOffice.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileBoardTab('remote')}
            className={`flex-1 py-2 px-2 text-center rounded-lg text-xs font-semibold transition min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileBoardTab === 'remote'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#0066FF] shrink-0" />
            <span className="truncate tabular-nums">
              WFH/นอก ({dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileBoardTab('leaves')}
            className={`flex-1 py-2 px-2 text-center rounded-lg text-xs font-semibold transition min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileBoardTab === 'leaves'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
            <span className="truncate tabular-nums">
              ลา/รอ ({dailyBoard.onLeave.length + dailyBoard.notCheckedIn.length})
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          {/* Column 1: ใครอยู่ Office บ้าง */}
          <div
            className={`${
              mobileBoardTab === 'office' ? 'block' : 'hidden'
            } xl:block rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden`}
          >
            <div className="border-b border-slate-100 px-4 sm:px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                  <Building2 className="h-4 w-4" />
                </span>
                <span>Office</span>
              </div>
              <span className="rounded-full bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums">
                {dailyBoard.inOffice.length}
              </span>
            </div>

            <div className="max-h-[460px] overflow-y-auto momentum-scroll divide-y divide-slate-100">
              {dailyBoard.inOffice.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs sm:text-sm text-slate-400">
                  ยังไม่มีผู้กด Check-in เข้า Office ในวันที่เลือก
                </div>
              ) : (
                dailyBoard.inOffice.map(({ user, record }) => (
                  <div
                    key={user.id}
                    className="px-4 py-3 hover:bg-slate-50/70 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          name={user.name}
                          avatarUrl={user.avatarUrl}
                          sizeClass="h-8 w-8"
                          roundedClass="rounded-full"
                          textClass="text-xs"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {user.englishName ? `${user.englishName} · ` : ''}
                            {user.department}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-lg bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 font-mono tabular-nums shrink-0">
                        เข้า {record.checkInTime}
                        {record.checkOutTime ? ` - ${record.checkOutTime}` : ''}
                      </span>
                    </div>
                    {record.note && (
                      <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                        {record.note}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: ทำงานนอกสถานที่ (พบลูกค้า/ออกบูธ) & WFH */}
          <div
            className={`${
              mobileBoardTab === 'remote' ? 'block' : 'hidden'
            } xl:block rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden`}
          >
            <div className="border-b border-slate-100 px-4 sm:px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60">
                  <MapPin className="h-4 w-4" />
                </span>
                <span>{ENABLE_WFA ? 'WFH / WFA & นอกสถานที่' : 'WFH & นอกสถานที่'}</span>
              </div>
              <span className="rounded-full bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 text-xs font-semibold text-[#0066FF] tabular-nums">
                {dailyBoard.remoteWfhWfa.length + dailyBoard.offsiteClient.length}
              </span>
            </div>

            <div className="max-h-[460px] overflow-y-auto momentum-scroll divide-y divide-slate-100">
              {dailyBoard.offsiteClient.length === 0 &&
              dailyBoard.remoteWfhWfa.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs sm:text-sm text-slate-400">
                  {ENABLE_WFA
                    ? 'ไม่มีพนักงาน WFH / WFA หรือไปพบลูกค้านอกสถานที่ในวันนี้'
                    : 'ไม่มีพนักงาน WFH หรือไปพบลูกค้านอกสถานที่ในวันนี้'}
                </div>
              ) : (
                <>
                  {dailyBoard.offsiteClient.map(({ user, record, leave }) => (
                    <div
                      key={`offsite-${user.id}`}
                      className="px-4 py-3 hover:bg-teal-50/30 transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={user.name}
                            avatarUrl={user.avatarUrl}
                            sizeClass="h-8 w-8"
                            roundedClass="rounded-full"
                            textClass="text-xs"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 truncate">
                              {user.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {user.department} · {user.position}
                            </div>
                          </div>
                        </div>
                        <span className="rounded-lg bg-teal-50 border border-teal-200/80 px-2 py-0.5 text-[11px] font-semibold text-teal-700 shrink-0 tabular-nums">
                          พบลูกค้า/ออกบูธ
                          {record ? ` (${record.checkInTime})` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-teal-900 bg-teal-50/50 rounded-lg px-2.5 py-1.5 border border-teal-100 flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <span className="font-medium">
                          {record?.note ||
                            record?.locationName ||
                            leave?.locationDetail ||
                            leave?.reason ||
                            'ปฏิบัติงานนอกสถานที่'}
                        </span>
                      </div>
                    </div>
                  ))}

                  {dailyBoard.remoteWfhWfa.map(
                    ({ user, record, leave, locationType }) => {
                      const extractedWfh =
                        locationType === 'wfh'
                          ? extractWfhMeetLinkAndNote(record)
                          : {};
                      const displayNote =
                        locationType === 'wfh'
                          ? extractedWfh.extraNote || leave?.reason
                          : record?.note || leave?.reason;

                      return (
                        <div
                          key={`remote-${user.id}`}
                          className="px-4 py-3 hover:bg-blue-50/30 transition space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <UserAvatar
                                name={user.name}
                                avatarUrl={user.avatarUrl}
                                sizeClass="h-8 w-8"
                                roundedClass="rounded-full"
                                textClass="text-xs"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-900 truncate">
                                  {user.name}
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                  {user.department} · {user.position}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold shrink-0 tabular-nums ${
                                WORK_LOCATION_META[locationType].badgeClass
                              }`}
                            >
                              {WORK_LOCATION_META[locationType].shortLabel}
                              {record ? ` (${record.checkInTime})` : ''}
                            </span>
                          </div>
                          {extractedWfh.meetLink && (
                            <a
                              href={extractedWfh.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#0066FF] hover:text-blue-800 bg-blue-50/60 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 border border-blue-200/70 flex items-center justify-between gap-2 transition"
                            >
                              <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold">
                                <Video className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{extractedWfh.meetLink}</span>
                              </span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          )}
                          {displayNote && (
                            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                              {displayNote}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </>
              )}
            </div>
          </div>

          {/* Column 3: ลางานวันนี้ & ยังไม่กด Check-in */}
          <div
            className={`${
              mobileBoardTab === 'leaves' ? 'block' : 'hidden'
            } xl:block rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden`}
          >
            <div className="border-b border-slate-100 px-4 sm:px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
                  <UserCheck className="h-4 w-4" />
                </span>
                <span>ลางาน &amp; ยังไม่ลงเวลา</span>
              </div>
              <span className="rounded-full bg-slate-100 border border-slate-200/70 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
                {dailyBoard.onLeave.length + dailyBoard.notCheckedIn.length}
              </span>
            </div>

            <div className="max-h-[460px] overflow-y-auto momentum-scroll divide-y divide-slate-100">
              {dailyBoard.onLeave.length === 0 && dailyBoard.notCheckedIn.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs sm:text-sm text-slate-400">
                  พนักงานทุกคนลงเวลาปฏิบัติงานเรียบร้อยแล้ว และไม่มีผู้ลางานในวันนี้
                </div>
              ) : (
                <>
                  {dailyBoard.onLeave.map(({ user, leave }) => (
                    <div
                      key={`leave-${user.id}`}
                      className="px-4 py-3 bg-rose-50/20 hover:bg-rose-50/40 transition flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          name={user.name}
                          avatarUrl={user.avatarUrl}
                          sizeClass="h-8 w-8"
                          roundedClass="rounded-full"
                          textClass="text-xs"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {user.englishName ? `${user.englishName} · ` : ''}แผนก {user.department}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${
                          LEAVE_TYPE_META[leave.leaveType].badgeClass
                        }`}
                      >
                        {LEAVE_TYPE_META[leave.leaveType].label}
                      </span>
                    </div>
                  ))}

                  {dailyBoard.notCheckedIn.map((user) => (
                    <div
                      key={`wait-${user.id}`}
                      className="px-4 py-3 hover:bg-slate-50/70 transition flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          name={user.name}
                          avatarUrl={user.avatarUrl}
                          sizeClass="h-8 w-8"
                          roundedClass="rounded-full"
                          textClass="text-xs"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-700 truncate">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {user.englishName ? `${user.englishName} · ` : ''}{user.department} ·{' '}
                            {ROLE_META[user.role].label}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 shrink-0">
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

      {/* WFH Check-in Modal (Requires Google Meet Link) */}
      {isWfhModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Check-in Work From Home (WFH)"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 p-0 sm:p-4 backdrop-blur-xs animate-ui-fade"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setIsWfhModalOpen(false);
            }
          }}
        >
          <div className="relative flex h-auto max-h-[92dvh] sm:max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 animate-ui-modal">
            {/* Clean Modern Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
                  <Video className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                    Check-in Work From Home (WFH)
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    ทำงานที่บ้าน • ต้องแนบลิงก์ Google Meet ทุกครั้ง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsWfhModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form
              onSubmit={handleWfhSubmit}
              noValidate
              className="flex-1 overflow-y-auto momentum-scroll p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4 text-sm"
            >
              {wfhError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-700 font-medium"
                >
                  <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                  <span>{wfhError}</span>
                </div>
              )}

              {/* User and Time Card */}
              <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    name={currentUser.name}
                    avatarUrl={currentUser.avatarUrl}
                    sizeClass="h-9 w-9"
                    roundedClass="rounded-xl"
                    textClass="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      ฝ่าย {currentUser.department || '-'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-400 font-medium">เวลา Check-in</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-[#0066FF]">
                    {myTodayRecord?.checkInTime || liveTime || getBangkokNow().timeStr} น.
                  </div>
                </div>
              </div>

              {/* Field: Google Meet Link (Required) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="wfh-modal-meet-link"
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700"
                >
                  <Video className="h-4 w-4 text-[#0066FF] shrink-0" />
                  <span>
                    ลิงก์ Google Meet สำหรับปฏิบัติงาน WFH{' '}
                    <span className="text-rose-500">*</span>
                  </span>
                </label>
                <input
                  id="wfh-modal-meet-link"
                  type="text"
                  inputMode="url"
                  autoFocus
                  required
                  aria-required="true"
                  aria-invalid={Boolean(wfhError)}
                  value={wfhMeetLink}
                  onChange={(e) => {
                    setWfhMeetLink(e.target.value);
                    if (wfhError) setWfhError(null);
                  }}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ต้องสร้างห้องประชุม Google Meet จริงและเปิดออนไลน์ไว้ตลอดเวลาทำงานเพื่อให้ทีมติดต่อได้
                </p>
              </div>

              {/* Field: Extra Note (Optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="wfh-modal-note"
                  className="block text-xs sm:text-sm font-semibold text-slate-700"
                >
                  หมายเหตุ / รายละเอียดงานวันนี้ (ถ้ามี)
                </label>
                <textarea
                  id="wfh-modal-note"
                  rows={2}
                  value={wfhNote}
                  onChange={(e) => setWfhNote(e.target.value)}
                  placeholder="เช่น ประชุมออนไลน์กับลูกค้า, โฟกัสทำรายงานประจำเดือน"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden resize-none transition"
                />
              </div>

              {/* Webhook notification notice */}
              <div className="rounded-xl bg-blue-50/55 border border-blue-200/70 p-3 text-xs text-blue-950 space-y-1">
                <div className="font-semibold text-blue-950">
                  แจ้งเตือนเข้า Google Chat พร้อมลิงก์ Meet อัตโนมัติ
                </div>
                <p className="text-blue-900/85 leading-relaxed">
                  เมื่อกดยืนยัน ระบบจะลงเวลา WFH พร้อมส่งลิงก์ Google Meet แจ้งเตือนเข้าห้องแชทบริษัททันที โดยไม่ต้องยื่นใบขออนุมัติล่วงหน้า
                </p>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsWfhModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer min-h-[42px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white px-5 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-xs disabled:opacity-50 min-h-[42px] flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>ยืนยัน Check-in WFH</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Offsite Check-in Modal */}
      {isOffsiteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Check-in ปฏิบัติงานนอกสถานที่"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 p-0 sm:p-4 backdrop-blur-xs animate-ui-fade"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setIsOffsiteModalOpen(false);
            }
          }}
        >
          <div className="relative flex h-auto max-h-[92dvh] sm:max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 animate-ui-modal">
            {/* Clean Modern Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 border border-teal-200/60 shrink-0">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                    Check-in ปฏิบัติงานนอกสถานที่
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    พบลูกค้า / ประชุมนอกสถานที่ / ออกบูธ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsOffsiteModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form
              onSubmit={handleOffsiteSubmit}
              noValidate
              className="flex-1 overflow-y-auto momentum-scroll p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4 text-sm"
            >
              {offsiteError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-700 font-medium"
                >
                  <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                  <span>{offsiteError}</span>
                </div>
              )}

              {/* User and Time Card */}
              <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    name={currentUser.name}
                    avatarUrl={currentUser.avatarUrl}
                    sizeClass="h-9 w-9"
                    roundedClass="rounded-xl"
                    textClass="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      ฝ่าย {currentUser.department || '-'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-400 font-medium">เวลา Check-in</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-teal-700">
                    {myTodayRecord?.checkInTime || liveTime || getBangkokNow().timeStr} น.
                  </div>
                </div>
              </div>

              {/* Field: Location / Client Name (Required) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="offsite-modal-location"
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700"
                >
                  <MapPin className="h-4 w-4 text-teal-600 shrink-0" />
                  <span>
                    สถานที่ปฏิบัติงาน / ชื่อลูกค้า / ชื่องานออกบูธ{' '}
                    <span className="text-rose-500">*</span>
                  </span>
                </label>
                <input
                  id="offsite-modal-location"
                  type="text"
                  autoFocus
                  required
                  value={offsiteLocation}
                  onChange={(e) => setOffsiteLocation(e.target.value)}
                  placeholder="เช่น บจก. สยามเทค (สีลม), ศูนย์สิริกิติ์"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-500/10 focus:outline-hidden transition"
                />
              </div>

              {/* Field: Extra Note (Optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="offsite-modal-note"
                  className="block text-xs sm:text-sm font-semibold text-slate-700"
                >
                  หมายเหตุ / รายละเอียดสถานที่เพิ่มเติม (ถ้ามี)
                </label>
                <textarea
                  id="offsite-modal-note"
                  rows={2}
                  value={offsiteNote}
                  onChange={(e) => setOffsiteNote(e.target.value)}
                  placeholder="เช่น ประชุมสรุป Requirement โครงการใหม่, ออกบูธแนะนำบริการ"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-500/10 focus:outline-hidden resize-none transition"
                />
              </div>

              {/* Webhook notification notice */}
              <div className="rounded-xl bg-teal-50/50 border border-teal-200/60 p-3 text-xs text-teal-900 space-y-1">
                <div className="font-semibold text-teal-950">
                  แจ้งเตือนเข้า Google Chat อัตโนมัติ
                </div>
                <p className="text-teal-800/90 leading-relaxed">
                  เมื่อกดยืนยัน ระบบจะลงเวลาเข้างานพร้อมส่งข้อความแจ้งเตือนเข้าห้องแชทบริษัททันที โดยไม่ต้องรอส่งใบลาขออนุมัติล่วงหน้า
                </p>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsOffsiteModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer min-h-[42px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-xs disabled:opacity-50 min-h-[42px] flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>ยืนยัน Check-in นอกสถานที่</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
