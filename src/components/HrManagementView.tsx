'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarCog,
  Check,
  ChevronDown,
  Edit3,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  formatThaiDate,
  getNextEmployeeId,
  getProbationInfo,
  ROLE_META,
  STANDARD_LEAVE_QUOTAS,
} from '@/lib/leave-utils';
import { COMPANY_DEPARTMENTS, Holiday, Role, SafeUser } from '@/lib/types';

export interface DepartmentDropdownProps {
  value: string;
  onChange: (value: string) => void;
  legacyDepartment?: string | null;
  error?: string | null;
  helperText?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function DepartmentDropdown({
  value,
  onChange,
  legacyDepartment,
  error,
  helperText,
  isOpen: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  triggerRef: externalTriggerRef,
}: DepartmentDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const openRef = useRef(open);
  openRef.current = open;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved =
        typeof next === 'function' ? next(openRef.current) : next;
      if (controlledOpen === undefined) {
        setInternalOpen(resolved);
      }
      onOpenChangeRef.current?.(resolved);
    },
    [controlledOpen]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = externalTriggerRef || internalTriggerRef;
  const listboxRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => {
    const base = COMPANY_DEPARTMENTS.map((dept) => ({
      value: dept as string,
      label: dept as string,
      isLegacy: false,
    }));
    const cleanLegacy = (legacyDepartment || '').trim();
    if (
      cleanLegacy &&
      !(COMPANY_DEPARTMENTS as readonly string[]).includes(cleanLegacy)
    ) {
      base.push({
        value: cleanLegacy,
        label: `${cleanLegacy} (ฝ่ายเดิม)`,
        isLegacy: true,
      });
    }
    return base;
  }, [legacyDepartment]);

  const trimmedValue = value.trim();
  const initialSelectedIdx = options.findIndex(
    (opt) => opt.value === trimmedValue
  );
  const [activeIndex, setActiveIndex] = useState<number>(
    initialSelectedIdx >= 0 ? initialSelectedIdx : 0
  );
  const activeIndexRef = useRef<number>(
    initialSelectedIdx >= 0 ? initialSelectedIdx : 0
  );

  const updateActiveIndex = useCallback((nextIdx: number) => {
    activeIndexRef.current = nextIdx;
    setActiveIndex(nextIdx);
  }, []);

  useEffect(() => {
    if (!open) return;
    const selectedIdx = options.findIndex((opt) => opt.value === trimmedValue);
    updateActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);

    const rafId =
      typeof window !== 'undefined'
        ? window.requestAnimationFrame(() => {
            triggerRef.current?.scrollIntoView({
              block: 'nearest',
            });
            listboxRef.current?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          })
        : undefined;

    const handlePointerDownOutside = (event: PointerEvent | MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      if (rafId !== undefined && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafId);
      }
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [open, options, trimmedValue, setOpen, triggerRef, updateActiveIndex]);

  const selectedOption = options.find((opt) => opt.value === trimmedValue);
  const isLegacySelected = Boolean(selectedOption?.isLegacy);
  const activeOptionId =
    open && options[activeIndex]
      ? `emp-department-option-${activeIndex}`
      : undefined;

  const handleSelectOption = (nextVal: string) => {
    onChange(nextVal);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Enter' ||
        e.key === ' '
      ) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateActiveIndex((activeIndexRef.current + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateActiveIndex(
        (activeIndexRef.current - 1 + options.length) % options.length
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      updateActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const targetOpt = options[activeIndexRef.current];
      if (targetOpt) {
        handleSelectOption(targetOpt.value);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="relative">
        <button
          ref={triggerRef}
          id="emp-department-trigger"
          type="button"
          role="combobox"
          aria-labelledby="emp-department-label"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="emp-department-listbox"
          aria-activedescendant={activeOptionId}
          aria-invalid={Boolean(error)}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={handleTriggerKeyDown}
          className={`w-full scroll-mt-10 rounded-xl border bg-white pl-3.5 pr-2.5 py-2.5 text-base sm:text-sm text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[46px] focus:outline-hidden ${
            error
              ? 'border-rose-500 ring-2 ring-rose-100'
              : open
                ? 'border-blue-600 ring-2 ring-blue-100'
                : 'border-slate-300 hover:border-blue-400'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Building2
              className={`h-4 w-4 shrink-0 ${
                trimmedValue ? 'text-blue-600' : 'text-slate-400'
              }`}
            />
            {trimmedValue ? (
              <span
                className={`font-bold truncate ${
                  isLegacySelected ? 'text-amber-800' : 'text-slate-900'
                }`}
              >
                {selectedOption ? selectedOption.label : trimmedValue}
              </span>
            ) : (
              <span className="font-medium text-slate-400 truncate">
                -- เลือกฝ่าย / แผนก --
              </span>
            )}
          </span>

          <span
            className={`inline-flex items-center justify-center rounded-lg px-1.5 py-1 transition-colors shrink-0 ${
              open ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        {open && (
          <div
            ref={listboxRef}
            id="emp-department-listbox"
            role="listbox"
            aria-labelledby="emp-department-label"
            className="absolute left-0 right-0 top-full z-30 mt-1.5 scroll-mb-6 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-slate-900/5 space-y-1"
          >
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700">
                {error}
              </div>
            )}
            {options.map((opt, idx) => {
              const isSelected = trimmedValue === opt.value;
              const isHighlighted = activeIndex === idx;
              return (
                <React.Fragment key={opt.value}>
                  {opt.isLegacy && (
                    <div className="my-1 border-t border-slate-100" />
                  )}
                  <button
                    id={`emp-department-option-${idx}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onMouseEnter={() => updateActiveIndex(idx)}
                    onClick={() => handleSelectOption(opt.value)}
                    className={`w-full rounded-xl px-3.5 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition cursor-pointer min-h-[42px] ${
                      isSelected
                        ? opt.isLegacy
                          ? 'bg-amber-50 text-amber-800 font-extrabold'
                          : 'bg-blue-50 text-blue-700 font-extrabold'
                        : isHighlighted
                          ? 'bg-slate-100 text-slate-900 font-bold'
                          : opt.isLegacy
                            ? 'text-slate-600 hover:bg-slate-50 font-medium'
                            : 'text-slate-800 hover:bg-slate-50 font-semibold'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          opt.isLegacy ? 'text-amber-600' : 'text-blue-600'
                        }`}
                      />
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {!open && error ? (
        <p className="mt-1.5 text-xs font-bold text-rose-600">{error}</p>
      ) : helperText ? (
        <p
          className={`mt-1 text-xs text-slate-500 ${
            open ? 'invisible select-none' : ''
          }`}
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

interface HrManagementViewProps {
  currentUser: SafeUser;
  users: SafeUser[];
  holidays: Holiday[];
  onUpsertEmployee: (employeeData: {
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
  }) => Promise<{ success: boolean; error?: string }>;
  onDeleteEmployee: (
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onUpsertHoliday: (holidayData: {
    id?: string;
    date: string;
    name: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onDeleteHoliday: (
    holidayId: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function HrManagementView({
  currentUser,
  users,
  holidays,
  onUpsertEmployee,
  onDeleteEmployee,
  onUpsertHoliday,
  onDeleteHoliday,
}: HrManagementViewProps) {
  const [activeSection, setActiveSection] = useState<'EMPLOYEES' | 'HOLIDAYS'>(
    'EMPLOYEES'
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Employee Form Modal State (PDPA Compliant: No phone, No password stored in sheet)
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | undefined>(
    undefined
  );
  const [editingOriginalDepartment, setEditingOriginalDepartment] = useState<
    string | null
  >(null);
  const [editingEnglishName, setEditingEnglishName] = useState<string>('');
  const [empCustomId, setEmpCustomId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empRole, setEmpRole] = useState<Role>('employee');
  const [empDepartment, setEmpDepartment] = useState<string>('');
  const [empPosition, setEmpPosition] = useState('');
  const [empStartDate, setEmpStartDate] = useState('2024-01-15');
  const [savingEmp, setSavingEmp] = useState(false);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptValidationError, setDeptValidationError] = useState<string | null>(
    null
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const deptTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isExecutiveRole = empRole === 'c_level' || empRole === 'admin';

  // Holiday Form State
  const [editingHolidayId, setEditingHolidayId] = useState<string | undefined>(
    undefined
  );
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);

  const closeEmployeeModal = () => {
    setIsDeptDropdownOpen(false);
    setDeptValidationError(null);
    setModalError(null);
    setIsEmpModalOpen(false);
  };

  const openAddEmployeeModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextId = getNextEmployeeId(users);
    setEditingEmpId(undefined);
    setEditingOriginalDepartment(null);
    setEditingEnglishName('');
    setEmpCustomId(nextId);
    setEmpName('');
    setEmpEmail('');
    setEmpRole('employee');
    setEmpDepartment('');
    setEmpPosition('');
    setEmpStartDate(today);
    setIsDeptDropdownOpen(false);
    setDeptValidationError(null);
    setModalError(null);
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (u: SafeUser) => {
    const cleanDept = (u.department || '').trim();
    setEditingEmpId(u.id);
    setEditingOriginalDepartment(cleanDept || null);
    setEditingEnglishName(u.englishName || '');
    setEmpCustomId(u.id);
    setEmpName(u.name || '');
    setEmpEmail(u.email || '');
    setEmpRole(u.role);
    setEmpDepartment(cleanDept);
    setEmpPosition(u.position || '');
    setEmpStartDate(u.startDate || '');
    setIsDeptDropdownOpen(false);
    setDeptValidationError(null);
    setModalError(null);
    setIsEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setModalError(null);
    setDeptValidationError(null);

    const cleanEmail = empEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setModalError('กรุณากรอกอีเมล Google ที่ถูกต้องสำหรับเข้าสู่ระบบ');
      return;
    }

    const trimmedDepartment = isExecutiveRole
      ? 'Executive (C-Level)'
      : empDepartment.trim();

    if (!isExecutiveRole && !trimmedDepartment) {
      const msg =
        'กรุณาเลือกฝ่าย / แผนกจากรายการ (AE, สำนักงาน, Consult, Marketing&BD)';
      setDeptValidationError(msg);
      setModalError(msg);
      setIsDeptDropdownOpen(true);
      deptTriggerRef.current?.focus({ preventScroll: true });
      return;
    }

    const cleanStartDate = isExecutiveRole ? '' : empStartDate.trim();
    if (!isExecutiveRole && !cleanStartDate) {
      setModalError('กรุณาระบุวันเริ่มทำงานของพนักงาน');
      return;
    }

    setSavingEmp(true);
    try {
      const res = await onUpsertEmployee({
        id: editingEmpId ? editingEmpId : empCustomId.trim() || undefined,
        name: empName.trim() || undefined,
        email: cleanEmail,
        role: empRole,
        department: trimmedDepartment,
        position: empPosition.trim() || undefined,
        startDate: cleanStartDate,
        quotas: { ...STANDARD_LEAVE_QUOTAS },
      });
      if (!res.success) {
        const errMsg = res.error || 'บันทึกข้อมูลพนักงานไม่สำเร็จ';
        setModalError(errMsg);
        setFeedback({
          type: 'error',
          message: errMsg,
        });
      } else {
        const displayLabel = empName.trim() || cleanEmail;
        setFeedback({
          type: 'success',
          message: editingEmpId
            ? `แก้ไขข้อมูลพนักงาน ${displayLabel} (${cleanEmail}) เรียบร้อยแล้ว`
            : `เพิ่มพนักงานใหม่ ${displayLabel} (${cleanEmail}) เรียบร้อยแล้ว พนักงานสามารถเข้าสู่ระบบด้วย Google เพื่อซิงก์ชื่อโปรไฟล์ได้ทันที`,
        });
        setIsDeptDropdownOpen(false);
        setIsEmpModalOpen(false);
      }
    } finally {
      setSavingEmp(false);
    }
  };

  const handleDeleteEmployeeClick = async (u: SafeUser) => {
    setFeedback(null);
    const res = await onDeleteEmployee(u.id);
    if (!res.success) {
      setFeedback({
        type: 'error',
        message: res.error || 'ไม่สามารถลบพนักงานได้',
      });
    } else {
      setFeedback({
        type: 'success',
        message: `ลบข้อมูลพนักงาน ${u.name} เรียบร้อยแล้ว`,
      });
    }
  };

  const handleEditHolidayClick = (h: Holiday) => {
    setEditingHolidayId(h.id);
    setHolidayDate(h.date);
    setHolidayName(h.name);
    setFeedback(null);
  };

  const handleCancelEditHoliday = () => {
    setEditingHolidayId(undefined);
    setHolidayDate('');
    setHolidayName('');
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingHoliday(true);
    try {
      const res = await onUpsertHoliday({
        id: editingHolidayId,
        date: holidayDate,
        name: holidayName,
      });
      if (!res.success) {
        setFeedback({
          type: 'error',
          message: res.error || 'ไม่สามารถบันทึกวันหยุดได้',
        });
      } else {
        const wasEditing = Boolean(editingHolidayId);
        setEditingHolidayId(undefined);
        setHolidayDate('');
        setHolidayName('');
        setFeedback({
          type: 'success',
          message: wasEditing
            ? 'แก้ไขข้อมูลวันหยุดนักขัตฤกษ์/บริษัทเรียบร้อยแล้ว'
            : 'บันทึกวันหยุดนักขัตฤกษ์/บริษัทเรียบร้อยแล้ว (ระบบจะตัดวันนี้ออกจากการคำนวณวันลาอัตโนมัติ)',
        });
      }
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHolidayClick = async (h: Holiday) => {
    setFeedback(null);
    const res = await onDeleteHoliday(h.id);
    if (!res.success) {
      setFeedback({
        type: 'error',
        message: res.error || 'ลบวันหยุดไม่สำเร็จ',
      });
    } else {
      if (editingHolidayId === h.id) {
        handleCancelEditHoliday();
      }
      setFeedback({
        type: 'success',
        message: `ลบวันหยุด "${h.name}" เรียบร้อยแล้ว`,
      });
    }
  };

  if (
    currentUser.role !== 'hr' &&
    currentUser.role !== 'c_level' &&
    currentUser.role !== 'admin'
  ) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
        เฉพาะฝ่ายบุคคล (HR), ผู้บริหาร (C-Level) หรือผู้ดูแลระบบ (Admin)
        เท่านั้นที่สามารถเข้าถึงการจัดการพนักงานและวันหยุดได้
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveSection('EMPLOYEES')}
            className={`rounded-2xl px-5 py-3 text-sm font-bold transition flex items-center gap-2.5 cursor-pointer min-h-[46px] ${
              activeSection === 'EMPLOYEES'
                ? 'bg-[#0066FF] text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>จัดการพนักงาน PDPA &amp; โควต้า ({users.length} คน)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('HOLIDAYS')}
            className={`rounded-2xl px-5 py-3 text-sm font-bold transition flex items-center gap-2.5 cursor-pointer min-h-[46px] ${
              activeSection === 'HOLIDAYS'
                ? 'bg-[#0066FF] text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarCog className="h-4 w-4" />
            <span>
              จัดการวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท ({holidays.length} วัน)
            </span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl border p-4 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline ml-3 cursor-pointer text-xs font-bold"
          >
            ปิด
          </button>
        </div>
      )}

      {/* SECTION 1: EMPLOYEES MANAGEMENT */}
      {activeSection === 'EMPLOYEES' && (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                รายชื่อพนักงาน ({users.length} คน)
              </h3>
            </div>

            <button
              type="button"
              onClick={openAddEmployeeModal}
              className="rounded-xl bg-[#0066FF] hover:bg-blue-700 px-5 py-2.5 text-xs sm:text-sm font-bold text-white transition flex items-center gap-2 cursor-pointer shadow-xs shrink-0 min-h-[44px]"
            >
              <UserPlus className="h-4 w-4" />
              <span>เพิ่มพนักงานใหม่</span>
            </button>
          </div>

          <div className="overflow-x-auto momentum-scroll pb-2">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black">
                  <th className="py-4 px-5">รหัส / ชื่อภาษาไทย</th>
                  <th className="py-4 px-4">Google Email / EN</th>
                  <th className="py-4 px-3">บทบาท</th>
                  <th className="py-4 px-3">ฝ่าย / ตำแหน่ง</th>
                  <th className="py-4 px-3">เริ่มงาน (โปร 119 วัน)</th>
                  <th className="py-4 px-3 text-center">
                    โควต้า (ป่วย/กิจ/พักร้อน)
                  </th>
                  <th className="py-4 px-5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {users.map((u) => {
                  const prob = getProbationInfo(u.startDate);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-sm sm:text-base text-slate-900">{u.name}</div>
                        <div className="font-mono text-xs text-slate-400 font-bold mt-0.5">
                          {u.id}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-blue-700">
                          {u.email}
                        </div>
                        <div className="text-xs mt-0.5 font-medium">
                          {u.englishName ? (
                            <span className="text-slate-500">EN: {u.englishName}</span>
                          ) : (
                            <span className="text-amber-600 font-semibold">
                              EN: รอดึงจาก Google Login
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-3">
                        <span
                          className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                            ROLE_META[u.role].badgeClass
                          }`}
                        >
                          {ROLE_META[u.role].label}
                        </span>
                      </td>
                      <td className="py-4 px-3">
                        <div className="font-bold text-slate-800">
                          {u.department || (u.role === 'c_level' ? 'ผู้บริหาร (C-Level)' : '-')}
                        </div>
                        <div className="text-slate-500 text-xs mt-0.5 font-medium">
                          {u.position}
                        </div>
                      </td>
                      <td className="py-4 px-3">
                        {u.role === 'c_level' || u.role === 'admin' || !u.startDate ? (
                          <span className="inline-flex items-center rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-bold text-purple-700">
                            ผู้บริหาร (ไม่เช็คโปร)
                          </span>
                        ) : (
                          <>
                            <div className="font-mono text-slate-800 font-bold">
                              {u.startDate}
                            </div>
                            <div className="mt-1">
                              {prob.passed ? (
                                <span className="text-xs font-bold text-emerald-700">
                                  ✓ ผ่านโปรแล้ว ({prob.daysWorked} วัน)
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-amber-700">
                                  ⏳ ทดลองงาน (เหลือ {prob.daysRemaining} วัน)
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-4 px-3 text-center font-bold text-slate-800 text-xs sm:text-sm">
                        {(u.quotas?.sick ?? STANDARD_LEAVE_QUOTAS.sick)} / {(u.quotas?.personal ?? STANDARD_LEAVE_QUOTAS.personal)} / {(u.quotas?.vacation ?? STANDARD_LEAVE_QUOTAS.vacation)}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditEmployeeModal(u)}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>แก้ไข</span>
                          </button>
                          {u.id !== currentUser.id &&
                            u.email.toLowerCase() !==
                              'rut.wa@digitalbusinessconsult.asia' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployeeClick(u)}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>ลบ</span>
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: HOLIDAYS MANAGEMENT */}
      {activeSection === 'HOLIDAYS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Left: Add/Edit Holiday Form */}
          <div className="lg:col-span-5 rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                {editingHolidayId
                  ? 'แก้ไขวันหยุดบริษัท'
                  : 'เพิ่มวันหยุดบริษัท'}
              </h3>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label
                  htmlFor="holiday-date"
                  className="block font-bold text-slate-800 mb-1.5"
                >
                  วันที่หยุด (YYYY-MM-DD) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="holiday-date"
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="holiday-name"
                  className="block font-bold text-slate-800 mb-1.5"
                >
                  ชื่อวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท <span className="text-rose-500">*</span>
                </label>
                <input
                  id="holiday-name"
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="เช่น วันสงกรานต์ หรือ วันหยุดประจำปีบริษัท"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden font-medium"
                  required
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                {editingHolidayId && (
                  <button
                    type="button"
                    onClick={handleCancelEditHoliday}
                    className="rounded-xl border border-slate-300 bg-white py-3 px-5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[46px]"
                  >
                    ยกเลิกแก้ไข
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingHoliday}
                  className="flex-1 rounded-xl bg-[#0066FF] py-3 px-5 text-xs sm:text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs min-h-[46px]"
                >
                  {editingHolidayId ? (
                    <Save className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>
                    {savingHoliday
                      ? 'กำลังบันทึก...'
                      : editingHolidayId
                        ? 'บันทึกการแก้ไขวันหยุด'
                        : 'เพิ่มวันหยุดเข้าปฏิทินบริษัท'}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Holidays List */}
          <div className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-200">
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                รายการวันหยุดประจำปีทั้งหมด ({holidays.length} วัน)
              </h3>
            </div>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {holidays.map((h) => (
                <div
                  key={h.id}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50 transition text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="rounded-xl bg-emerald-100 border border-emerald-200 px-3.5 py-2 font-mono font-bold text-emerald-800 text-xs sm:text-sm">
                      {h.date}
                    </span>
                    <div>
                      <div className="font-extrabold text-sm sm:text-base text-slate-900">
                        {h.name}
                      </div>
                      <div className="text-slate-500 text-xs font-medium mt-0.5">
                        {formatThaiDate(h.date)}
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditHolidayClick(h)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHolidayClick(h)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>ลบ</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Employee Add/Edit Modal (PDPA Compliant) */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-t-[28px] sm:rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-gradient-to-r from-[#0A2540] to-[#0066FF] px-5 sm:px-6 py-4 text-white">
              <div>
                <h3 className="font-black text-base sm:text-lg">
                  {editingEmpId
                    ? `แก้ไขข้อมูลพนักงาน (${editingEmpId})`
                    : 'เพิ่มพนักงานใหม่'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeEmployeeModal}
                className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 cursor-pointer transition min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEmployee}
              className="p-5 sm:p-7 space-y-4 sm:space-y-5 text-xs sm:text-sm max-h-[82dvh] sm:max-h-[82vh] overflow-y-auto momentum-scroll pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
            >
              {modalError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-bold text-rose-800 flex items-center justify-between gap-3"
                >
                  <span>{modalError}</span>
                  <button
                    type="button"
                    onClick={() => setModalError(null)}
                    className="text-xs underline shrink-0 cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    รหัสพนักงาน <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={empCustomId}
                    onChange={(e) => setEmpCustomId(e.target.value)}
                    disabled={Boolean(editingEmpId)}
                    placeholder="เช่น EMP012"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm font-mono font-bold text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 focus:border-blue-600 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-role-select"
                    className="block font-bold text-slate-800 mb-1.5"
                  >
                    บทบาท (Role) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="emp-role-select"
                      value={empRole}
                      onChange={(e) => {
                        const nextRole = e.target.value as Role;
                        setEmpRole(nextRole);
                        if (nextRole === 'c_level' || nextRole === 'admin') {
                          setDeptValidationError(null);
                          setIsDeptDropdownOpen(false);
                        }
                        setModalError(null);
                      }}
                      className="w-full appearance-none rounded-xl border border-slate-300 pl-4 pr-11 py-3 text-base sm:text-sm text-slate-900 bg-white font-medium hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden cursor-pointer min-h-[46px]"
                    >
                      <option value="employee">พนักงานทั่วไป (Employee)</option>
                      <option value="manager">หัวหน้าฝ่าย (Manager)</option>
                      <option value="hr">ฝ่ายบุคคล (HR)</option>
                      <option value="c_level">ผู้บริหารระดับสูง (C-Level)</option>
                      {empEmail.trim().toLowerCase() ===
                        'rut.wa@digitalbusinessconsult.asia' && (
                        <option value="admin">
                          👑 ผู้ดูแลระบบสูงสุด (Super Admin)
                        </option>
                      )}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                      <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-1.5 py-1 text-slate-600">
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-800 mb-1.5">
                    อีเมล Google <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="name@digitalbusinessconsult.asia"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 font-medium focus:border-blue-600 focus:outline-hidden"
                    required
                  />
                  {editingEmpId && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs">
                      <span className="font-bold text-slate-600">ชื่อจาก Google:</span>
                      <span className="font-bold text-blue-700">
                        {editingEnglishName || 'รอดึงอัตโนมัติ'}
                      </span>
                    </div>
                  )}
                </div>

                {isExecutiveRole ? (
                  <div className="sm:col-span-2 rounded-2xl bg-purple-50/80 border border-purple-200 px-4 py-3 text-xs sm:text-sm text-purple-950 font-bold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0" />
                    <span>C-Level: ไม่ต้องเลือกฝ่ายและไม่ต้องระบุวันเริ่มทำงาน</span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label
                        id="emp-department-label"
                        htmlFor="emp-department-trigger"
                        className="block font-bold text-slate-800 mb-1.5"
                      >
                        ฝ่าย / แผนก <span className="text-rose-500">*</span>
                      </label>
                      <DepartmentDropdown
                        value={empDepartment}
                        onChange={(nextDept) => {
                          setEmpDepartment(nextDept);
                          setDeptValidationError(null);
                          setModalError(null);
                        }}
                        legacyDepartment={editingEmpId ? editingOriginalDepartment : null}
                        error={deptValidationError}
                        isOpen={isDeptDropdownOpen}
                        onOpenChange={setIsDeptDropdownOpen}
                        triggerRef={deptTriggerRef}
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5">
                        วันที่เริ่มงาน (โปร 119 วัน){' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={empStartDate}
                        onChange={(e) => setEmpStartDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 font-medium focus:border-blue-600 focus:outline-hidden min-h-[46px]"
                        required
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    ชื่อภาษาไทย{' '}
                    <span className="text-xs font-medium text-slate-400">(ไม่บังคับ)</span>
                  </label>
                  <input
                    type="text"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="เช่น สมชาย ใจดี"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 font-medium focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    ตำแหน่ง{' '}
                    <span className="text-xs font-medium text-slate-400">(ไม่บังคับ)</span>
                  </label>
                  <input
                    type="text"
                    value={empPosition}
                    onChange={(e) => setEmpPosition(e.target.value)}
                    placeholder={isExecutiveRole ? 'C-Level' : 'เช่น AE / Consultant'}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 font-medium focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEmployeeModal}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingEmp}
                  className="rounded-xl bg-[#0066FF] hover:bg-blue-700 px-6 py-2.5 text-sm font-extrabold text-white disabled:opacity-50 cursor-pointer shadow-md min-h-[44px]"
                >
                  {savingEmp ? 'กำลังบันทึก...' : 'บันทึกข้อมูลพนักงาน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
