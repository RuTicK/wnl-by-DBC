'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  Lock,
  MapPin,
  Upload,
  X,
} from 'lucide-react';
import {
  ALL_LEAVE_TYPES,
  calculateLeaveDays,
  calculateUserQuotaSummary,
  checkProbationLeaveEligibility,
  DURATION_TYPE_META,
  formatThaiDate,
  getApprovalFlowLabel,
  LEAVE_TYPE_META,
} from '@/lib/leave-utils';
import LeavePolicyModal from './LeavePolicyModal';
import {
  EmployeeQuotaOverview,
  Holiday,
  LeaveDuration,
  LeaveRequest,
  LeaveType,
  SafeUser,
} from '@/lib/types';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  currentUser?: SafeUser;
  leaves?: LeaveRequest[];
  holidays: Holiday[];
  myQuota: EmployeeQuotaOverview;
  onSubmitLeave: (payload: {
    leaveType: LeaveType;
    durationType: LeaveDuration;
    startDate: string;
    endDate: string;
    reason: string;
    locationDetail?: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export default function LeaveRequestModal({
  isOpen,
  onClose,
  initialDate,
  currentUser,
  leaves,
  holidays,
  myQuota,
  onSubmitLeave,
}: LeaveRequestModalProps) {
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [leaveType, setLeaveType] = useState<LeaveType>('vacation');
  const [durationType, setDurationType] = useState<LeaveDuration>('full');
  const [startDate, setStartDate] = useState<string>(initialDate || todayStr);
  const [endDate, setEndDate] = useState<string>(initialDate || todayStr);
  const [locationDetail, setLocationDetail] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const baseDate = initialDate || todayStr;
      setStartDate(baseDate);
      setEndDate(baseDate);
      setError(null);
      if (
        currentUser &&
        currentUser.role !== 'c_level' &&
        currentUser.role !== 'admin'
      ) {
        const prob = checkProbationLeaveEligibility(
          currentUser.startDate,
          'vacation',
          baseDate
        );
        if (!prob.allowed) {
          setLeaveType('sick');
        }
      }
    }
  }, [isOpen, initialDate, todayStr, currentUser]);

  useEffect(() => {
    if (durationType !== 'full') {
      setEndDate(startDate);
    }
  }, [durationType, startDate]);

  const calcResult = useMemo(() => {
    return calculateLeaveDays(startDate, endDate, durationType, holidays);
  }, [startDate, endDate, durationType, holidays]);

  const effectiveQuota = useMemo(() => {
    const targetYear = Number(startDate.slice(0, 4)) || myQuota.year;
    if (currentUser && leaves && targetYear !== myQuota.year) {
      return calculateUserQuotaSummary(
        currentUser,
        leaves,
        targetYear,
        holidays
      );
    }
    return myQuota;
  }, [startDate, currentUser, leaves, holidays, myQuota]);

  const probationCheck = useMemo(() => {
    const check = checkProbationLeaveEligibility(
      currentUser?.startDate,
      leaveType,
      startDate
    );
    if (currentUser?.role === 'c_level' || currentUser?.role === 'admin') {
      return {
        allowed: true,
        probation: { ...check.probation, passed: true, daysRemaining: 0 },
      };
    }
    return check;
  }, [currentUser?.role, currentUser?.startDate, leaveType, startDate]);

  const selectedQuota = effectiveQuota.quotas[leaveType];
  const isOverQuota =
    !selectedQuota.isUnlimited &&
    calcResult.isValid &&
    calcResult.totalDays > selectedQuota.availableAfterPending;

  if (!isOpen) return null;

  const compressImageDataUrl = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      if (
        !dataUrl.startsWith('data:image/') ||
        dataUrl.length <= 40000 ||
        typeof window === 'undefined'
      ) {
        resolve(dataUrl);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        try {
          const maxDim = 720;
          let width = img.width || 600;
          let height = img.height || 600;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.55);
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      setError('ขนาดไฟล์รูปใบรับรองแพทย์ต้องไม่เกิน 3 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const finalUrl = await compressImageDataUrl(reader.result);
        setAttachmentUrl(finalUrl);
        setAttachmentName(file.name);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!probationCheck.allowed) {
      setError(probationCheck.error || 'อยู่ในช่วงทดลองงาน ยังไม่สามารถลาประเภทนี้ได้');
      return;
    }

    if (!calcResult.isValid || calcResult.totalDays <= 0) {
      setError(calcResult.error || 'จำนวนวันลาไม่ถูกต้อง');
      return;
    }

    if (isOverQuota) {
      setError(
        `โควต้า${selectedQuota.label}ไม่เพียงพอ (ต้องการใช้ ${calcResult.totalDays} วัน แต่เหลือที่ขอได้ ${selectedQuota.availableAfterPending} วัน)`
      );
      return;
    }

    if (leaveType === 'offsite' && !locationDetail.trim()) {
      setError(
        'กรุณาระบุสถานที่ปฏิบัติงาน / ชื่อลูกค้า / งานที่ไปออกบูธ สำหรับการขอทำงานนอกสถานที่'
      );
      return;
    }

    if (!reason.trim()) {
      setError('กรุณากรอกเหตุผลการลา / รายละเอียดงาน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onSubmitLeave({
        leaveType,
        durationType,
        startDate,
        endDate: durationType === 'full' ? endDate : startDate,
        reason: reason.trim(),
        locationDetail: locationDetail.trim() || undefined,
        attachmentUrl: attachmentUrl.trim() || undefined,
        attachmentName: attachmentName.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || 'ไม่สามารถยื่นใบลาได้');
      } else {
        setReason('');
        setLocationDetail('');
        setAttachmentUrl('');
        setAttachmentName('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="relative flex h-[92dvh] sm:h-auto sm:max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] sm:rounded-3xl bg-white shadow-2xl border border-slate-200"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-blue-500/20 bg-gradient-to-r from-[#0A2540] via-[#0A2540] to-[#0066FF] px-4 sm:px-6 py-3.5 sm:py-4 text-white">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-white/20 text-white shadow-xs shrink-0">
              <CalendarPlus className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-black tracking-tight truncate">
                ยื่นคำขอวันลา / ปฏิบัติงาน
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 mt-0.5 font-medium truncate">
                สายอนุมัติของคุณ: {getApprovalFlowLabel(currentUser?.role)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPolicyModalOpen(true)}
              className="rounded-xl bg-white/20 hover:bg-white/30 text-white px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer min-h-[44px]"
              title="ดูเงื่อนไขการลางาน"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">เงื่อนไขการลา</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-5 sm:space-y-6 text-sm momentum-scroll">
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 sm:p-4 text-xs sm:text-sm text-rose-700 font-semibold shadow-2xs">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* แจ้งเตือนกรณีพนักงานยังอยู่ในช่วงทดลองงาน (< 119 วัน) */}
          {!probationCheck.probation.passed && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs sm:text-sm text-amber-950 shadow-2xs flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="font-bold">
                ทดลองงาน 119 วัน (ผ่านโปร{' '}
                {formatThaiDate(probationCheck.probation.passDate, true)}) —
                ล็อก ลาพักร้อน / WFH / WFA
              </span>
            </div>
          )}

          {/* 1. เลือกประเภทการลา / รูปแบบการปฏิบัติงาน */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2 sm:mb-2.5">
              1. เลือกประเภท ({effectiveQuota.year}):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {ALL_LEAVE_TYPES.map((type) => {
                const meta = LEAVE_TYPE_META[type];
                const q = effectiveQuota.quotas[type];
                const isSelected = leaveType === type;
                const isExec =
                  currentUser?.role === 'c_level' ||
                  currentUser?.role === 'admin';
                const typeProbation = checkProbationLeaveEligibility(
                  currentUser?.startDate,
                  type,
                  startDate
                );
                const isLockedByProbation = !isExec && !typeProbation.allowed;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setLeaveType(type)}
                    className={`rounded-2xl border p-3 sm:p-4 text-left transition cursor-pointer flex flex-col justify-between min-h-[82px] sm:min-h-[92px] ${
                      isSelected
                        ? 'border-[#0066FF] bg-blue-50/80 ring-2 ring-blue-600/30 shadow-xs'
                        : isLockedByProbation
                          ? 'border-slate-200 bg-slate-50/80 opacity-60'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-slate-900 text-xs sm:text-sm md:text-base leading-snug truncate">
                        {meta.label}
                      </span>
                      <span
                        className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full shrink-0 ring-2 ring-white"
                        style={{ backgroundColor: meta.color }}
                      />
                    </div>
                    <div className="mt-1.5 sm:mt-2 text-xs text-slate-600">
                      {isLockedByProbation ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> รอผ่านโปร
                        </span>
                      ) : q.isUnlimited ? (
                        <span className="text-teal-700 font-black">
                          ไม่จำกัด (ใช้ {q.usedDays}ว.)
                        </span>
                      ) : q.availableAfterPending <= 0 ? (
                        <div className="flex items-baseline gap-1 text-rose-600">
                          <span className="font-bold">หมด:</span>
                          <strong className="font-black text-xs sm:text-base">
                            0
                          </strong>
                          <span className="text-slate-400 font-medium">
                            / {q.totalQuota}ว.
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-slate-500 font-medium">เหลือ:</span>
                          <strong className="text-blue-700 font-black text-xs sm:text-base">
                            {q.availableAfterPending}
                          </strong>
                          <span className="text-slate-400 font-medium">
                            / {q.totalQuota}ว.
                          </span>
                        </div>
                      )}
                    </div>
                    {q.pendingDays > 0 && (
                      <div className="text-xs font-bold text-amber-800 mt-1 bg-amber-100/80 border border-amber-200 px-1.5 py-0.5 rounded-md inline-block">
                        รอ {q.pendingDays} วัน
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ข้อกำหนดและเงื่อนไขตามประเภทการลาที่เลือก */}
          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-3.5 sm:p-4 text-xs sm:text-sm space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-blue-950 flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
                เงื่อนไขการ{LEAVE_TYPE_META[leaveType].label}:
              </span>
              <button
                type="button"
                onClick={() => setIsPolicyModalOpen(true)}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
              >
                ดูระเบียบทั้งหมด
              </button>
            </div>
            {leaveType === 'sick' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ต้องแจ้งโดยเร็วที่สุดในวันแรกที่ต้องหยุดงาน</li>
                <li>หลังจากกลับมาทำงานต้องส่งใบลาย้อนหลัง</li>
                <li>การลาป่วยตั้งแต่ <strong>3 วันทำงานขึ้นไป</strong> ให้แสดงใบรับรองแพทย์ด้วย</li>
              </ul>
            )}
            {leaveType === 'personal' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ส่งใบลาแจ้งทางหัวหน้างานทราบ และได้รับการอนุมัติล่วงหน้าไม่น้อยกว่า <strong>3 วันทำงาน</strong></li>
                <li>กรณีลาครบ 3 วันในปีนั้นๆ แล้ว มีเหตุหรือกิจที่ต้องลา ต้องได้รับการอนุมัติจากผู้บังคับบัญชาเป็นกรณีๆ ไป</li>
              </ul>
            )}
            {leaveType === 'vacation' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ได้รับการอนุมัติจากหัวหน้างานล่วงหน้าไม่น้อยกว่า <strong>3 วันทำงาน</strong></li>
                <li>ใช้ได้ต่อเมื่อปฏิบัติงานครบ 1 ปี (เฉลี่ยตาม Prorate)</li>
                <li>ในกรณีที่พนักงานใช้สิทธิหยุดพักผ่อนประจำปีไม่ครบตามสิทธิ <strong>ไม่สามารถนำมาสะสมในปีถัดไปได้</strong></li>
              </ul>
            )}
            {leaveType === 'wfh' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ได้รับการอนุมัติจากหัวหน้างาน เป็นกรณีที่สมเหตุสมผล สามารถดำเนินงานได้ตามปกติ</li>
                <li><strong>เปิดหน้าจอ Google Meet</strong> ระหว่างเวลาการทำงาน และสามารถติดต่อสื่อสารได้ตลอดเวลา</li>
              </ul>
            )}
            {leaveType === 'wfa' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ได้รับการอนุมัติจากหัวหน้างาน สามารถดำเนินงานได้ตามปกติและติดต่อสื่อสารได้ตลอดเวลา</li>
              </ul>
            )}
            {leaveType === 'offsite' && (
              <ul className="space-y-1 text-slate-700 font-medium list-disc list-inside">
                <li>ไม่มีโควต้าจำกัดวัน ต้องระบุสถานที่ / ชื่อลูกค้า / งานออกบูธให้ชัดเจนในช่องด้านล่าง</li>
              </ul>
            )}
          </div>

          {/* 2. เลือกช่วงเวลาการลา (เต็มวัน / ครึ่งวันเช้า / ครึ่งวันบ่าย) */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              2. เลือกรูปแบบช่วงเวลา
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
              {(
                ['full', 'half_morning', 'half_afternoon'] as LeaveDuration[]
              ).map((dur) => {
                const meta = DURATION_TYPE_META[dur];
                const isSelected = durationType === dur;
                return (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDurationType(dur)}
                    className={`rounded-xl sm:rounded-2xl border py-2.5 sm:py-3 px-2 sm:px-4 text-center font-bold text-xs sm:text-sm transition cursor-pointer min-h-[44px] sm:min-h-[48px] flex items-center justify-center ${
                      isSelected
                        ? 'border-[#0066FF] bg-[#0066FF] text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="sm:hidden">{meta.shortLabel}</span>
                    <span className="hidden sm:inline">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. วันที่เริ่ม - วันที่สิ้นสุด */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="leave-start-date"
                className="block text-sm font-bold text-slate-800 mb-1.5"
              >
                {durationType === 'full' ? 'วันที่เริ่ม' : 'วันที่ต้องการทำรายการครึ่งวัน'}
              </label>
              <input
                id="leave-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (durationType !== 'full' || val > endDate) {
                    setEndDate(val);
                  }
                }}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                required
              />
            </div>

            {durationType === 'full' && (
              <div>
                <label
                  htmlFor="leave-end-date"
                  className="block text-sm font-bold text-slate-800 mb-1.5"
                >
                  ถึงวันที่ (วันสิ้นสุด)
                </label>
                <input
                  id="leave-end-date"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>
            )}
          </div>

          {/* กล่องสรุปผลการคำนวณวันลาอัตโนมัติ */}
          <div
            className={`rounded-3xl border-2 p-5 sm:p-6 text-sm space-y-4 shadow-sm ${
              !calcResult.isValid || isOverQuota || !probationCheck.allowed
                ? 'border-rose-300 bg-rose-50/80 text-rose-950'
                : 'border-blue-300 bg-gradient-to-br from-blue-50/90 via-sky-50/30 to-white text-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-200/60 pb-3.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-blue-600" />
                  คำนวณวันทำการสุทธิอัตโนมัติ
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    สุทธิ {calcResult.isValid ? calcResult.totalDays : 0} วันทำการ
                  </span>
                  {durationType !== 'full' && (
                    <span className="rounded-lg bg-blue-100 text-blue-800 font-bold px-2 py-0.5 text-xs">
                      {DURATION_TYPE_META[durationType].label}
                    </span>
                  )}
                </div>
              </div>

              {calcResult.isValid && !isOverQuota ? (
                <span className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-black text-white shadow-xs self-start sm:self-auto flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  พร้อมยื่นคำขอ
                </span>
              ) : (
                <span className="rounded-2xl bg-rose-600 px-4 py-2 text-xs sm:text-sm font-black text-white shadow-xs self-start sm:self-auto flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {isOverQuota ? 'โควต้าไม่พอ' : 'ตรวจสอบข้อมูล'}
                </span>
              )}
            </div>

            {!calcResult.isValid ? (
              <p className="text-rose-700 font-bold text-sm">{calcResult.error}</p>
            ) : (
              <div className="space-y-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-xl bg-white px-3 py-1.5 border border-slate-200 font-bold text-slate-900 shadow-2xs">
                    📅 {formatThaiDate(startDate)} ถึง{' '}
                    {formatThaiDate(durationType === 'full' ? endDate : startDate)}{' '}
                    (ปฏิทิน {calcResult.calendarDays} วัน)
                  </span>

                  {calcResult.skippedWeekendDates.length > 0 && (
                    <span className="rounded-xl bg-emerald-100/80 border border-emerald-200 px-3 py-1.5 font-bold text-emerald-800 shadow-2xs">
                      ✨ ตัดเสาร์-อาทิตย์ออก {calcResult.skippedWeekendDates.length} วัน
                    </span>
                  )}

                  {calcResult.skippedHolidayDates.length > 0 && (
                    <span className="rounded-xl bg-emerald-100/80 border border-emerald-200 px-3 py-1.5 font-bold text-emerald-800 shadow-2xs">
                      🎉 ตัดวันหยุดบริษัท {calcResult.skippedHolidayDates.length} วัน (
                      {calcResult.skippedHolidayDates.map((h) => h.name).join(', ')})
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-blue-100 flex items-center justify-between flex-wrap gap-2 text-slate-900 font-semibold">
                  <div>
                    โควต้า{selectedQuota.label}:{' '}
                    {selectedQuota.isUnlimited ? (
                      <span className="text-teal-700 font-bold">
                        ไม่จำกัดโควต้า (บันทึกเวลาปฏิบัติงานหลังอนุมัติ)
                      </span>
                    ) : (
                      <>
                        คงเหลือหลังยื่นรายการนี้:{' '}
                        <strong
                          className={`text-base font-black ${
                            isOverQuota ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {selectedQuota.availableAfterPending -
                            calcResult.totalDays}{' '}
                          วัน
                        </strong>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ช่องระบุสถานที่ / ชื่อลูกค้า (แสดงเมื่อเลือก ทำงานนอกสถานที่ / WFA / WFH) */}
          {(leaveType === 'offsite' ||
            leaveType === 'wfa' ||
            leaveType === 'wfh') && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-2">
              <label
                htmlFor="leave-location-detail"
                className="flex items-center gap-1.5 text-sm font-bold text-teal-950"
              >
                <MapPin className="h-4.5 w-4.5 text-teal-600" />
                <span>
                  สถานที่ปฏิบัติงาน / ชื่อลูกค้า / ชื่องานออกบูธ{' '}
                  {leaveType === 'offsite' && (
                    <span className="text-rose-500 font-black">* (บังคับระบุ)</span>
                  )}
                </span>
              </label>
              <input
                id="leave-location-detail"
                type="text"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder={
                  leaveType === 'offsite'
                    ? 'เช่น ไปพบลูกค้า บจก. สยามเทค (สีลม) หรือ ออกบูธงาน Tech Expo ศูนย์สิริกิติ์'
                    : 'เช่น ทำงานที่บ้าน หรือ ระบุจังหวัด/สถานที่ปฏิบัติงาน'
                }
                className="w-full rounded-xl border border-teal-300 bg-white px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-teal-600 focus:outline-hidden"
                required={leaveType === 'offsite'}
              />
            </div>
          )}

          {/* 4. เหตุผลการลา / รายละเอียดงาน */}
          <div>
            <label
              htmlFor="leave-reason"
              className="block text-sm font-bold text-slate-800 mb-1.5"
            >
              3. เหตุผลการลา / รายละเอียดงานที่รับผิดชอบ{' '}
              <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ระบุเหตุผลการลา หรือ รายละเอียดงาน"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden leading-relaxed"
              required
            />
          </div>

          {/* 5. แนบลิงก์ / รูปใบรับรองแพทย์ */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${
              leaveType === 'sick'
                ? 'border-rose-200 bg-rose-50/50'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <FileText className="h-4.5 w-4.5 text-rose-600" />
                <span>
                  4. แนบรูปภาพหรือลิงก์ใบรับรองแพทย์ / เอกสารประกอบ{' '}
                  {leaveType === 'sick' ? '(แนะนำสำหรับลาป่วย)' : '(ถ้ามี)'}
                </span>
              </div>
              {attachmentUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentUrl('');
                    setAttachmentName('');
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  ลบไฟล์แนบ
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-white py-3 px-4 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-50 transition cursor-pointer shadow-2xs min-h-[44px]">
                <Upload className="h-4.5 w-4.5" />
                <span>อัปโหลดรูปใบรับรองแพทย์ / เอกสาร</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="relative">
                <Link2 className="h-4.5 w-4.5 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={
                    attachmentUrl.startsWith('data:') ? '' : attachmentUrl
                  }
                  onChange={(e) => {
                    setAttachmentUrl(e.target.value);
                    setAttachmentName('ลิงก์เอกสารแนบ');
                  }}
                  placeholder="หรือวางลิงก์ Google Drive / รูปภาพที่นี่"
                  className="w-full rounded-2xl border border-slate-300 bg-white pl-10 pr-3.5 py-3 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            {attachmentUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs sm:text-sm text-emerald-800 font-semibold">
                <ImageIcon className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <span className="truncate">
                  แนบเอกสารเรียบร้อย:{' '}
                  <strong>{attachmentName || attachmentUrl}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Actions Footer */}
        <div className="shrink-0 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 shadow-md flex items-center gap-2.5 sm:gap-3 justify-end pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-slate-300 bg-white px-4 sm:px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[48px] flex items-center justify-center"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !calcResult.isValid ||
              isOverQuota ||
              !probationCheck.allowed
            }
            className="flex-[2] sm:flex-none rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0066FF] to-[#1D4ED8] hover:from-blue-700 hover:to-[#0A2540] px-4 sm:px-6 py-3 text-sm sm:text-base font-black text-white shadow-lg disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer min-h-[48px] active:scale-98"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="truncate">
              {submitting
                ? 'กำลังส่งคำขอ...'
                : `ส่งคำขอใบลา (${calcResult.totalDays} วัน)`}
            </span>
          </button>
        </div>
      </form>

      <LeavePolicyModal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        onlyView={true}
      />
    </div>
  );
}
