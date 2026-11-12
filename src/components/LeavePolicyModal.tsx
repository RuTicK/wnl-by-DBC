'use client';

import React, { useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  ShieldAlert,
  Sun,
  Video,
  X,
} from 'lucide-react';

interface LeavePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  onlyView?: boolean;
}

export default function LeavePolicyModal({
  isOpen,
  onClose,
  onConfirm,
  onlyView = false,
}: LeavePolicyModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProceed = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เงื่อนไขและระเบียบการลางาน"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs"
    >
      <div className="relative flex h-[92dvh] sm:h-auto sm:max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] sm:rounded-3xl bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-blue-500/20 bg-gradient-to-r from-[#0A2540] via-[#0A2540] to-[#0066FF] px-4 sm:px-6 py-3.5 sm:py-4 text-white">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-white/20 text-white shadow-xs shrink-0">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-black tracking-tight truncate">
                เงื่อนไขและระเบียบการลางาน
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 mt-0.5 font-medium truncate">
                ข้อกำหนดการลาและปฏิบัติงานนอกสถานที่ บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 transition cursor-pointer shrink-0 ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Policy Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-4 sm:space-y-5 text-sm momentum-scroll">
          {/* Probation Notice Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 via-amber-50 to-orange-50 border border-amber-200 p-4 sm:p-4.5 text-xs sm:text-sm text-amber-950 space-y-1.5 shadow-2xs">
            <div className="font-black flex items-center gap-2 text-amber-900">
              <Clock className="h-4.5 w-4.5 text-amber-600 shrink-0" />
              <span>เกณฑ์การผ่านทดลองงาน: 119 วัน (Probation)</span>
            </div>
            <p className="text-amber-800 leading-relaxed font-medium">
              พนักงานต้องปฏิบัติงานครบ <strong>119 วัน</strong> จึงจะถือว่าผ่านการทดลองงาน โดยในช่วงระหว่างทดลองงานจะไม่สามารถใช้สิทธิ <strong>ลาพักร้อน (Vacation) หรือ Work From Home (WFH)</strong> ได้ (สามารถใช้สิทธิลาป่วย หรือ ทำงานนอกสถานที่ได้ตามปกติ)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. ลาป่วย (Sick Leave) */}
            <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-rose-200/60 pb-2.5">
                  <div className="flex items-center gap-2 font-black text-rose-900 text-base">
                    <Activity className="h-5 w-5 text-rose-600 shrink-0" />
                    <span>ลาป่วย</span>
                  </div>
                  <span className="rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-bold">
                    30 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>ต้องแจ้งโดยเร็วที่สุดในวันแรกที่ต้องหยุดงาน</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>หลังจากกลับมาทำงานต้องส่งใบลาย้อนหลัง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      การลาป่วยตั้งแต่ <strong>3 วันทำงานขึ้นไป</strong> ให้แสดงใบรับรองแพทย์ด้วย
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 2. ลากิจ (Personal Leave) */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-2.5">
                  <div className="flex items-center gap-2 font-black text-amber-900 text-base">
                    <FileText className="h-5 w-5 text-amber-600 shrink-0" />
                    <span>ลากิจ</span>
                  </div>
                  <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-bold">
                    3 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ส่งใบลาแจ้งทางหัวหน้างานทราบ และได้รับการอนุมัติล่วงหน้าไม่น้อยกว่า <strong>3 วันทำงาน</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      กรณีลาครบ 3 วันในปีนั้นๆ แล้ว มีเหตุหรือกิจที่ต้องลา ต้องได้รับการอนุมัติจากผู้บังคับบัญชาเป็นกรณีๆ ไป
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 3. ลาพักร้อน (Vacation Leave) */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-sky-200/60 pb-2.5">
                  <div className="flex items-center gap-2 font-black text-sky-900 text-base">
                    <Sun className="h-5 w-5 text-sky-600 shrink-0" />
                    <span>ลาพักร้อน</span>
                  </div>
                  <span className="rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 text-xs font-bold">
                    6 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ได้รับการอนุมัติจากหัวหน้างานล่วงหน้าไม่น้อยกว่า <strong>3 วันทำงาน</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>ใช้ได้ต่อเมื่อปฏิบัติงานครบ 1 ปี (เฉลี่ยตาม Prorate)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ในกรณีที่พนักงานใช้สิทธิหยุดพักผ่อนประจำปีไม่ครบตามสิทธิ <strong>ไม่สามารถนำมาสะสมในปีถัดไปได้</strong>
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 4. WFH (Work From Home) */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-blue-200/60 pb-2.5">
                  <div className="flex items-center gap-2 font-black text-blue-900 text-base">
                    <Home className="h-5 w-5 text-blue-600 shrink-0" />
                    <span>Work From Home (WFH)</span>
                  </div>
                  <span className="rounded-full bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 text-xs font-bold">
                    ไม่มีโควต้า (ไม่จำกัด)
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>ได้รับการอนุมัติจากหัวหน้างาน</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>เป็นกรณีที่สมเหตุสมผล</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>สามารถดำเนินงานได้ตามปกติ</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      <strong>เปิดหน้าจอ Google Meet</strong> ระหว่างเวลาการทำงาน และสามารถติดต่อสื่อสารได้ตลอดเวลา
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 shadow-md flex items-center gap-2.5 sm:gap-3 justify-end pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          {onlyView ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl sm:rounded-2xl bg-[#0066FF] hover:bg-blue-700 px-6 py-3 text-sm font-bold text-white transition cursor-pointer min-h-[46px]"
            >
              ปิดหน้าต่าง
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[48px] flex items-center justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleProceed}
                className="flex-[2] sm:flex-none rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0066FF] via-blue-600 to-[#1D4ED8] hover:from-blue-700 hover:to-[#0A2540] px-6 py-3 text-sm sm:text-base font-black text-white shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer min-h-[48px] active:scale-98"
              >
                <span>รับทราบเงื่อนไขและยื่นใบลา</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
