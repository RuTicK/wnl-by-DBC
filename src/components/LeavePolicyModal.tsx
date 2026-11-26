'use client';

import React, { useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  Home,
  Sun,
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/45 p-0 sm:p-4 backdrop-blur-xs animate-ui-fade"
    >
      <div className="relative flex h-[92dvh] sm:h-auto sm:max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 animate-ui-modal">
        {/* Clean Modern Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                เงื่อนไขและระเบียบการลางาน
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                ข้อกำหนดการลาและปฏิบัติงานนอกสถานที่ บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 ml-2 min-h-[38px] min-w-[38px] flex items-center justify-center"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Policy Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-sm momentum-scroll bg-[#FAFBFD]">
          {/* Probation Notice Banner */}
          <div className="rounded-xl bg-amber-50/75 border border-amber-200/75 p-4 text-xs sm:text-sm text-amber-950 space-y-1.5">
            <div className="font-semibold flex items-center gap-2 text-amber-900">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>เกณฑ์การผ่านทดลองงาน: 119 วัน (Probation)</span>
            </div>
            <p className="text-amber-900/85 leading-relaxed">
              พนักงานต้องปฏิบัติงานครบ <strong className="font-semibold">119 วัน</strong> จึงจะถือว่าผ่านการทดลองงาน โดยในช่วงระหว่างทดลองงานจะไม่สามารถใช้สิทธิ <strong className="font-semibold">ลาพักร้อน (Vacation) หรือ Work From Home (WFH)</strong> ได้ (สามารถใช้สิทธิลาป่วย ลากิจ หรือ ทำงานนอกสถานที่ได้ตามปกติ)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. ลาป่วย (Sick Leave) */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60 shrink-0">
                      <Activity className="h-4 w-4" />
                    </span>
                    <span>ลาป่วย</span>
                  </div>
                  <span className="rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                    30 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>ต้องแจ้งโดยเร็วที่สุดในวันแรกที่ต้องหยุดงาน</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>หลังจากกลับมาทำงานต้องส่งใบลาย้อนหลัง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      การลาป่วยตั้งแต่ <strong className="font-semibold text-slate-800">3 วันทำงานขึ้นไป</strong> ให้แสดงใบรับรองแพทย์ด้วย
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 2. ลากิจ (Personal Leave) */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60 shrink-0">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span>ลากิจ</span>
                  </div>
                  <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                    3 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ส่งใบลาแจ้งทางหัวหน้างานทราบ และได้รับการอนุมัติล่วงหน้าไม่น้อยกว่า <strong className="font-semibold text-slate-800">3 วันทำงาน</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      กรณีลาครบ 3 วันในปีนั้นๆ แล้ว มีเหตุหรือกิจที่ต้องลา ต้องได้รับการอนุมัติเป็นกรณีพิเศษจากผู้บริหาร
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 3. ลาพักร้อน (Vacation Leave) */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-200/60 shrink-0">
                      <Sun className="h-4 w-4" />
                    </span>
                    <span>ลาพักร้อน</span>
                  </div>
                  <span className="rounded-full bg-sky-50 text-sky-700 border border-sky-200/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                    6 วัน / ปี
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ได้รับการอนุมัติจากหัวหน้างานล่วงหน้าไม่น้อยกว่า <strong className="font-semibold text-slate-800">3 วันทำงาน</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>ใช้ได้ต่อเมื่อปฏิบัติงานครบ 1 ปี (เฉลี่ยตาม Prorate)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      ในกรณีที่พนักงานใช้สิทธิหยุดพักผ่อนประจำปีไม่ครบตามสิทธิ <strong className="font-semibold text-slate-800">ไม่สามารถนำมาสะสมในปีถัดไปได้</strong>
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 4. WFH (Work From Home) */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#0066FF] border border-blue-200/60 shrink-0">
                      <Home className="h-4 w-4" />
                    </span>
                    <span>Work From Home (WFH)</span>
                  </div>
                  <span className="rounded-full bg-blue-50 text-[#0066FF] border border-blue-200/80 px-2.5 py-0.5 text-xs font-semibold shrink-0 whitespace-nowrap">
                    Check-in โดยตรง
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>ไม่ต้องยื่นใบขออนุมัติล่วงหน้า สามารถกด Check-in (WFH) ได้ที่หน้าลงเวลาเข้างานโดยตรง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      <strong className="font-semibold text-slate-800">ต้องแนบลิงก์ Google Meet</strong> ทุกครั้งเมื่อกด Check-in WFH
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>สามารถดำเนินงานได้ตามปกติ</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>
                      <strong className="font-semibold text-slate-800">เปิดหน้าจอ Google Meet</strong> ระหว่างเวลาการทำงาน และสามารถติดต่อสื่อสารได้ตลอดเวลา
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 bg-white px-5 sm:px-6 py-3.5 border-t border-slate-100 flex items-center gap-2.5 justify-end pb-[max(0.85rem,env(safe-area-inset-bottom,0px))]">
          {onlyView ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-5 py-2.5 text-sm font-semibold text-white transition cursor-pointer min-h-[42px]"
            >
              ปิดหน้าต่าง
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer min-h-[44px] flex items-center justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleProceed}
                className="flex-[2] sm:flex-none rounded-xl bg-[#0066FF] hover:bg-[#0052CC] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px] active:scale-[0.98]"
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
