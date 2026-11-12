'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  LogOut,
  MapPin,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';
import ApprovalAndHistoryView from '@/components/ApprovalAndHistoryView';
import AttendanceAndOfficeView from '@/components/AttendanceAndOfficeView';
import HrDashboardView from '@/components/HrDashboardView';
import HrManagementView from '@/components/HrManagementView';
import LeaveCalendar from '@/components/LeaveCalendar';
import LeavePolicyModal from '@/components/LeavePolicyModal';
import LeaveRequestModal from '@/components/LeaveRequestModal';
import LoginView from '@/components/LoginView';
import {
  LEAVE_TYPE_META,
  PROBATION_RESTRICTED_TYPES,
  ROLE_META,
  WORK_LOCATION_META,
  checkApprovalPermission,
  getProbationInfo,
} from '@/lib/leave-utils';
import { DashboardPayload } from '@/lib/hr-service';
import {
  LeaveDuration,
  LeaveType,
  Role,
  SafeUser,
  WorkLocationType,
} from '@/lib/types';

type MainTab = 'OFFICE' | 'CALENDAR' | 'APPROVALS' | 'DASHBOARD' | 'MANAGEMENT';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [systemData, setSystemData] = useState<DashboardPayload | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('OFFICE');
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [isMobileQuotaOpen, setIsMobileQuotaOpen] = useState<boolean>(false);
  const [isPolicyOnlyView, setIsPolicyOnlyView] = useState<boolean>(false);
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>(
    undefined
  );

  const currentYear = new Date().getFullYear();

  const isHrOrCLevel =
    currentUser?.role === 'hr' ||
    currentUser?.role === 'c_level' ||
    currentUser?.role === 'admin';

  const fetchDashboardData = useCallback(
    async (userId: string) => {
      setLoadingData(true);
      try {
        const res = await fetch(
          `/api/system?userId=${encodeURIComponent(userId)}&year=${currentYear}`
        );
        const data = await res.json();
        if (res.ok && data.currentUser) {
          setSystemData(data);
          setCurrentUser(data.currentUser);
          setActiveTab((prev) =>
            (prev === 'MANAGEMENT' || prev === 'DASHBOARD') &&
            data.currentUser.role !== 'hr' &&
            data.currentUser.role !== 'c_level' &&
            data.currentUser.role !== 'admin'
              ? 'OFFICE'
              : prev
          );
          try {
            localStorage.setItem('hr_active_user_id', data.currentUser.id);
          } catch {
            // Ignore
          }
        } else {
          try {
            localStorage.removeItem('hr_active_user_id');
          } catch {
            // Ignore
          }
          setCurrentUser(null);
          setSystemData(null);
        }
      } catch {
        try {
          localStorage.removeItem('hr_active_user_id');
        } catch {
          // Ignore
        }
        setCurrentUser(null);
        setSystemData(null);
      } finally {
        setLoadingData(false);
      }
    },
    [currentYear]
  );

  // Restore session from localStorage if available
  useEffect(() => {
    let active = true;
    try {
      const savedUserId = localStorage.getItem('hr_active_user_id');
      if (savedUserId) {
        fetchDashboardData(savedUserId).finally(() => {
          if (active) setIsInitializing(false);
        });
      } else {
        setIsInitializing(false);
      }
    } catch {
      setIsInitializing(false);
    }
    return () => {
      active = false;
    };
  }, [fetchDashboardData]);

  // Enforce role-based tab access
  useEffect(() => {
    if (
      currentUser &&
      !isHrOrCLevel &&
      (activeTab === 'DASHBOARD' || activeTab === 'MANAGEMENT')
    ) {
      setActiveTab('OFFICE');
    }
  }, [currentUser, isHrOrCLevel, activeTab]);

  // Close mobile quota popover on active tab change
  useEffect(() => {
    setIsMobileQuotaOpen(false);
  }, [activeTab]);

  // Close mobile quota popover when pressing Escape
  useEffect(() => {
    if (!isMobileQuotaOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileQuotaOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileQuotaOpen]);

  const handleLoginSuccess = (user: SafeUser) => {
    try {
      localStorage.setItem('hr_active_user_id', user.id);
    } catch {
      // Ignore
    }
    setCurrentUser(user);
    setActiveTab('OFFICE');
    fetchDashboardData(user.id);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('hr_active_user_id');
    } catch {
      // Ignore
    }
    setCurrentUser(null);
    setSystemData(null);
    setIsMobileQuotaOpen(false);
    setActiveTab('OFFICE');
  };

  // จำนวนใบลาที่รอให้คนนี้กดอนุมัติจริงตามสาย 4 บทบาท (แยกตามสายบังคับบัญชาแผนก)
  const pendingApprovalCount = useMemo(() => {
    if (!systemData || !currentUser || currentUser.role === 'employee') return 0;
    return systemData.leaves.filter((l) => {
      if (currentUser.role === 'manager') {
        const userDept = (currentUser.department || '').trim().toLowerCase();
        const leaveDept = (l.department || '').trim().toLowerCase();
        if (!userDept || !leaveDept || userDept !== leaveDept) return false;
      }
      return checkApprovalPermission(l, currentUser).allowed;
    }).length;
  }, [systemData, currentUser]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const myTodayAttendance = useMemo(() => {
    if (!systemData?.attendance || !currentUser) return null;
    return systemData.attendance.find(
      (a) => a.userId === currentUser.id && a.date === todayStr
    );
  }, [systemData?.attendance, currentUser, todayStr]);

  const handleOpenRequestModal = (dateStr?: string) => {
    setModalInitialDate(dateStr);
    setIsPolicyOnlyView(false);
    setIsPolicyModalOpen(true);
  };

  const handleOpenPolicyOnlyModal = () => {
    setIsPolicyOnlyView(true);
    setIsPolicyModalOpen(true);
  };

  const handleCreateLeave = async (payload: {
    leaveType: LeaveType;
    durationType: LeaveDuration;
    startDate: string;
    endDate: string;
    reason: string;
    locationDetail?: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ยื่นคำขอไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleProcessLeaveAction = async (
    leaveId: string,
    action: 'approve' | 'reject' | 'cancel',
    comment?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/leaves', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        leaveId,
        action,
        comment,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ดำเนินการไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleCheckIn = async (payload: {
    workLocation: WorkLocationType;
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        workLocation: payload.workLocation,
        note: payload.note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกเวลาเข้างานไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleCheckOut = async (payload: {
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/attendance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        note: payload.note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกเวลาออกงานไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleUpsertEmployee = async (employeeData: {
    id?: string;
    username?: string;
    name?: string;
    englishName?: string;
    email: string;
    role: Role;
    department?: string;
    position?: string;
    startDate?: string;
    quotas?: {
      sick?: number;
      personal?: number;
      vacation?: number;
      wfh?: number;
      wfa?: number;
      offsite?: number;
    };
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        employee: employeeData,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleDeleteEmployee = async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch(
      `/api/employees?actorId=${encodeURIComponent(
        currentUser.id
      )}&userId=${encodeURIComponent(targetUserId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ลบไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleUpsertHoliday = async (holidayData: {
    id?: string;
    date: string;
    name: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: currentUser.id,
        holiday: holidayData,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกวันหยุดไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  const handleDeleteHoliday = async (
    holidayId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch(
      `/api/holidays?actorId=${encodeURIComponent(
        currentUser.id
      )}&holidayId=${encodeURIComponent(holidayId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ลบวันหยุดไม่สำเร็จ' };
    }
    await fetchDashboardData(currentUser.id);
    return { success: true };
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-[#0A2540] via-[#0066FF] to-[#2563EB] text-white shadow-xl shadow-blue-600/30 ring-8 ring-blue-500/10 animate-pulse">
            <Calendar className="h-8 w-8" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-black text-slate-900 tracking-tight">
                วันนี้ลา
              </span>
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2 py-0.5 text-xs font-black">
                by DBC
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              กำลังตรวจสอบข้อมูลเซสชัน...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || !systemData) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const rawProbation = getProbationInfo(currentUser.startDate);
  const probation =
    currentUser.role === 'c_level' || currentUser.role === 'admin'
      ? { ...rawProbation, passed: true, daysRemaining: 0 }
      : rawProbation;

  return (
    <div className="min-h-screen bg-slate-50/80 flex flex-col md:flex-row">
      {/* =================================================================
          DESKTOP LEFT SIDEBAR NAVBAR (md: and up)
          ================================================================= */}
      <aside className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 z-40 bg-white border-r border-slate-200/90 shadow-xs">
        {/* Sidebar Header: Brand & Live Status */}
        <div className="p-4 lg:p-5 border-b border-slate-100 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 lg:h-11 lg:w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0A2540] to-[#0066FF] text-white shadow-md shadow-blue-900/20 ring-2 ring-blue-500/10 shrink-0">
              <Calendar className="h-5 w-5 lg:h-5.5 lg:w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base lg:text-lg font-black tracking-tight text-slate-900 truncate">
                  วันนี้ลา
                </span>
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2 py-0.5 text-xs font-black tracking-wider shadow-2xs shrink-0">
                  by DBC
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">
                  {systemData.storageMode === 'google_sheets'
                    ? 'Google Sheets (Live)'
                    : 'PDPA Verified'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Button: Request Leave */}
        <div className="p-3.5 lg:p-4 pb-2">
          <button
            type="button"
            onClick={() => handleOpenRequestModal()}
            className="w-full rounded-2xl bg-gradient-to-r from-[#0066FF] via-blue-600 to-[#1D4ED8] p-3 lg:p-3.5 text-xs lg:text-sm font-black text-white shadow-md shadow-blue-600/25 hover:shadow-lg hover:from-blue-700 hover:to-[#0A2540] transition flex items-center justify-center gap-2 cursor-pointer ring-2 ring-blue-500/20 active:scale-98"
          >
            <CalendarPlus className="h-4 w-4 lg:h-5 lg:w-5 shrink-0" />
            <span>+ ยื่นใบลา / WFH</span>
          </button>
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto px-3 lg:px-4 py-2 space-y-1.5 momentum-scroll">
          <div className="text-xs font-bold text-slate-400 px-3 uppercase tracking-wider mb-2">
            เมนูหลัก
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('OFFICE')}
            className={`w-full rounded-2xl px-3.5 py-3 text-xs lg:text-sm font-bold transition flex items-center justify-between gap-3 cursor-pointer text-left ${
              activeTab === 'OFFICE'
                ? 'bg-blue-50/90 text-blue-700 border border-blue-200/80 shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <MapPin
                className={`h-5 w-5 shrink-0 ${
                  activeTab === 'OFFICE' ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Check-in &amp; ออฟฟิศ</span>
            </div>
            {myTodayAttendance && (
              <span
                className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                title="Check-in แล้ว"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CALENDAR')}
            className={`w-full rounded-2xl px-3.5 py-3 text-xs lg:text-sm font-bold transition flex items-center gap-3 cursor-pointer text-left ${
              activeTab === 'CALENDAR'
                ? 'bg-blue-50/90 text-blue-700 border border-blue-200/80 shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <Calendar
              className={`h-5 w-5 shrink-0 ${
                activeTab === 'CALENDAR' ? 'text-blue-600' : 'text-slate-400'
              }`}
            />
            <span className="truncate">ปฏิทินวันลา &amp; โควต้า</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('APPROVALS')}
            className={`w-full rounded-2xl px-3.5 py-3 text-xs lg:text-sm font-bold transition flex items-center justify-between gap-3 cursor-pointer text-left ${
              activeTab === 'APPROVALS'
                ? 'bg-blue-50/90 text-blue-700 border border-blue-200/80 shadow-2xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <CheckSquare
                className={`h-5 w-5 shrink-0 ${
                  activeTab === 'APPROVALS'
                    ? 'text-blue-600'
                    : 'text-slate-400'
                }`}
              />
              <span className="truncate">
                {currentUser.role === 'employee'
                  ? 'ประวัติการลาของฉัน'
                  : 'อนุมัติใบลา & ประวัติ'}
              </span>
            </div>
            {currentUser.role !== 'employee' && pendingApprovalCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-black shadow-xs shrink-0">
                {pendingApprovalCount}
              </span>
            )}
          </button>

          {isHrOrCLevel && (
            <>
              <div className="pt-4 pb-1 text-xs font-bold text-slate-400 px-3 uppercase tracking-wider">
                ผู้ดูแลระบบ (HR / C-Level)
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('DASHBOARD')}
                className={`w-full rounded-2xl px-3.5 py-3 text-xs lg:text-sm font-bold transition flex items-center gap-3 cursor-pointer text-left ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200/80 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <BarChart3
                  className={`h-5 w-5 shrink-0 ${
                    activeTab === 'DASHBOARD'
                      ? 'text-blue-600'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">สถิติ &amp; รายงานวันลา</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MANAGEMENT')}
                className={`w-full rounded-2xl px-3.5 py-3 text-xs lg:text-sm font-bold transition flex items-center gap-3 cursor-pointer text-left ${
                  activeTab === 'MANAGEMENT'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200/80 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <Settings
                  className={`h-5 w-5 shrink-0 ${
                    activeTab === 'MANAGEMENT'
                      ? 'text-blue-600'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">จัดการพนักงาน &amp; วันหยุด</span>
              </button>
            </>
          )}

          {/* Desktop Quota Display Widget */}
          <div className="pt-3 pb-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                โควต้าวันลาคงเหลือ
              </span>
              <button
                type="button"
                onClick={handleOpenPolicyOnlyModal}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                title="ดูระเบียบและเงื่อนไขการลา"
              >
                เงื่อนไข
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50/90 border border-slate-200/80 p-2.5 space-y-2.5 shadow-2xs">
              {(['sick', 'personal', 'vacation'] as LeaveType[]).map((type) => {
                const meta = LEAVE_TYPE_META[type];
                const q = systemData.myQuota.quotas[type];
                const lockedByProbation =
                  !probation.passed && PROBATION_RESTRICTED_TYPES.includes(type);
                const usedPercent = Math.min(
                  100,
                  Math.round(
                    ((q.usedDays + q.pendingDays) / (q.totalQuota || 1)) * 100
                  )
                );

                const icon =
                  type === 'sick' ? (
                    <Activity className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  ) : type === 'personal' ? (
                    <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                  );

                const barColor =
                  type === 'sick'
                    ? 'bg-rose-500'
                    : type === 'personal'
                    ? 'bg-amber-500'
                    : 'bg-sky-500';

                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {icon}
                        <span className="font-bold text-slate-700 truncate">
                          {meta.shortLabel}
                        </span>
                        {lockedByProbation && (
                          <span className="rounded bg-amber-100 border border-amber-300 px-1 py-0.2 text-[10px] font-bold text-amber-800 shrink-0">
                            รอโปร
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1 shrink-0">
                        <span className="font-black text-slate-900 text-xs">
                          {q.remainingDays}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          /{q.totalQuota} วัน
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium px-0.5">
                      <span>ใช้ไป {q.usedDays} วัน</span>
                      {q.pendingDays > 0 ? (
                        <span className="text-amber-700 font-bold bg-amber-100/80 px-1 py-0.2 rounded">
                          รอ {q.pendingDays} วัน
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">
                          พร้อมใช้
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Bottom: User Card & Logout */}
        <div className="p-3 lg:p-4 border-t border-slate-100 bg-slate-50/70 space-y-3">
          {/* User Profile Info Card */}
          <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-2xs space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0A2540] to-[#0066FF] text-white font-extrabold text-sm shrink-0 shadow-2xs">
                {currentUser.name.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {currentUser.name}
                </div>
                <div className="text-xs text-slate-500 font-medium truncate">
                  {currentUser.email}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 text-xs">
              <span
                className={`rounded-md border px-1.5 py-0.5 font-bold ${
                  ROLE_META[currentUser.role].badgeClass
                }`}
              >
                {ROLE_META[currentUser.role].label}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-bold ${
                  probation.passed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {probation.passed
                  ? 'ผ่านโปร'
                  : `ทดลองงาน (${probation.daysWorked}/119ว.)`}
              </span>
            </div>
          </div>

          {/* Logout & Refresh Row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDashboardData(currentUser.id)}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loadingData ? 'animate-spin text-blue-600' : ''
                }`}
              />
              <span>รีเฟรช</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-rose-200 bg-rose-50/80 py-2 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>ออก</span>
            </button>
          </div>

          {/* Legal Links in Sidebar */}
          <div className="pt-1 flex items-center justify-center gap-2 text-xs text-slate-400">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 underline transition-colors"
            >
              ความเป็นส่วนตัว
            </a>
            <span>•</span>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 underline transition-colors"
            >
              เงื่อนไข
            </a>
          </div>
        </div>
      </aside>

      {/* =================================================================
          MAIN CONTENT AREA (Offset by sidebar on desktop)
          ================================================================= */}
      <div className="flex-1 min-w-0 md:pl-64 lg:pl-72 flex flex-col min-h-screen">
        {/* Top Header Bar for Desktop & Mobile */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
          <div className="relative z-40 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 bg-white">
            {/* Mobile Branding (only visible on mobile) */}
            <div className="flex md:hidden items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0A2540] to-[#0066FF] text-white shadow-xs shrink-0">
                <Calendar className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-sm font-black text-slate-900 truncate">
                    วันนี้ลา
                  </span>
                  <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-black tracking-wider shadow-2xs shrink-0">
                    by DBC
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                  คุณ {currentUser.name.split(' ')[0]}
                </div>
              </div>
            </div>

            {/* Desktop View Header / Title */}
            <div className="hidden md:flex items-center gap-3 min-w-0">
              <div className="text-base lg:text-lg font-black text-slate-900 flex items-center gap-2">
                {activeTab === 'OFFICE' && (
                  <>
                    <MapPin className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>ลงเวลาเข้างาน (Check-in) &amp; ใครอยู่ออฟฟิศวันนี้</span>
                  </>
                )}
                {activeTab === 'CALENDAR' && (
                  <>
                    <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
                    <span>ปฏิทินวันลา &amp; โควต้าคงเหลือ</span>
                  </>
                )}
                {activeTab === 'APPROVALS' && (
                  <>
                    <CheckSquare className="h-5 w-5 text-amber-600 shrink-0" />
                    <span>
                      {currentUser.role === 'employee'
                        ? 'ประวัติการลาของฉัน'
                        : 'อนุมัติใบลา & ประวัติคำขอ'}
                    </span>
                  </>
                )}
                {activeTab === 'DASHBOARD' && (
                  <>
                    <BarChart3 className="h-5 w-5 text-blue-600 shrink-0" />
                    <span>สถิติ &amp; รายงานวันลาภาพรวมบริษัท</span>
                  </>
                )}
                {activeTab === 'MANAGEMENT' && (
                  <>
                    <Settings className="h-5 w-5 text-slate-700 shrink-0" />
                    <span>จัดการฐานข้อมูลพนักงาน &amp; วันหยุดบริษัท</span>
                  </>
                )}
              </div>
            </div>

            {/* Right Quick Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Today Attendance Status Indicator */}
              {myTodayAttendance ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    {myTodayAttendance.checkOutTime
                      ? `เลิกงาน ${myTodayAttendance.checkOutTime} น.`
                      : `เข้างาน ${myTodayAttendance.checkInTime} น. (${
                          WORK_LOCATION_META[myTodayAttendance.workLocation]
                            ?.shortLabel || 'Office'
                        })`}
                  </span>
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 shadow-2xs">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>ยังไม่ Check-in วันนี้</span>
                </span>
              )}

              {/* Desktop Quick Quota Pill Indicator */}
              <button
                type="button"
                onClick={handleOpenPolicyOnlyModal}
                className="hidden lg:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-100 hover:border-slate-300 transition cursor-pointer"
                title="คลิกเพื่อดูระเบียบและเงื่อนไขการลา"
              >
                <span className="text-slate-400 font-bold text-[11px] mr-0.5">โควต้า:</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-bold" title="ลาป่วยคงเหลือ">
                  <Activity className="h-3 w-3 text-rose-500" />
                  <span>{systemData.myQuota.quotas.sick.remainingDays}/{systemData.myQuota.quotas.sick.totalQuota}</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-bold" title="ลากิจคงเหลือ">
                  <FileText className="h-3 w-3 text-amber-500" />
                  <span>{systemData.myQuota.quotas.personal.remainingDays}/{systemData.myQuota.quotas.personal.totalQuota}</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-bold" title="ลาพักร้อนคงเหลือ">
                  <Sun className="h-3 w-3 text-sky-500" />
                  <span>{systemData.myQuota.quotas.vacation.remainingDays}/{systemData.myQuota.quotas.vacation.totalQuota}</span>
                </span>
              </button>

              {/* Mobile quick Request button */}
              <button
                type="button"
                onClick={() => handleOpenRequestModal()}
                className="md:hidden rounded-xl bg-gradient-to-r from-[#0066FF] to-[#1D4ED8] hover:from-blue-700 hover:to-[#0A2540] px-2.5 sm:px-3 py-2 text-xs font-black text-white shadow-xs flex items-center gap-1.5 min-h-[40px] sm:min-h-[44px] active:scale-95 transition"
              >
                <CalendarPlus className="h-4 w-4 shrink-0" />
                <span className="hidden xs:inline">ยื่นใบลา</span>
              </button>

              {/* Refresh button */}
              <button
                type="button"
                onClick={() => fetchDashboardData(currentUser.id)}
                className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-2xs min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center active:scale-95"
                title="รีเฟรชข้อมูล"
                aria-label="รีเฟรชข้อมูล"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loadingData ? 'animate-spin text-blue-600' : ''
                  }`}
                />
              </button>

              {/* Mobile logout button */}
              <button
                type="button"
                onClick={handleLogout}
                className="md:hidden rounded-xl border border-rose-200 bg-rose-50 p-2 sm:p-2.5 text-rose-700 hover:bg-rose-100 transition shadow-2xs min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center active:scale-95"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mobile Quota Quick Bar */}
          <div className="relative z-40 md:hidden border-t border-slate-100 bg-slate-50/90 px-2 sm:px-3 py-1.5">
            <div className="flex items-center justify-between gap-1 sm:gap-1.5">
              {(['sick', 'personal', 'vacation'] as LeaveType[]).map((type) => {
                const meta = LEAVE_TYPE_META[type];
                const q = systemData.myQuota.quotas[type];

                const icon =
                  type === 'sick' ? (
                    <Activity className="h-3 w-3 text-rose-600 shrink-0" />
                  ) : type === 'personal' ? (
                    <FileText className="h-3 w-3 text-amber-600 shrink-0" />
                  ) : (
                    <Sun className="h-3 w-3 text-sky-600 shrink-0" />
                  );

                const borderClass =
                  type === 'sick'
                    ? 'border-rose-200/80 text-rose-700'
                    : type === 'personal'
                    ? 'border-amber-200/80 text-amber-700'
                    : 'border-sky-200/80 text-sky-700';

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setIsMobileQuotaOpen((prev) => !prev)}
                    className={`flex-1 rounded-xl bg-white border ${borderClass} px-1.5 sm:px-2 py-1 sm:py-1.5 flex items-center justify-between text-xs shadow-2xs active:scale-95 transition cursor-pointer min-w-0`}
                    title={`โควต้า${meta.shortLabel}คงเหลือ ${q.remainingDays}/${q.totalQuota} วัน (แตะเพื่อดูรายละเอียด)`}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      {icon}
                      <span className="font-bold text-slate-700 text-[10px] sm:text-[11px] shrink-0">
                        {meta.shortLabel}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-0.5 shrink-0 ml-0.5 text-slate-900">
                      <span className="font-black text-[11px] sm:text-xs">
                        {q.remainingDays}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold">
                        /{q.totalQuota}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Mobile Quota Drawer Toggle */}
              <button
                type="button"
                onClick={() => setIsMobileQuotaOpen((prev) => !prev)}
                className="rounded-xl border border-slate-200 bg-white p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 transition active:scale-95 shadow-2xs shrink-0 flex items-center justify-center cursor-pointer min-h-[32px] min-w-[32px]"
                title={isMobileQuotaOpen ? 'ซ่อนรายละเอียดโควต้า' : 'ดูรายละเอียดโควต้า'}
                aria-label="ดูรายละเอียดโควต้า"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isMobileQuotaOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mobile Expandable Quota Drawer / Popover */}
          {isMobileQuotaOpen && (
            <>
              {/* Backdrop: clicking outside dismisses drawer */}
              <div
                className="md:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
                onClick={() => setIsMobileQuotaOpen(false)}
                aria-hidden="true"
              />

              <div
                role="region"
                aria-label="รายละเอียดโควต้าวันลา"
                className="md:hidden absolute top-full inset-x-0 z-40 border-t border-slate-200 bg-white px-4 py-3.5 shadow-xl space-y-3 max-h-[calc(100dvh-120px)] overflow-y-auto momentum-scroll"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-blue-500/20" />
                    <span className="text-xs sm:text-sm font-black text-slate-900">
                      รายละเอียดโควต้าวันลา ปี {currentYear}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileQuotaOpen(false);
                        handleOpenPolicyOnlyModal();
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer p-1"
                    >
                      เงื่อนไข
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMobileQuotaOpen(false)}
                      className="text-xs font-bold text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      aria-label="ปิดรายละเอียดโควต้า"
                    >
                      ✕ ปิด
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {(['sick', 'personal', 'vacation'] as LeaveType[]).map((type) => {
                    const meta = LEAVE_TYPE_META[type];
                    const q = systemData.myQuota.quotas[type];
                    const lockedByProbation =
                      !probation.passed && PROBATION_RESTRICTED_TYPES.includes(type);
                    const usedPercent = Math.min(
                      100,
                      Math.round(
                        ((q.usedDays + q.pendingDays) / (q.totalQuota || 1)) * 100
                      )
                    );

                    const icon =
                      type === 'sick' ? (
                        <Activity className="h-4 w-4 text-rose-600 shrink-0" />
                      ) : type === 'personal' ? (
                        <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                      ) : (
                        <Sun className="h-4 w-4 text-sky-600 shrink-0" />
                      );

                    const barColor =
                      type === 'sick'
                        ? 'bg-rose-500'
                        : type === 'personal'
                        ? 'bg-amber-500'
                        : 'bg-sky-500';

                    return (
                      <div
                        key={type}
                        className="rounded-2xl bg-slate-50/90 border border-slate-200/80 p-3 space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {icon}
                            <span className="text-xs font-black text-slate-800 truncate">
                              {meta.label}
                            </span>
                            {lockedByProbation && (
                              <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 shrink-0">
                                รอผ่านโปร (119 วัน)
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-extrabold text-slate-900 shrink-0 ml-2">
                            เหลือ <span className="text-blue-700 font-black">{q.remainingDays}</span> จาก {q.totalQuota} วัน
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${usedPercent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                          <span>ใช้ไปแล้ว: {q.usedDays} วัน</span>
                          {q.pendingDays > 0 ? (
                            <span className="text-amber-800 font-bold bg-amber-100/90 px-1.5 py-0.2 rounded text-[10px]">
                              รออนุมัติ {q.pendingDays} วัน
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold text-[10px]">
                              พร้อมใช้งาน
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-10 space-y-6">
        {/* Google Sheets API Warning Banner for Admin */}
        {currentUser.role === 'admin' && systemData.storageMode === 'demo_local' && systemData.syncError && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs sm:text-sm text-amber-950 flex items-start gap-3 shadow-2xs">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-bold flex items-center gap-2 flex-wrap">
                <span>Google Sheets ยังไม่ได้รับข้อมูลอัปเดต (ระบบกำลังบันทึกใน Local Storage ชั่วคราว)</span>
                <span className="rounded-md bg-amber-200/90 px-2 py-0.5 text-xs font-black text-amber-950">
                  รอเปิดใช้งาน Sheets API
                </span>
              </div>
              <p className="mt-1 text-amber-800 leading-relaxed">
                สาเหตุเนื่องจากใน Google Cloud Project ยังไม่ได้กดเปิดใช้งาน (Enable) ตัว <strong>Google Sheets API</strong> ข้อมูลการลงเวลาและใบลาจึงยังไม่ถูกส่งเข้าชีต
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <a
                  href="https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=112533483238"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>คลิกเพื่อเปิดใช้งาน Google Sheets API ใน Google Cloud</span>
                </a>
                <span className="text-xs text-amber-700">
                  (เมื่อกด Enable แล้ว ให้รีเฟรชหน้านี้ ข้อมูลจะซิงค์เข้าชีตแบบเรียลไทม์ทันที)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Active View Content */}
        {activeTab === 'OFFICE' && (
          <AttendanceAndOfficeView
            currentUser={currentUser}
            users={systemData.users}
            attendance={systemData.attendance || []}
            leaves={systemData.leaves}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
          />
        )}

        {activeTab === 'CALENDAR' && (
          <LeaveCalendar
            currentUser={currentUser}
            leaves={systemData.leaves}
            holidays={systemData.holidays}
            onOpenRequestModal={handleOpenRequestModal}
            onOpenPolicyModal={handleOpenPolicyOnlyModal}
          />
        )}

        {activeTab === 'APPROVALS' && (
          <ApprovalAndHistoryView
            currentUser={currentUser}
            leaves={systemData.leaves}
            onProcessLeaveAction={handleProcessLeaveAction}
          />
        )}

        {activeTab === 'DASHBOARD' && isHrOrCLevel && (
          <HrDashboardView
            currentUser={currentUser}
            leaves={systemData.leaves}
            holidays={systemData.holidays}
            allQuotas={systemData.allQuotas}
            year={currentYear}
            onNavigateToApprovals={() => setActiveTab('APPROVALS')}
          />
        )}

        {activeTab === 'MANAGEMENT' && isHrOrCLevel && (
          <HrManagementView
            currentUser={currentUser}
            users={systemData.users}
            holidays={systemData.holidays}
            onUpsertEmployee={handleUpsertEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onUpsertHoliday={handleUpsertHoliday}
            onDeleteHoliday={handleDeleteHoliday}
          />
        )}

        {/* Global Footer */}
        <footer className="mt-12 pt-6 pb-20 md:pb-8 border-t border-slate-200/80 text-center text-xs text-slate-500 space-y-2">
          <div className="flex items-center justify-center gap-3 font-medium">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              นโยบายความเป็นส่วนตัว (Privacy)
            </a>
            <span>•</span>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              ข้อกำหนดการใช้งาน (Terms)
            </a>
          </div>
          <p className="text-xs text-slate-400">
            ระบบวันนี้ลา by DBC • Digital Business Consult Co., Ltd. สงวนลิขสิทธิ์
          </p>
        </footer>
      </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-1.5 py-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] grid ${
          isHrOrCLevel ? 'grid-cols-5' : 'grid-cols-4'
        } gap-1 shadow-[0_-4px_24px_rgba(15,23,42,0.08)]`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('OFFICE')}
          className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition min-h-[52px] active:scale-95 duration-100 ${
            activeTab === 'OFFICE'
              ? 'text-blue-700 bg-blue-50/90 ring-1 ring-blue-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <MapPin className="h-5 w-5 mb-0.5 shrink-0" />
          <span className="text-[11px] sm:text-xs truncate text-center w-full">Check-in</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CALENDAR')}
          className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition min-h-[52px] active:scale-95 duration-100 ${
            activeTab === 'CALENDAR'
              ? 'text-blue-700 bg-blue-50/90 ring-1 ring-blue-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Calendar className="h-5 w-5 mb-0.5 shrink-0" />
          <span className="text-[11px] sm:text-xs truncate text-center w-full">ปฏิทิน</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APPROVALS')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition min-h-[52px] active:scale-95 duration-100 ${
            activeTab === 'APPROVALS'
              ? 'text-blue-700 bg-blue-50/90 ring-1 ring-blue-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <CheckSquare className="h-5 w-5 mb-0.5 shrink-0" />
          <span className="text-[11px] sm:text-xs truncate text-center w-full">
            {currentUser.role === 'employee' ? 'ประวัติลา' : 'อนุมัติ'}
          </span>
          {currentUser.role !== 'employee' && pendingApprovalCount > 0 && (
            <span className="absolute top-0.5 right-1 h-4 min-w-[16px] rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center px-1 shadow-xs">
              {pendingApprovalCount}
            </span>
          )}
        </button>

        {isHrOrCLevel ? (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition min-h-[52px] active:scale-95 duration-100 ${
                activeTab === 'DASHBOARD'
                  ? 'text-blue-700 bg-blue-50/90 ring-1 ring-blue-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <BarChart3 className="h-5 w-5 mb-0.5 shrink-0" />
              <span className="text-[11px] sm:text-xs truncate text-center w-full">สถิติ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('MANAGEMENT')}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition min-h-[52px] active:scale-95 duration-100 ${
                activeTab === 'MANAGEMENT'
                  ? 'text-blue-700 bg-blue-50/90 ring-1 ring-blue-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <Settings className="h-5 w-5 mb-0.5 shrink-0" />
              <span className="text-[11px] sm:text-xs truncate text-center w-full">ตั้งค่า HR</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleOpenRequestModal()}
            className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl text-white bg-[#0066FF] hover:bg-blue-700 shadow-xs min-h-[52px] font-bold active:scale-95 duration-100"
          >
            <CalendarPlus className="h-5 w-5 mb-0.5 shrink-0" />
            <span className="text-[11px] sm:text-xs truncate text-center w-full">ยื่นใบลา</span>
          </button>
        )}
      </nav>

      {/* Leave Policy Terms Modal (Pops up when clicking leave request or viewing policy) */}
      <LeavePolicyModal
        isOpen={isPolicyModalOpen}
        onlyView={isPolicyOnlyView}
        onClose={() => setIsPolicyModalOpen(false)}
        onConfirm={() => {
          setIsPolicyModalOpen(false);
          setIsLeaveModalOpen(true);
        }}
      />

      {/* Leave Request Modal */}
      <LeaveRequestModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        initialDate={modalInitialDate}
        currentUser={currentUser}
        leaves={systemData.leaves}
        holidays={systemData.holidays}
        myQuota={systemData.myQuota}
        onSubmitLeave={handleCreateLeave}
      />
    </div>
  );
}
