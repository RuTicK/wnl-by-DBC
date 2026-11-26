'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  CalendarPlus,
  CheckSquare,
  ChevronDown,
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
import UserAvatar from '@/components/UserAvatar';
import {
  ENABLE_WFA,
  LEAVE_TYPE_META,
  PROBATION_RESTRICTED_TYPES,
  ROLE_META,
  WORK_LOCATION_META,
  checkApprovalPermission,
  getBangkokNow,
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
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [isMobileQuotaOpen, setIsMobileQuotaOpen] = useState<boolean>(false);
  const [isPolicyOnlyView, setIsPolicyOnlyView] = useState<boolean>(false);
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>(
    undefined
  );

  const currentYear = useMemo(() => getBangkokNow().year, []);

  const isHrOrCLevel =
    currentUser?.role === 'hr' ||
    currentUser?.role === 'c_level' ||
    currentUser?.role === 'admin';

  const fetchDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch(`/api/system?year=${currentYear}`, {
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (res.ok && data.currentUser) {
        setStorageError(null);
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
      } else if (res.status === 401) {
        setStorageError(null);
        setCurrentUser(null);
        setSystemData(null);
      } else if (res.status === 503 || data.storageUnavailable) {
        setStorageError(
          data.error ||
            'ไม่สามารถเชื่อมต่อฐานข้อมูล Google Sheets ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง'
        );
      }
    } catch {
      // Preserve current UI state on transient network errors instead of forcing logout
    } finally {
      setLoadingData(false);
    }
  }, [currentYear]);

  // Restore session from server HttpOnly session cookie
  useEffect(() => {
    let active = true;
    try {
      localStorage.removeItem('hr_active_user_id');
    } catch {
      // Ignore
    }
    fetchDashboardData().finally(() => {
      if (active) setIsInitializing(false);
    });
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
    setCurrentUser(user);
    setActiveTab('OFFICE');
    fetchDashboardData();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // Ignore network error on logout
    }
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
      if (currentUser.role === 'c_level' && l.status === 'pending_manager') {
        const userDept = (currentUser.department || '').trim().toLowerCase();
        const leaveDept = (l.department || '').trim().toLowerCase();
        const isGeneralExecutive =
          !userDept ||
          userDept === 'executive (c-level)' ||
          userDept === 'executive' ||
          userDept === 'ผู้บริหาร (c-level)';
        if (!isGeneralExecutive && userDept !== leaveDept) return false;
      }
      return checkApprovalPermission(l, currentUser).allowed;
    }).length;
  }, [systemData, currentUser]);

  const todayStr = useMemo(() => {
    return getBangkokNow().dateStr;
  }, []);

  const myTodayAttendance = useMemo(() => {
    if (!systemData?.attendance || !currentUser) return null;
    return systemData.attendance.find(
      (a) =>
        a.userId === currentUser.id &&
        a.date === todayStr &&
        (ENABLE_WFA || a.workLocation !== 'wfa')
    );
  }, [systemData?.attendance, currentUser, todayStr]);

  const handleOpenRequestModal = (dateStr?: string) => {
    setIsMobileQuotaOpen(false);
    setModalInitialDate(dateStr);
    setIsPolicyOnlyView(false);
    setIsPolicyModalOpen(true);
  };

  const handleOpenPolicyOnlyModal = () => {
    setIsMobileQuotaOpen(false);
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
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'ยื่นคำขอไม่สำเร็จ' };
      }
      await fetchDashboardData();
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      };
    }
  };

  const handleProcessLeaveAction = async (
    leaveId: string,
    action: 'approve' | 'reject' | 'cancel',
    comment?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    try {
      const res = await fetch('/api/leaves', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveId,
          action,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'ดำเนินการไม่สำเร็จ' };
      }
      await fetchDashboardData();
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      };
    }
  };

  const handleCheckIn = async (payload: {
    date?: string;
    checkInTime?: string;
    workLocation: WorkLocationType;
    locationName?: string;
    meetLink?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    try {
      const bkk = getBangkokNow();
      const res = await fetch('/api/attendance', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: payload.date || bkk.dateStr,
          checkInTime: payload.checkInTime || bkk.timeStr,
          workLocation: payload.workLocation,
          locationName: payload.locationName,
          meetLink: payload.meetLink,
          note: payload.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'บันทึกเวลาเข้างานไม่สำเร็จ' };
      }
      await fetchDashboardData();
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      };
    }
  };

  const handleCheckOut = async (payload: {
    date?: string;
    checkOutTime?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    try {
      const bkk = getBangkokNow();
      const res = await fetch('/api/attendance', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: payload.date || bkk.dateStr,
          checkOutTime: payload.checkOutTime || bkk.timeStr,
          note: payload.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'บันทึกเวลาออกงานไม่สำเร็จ' };
      }
      await fetchDashboardData();
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
      };
    }
  };

  const handleUpsertEmployee = async (employeeData: {
    id?: string;
    username?: string;
    name?: string;
    englishName?: string;
    email: string;
    secondaryEmail?: string;
    role: Role;
    department?: string;
    position?: string;
    startDate?: string;
    cLevelApproverId?: string;
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
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: employeeData,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกไม่สำเร็จ' };
    }
    await fetchDashboardData();
    return { success: true };
  };

  const handleDeleteEmployee = async (
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch(
      `/api/employees?userId=${encodeURIComponent(targetUserId)}`,
      { method: 'DELETE', credentials: 'same-origin' }
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ลบไม่สำเร็จ' };
    }
    await fetchDashboardData();
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
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holiday: holidayData,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'บันทึกวันหยุดไม่สำเร็จ' };
    }
    await fetchDashboardData();
    return { success: true };
  };

  const handleDeleteHoliday = async (
    holidayId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    const res = await fetch(
      `/api/holidays?holidayId=${encodeURIComponent(holidayId)}`,
      { method: 'DELETE', credentials: 'same-origin' }
    );
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'ลบวันหยุดไม่สำเร็จ' };
    }
    await fetchDashboardData();
    return { success: true };
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4 animate-ui-fade">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0A2540] to-[#0066FF] text-white shadow-lg shadow-blue-600/20 animate-pulse">
            <Calendar className="h-7 w-7" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg font-bold text-slate-900 tracking-tight">
                วันนี้ลา
              </span>
              <span className="rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 px-2 py-0.5 text-[11px] font-semibold">
                by DBC
              </span>
            </div>
            <p className="text-xs font-medium text-slate-400 mt-1.5">
              กำลังตรวจสอบข้อมูลเซสชัน...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if ((!currentUser || !systemData) && storageError) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-lg border border-amber-200/80 text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">
              ไม่สามารถเชื่อมต่อฐานข้อมูลได้ชั่วคราว
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {storageError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchDashboardData()}
            disabled={loadingData}
            className="w-full rounded-xl bg-[#0066FF] hover:bg-[#0052CC] py-3 px-5 text-sm font-semibold text-white transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingData ? 'animate-spin' : ''}`}
            />
            <span>ลองเชื่อมต่อใหม่</span>
          </button>
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
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col md:flex-row">
      {/* =================================================================
          DESKTOP LEFT SIDEBAR NAVBAR (md: and up)
          ================================================================= */}
      <aside className="hidden md:flex md:w-64 lg:w-[272px] md:flex-col md:fixed md:inset-y-0 z-40 bg-white border-r border-slate-200/75">
        {/* Sidebar Header: Brand & Live Status */}
        <div className="px-4 lg:px-5 h-16 border-b border-slate-100 flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2540] to-[#0066FF] text-white shadow-sm shadow-blue-900/15 shrink-0">
              <Calendar className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-slate-900 truncate">
                  วันนี้ลา
                </span>
                <span className="rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 px-2 py-0.5 text-[10px] font-semibold tracking-wide shrink-0">
                  by DBC
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
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
        <div className="px-3.5 lg:px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => handleOpenRequestModal()}
            className="w-full rounded-xl bg-[#0066FF] hover:bg-[#0052CC] active:scale-[0.98] py-2.5 px-4 text-xs lg:text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
          >
            <CalendarPlus className="h-4 w-4 shrink-0" />
            <span>+ ยื่นใบลา</span>
          </button>
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto px-3 lg:px-3.5 py-2 space-y-1 momentum-scroll">
          <div className="text-[11px] font-semibold text-slate-400 px-3 pt-1 pb-1.5 uppercase tracking-wider">
            เมนูหลัก
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('OFFICE')}
            className={`w-full rounded-xl px-3 py-2.5 text-xs lg:text-[13px] transition flex items-center justify-between gap-2.5 cursor-pointer text-left ${
              activeTab === 'OFFICE'
                ? 'bg-blue-50/90 text-[#0066FF] font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin
                className={`h-[18px] w-[18px] shrink-0 ${
                  activeTab === 'OFFICE' ? 'text-[#0066FF]' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Check-in &amp; ออฟฟิศ</span>
            </div>
            {myTodayAttendance && (
              <span
                className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0"
                title="Check-in แล้ว"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CALENDAR')}
            className={`w-full rounded-xl px-3 py-2.5 text-xs lg:text-[13px] transition flex items-center gap-2.5 cursor-pointer text-left ${
              activeTab === 'CALENDAR'
                ? 'bg-blue-50/90 text-[#0066FF] font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
            }`}
          >
            <Calendar
              className={`h-[18px] w-[18px] shrink-0 ${
                activeTab === 'CALENDAR' ? 'text-[#0066FF]' : 'text-slate-400'
              }`}
            />
            <span className="truncate">ปฏิทินวันลา &amp; โควต้า</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('APPROVALS')}
            className={`w-full rounded-xl px-3 py-2.5 text-xs lg:text-[13px] transition flex items-center justify-between gap-2.5 cursor-pointer text-left ${
              activeTab === 'APPROVALS'
                ? 'bg-blue-50/90 text-[#0066FF] font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckSquare
                className={`h-[18px] w-[18px] shrink-0 ${
                  activeTab === 'APPROVALS'
                    ? 'text-[#0066FF]'
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
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0">
                {pendingApprovalCount}
              </span>
            )}
          </button>

          {isHrOrCLevel && (
            <>
              <div className="pt-4 pb-1.5 text-[11px] font-semibold text-slate-400 px-3 uppercase tracking-wider">
                ผู้ดูแลระบบ (HR / C-Level)
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('DASHBOARD')}
                className={`w-full rounded-xl px-3 py-2.5 text-xs lg:text-[13px] transition flex items-center gap-2.5 cursor-pointer text-left ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-blue-50/90 text-[#0066FF] font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                }`}
              >
                <BarChart3
                  className={`h-[18px] w-[18px] shrink-0 ${
                    activeTab === 'DASHBOARD'
                      ? 'text-[#0066FF]'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">สถิติ &amp; รายงานวันลา</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MANAGEMENT')}
                className={`w-full rounded-xl px-3 py-2.5 text-xs lg:text-[13px] transition flex items-center gap-2.5 cursor-pointer text-left ${
                  activeTab === 'MANAGEMENT'
                    ? 'bg-blue-50/90 text-[#0066FF] font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                }`}
              >
                <Settings
                  className={`h-[18px] w-[18px] shrink-0 ${
                    activeTab === 'MANAGEMENT'
                      ? 'text-[#0066FF]'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">จัดการพนักงาน &amp; วันหยุด</span>
              </button>
            </>
          )}

          {/* Desktop Quota Display Widget */}
          <div className="pt-4 pb-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                โควต้าวันลาคงเหลือ ({currentYear})
              </span>
              <button
                type="button"
                onClick={handleOpenPolicyOnlyModal}
                className="text-[11px] font-semibold text-[#0066FF] hover:text-blue-800 transition cursor-pointer"
                title="ดูระเบียบและเงื่อนไขการลา"
              >
                เงื่อนไข
              </button>
            </div>

            <div className="rounded-xl bg-slate-50/80 border border-slate-200/60 p-3 space-y-3">
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
                    <Activity className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  ) : type === 'personal' ? (
                    <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  );

                const barColor =
                  type === 'sick'
                    ? 'bg-rose-500'
                    : type === 'personal'
                    ? 'bg-amber-500'
                    : 'bg-sky-500';

                return (
                  <div key={type} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {icon}
                        <span className="font-medium text-slate-700 truncate">
                          {meta.shortLabel}
                        </span>
                        {lockedByProbation && (
                          <span className="rounded-md bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 shrink-0">
                            รอโปร
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5 shrink-0 tabular-nums">
                        <span className="font-bold text-slate-900 text-xs">
                          {q.remainingDays}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          /{q.totalQuota} วัน
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span className="tabular-nums">ใช้ไป {q.usedDays} วัน</span>
                      {q.pendingDays > 0 ? (
                        <span className="text-amber-700 font-semibold bg-amber-50 border border-amber-200/70 px-1.5 py-0.5 rounded tabular-nums">
                          รอ {q.pendingDays} วัน
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">
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

        {/* Sidebar Bottom: Clean User Profile & Actions */}
        <div className="p-3.5 border-t border-slate-100 bg-white space-y-2.5 shrink-0">
          <div className="flex items-center gap-2.5 px-1">
            <UserAvatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
              sizeClass="h-9 w-9"
              roundedClass="rounded-xl"
              textClass="text-xs"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {currentUser.email}
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-1.5 px-1 text-[11px]">
            <span
              className={`rounded-md border px-1.5 py-0.5 font-semibold ${
                ROLE_META[currentUser.role].badgeClass
              }`}
            >
              {ROLE_META[currentUser.role].label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold ${
                probation.passed
                  ? 'bg-emerald-50 border-emerald-200/80 text-emerald-700'
                  : 'bg-amber-50 border-amber-200/80 text-amber-800'
              }`}
            >
              {probation.passed
                ? 'ผ่านโปร'
                : `ทดลองงาน (${probation.daysWorked}/119ว.)`}
            </span>
          </div>

          {/* Logout & Refresh Row */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              className="flex-1 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100 py-2 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loadingData ? 'animate-spin text-[#0066FF]' : ''
                }`}
              />
              <span>รีเฟรช</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200/80 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 py-2 px-3 text-xs font-semibold text-slate-600 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>ออก</span>
            </button>
          </div>

          {/* Legal Links in Sidebar */}
          <div className="pt-0.5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0066FF] transition-colors"
            >
              ความเป็นส่วนตัว
            </a>
            <span className="text-slate-300">•</span>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0066FF] transition-colors"
            >
              เงื่อนไข
            </a>
          </div>
        </div>
      </aside>

      {/* =================================================================
          MAIN CONTENT AREA (Offset by sidebar on desktop)
          ================================================================= */}
      <div className="flex-1 min-w-0 md:pl-64 lg:pl-[272px] flex flex-col min-h-screen">
        {/* Top Header Bar for Desktop & Mobile */}
        <header
          className={`sticky top-0 border-b border-slate-200/70 ${
            isMobileQuotaOpen ? 'z-50' : 'z-30'
          }`}
        >
          <div
            className={`relative z-40 px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3 ${
              isMobileQuotaOpen
                ? 'bg-white'
                : 'bg-white/85 backdrop-blur-xl'
            }`}
          >
            {/* Mobile Branding (only visible on mobile) */}
            <div className="flex md:hidden items-center gap-2.5 min-w-0">
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-8.5 w-8.5 sm:h-9 sm:w-9"
                roundedClass="rounded-xl"
                textClass="text-xs"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-900 truncate">
                    วันนี้ลา
                  </span>
                  <span className="rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide shrink-0">
                    by DBC
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate">
                  คุณ {currentUser.name.split(' ')[0]}
                </div>
              </div>
            </div>

            {/* Desktop View Header / Title */}
            <div className="hidden md:flex items-center gap-2.5 min-w-0">
              <div className="text-base lg:text-[17px] font-bold text-slate-900 tracking-tight flex items-center gap-2.5 min-w-0">
                {activeTab === 'OFFICE' && (
                  <>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="truncate">ลงเวลาเข้างาน &amp; สถานะออฟฟิศ</span>
                  </>
                )}
                {activeTab === 'CALENDAR' && (
                  <>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
                      <Calendar className="h-4 w-4" />
                    </span>
                    <span className="truncate">ปฏิทินวันลา &amp; โควต้า</span>
                  </>
                )}
                {activeTab === 'APPROVALS' && (
                  <>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60 shrink-0">
                      <CheckSquare className="h-4 w-4" />
                    </span>
                    <span className="truncate">
                      {currentUser.role === 'employee'
                        ? 'ประวัติการลาของฉัน'
                        : 'อนุมัติใบลา & ประวัติคำขอ'}
                    </span>
                  </>
                )}
                {activeTab === 'DASHBOARD' && (
                  <>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <span className="truncate">สถิติ &amp; รายงานวันลา</span>
                  </>
                )}
                {activeTab === 'MANAGEMENT' && (
                  <>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200/70 shrink-0">
                      <Settings className="h-4 w-4" />
                    </span>
                    <span className="truncate">จัดการพนักงาน &amp; วันหยุด</span>
                  </>
                )}
              </div>
            </div>

            {/* Right Quick Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Today Attendance Status Indicator */}
              {myTodayAttendance ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
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
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span>ยังไม่ Check-in วันนี้</span>
                </span>
              )}

              {/* Desktop Quick Quota Pill Indicator */}
              <button
                type="button"
                onClick={handleOpenPolicyOnlyModal}
                className="hidden xl:flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white hover:border-slate-300 transition cursor-pointer tabular-nums"
                title="คลิกเพื่อดูระเบียบและเงื่อนไขการลา"
              >
                <span className="text-slate-400 font-medium text-[11px]">โควต้า</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-semibold" title="ลาป่วยคงเหลือ">
                  <Activity className="h-3 w-3 text-rose-500" />
                  <span>{systemData.myQuota.quotas.sick.remainingDays}/{systemData.myQuota.quotas.sick.totalQuota}</span>
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-semibold" title="ลากิจคงเหลือ">
                  <FileText className="h-3 w-3 text-amber-500" />
                  <span>{systemData.myQuota.quotas.personal.remainingDays}/{systemData.myQuota.quotas.personal.totalQuota}</span>
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-700 font-semibold" title="ลาพักร้อนคงเหลือ">
                  <Sun className="h-3 w-3 text-sky-500" />
                  <span>{systemData.myQuota.quotas.vacation.remainingDays}/{systemData.myQuota.quotas.vacation.totalQuota}</span>
                </span>
              </button>

              {/* Mobile quick Request button */}
              <button
                type="button"
                onClick={() => handleOpenRequestModal()}
                aria-label="ยื่นใบลา"
                title="ยื่นใบลา"
                className="md:hidden rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-3 py-2 text-xs font-semibold text-white shadow-xs flex items-center gap-1.5 min-h-[38px] sm:min-h-[40px] active:scale-95 transition cursor-pointer"
              >
                <CalendarPlus className="h-4 w-4 shrink-0" />
                <span className={isHrOrCLevel ? 'inline' : 'hidden xs:inline'}>ยื่นใบลา</span>
              </button>

              {/* Refresh button */}
              <button
                type="button"
                onClick={() => fetchDashboardData()}
                className="rounded-xl border border-slate-200/80 bg-white p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center active:scale-95"
                title="รีเฟรชข้อมูล"
                aria-label="รีเฟรชข้อมูล"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loadingData ? 'animate-spin text-[#0066FF]' : ''
                  }`}
                />
              </button>

              {/* Mobile logout button */}
              <button
                type="button"
                onClick={handleLogout}
                className="md:hidden rounded-xl border border-slate-200/80 bg-white p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center active:scale-95"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mobile Quota Quick Bar */}
          <div
            className={`relative z-40 md:hidden border-t border-slate-100 px-3 py-1.5 ${
              isMobileQuotaOpen
                ? 'bg-slate-50'
                : 'bg-slate-50/90 backdrop-blur-xl'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              {(['sick', 'personal', 'vacation'] as LeaveType[]).map((type) => {
                const meta = LEAVE_TYPE_META[type];
                const q = systemData.myQuota.quotas[type];

                const icon =
                  type === 'sick' ? (
                    <Activity className="h-3 w-3 text-rose-500 shrink-0" />
                  ) : type === 'personal' ? (
                    <FileText className="h-3 w-3 text-amber-500 shrink-0" />
                  ) : (
                    <Sun className="h-3 w-3 text-sky-500 shrink-0" />
                  );

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setIsMobileQuotaOpen((prev) => !prev)}
                    aria-expanded={isMobileQuotaOpen}
                    aria-controls="mobile-quota-drawer"
                    className="flex-1 rounded-lg bg-white border border-slate-200/80 px-2 py-1.5 flex items-center justify-between text-xs active:scale-95 transition cursor-pointer min-w-0"
                    title={`โควต้า${meta.shortLabel}คงเหลือ ${q.remainingDays}/${q.totalQuota} วัน (แตะเพื่อดูรายละเอียด)`}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      {icon}
                      <span className="font-bold text-slate-700 text-[10px] sm:text-[11px] shrink-0">
                        {meta.shortLabel}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-0.5 shrink-0 ml-0.5 text-slate-900 tabular-nums">
                      <span className="font-bold text-[11px] sm:text-xs">
                        {q.remainingDays}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
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
                aria-expanded={isMobileQuotaOpen}
                aria-controls="mobile-quota-drawer"
                className="rounded-lg border border-slate-200/80 bg-white p-1.5 text-slate-500 hover:text-slate-800 transition active:scale-95 shrink-0 flex items-center justify-center cursor-pointer min-h-[30px] min-w-[30px]"
                title={isMobileQuotaOpen ? 'ซ่อนรายละเอียดโควต้า' : 'ดูรายละเอียดโควต้า'}
                aria-label="ดูรายละเอียดโควต้า"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isMobileQuotaOpen ? 'rotate-180 text-[#0066FF]' : ''
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
                className="md:hidden fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-xs transition-opacity"
                onClick={() => setIsMobileQuotaOpen(false)}
                aria-hidden="true"
              />

              <div
                id="mobile-quota-drawer"
                role="region"
                aria-label="รายละเอียดโควต้าวันลา"
                className="md:hidden absolute top-full inset-x-0 z-40 border-t border-slate-200/80 bg-white px-4 py-4 shadow-xl space-y-3 max-h-[calc(100dvh-120px)] overflow-y-auto momentum-scroll animate-ui-slide-up"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#0066FF]" />
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
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
                      className="text-xs font-semibold text-[#0066FF] hover:text-blue-800 cursor-pointer p-1"
                    >
                      เงื่อนไข
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMobileQuotaOpen(false)}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
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
                        <Activity className="h-4 w-4 text-rose-500 shrink-0" />
                      ) : type === 'personal' ? (
                        <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <Sun className="h-4 w-4 text-sky-500 shrink-0" />
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
                        className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {icon}
                            <span className="text-xs font-semibold text-slate-800 truncate">
                              {meta.label}
                            </span>
                            {lockedByProbation && (
                              <span className="rounded bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 shrink-0">
                                รอผ่านโปร (119 วัน)
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-slate-700 shrink-0 ml-2 tabular-nums">
                            เหลือ <span className="text-[#0066FF] font-bold">{q.remainingDays}</span> / {q.totalQuota} วัน
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${usedPercent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium tabular-nums">
                          <span>ใช้ไปแล้ว: {q.usedDays} วัน</span>
                          {q.pendingDays > 0 ? (
                            <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded text-[10px]">
                              รออนุมัติ {q.pendingDays} วัน
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium text-[10px]">
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
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-10 space-y-6">
        {/* Temporary Google Sheets Unavailability Banner (HTTP 503) */}
        {storageError && (
          <div className="rounded-2xl bg-amber-50/90 border border-amber-200/80 p-4 text-xs sm:text-sm text-amber-950 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <span>{storageError}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              disabled={loadingData}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`}
              />
              <span>ลองใหม่</span>
            </button>
          </div>
        )}
        {/* Google Sheets API Warning Banner for Admin */}
        {currentUser.role === 'admin' && systemData.storageMode === 'demo_local' && systemData.syncError && (
          <div className="rounded-2xl bg-amber-50/90 border border-amber-200/80 p-4 text-xs sm:text-sm text-amber-950 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2 flex-wrap">
                <span>Google Sheets ยังไม่ได้รับข้อมูลอัปเดต (ระบบกำลังบันทึกใน Local Storage ชั่วคราว)</span>
                <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  รอเปิดใช้งาน Sheets API
                </span>
              </div>
              <p className="mt-1 text-amber-800 leading-relaxed">
                สาเหตุเนื่องจากใน Google Cloud Project ยังไม่ได้กดเปิดใช้งาน (Enable) ตัว <strong>Google Sheets API</strong> ข้อมูลการลงเวลาและใบลาจึงยังไม่ถูกส่งเข้าชีต
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <a
                  href="https://console.cloud.google.com/apis/library/sheets.googleapis.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
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
        <footer className="mt-10 pt-6 pb-4 md:pb-6 border-t border-slate-200/70 text-center text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center justify-center gap-3 font-medium">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0066FF] transition-colors"
            >
              นโยบายความเป็นส่วนตัว (Privacy)
            </a>
            <span className="text-slate-300">•</span>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0066FF] transition-colors"
            >
              ข้อกำหนดการใช้งาน (Terms)
            </a>
          </div>
          <p className="text-[11px] text-slate-400">
            ระบบวันนี้ลา by DBC • Digital Business Consult Co., Ltd. สงวนลิขสิทธิ์
          </p>
        </footer>
      </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/75 px-2 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] grid ${
          isHrOrCLevel ? 'grid-cols-5' : 'grid-cols-4'
        } gap-1 shadow-[0_-4px_20px_rgba(15,23,42,0.05)]`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('OFFICE')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[50px] active:scale-95 ${
            activeTab === 'OFFICE'
              ? 'text-[#0066FF] bg-blue-50/80 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <MapPin className="h-[19px] w-[19px] mb-0.5 shrink-0" />
          <span className="text-[11px] truncate text-center w-full">Check-in</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CALENDAR')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[50px] active:scale-95 ${
            activeTab === 'CALENDAR'
              ? 'text-[#0066FF] bg-blue-50/80 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <Calendar className="h-[19px] w-[19px] mb-0.5 shrink-0" />
          <span className="text-[11px] truncate text-center w-full">ปฏิทิน</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APPROVALS')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[50px] active:scale-95 ${
            activeTab === 'APPROVALS'
              ? 'text-[#0066FF] bg-blue-50/80 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <CheckSquare className="h-[19px] w-[19px] mb-0.5 shrink-0" />
          <span className="text-[11px] truncate text-center w-full">
            {currentUser.role === 'employee' ? 'ประวัติลา' : 'อนุมัติ'}
          </span>
          {currentUser.role !== 'employee' && pendingApprovalCount > 0 && (
            <span className="absolute top-0.5 right-1.5 h-4 min-w-[16px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1 tabular-nums">
              {pendingApprovalCount}
            </span>
          )}
        </button>

        {isHrOrCLevel ? (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[50px] active:scale-95 ${
                activeTab === 'DASHBOARD'
                  ? 'text-[#0066FF] bg-blue-50/80 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <BarChart3 className="h-[19px] w-[19px] mb-0.5 shrink-0" />
              <span className="text-[11px] truncate text-center w-full">สถิติ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('MANAGEMENT')}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[50px] active:scale-95 ${
                activeTab === 'MANAGEMENT'
                  ? 'text-[#0066FF] bg-blue-50/80 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <Settings className="h-[19px] w-[19px] mb-0.5 shrink-0" />
              <span className="text-[11px] truncate text-center w-full">ตั้งค่า HR</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleOpenRequestModal()}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-white bg-[#0066FF] hover:bg-[#0052CC] shadow-xs min-h-[50px] font-semibold active:scale-95 transition"
          >
            <CalendarPlus className="h-[19px] w-[19px] mb-0.5 shrink-0" />
            <span className="text-[11px] truncate text-center w-full">ยื่นใบลา</span>
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
