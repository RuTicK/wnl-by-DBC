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
  calculateLeaveDays,
  calculateUserQuotaSummary,
  checkProbationLeaveEligibility,
  DURATION_TYPE_META,
  formatThaiDate,
  getApprovalFlowLabel,
  getBangkokNow,
  LEAVE_TYPE_META,
  REQUESTABLE_LEAVE_TYPES,
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
    return getBangkokNow().dateStr;
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
    if (!isOpen || isPolicyModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPolicyModalOpen, submitting, onClose]);

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
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          let maxDim = 680;
          let quality = 0.55;
          let result = dataUrl;

          // บีบอัดภาพให้อยู่ในเกณฑ์ปลอดภัยของ Google Sheets (<= 45,000 ตัวอักษร)
          for (let attempt = 0; attempt < 3; attempt++) {
            let width = img.width || 600;
            let height = img.height || 600;
            if (width > maxDim || height > maxDim) {
              const ratio = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            canvas.width = width;
            canvas.height = height;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', quality);
            result = compressed;
            if (compressed.length <= 45000) {
              break;
            }
            maxDim = Math.round(maxDim * 0.8);
            quality = Math.max(0.35, quality - 0.1);
          }

          resolve(result.length < dataUrl.length ? result : dataUrl);
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

    if (file.size > 5 * 1024 * 1024) {
      setError('ขนาดไฟล์รูปใบรับรองแพทย์ต้องไม่เกิน 5 MB');
      return;
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setError('ระบบแนะนำให้อัปโหลดไฟล์รูปภาพ (JPG/PNG) หรือหากเป็นไฟล์ PDF กรุณาวางลิงก์ Google Drive ในช่องด้านขวา');
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ยื่นคำขอวันลา / ปฏิบัติงาน"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 p-0 sm:p-4 backdrop-blur-xs animate-ui-fade"
    >
      <form
        onSubmit={handleSubmit}
        className="relative flex h-[92dvh] sm:h-auto sm:max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 animate-ui-modal"
      >
        {/* Clean Modern Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                ยื่นคำขอวันลา / ปฏิบัติงาน
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                สายอนุมัติของคุณ: {getApprovalFlowLabel(currentUser?.role)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPolicyModalOpen(true)}
              className="rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 text-slate-600 hover:text-slate-900 px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
              title="ดูเงื่อนไขการลางาน"
            >
              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">เงื่อนไขการลา</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-sm momentum-scroll">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-700 font-medium">
              <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* แจ้งเตือนกรณีพนักงานยังอยู่ในช่วงทดลองงาน (< 119 วัน) */}
          {!probationCheck.probation.passed && (
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/75 px-3.5 py-2.5 text-xs sm:text-sm text-amber-900 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="font-medium">
                ทดลองงาน 119 วัน (ผ่านโปร{' '}
                {formatThaiDate(probationCheck.probation.passDate, true)}) —
                ล็อก ลาพักร้อน / WFH / WFA
              </span>
            </div>
          )}

          {/* 1. เลือกประเภทการลา / รูปแบบการปฏิบัติงาน */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              1. เลือกประเภท ({effectiveQuota.year})
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              {REQUESTABLE_LEAVE_TYPES.map((type) => {
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
                    className={`rounded-xl border p-3 sm:p-3.5 text-left transition cursor-pointer flex flex-col justify-between min-h-[78px] ${
                      isSelected
                        ? 'border-[#0066FF] bg-blue-50/50 ring-2 ring-blue-500/15'
                        : isLockedByProbation
                          ? 'border-slate-200/70 bg-slate-50/80 opacity-60'
                          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-900 text-xs sm:text-sm leading-snug">
                        {meta.label}
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: meta.color }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500 tabular-nums">
                      {isLockedByProbation ? (
                        <span className="text-rose-600 font-semibold flex items-center gap-1">
                          <Lock className="h-3 w-3" /> รอผ่านโปร
                        </span>
                      ) : q.isUnlimited ? (
                        <span className="text-teal-700 font-semibold">
                          ไม่จำกัด (ใช้ {q.usedDays}ว.)
                        </span>
                      ) : q.availableAfterPending <= 0 ? (
                        <div className="flex items-baseline gap-1 text-rose-600">
                          <span className="font-medium">หมด:</span>
                          <strong className="font-bold text-sm">0</strong>
                          <span className="text-slate-400">/ {q.totalQuota}ว.</span>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-slate-400">เหลือ</span>
                          <strong className="text-[#0066FF] font-bold text-sm">
                            {q.availableAfterPending}
                          </strong>
                          <span className="text-slate-400">/ {q.totalQuota}ว.</span>
                        </div>
                      )}
                    </div>
                    {q.pendingDays > 0 && (
                      <div className="text-[11px] font-semibold text-amber-800 mt-1.5 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-md inline-block self-start tabular-nums">
                        รอ {q.pendingDays} วัน
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              หมายเหตุ: การทำงานนอกสถานที่ (พบลูกค้า/ออกบูธ) ไม่ต้องยื่นขออนุมัติล่วงหน้า สามารถกด Check-in นอกสถานที่ในหน้าลงเวลาเข้างานได้ทันที
            </p>
          </div>

          {/* ข้อกำหนดและเงื่อนไขตามประเภทการลาที่เลือก */}
          <div className="rounded-xl border border-slate-200/75 bg-slate-50/75 p-3.5 text-xs sm:text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-[#0066FF] shrink-0" />
                {leaveType === 'wfh' || leaveType === 'wfa'
                  ? `เงื่อนไข ${LEAVE_TYPE_META[leaveType].label}:`
                  : `เงื่อนไขการ${LEAVE_TYPE_META[leaveType].label}:`}
              </span>
              <button
                type="button"
                onClick={() => setIsPolicyModalOpen(true)}
                className="text-xs font-semibold text-[#0066FF] hover:text-blue-800 cursor-pointer shrink-0"
              >
                ดูระเบียบทั้งหมด
              </button>
            </div>
            {leaveType === 'sick' && (
              <ul className="space-y-1 text-slate-600 list-disc list-inside text-xs">
                <li>ต้องแจ้งโดยเร็วที่สุดในวันแรกที่ต้องหยุดงาน</li>
                <li>หลังจากกลับมาทำงานต้องส่งใบลาย้อนหลัง</li>
                <li>การลาป่วยตั้งแต่ <strong className="font-semibold text-slate-800">3 วันทำงานขึ้นไป</strong> ให้แสดงใบรับรองแพทย์ด้วย</li>
              </ul>
            )}
            {leaveType === 'personal' && (
              <ul className="space-y-1 text-slate-600 list-disc list-inside text-xs">
                <li>ส่งใบลาแจ้งทางหัวหน้างานทราบ และได้รับการอนุมัติล่วงหน้าไม่น้อยกว่า <strong className="font-semibold text-slate-800">3 วันทำงาน</strong></li>
                <li>กรณีลาครบ 3 วันในปีนั้นๆ แล้ว มีเหตุหรือกิจที่ต้องลา ต้องได้รับการอนุมัติเป็นกรณีพิเศษจากผู้บริหาร</li>
              </ul>
            )}
            {leaveType === 'vacation' && (
              <ul className="space-y-1 text-slate-600 list-disc list-inside text-xs">
                <li>ได้รับการอนุมัติจากหัวหน้างานล่วงหน้าไม่น้อยกว่า <strong className="font-semibold text-slate-800">3 วันทำงาน</strong></li>
                <li>ใช้ได้ต่อเมื่อปฏิบัติงานครบ 1 ปี (เฉลี่ยตาม Prorate)</li>
                <li>ในกรณีที่พนักงานใช้สิทธิหยุดพักผ่อนประจำปีไม่ครบตามสิทธิ <strong className="font-semibold text-slate-800">ไม่สามารถนำมาสะสมในปีถัดไปได้</strong></li>
              </ul>
            )}
            {leaveType === 'wfh' && (
              <ul className="space-y-1 text-slate-600 list-disc list-inside text-xs">
                <li>ได้รับการอนุมัติจากหัวหน้างาน เป็นกรณีที่สมเหตุสมผล สามารถดำเนินงานได้ตามปกติ</li>
                <li><strong className="font-semibold text-slate-800">เปิดหน้าจอ Google Meet</strong> ระหว่างเวลาการทำงาน และสามารถติดต่อสื่อสารได้ตลอดเวลา</li>
              </ul>
            )}
            {leaveType === 'wfa' && (
              <ul className="space-y-1 text-slate-600 list-disc list-inside text-xs">
                <li>ได้รับการอนุมัติจากหัวหน้างาน สามารถดำเนินงานได้ตามปกติและติดต่อสื่อสารได้ตลอดเวลา</li>
              </ul>
            )}
          </div>

          {/* 2. เลือกช่วงเวลาการลา (เต็มวัน / ครึ่งวันเช้า / ครึ่งวันบ่าย) */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
              2. เลือกรูปแบบช่วงเวลา
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
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
                    className={`rounded-lg py-2.5 px-2 sm:px-3 text-center font-semibold text-xs sm:text-sm transition cursor-pointer min-h-[40px] flex items-center justify-center ${
                      isSelected
                        ? 'bg-white text-[#0066FF] shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="leave-start-date"
                className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                required
              />
            </div>

            {durationType === 'full' && (
              <div>
                <label
                  htmlFor="leave-end-date"
                  className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5"
                >
                  ถึงวันที่ (วันสิ้นสุด)
                </label>
                <input
                  id="leave-end-date"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                  required
                />
              </div>
            )}
          </div>

          {/* กล่องสรุปผลการคำนวณวันลาอัตโนมัติ */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 text-sm space-y-3.5 ${
              !calcResult.isValid || isOverQuota || !probationCheck.allowed
                ? 'border-rose-200 bg-rose-50/60 text-rose-950'
                : 'border-blue-200/75 bg-blue-50/40 text-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200/60 pb-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0066FF] flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  คำนวณวันทำการสุทธิอัตโนมัติ
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
                    สุทธิ {calcResult.isValid ? calcResult.totalDays : 0} วันทำการ
                  </span>
                  {durationType !== 'full' && (
                    <span className="rounded-md bg-blue-100/80 text-blue-800 font-semibold px-2 py-0.5 text-[11px]">
                      {DURATION_TYPE_META[durationType].label}
                    </span>
                  )}
                </div>
              </div>

              {calcResult.isValid && !isOverQuota && probationCheck.allowed ? (
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white self-start sm:self-auto flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  พร้อมยื่นคำขอ
                </span>
              ) : (
                <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white self-start sm:self-auto flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {!probationCheck.allowed
                    ? 'ติดเงื่อนไขทดลองงาน'
                    : isOverQuota
                      ? 'โควต้าไม่พอ'
                      : 'ตรวจสอบข้อมูล'}
                </span>
              )}
            </div>

            {!probationCheck.allowed ? (
              <p className="text-rose-700 font-semibold text-xs sm:text-sm leading-relaxed">
                {probationCheck.error || 'อยู่ในช่วงทดลองงานยังไม่ครบ 119 วัน ยังไม่สามารถยื่นคำขอประเภทนี้ได้'}
              </p>
            ) : !calcResult.isValid ? (
              <p className="text-rose-700 font-semibold text-xs sm:text-sm">{calcResult.error}</p>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-lg bg-white px-2.5 py-1 border border-slate-200/80 font-medium text-slate-700 tabular-nums">
                    {formatThaiDate(startDate)} –{' '}
                    {formatThaiDate(durationType === 'full' ? endDate : startDate)}{' '}
                    (ปฏิทิน {calcResult.calendarDays} วัน)
                  </span>

                  {calcResult.skippedWeekendDates.length > 0 && (
                    <span className="rounded-lg bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 font-semibold text-emerald-700 tabular-nums">
                      ตัดเสาร์-อาทิตย์ออก {calcResult.skippedWeekendDates.length} วัน
                    </span>
                  )}

                  {calcResult.skippedHolidayDates.length > 0 && (
                    <span className="rounded-lg bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 font-semibold text-emerald-700 tabular-nums">
                      ตัดวันหยุดบริษัท {calcResult.skippedHolidayDates.length} วัน (
                      {calcResult.skippedHolidayDates.map((h) => h.name).join(', ')})
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between flex-wrap gap-2 text-slate-700 font-medium">
                  <div>
                    โควต้า{selectedQuota.label}:{' '}
                    {selectedQuota.isUnlimited ? (
                      <span className="text-teal-700 font-semibold">
                        ไม่จำกัดโควต้า (บันทึกเวลาปฏิบัติงานหลังอนุมัติ)
                      </span>
                    ) : (
                      <>
                        คงเหลือหลังยื่นรายการนี้:{' '}
                        <strong
                          className={`text-sm font-bold tabular-nums ${
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

          {/* ช่องระบุสถานที่ปฏิบัติงาน (แสดงเมื่อเลือก WFA / WFH) */}
          {(leaveType === 'wfa' || leaveType === 'wfh') && (
            <div className="rounded-xl border border-teal-200/75 bg-teal-50/40 p-4 space-y-2">
              <label
                htmlFor="leave-location-detail"
                className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-teal-900"
              >
                <MapPin className="h-4 w-4 text-teal-600" />
                <span>สถานที่ปฏิบัติงาน (WFH / WFA)</span>
              </label>
              <input
                id="leave-location-detail"
                type="text"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="เช่น ทำงานที่บ้าน หรือ ระบุจังหวัด/สถานที่ปฏิบัติงาน"
                className="w-full rounded-xl border border-teal-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-500/10 focus:outline-hidden transition"
              />
            </div>
          )}

          {/* 4. เหตุผลการลา / รายละเอียดงาน */}
          <div>
            <label
              htmlFor="leave-reason"
              className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5"
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden leading-relaxed transition"
              required
            />
          </div>

          {/* 5. แนบลิงก์ / รูปใบรับรองแพทย์ */}
          <div
            className={`rounded-xl border p-4 space-y-3 ${
              leaveType === 'sick'
                ? 'border-rose-200/75 bg-rose-50/35'
                : 'border-slate-200/75 bg-slate-50/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-slate-700">
                <FileText className="h-4 w-4 text-rose-500 shrink-0" />
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
                  className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer shrink-0"
                >
                  ลบไฟล์แนบ
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-[#0066FF] hover:bg-blue-50/60 transition cursor-pointer min-h-[42px]">
                <Upload className="h-4 w-4" />
                <span>อัปโหลดรูปใบรับรองแพทย์ / เอกสาร</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="relative">
                <Link2 className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden transition"
                />
              </div>
            </div>

            {attachmentUrl && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200/75 px-3 py-2 text-xs text-emerald-800 font-medium">
                <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  แนบเอกสารเรียบร้อย:{' '}
                  <strong className="font-semibold">{attachmentName || attachmentUrl}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Actions Footer */}
        <div className="shrink-0 bg-white px-5 sm:px-6 py-3.5 border-t border-slate-100 flex items-center gap-2.5 justify-end pb-[max(0.85rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer min-h-[44px] flex items-center justify-center"
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
            className="flex-[2] sm:flex-none rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px] active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
            <span className="truncate tabular-nums">
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
