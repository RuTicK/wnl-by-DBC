import React from 'react';
import Link from 'next/link';
import { Calendar, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center p-4 text-center">
      <div className="max-w-sm w-full rounded-3xl bg-white border border-slate-200/80 p-8 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.08)] space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0066FF] border border-blue-100">
          <Calendar className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Error 404
          </p>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            ไม่พบหน้าที่ต้องการ
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            หน้าเว็บที่คุณกำลังเข้าถึงไม่มีอยู่ในระบบ หรืออาจถูกย้ายไปแล้ว
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0066FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0052CC] shadow-xs transition min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>กลับหน้าหลัก</span>
        </Link>
      </div>
    </div>
  );
}
