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
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  formatThaiDate,
  getAdditionalUserEmails,
  getBangkokNow,
  getCompanyAliasEmail,
  getNextEmployeeId,
  getProbationInfo,
  getUserEmails,
  isSuperAdminEmail,
  isSuperAdminUser,
  isValidEmailFormat,
  parseEmailList,
  ROLE_META,
  STANDARD_LEAVE_QUOTAS,
} from '@/lib/leave-utils';
import { COMPANY_DEPARTMENTS, Holiday, Role, SafeUser } from '@/lib/types';
import UserAvatar from '@/components/UserAvatar';

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
          className={`w-full scroll-mt-10 rounded-xl border bg-white pl-3.5 pr-2.5 py-2.5 text-base sm:text-sm text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[44px] focus:outline-hidden ${
            error
              ? 'border-rose-500 ring-4 ring-rose-500/10'
              : open
                ? 'border-[#0066FF] ring-4 ring-blue-500/10'
                : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Building2
              className={`h-4 w-4 shrink-0 ${
                trimmedValue ? 'text-[#0066FF]' : 'text-slate-400'
              }`}
            />
            {trimmedValue ? (
              <span
                className={`font-semibold truncate ${
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
              open ? 'bg-blue-50 text-[#0066FF]' : 'bg-slate-100/80 text-slate-500'
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
            className="absolute left-0 right-0 top-full z-30 mt-1.5 scroll-mb-6 rounded-2xl border border-slate-200/85 bg-white p-1.5 shadow-xl ring-1 ring-slate-900/5 space-y-1"
          >
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700">
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
                          ? 'bg-amber-50 text-amber-800 font-semibold'
                          : 'bg-blue-50/90 text-[#0066FF] font-semibold'
                        : isHighlighted
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : opt.isLegacy
                            ? 'text-slate-600 hover:bg-slate-50 font-medium'
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          opt.isLegacy ? 'text-amber-600' : 'text-[#0066FF]'
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
        <p className="mt-1.5 text-xs font-semibold text-rose-600">{error}</p>
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
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.englishName || '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        getUserEmails(u).some((e) => e.includes(q)) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.position || '').toLowerCase().includes(q)
    );
  }, [users, empSearchQuery]);

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
  const [empSecondaryEmail, setEmpSecondaryEmail] = useState('');
  const [empRole, setEmpRole] = useState<Role>('employee');
  const [empDepartment, setEmpDepartment] = useState<string>('');
  const [empPosition, setEmpPosition] = useState('');
  const [empStartDate, setEmpStartDate] = useState('2024-01-15');
  const [empCLevelApproverId, setEmpCLevelApproverId] = useState<string>('');
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

  const closeEmployeeModal = useCallback(() => {
    setIsDeptDropdownOpen(false);
    setDeptValidationError(null);
    setModalError(null);
    setIsEmpModalOpen(false);
  }, []);

  useEffect(() => {
    if (!isEmpModalOpen || isDeptDropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingEmp) {
        closeEmployeeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEmpModalOpen, isDeptDropdownOpen, savingEmp, closeEmployeeModal]);

  const openAddEmployeeModal = () => {
    const today = getBangkokNow().dateStr;
    const nextId = getNextEmployeeId(users);
    setEditingEmpId(undefined);
    setEditingOriginalDepartment(null);
    setEditingEnglishName('');
    setEmpCustomId(nextId);
    setEmpName('');
    setEmpEmail('');
    setEmpSecondaryEmail('');
    setEmpRole('employee');
    setEmpDepartment('');
    setEmpPosition('');
    setEmpStartDate(today);
    setEmpCLevelApproverId('');
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
    setEmpSecondaryEmail(u.secondaryEmail || '');
    setEmpRole(u.role);
    setEmpDepartment(cleanDept);
    setEmpPosition(u.position || '');
    setEmpStartDate(u.startDate || '');
    setEmpCLevelApproverId(u.cLevelApproverId || '');
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

    const parsedPrimaryEmails = parseEmailList(empEmail);
    const parsedSecondaryEmails = parseEmailList(empSecondaryEmail);
    const cleanEmail = parsedPrimaryEmails[0] || '';
    const cleanSecondaryEmail =
      parsedSecondaryEmails[0] || parsedPrimaryEmails[1] || '';

    if (
      !cleanEmail ||
      !isValidEmailFormat(cleanEmail) ||
      parsedPrimaryEmails.some((addr) => !isValidEmailFormat(addr)) ||
      (cleanSecondaryEmail && !isValidEmailFormat(cleanSecondaryEmail)) ||
      parsedSecondaryEmails.some((addr) => !isValidEmailFormat(addr))
    ) {
      setModalError('กรุณากรอกอีเมล Google ที่ถูกต้องสำหรับเข้าสู่ระบบ');
      return;
    }

    const trimmedDepartment =
      empRole === 'c_level' || empRole === 'admin'
        ? empDepartment.trim() ||
          (empRole === 'admin' ? 'Executive (Admin)' : 'Executive (C-Level)')
        : empDepartment.trim();

    if (empRole !== 'c_level' && empRole !== 'admin' && !trimmedDepartment) {
      const msg =
        'กรุณาเลือกฝ่าย / แผนกจากรายการ (AE, สำนักงาน, Consult, Marketing&BD)';
      setDeptValidationError(msg);
      setModalError(msg);
      setIsDeptDropdownOpen(true);
      deptTriggerRef.current?.focus({ preventScroll: true });
      return;
    }

    const cleanStartDate = empStartDate.trim();
    if (empRole !== 'c_level' && empRole !== 'admin' && !cleanStartDate) {
      setModalError('กรุณาระบุวันเริ่มทำงานของพนักงาน');
      return;
    }

    setSavingEmp(true);
    try {
      const res = await onUpsertEmployee({
        id: editingEmpId ? editingEmpId : empCustomId.trim() || undefined,
        name: empName.trim() || undefined,
        email: cleanEmail,
        secondaryEmail: cleanSecondaryEmail,
        role: empRole,
        department: trimmedDepartment,
        position: empPosition.trim() || undefined,
        startDate: cleanStartDate,
        cLevelApproverId:
          empRole === 'manager'
            ? empCLevelApproverId.trim() || undefined
            : undefined,
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
      {/* Sub-navigation Segmented Control */}
      <div className="overflow-x-auto no-scrollbar momentum-scroll pb-1">
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-200/60 p-1">
          <button
            type="button"
            onClick={() => setActiveSection('EMPLOYEES')}
            className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer min-h-[38px] shrink-0 ${
              activeSection === 'EMPLOYEES'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users
              className={`h-4 w-4 ${
                activeSection === 'EMPLOYEES' ? 'text-[#0066FF]' : 'text-slate-400'
              }`}
            />
            <span>จัดการพนักงาน PDPA &amp; โควต้า ({users.length} คน)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('HOLIDAYS')}
            className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer min-h-[38px] shrink-0 ${
              activeSection === 'HOLIDAYS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CalendarCog
              className={`h-4 w-4 ${
                activeSection === 'HOLIDAYS' ? 'text-[#0066FF]' : 'text-slate-400'
              }`}
            />
            <span>
              จัดการวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท ({holidays.length} วัน)
            </span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 animate-ui-slide-up ${
            feedback.type === 'success'
              ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800'
              : 'border-rose-200/80 bg-rose-50/80 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold opacity-75 hover:opacity-100 ml-3 cursor-pointer shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {/* SECTION 1: EMPLOYEES MANAGEMENT */}
      {activeSection === 'EMPLOYEES' && (
        <div className="rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                รายชื่อพนักงาน ({users.length} คน)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                จัดการสิทธิ์การเข้าใช้งาน Whitelist และรองรับอีเมลองค์กรทั้ง 2 โดเมน
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={empSearchQuery}
                  onChange={(e) => setEmpSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ / อีเมล / แผนก..."
                  className="w-full sm:w-56 rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 py-2 text-base sm:text-xs text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden min-h-[40px] transition"
                />
                {empSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEmpSearchQuery('')}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={openAddEmployeeModal}
                className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0 min-h-[40px]"
              >
                <UserPlus className="h-4 w-4" />
                <span>เพิ่มพนักงานใหม่</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto momentum-scroll pb-2">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold text-xs whitespace-nowrap">
                  <th className="py-3.5 px-5 min-w-[200px]">รหัส / ชื่อภาษาไทย</th>
                  <th className="py-3.5 px-4 min-w-[220px]">Google Email / EN</th>
                  <th className="py-3.5 px-3">บทบาท</th>
                  <th className="py-3.5 px-3 min-w-[140px]">ฝ่าย / ตำแหน่ง</th>
                  <th className="py-3.5 px-3">เริ่มงาน (โปร 119 วัน)</th>
                  <th className="py-3.5 px-3 text-center">
                    โควต้า (ป่วย/กิจ/พักร้อน)
                  </th>
                  <th className="py-3.5 px-5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const prob = getProbationInfo(u.startDate);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={u.name}
                            avatarUrl={u.avatarUrl}
                            sizeClass="h-9 w-9"
                            roundedClass="rounded-full"
                            textClass="text-xs"
                            fallbackBgClass="bg-slate-100 text-slate-600"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 whitespace-nowrap">{u.name}</div>
                            <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                              {u.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#0066FF] text-xs sm:text-sm">
                          {u.email}
                        </div>
                        {getAdditionalUserEmails(u).map((altEmail) => (
                          <div
                            key={altEmail}
                            className="text-xs font-medium text-indigo-600 mt-0.5"
                          >
                            ↳ {altEmail}
                          </div>
                        ))}
                        <div className="text-xs mt-0.5">
                          {u.englishName ? (
                            <span className="text-slate-400">EN: {u.englishName}</span>
                          ) : (
                            <span className="text-amber-600 font-medium">
                              EN: รอดึงจาก Google Login
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            ROLE_META[u.role].badgeClass
                          }`}
                        >
                          {ROLE_META[u.role].label}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                          {u.department &&
                          u.department !== 'Executive (C-Level)' &&
                          u.department !== 'Executive (Admin)' &&
                          u.department !== 'ผู้บริหาร (C-Level)'
                            ? u.role === 'c_level'
                              ? `${u.department} (Manager)`
                              : u.department
                            : u.role === 'c_level'
                              ? 'ผู้บริหารภาพรวม'
                              : u.role === 'admin'
                                ? 'ผู้ดูแลระบบสูงสุด'
                                : '-'}
                        </div>
                        <div className="text-slate-400 text-xs mt-0.5">
                          {u.position}
                        </div>
                        {u.role === 'manager' && u.cLevelApproverId && (
                          <div className="text-[11px] text-[#0066FF] font-medium mt-0.5">
                            C-Level:{' '}
                            {users.find((c) => c.id === u.cLevelApproverId)
                              ?.name.split(' ')[0] || u.cLevelApproverId}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {u.role === 'c_level' || u.role === 'admin' || !u.startDate ? (
                          <span className="inline-flex items-center rounded-md bg-purple-50 border border-purple-200/70 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                            ผู้บริหาร (ไม่เช็คโปร)
                          </span>
                        ) : (
                          <>
                            <div className="font-mono text-xs text-slate-700 font-semibold tabular-nums">
                              {u.startDate}
                            </div>
                            <div className="mt-1">
                              {prob.passed ? (
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  ✓ ผ่านโปรแล้ว ({prob.daysWorked} วัน)
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-amber-700">
                                  ทดลองงาน (เหลือ {prob.daysRemaining} วัน)
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700 text-xs sm:text-sm tabular-nums whitespace-nowrap">
                        {(u.quotas?.sick ?? STANDARD_LEAVE_QUOTAS.sick)} / {(u.quotas?.personal ?? STANDARD_LEAVE_QUOTAS.personal)} / {(u.quotas?.vacation ?? STANDARD_LEAVE_QUOTAS.vacation)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditEmployeeModal(u)}
                            className="rounded-lg border border-slate-200/90 bg-white hover:bg-blue-50 hover:border-blue-200 hover:text-[#0066FF] px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[34px]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>แก้ไข</span>
                          </button>
                          {u.id !== currentUser.id &&
                            !isSuperAdminUser(u) &&
                            (currentUser.role === 'admin' ||
                              u.role !== 'admin') && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployeeClick(u)}
                                className="rounded-lg border border-slate-200/90 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[34px]"
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
                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-sm text-slate-400"
                    >
                      ไม่พบข้อมูลพนักงานที่ตรงกับคำค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: HOLIDAYS MANAGEMENT */}
      {activeSection === 'HOLIDAYS' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left: Add/Edit Holiday Form */}
          <div className="xl:col-span-5 rounded-2xl bg-white p-5 sm:p-6 border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
            <div className="border-b border-slate-100 pb-3.5">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {editingHolidayId
                  ? 'แก้ไขวันหยุดบริษัท'
                  : 'เพิ่มวันหยุดบริษัท'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                วันหยุดที่เพิ่มจะถูกหักออกจากการคำนวณวันลาอัตโนมัติ
              </p>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label
                  htmlFor="holiday-date"
                  className="block font-semibold text-slate-700 mb-1.5"
                >
                  วันที่หยุด (YYYY-MM-DD) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="holiday-date"
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="holiday-name"
                  className="block font-semibold text-slate-700 mb-1.5"
                >
                  ชื่อวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท <span className="text-rose-500">*</span>
                </label>
                <input
                  id="holiday-name"
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="เช่น วันสงกรานต์ หรือ วันหยุดประจำปีบริษัท"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                {editingHolidayId && (
                  <button
                    type="button"
                    onClick={handleCancelEditHoliday}
                    className="rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer min-h-[42px]"
                  >
                    ยกเลิกแก้ไข
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingHoliday}
                  className="flex-1 rounded-xl bg-[#0066FF] py-2.5 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-[#0052CC] disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs min-h-[42px]"
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
          <div className="xl:col-span-7 rounded-2xl bg-white border border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                รายการวันหยุดประจำปีทั้งหมด
              </h3>
              <span className="rounded-full bg-slate-100 border border-slate-200/70 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
                {holidays.length} วัน
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto momentum-scroll">
              {holidays.map((h) => (
                <div
                  key={h.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="rounded-lg bg-emerald-50 border border-emerald-200/75 px-3 py-1.5 font-mono font-semibold text-emerald-700 text-xs tabular-nums shrink-0">
                      {h.date}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">
                        {h.name}
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        {formatThaiDate(h.date)}
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditHolidayClick(h)}
                      className="rounded-lg border border-slate-200/90 bg-white hover:bg-blue-50 hover:border-blue-200 hover:text-[#0066FF] px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[34px]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHolidayClick(h)}
                      className="rounded-lg border border-slate-200/90 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition inline-flex items-center gap-1.5 cursor-pointer min-h-[34px]"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            editingEmpId
              ? `แก้ไขข้อมูลพนักงาน (${editingEmpId})`
              : 'เพิ่มพนักงานใหม่'
          }
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEmp) {
              closeEmployeeModal();
            }
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 p-0 sm:p-4 backdrop-blur-xs animate-ui-fade"
        >
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden animate-ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-slate-900 tracking-tight truncate">
                    {editingEmpId
                      ? `แก้ไขข้อมูลพนักงาน (${editingEmpId})`
                      : 'เพิ่มพนักงานใหม่'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    PDPA Compliant • เชื่อมโยง Google Workspace Whitelist
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEmployeeModal}
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEmployee}
              className="p-5 sm:p-6 space-y-4 text-xs sm:text-sm max-h-[82dvh] sm:max-h-[82vh] overflow-y-auto momentum-scroll pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
            >
              {modalError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 flex items-center justify-between gap-3"
                >
                  <span>{modalError}</span>
                  <button
                    type="button"
                    onClick={() => setModalError(null)}
                    className="text-xs font-semibold shrink-0 cursor-pointer hover:underline"
                  >
                    ปิด
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="emp-custom-id"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    รหัสพนักงาน <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="emp-custom-id"
                    type="text"
                    value={empCustomId}
                    onChange={(e) => setEmpCustomId(e.target.value)}
                    disabled={Boolean(editingEmpId)}
                    placeholder="เช่น EMP012"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-mono font-semibold text-slate-900 bg-slate-50/70 disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#0066FF] focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-role-select"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    บทบาท (Role) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="emp-role-select"
                      value={empRole}
                      disabled={
                        Boolean(
                          editingEmpId &&
                            users.find((u) => u.id === editingEmpId)?.role ===
                              'admin' &&
                            currentUser.role !== 'admin'
                        )
                      }
                      onChange={(e) => {
                        const nextRole = e.target.value as Role;
                        setEmpRole(nextRole);
                        if (nextRole === 'c_level' || nextRole === 'admin') {
                          setDeptValidationError(null);
                          setIsDeptDropdownOpen(false);
                        }
                        setModalError(null);
                      }}
                      className="w-full appearance-none rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-base sm:text-sm text-slate-900 bg-white font-medium hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden cursor-pointer min-h-[44px] transition"
                    >
                      <option value="employee">พนักงานทั่วไป (Employee)</option>
                      <option value="manager">หัวหน้าฝ่าย (Manager)</option>
                      <option value="hr">ฝ่ายบุคคล (HR)</option>
                      <option value="c_level">ผู้บริหารระดับสูง (C-Level)</option>
                      {(currentUser.role === 'admin' ||
                        isSuperAdminEmail(empEmail) ||
                        isSuperAdminEmail(empSecondaryEmail)) && (
                        <option value="admin">
                          👑 ผู้ดูแลระบบสูงสุด (Super Admin)
                        </option>
                      )}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </span>
                  </div>
                </div>

                {empRole === 'manager' && (
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="emp-clevel-approver-select"
                      className="block font-semibold text-slate-700 mb-1.5"
                    >
                      ผู้บริหารที่สังกัด (C-Level ผู้อนุมัติ)
                    </label>
                    <div className="relative">
                      <select
                        id="emp-clevel-approver-select"
                        value={empCLevelApproverId}
                        onChange={(e) => setEmpCLevelApproverId(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-base sm:text-sm text-slate-900 bg-white font-medium hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden cursor-pointer min-h-[44px] transition"
                      >
                        <option value="">-- ไม่ระบุ (ผู้บริหาร C-Level ท่านใดก็ได้) --</option>
                        {users
                          .filter(
                            (u) =>
                              (u.role === 'c_level' || u.role === 'admin') &&
                              (!editingEmpId || u.id !== editingEmpId)
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.englishName ? `(${c.englishName})` : ''} - {c.position || (c.role === 'admin' ? 'Super Admin' : 'C-Level')}
                            </option>
                          ))}
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </span>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="emp-email-input"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    อีเมล Google <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="emp-email-input"
                    type="text"
                    inputMode="email"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="name@digitalbusinessconsult.asia หรือ name@dbcgroup.asia"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                    required
                  />
                  {getCompanyAliasEmail(empEmail) ? (
                    <p className="mt-1.5 text-xs font-medium text-emerald-700">
                      ✓ รองรับการเข้าสู่ระบบทั้ง 2 อีเมลอัตโนมัติ:{' '}
                      <span className="font-mono underline">
                        {parseEmailList(empEmail)[0] || empEmail.trim().toLowerCase()}
                      </span>{' '}
                      และ{' '}
                      <span className="font-mono underline">
                        {getCompanyAliasEmail(empEmail)}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-400">
                      รองรับทั้ง @digitalbusinessconsult.asia และ @dbcgroup.asia (เชื่อมโยงผู้ใช้คนเดียวกันอัตโนมัติ)
                    </p>
                  )}
                  <div className="mt-3">
                    <label
                      htmlFor="emp-secondary-email-input"
                      className="block font-semibold text-slate-600 mb-1 text-xs"
                    >
                      อีเมลรอง / อีเมลลูกเพิ่มเติม{' '}
                      <span className="font-normal text-slate-400">
                        (ไม่บังคับ • กรณีชื่อหน้า @ ของ 2 อีเมลไม่เหมือนกัน)
                      </span>
                    </label>
                    <input
                      id="emp-secondary-email-input"
                      type="email"
                      value={empSecondaryEmail}
                      onChange={(e) => setEmpSecondaryEmail(e.target.value)}
                      placeholder="เช่น alias@dbcgroup.asia"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                    />
                  </div>
                  {editingEmpId && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-1.5 text-xs">
                      <span className="font-medium text-slate-500">ชื่อจาก Google:</span>
                      <span className="font-semibold text-[#0066FF]">
                        {editingEnglishName || 'รอดึงอัตโนมัติ'}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      id="emp-department-label"
                      htmlFor="emp-department-trigger"
                      className="block font-semibold text-slate-700"
                    >
                      ฝ่าย / แผนก{' '}
                      {isExecutiveRole ? (
                        <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200/70 px-1.5 py-0.5 rounded-md ml-1">
                          เป็น Manager ร่วมด้วย
                        </span>
                      ) : (
                        <span className="text-rose-500">*</span>
                      )}
                    </label>
                    {isExecutiveRole && empDepartment && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmpDepartment('');
                          setDeptValidationError(null);
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 underline cursor-pointer"
                      >
                        ล้างฝ่าย (ผู้บริหารภาพรวม)
                      </button>
                    )}
                  </div>
                  <DepartmentDropdown
                    value={
                      empDepartment === 'Executive (C-Level)' ||
                      empDepartment === 'Executive (Admin)' ||
                      empDepartment === 'ผู้บริหาร (C-Level)'
                        ? ''
                        : empDepartment
                    }
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
                  {empRole === 'c_level' && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      {empDepartment &&
                      empDepartment !== 'Executive (C-Level)' &&
                      empDepartment !== 'ผู้บริหาร (C-Level)'
                        ? `ผู้บริหารท่านนี้จะทำหน้าที่เป็นหัวหน้าฝ่าย (Manager) ดูแลและอนุมัติใบลาขั้นที่ 1 ของฝ่าย "${empDepartment}" ด้วย`
                        : 'C-Level: ไม่ต้องเลือกฝ่ายและไม่ต้องระบุวันเริ่มทำงาน (หากต้องการเป็น Manager ประจำฝ่าย ให้เลือกฝ่ายด้านบน)'}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-start-date-input"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    วันที่เริ่มงาน{' '}
                    {isExecutiveRole ? (
                      <span className="text-xs font-normal text-slate-400">
                        (ไม่บังคับสำหรับผู้บริหาร)
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-slate-400">
                        (โปร 119 วัน) <span className="text-rose-500">*</span>
                      </span>
                    )}
                  </label>
                  <input
                    id="emp-start-date-input"
                    type="date"
                    value={empStartDate}
                    onChange={(e) => setEmpStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden min-h-[44px] transition"
                    required={!isExecutiveRole}
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-thai-name-input"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    ชื่อภาษาไทย{' '}
                    <span className="text-xs font-normal text-slate-400">(ไม่บังคับ)</span>
                  </label>
                  <input
                    id="emp-thai-name-input"
                    type="text"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="เช่น สมชาย ใจดี"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-position-input"
                    className="block font-semibold text-slate-700 mb-1.5"
                  >
                    ตำแหน่ง{' '}
                    <span className="text-xs font-normal text-slate-400">(ไม่บังคับ)</span>
                  </label>
                  <input
                    id="emp-position-input"
                    type="text"
                    value={empPosition}
                    onChange={(e) => setEmpPosition(e.target.value)}
                    placeholder={isExecutiveRole ? 'C-Level' : 'เช่น AE / Consultant'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEmployeeModal}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer min-h-[42px] transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingEmp}
                  className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer shadow-xs min-h-[42px] transition"
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
