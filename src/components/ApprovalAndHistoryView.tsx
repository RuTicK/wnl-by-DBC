'use client';

import React, { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock,
  EyeOff,
  FileText,
  MapPin,
  ShieldCheck,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  checkApprovalPermission,
  checkRejectionPermission,
  DURATION_TYPE_META,
  formatThaiDate,
  getApprovalFlowLabel,
  LEAVE_TYPE_META,
  STATUS_META,
} from '@/lib/leave-utils';
import { LeaveRequest, SafeUser } from '@/lib/types';

interface ApprovalAndHistoryViewProps {
  currentUser: SafeUser;
  leaves: LeaveRequest[];
  onProcessLeaveAction: (
    leaveId: string,
    action: 'approve' | 'reject' | 'cancel',
    comment?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function ApprovalAndHistoryView({
  currentUser,
  leaves,
  onProcessLeaveAction,
}: ApprovalAndHistoryViewProps) {
  const [subTab, setSubTab] = useState<'ACTION_QUEUE' | 'MY_LEAVES' | 'ALL'>(
    currentUser.role === 'employee' ? 'MY_LEAVES' : 'ACTION_QUEUE'
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // รายการที่รอให้ผู้ใช้งานคนนี้กดอนุมัติตามสายบังคับบัญชา (แยกตามสายบังคับบัญชาแผนก)
  const actionQueueLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (currentUser.role === 'manager') {
        const userDept = (currentUser.department || '').trim().toLowerCase();
        const leaveDept = (l.department || '').trim().toLowerCase();
        if (!userDept || !leaveDept || userDept !== leaveDept) return false;
      }
      return checkApprovalPermission(l, currentUser).allowed;
    });
  }, [leaves, currentUser]);

  const myLeaves = useMemo(() => {
    return leaves.filter((l) => l.userId === currentUser.id);
  }, [leaves, currentUser]);

  const deptLeaves = useMemo(() => {
    if (
      currentUser.role === 'admin' ||
      currentUser.role === 'hr' ||
      currentUser.role === 'c_level'
    ) {
      return leaves;
    }
    const userDept = (currentUser.department || '').trim().toLowerCase();
    return leaves.filter((l) => {
      const leaveDept = (l.department || '').trim().toLowerCase();
      return (
        Boolean(userDept && leaveDept && userDept === leaveDept) ||
        l.userId === currentUser.id
      );
    });
  }, [leaves, currentUser]);

  const displayedLeaves = useMemo(() => {
    if (currentUser.role === 'employee') return myLeaves;
    if (subTab === 'ACTION_QUEUE') return actionQueueLeaves;
    if (subTab === 'MY_LEAVES') return myLeaves;
    return deptLeaves;
  }, [currentUser.role, subTab, actionQueueLeaves, myLeaves, deptLeaves]);

  const handleAction = async (
    leaveId: string,
    action: 'approve' | 'reject' | 'cancel'
  ) => {
    if (currentUser.role === 'employee' && action !== 'cancel') {
      setFeedback({
        type: 'error',
        message: 'พนักงานไม่มีสิทธิ์อนุมัติหรือปฏิเสธใบลา (เฉพาะ Manager, HR หรือ C-Level เท่านั้น)',
      });
      return;
    }
    const targetLeave = leaves.find((l) => l.id === leaveId);
    if (
      currentUser.role === 'manager' &&
      action !== 'cancel' &&
      targetLeave
    ) {
      const userDept = (currentUser.department || '').trim().toLowerCase();
      const leaveDept = (targetLeave.department || '').trim().toLowerCase();
      if (!userDept || !leaveDept || userDept !== leaveDept) {
        setFeedback({
          type: 'error',
          message: `หัวหน้าแผนก ${currentUser.department} ไม่มีสิทธิ์ดำเนินการกับใบลาของแผนกอื่น (${targetLeave.department})`,
        });
        return;
      }
    }
    if (action === 'approve' && targetLeave) {
      const perm = checkApprovalPermission(targetLeave, currentUser);
      if (!perm.allowed) {
        setFeedback({
          type: 'error',
          message: perm.error || 'คุณไม่มีสิทธิ์อนุมัติใบลานี้',
        });
        return;
      }
    }
    if (action === 'reject' && targetLeave) {
      const perm = checkRejectionPermission(targetLeave, currentUser);
      if (!perm.allowed) {
        setFeedback({
          type: 'error',
          message: perm.error || 'คุณไม่มีสิทธิ์ปฏิเสธใบลานี้',
        });
        return;
      }
    }
    setFeedback(null);
    setProcessingId(leaveId);
    try {
      const comment = comments[leaveId] || '';
      const res = await onProcessLeaveAction(leaveId, action, comment);
      if (!res.success) {
        setFeedback({
          type: 'error',
          message: res.error || 'ไม่สามารถดำเนินการได้',
        });
      } else {
        const msg =
          action === 'approve'
            ? 'อนุมัติคำขอเรียบร้อยแล้ว'
            : action === 'reject'
              ? 'ปฏิเสธคำขอเรียบร้อยแล้ว'
              : 'ยกเลิกคำขอเรียบร้อยแล้ว';
        setFeedback({ type: 'success', message: msg });
        setComments((prev) => ({ ...prev, [leaveId]: '' }));
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 4-Role Approval Workflow Guide (Collapsible for a clean, uncluttered interface) */}
      {currentUser.role !== 'employee' && (
        <details className="group rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden transition">
          <summary className="p-3.5 sm:p-4 cursor-pointer font-bold text-xs sm:text-sm text-slate-700 hover:text-blue-700 flex items-center justify-between list-none [&::-webkit-details-marker]:hidden select-none min-h-[44px]">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="h-4.5 w-4.5 text-blue-600 shrink-0" />
              <span className="font-extrabold truncate">
                ผังสายการอนุมัติวันลาตามบทบาท (Approval Matrix)
              </span>
            </div>
            <span className="text-xs font-semibold text-blue-600 group-open:rotate-180 transition-transform shrink-0 ml-2">
              ▼
            </span>
          </summary>
          <div className="px-3.5 sm:px-4 pb-4 pt-1 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[11px]">1</span>
                พนักงาน (Employee)
              </div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                Employee &rarr; Manager (ขั้น 1) &rarr; HR (ขั้น 2) ตัดโควต้า
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px]">2</span>
                หัวหน้าแผนก (Manager)
              </div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                Manager &rarr; C-Level (ขั้น 1) &rarr; HR (ขั้น 2) ตัดโควต้า
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px]">3</span>
                ฝ่ายบุคคล (HR)
              </div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                HR 1 &rarr; C-Level (ขั้น 1) &rarr; HR 2 สำรอง (ขั้น 2)
              </p>
            </div>
          </div>
        </details>
      )}

      {/* Sub-navigation Tabs */}
      {currentUser.role === 'employee' ? (
        <div className="flex items-center justify-between border-b border-slate-200/90 pb-3.5">
          <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Clock className="h-5 w-5 text-blue-600" />
            <span>ประวัติคำขอวันลาของฉัน ({myLeaves.length} รายการ)</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar momentum-scroll border-b border-slate-200/90 pb-3">
          <button
            type="button"
            onClick={() => setSubTab('ACTION_QUEUE')}
            className={`rounded-2xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0 ${
              subTab === 'ACTION_QUEUE'
                ? 'bg-[#0066FF] text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            <span>รอฉันอนุมัติ</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                subTab === 'ACTION_QUEUE'
                  ? 'bg-white text-blue-700'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {actionQueueLeaves.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('MY_LEAVES')}
            className={`rounded-2xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0 ${
              subTab === 'MY_LEAVES'
                ? 'bg-[#0066FF] text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Clock className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            <span>ประวัติการลาของฉัน ({myLeaves.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('ALL')}
            className={`rounded-2xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0 ${
              subTab === 'ALL'
                ? 'bg-[#0066FF] text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            <span>
              {currentUser.role === 'admin' ||
              currentUser.role === 'hr' ||
              currentUser.role === 'c_level'
                ? `ใบลาทั้งบริษัท (${leaves.length})`
                : `ใบลาในแผนก ${currentUser.department} (${deptLeaves.length})`}
            </span>
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border p-4 text-xs sm:text-sm font-bold flex items-center justify-between shadow-2xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline ml-4 cursor-pointer font-bold"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Leave Cards List */}
      {displayedLeaves.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-200 p-12 text-center text-base text-slate-400 font-medium">
          ไม่มีรายการใบลาในหมวดหมู่นี้
        </div>
      ) : (
        <div className="space-y-4">
          {displayedLeaves.map((lv) => {
            const typeMeta =
              LEAVE_TYPE_META[lv.leaveType] || LEAVE_TYPE_META.vacation;
            const durMeta =
              DURATION_TYPE_META[lv.durationType] || DURATION_TYPE_META.full;
            const statusMeta =
              STATUS_META[lv.status] || STATUS_META.pending_manager;
            const approvePerm = checkApprovalPermission(lv, currentUser);
            const rejectPerm = checkRejectionPermission(lv, currentUser);
            const canCancel =
              lv.userId === currentUser.id &&
              (lv.status === 'pending_manager' ||
                lv.status === 'pending_c_level' ||
                lv.status === 'pending_hr');

            const isCLevelStep1Workflow =
              lv.requesterRole === 'manager' ||
              lv.requesterRole === 'hr' ||
              lv.status === 'pending_c_level' ||
              Boolean(lv.cLevelApproval);
            const step1Approval = lv.cLevelApproval || lv.managerApproval;

            return (
              <div
                key={lv.id}
                className="rounded-3xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4 hover:shadow-md transition"
              >
                {/* Top Row: Requester Info, Dates, and Large Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-slate-100 pb-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`rounded-2xl border px-3.5 py-2 text-xs sm:text-sm font-black shrink-0 ${typeMeta.badgeClass}`}
                    >
                      {typeMeta.label}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-lg sm:text-xl text-slate-900">
                          {lv.userName}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                          แผนก {lv.department}
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          #{lv.id}
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm text-slate-700 mt-1">
                        วันที่:{' '}
                        <strong className="text-slate-900 font-bold">
                          {formatThaiDate(lv.startDate)}
                          {lv.endDate !== lv.startDate
                            ? ` ถึง ${formatThaiDate(lv.endDate)}`
                            : ''}
                        </strong>{' '}
                        • {durMeta.label} •{' '}
                        <strong className="text-blue-700 font-black text-sm sm:text-base">
                          รวมสุทธิ {lv.totalDays} วันทำการ
                        </strong>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        สายอนุมัติ: {getApprovalFlowLabel(lv.requesterRole)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 self-start sm:self-center">
                    <span
                      className={`rounded-2xl border-2 px-4 py-1.5 text-xs sm:text-sm font-black shadow-2xs ${statusMeta.badgeClass}`}
                    >
                      {statusMeta.label}
                    </span>
                    {lv.cLevelNotifiedAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        <BellRing className="h-3.5 w-3.5 text-amber-600" />
                        แจ้งเตือน C-Level แล้ว
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Row: Reason & Connected 2-Step Approval Stepper */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch text-xs sm:text-sm">
                  {/* Left: Reason & Location */}
                  <div className="lg:col-span-5 space-y-2 rounded-2xl bg-slate-50 p-4 border border-slate-100 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="font-bold text-slate-700">
                        รายละเอียด / เหตุผลการลา &amp; สถานที่:
                      </div>

                      {lv.locationDetail && (
                        <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-teal-950 font-bold text-xs sm:text-sm">
                          <MapPin className="h-4 w-4 text-teal-600 shrink-0" />
                          <span>สถานที่/ลูกค้า: {lv.locationDetail}</span>
                        </div>
                      )}

                      {lv.isRedacted ? (
                        <div className="flex items-center gap-1.5 text-slate-400 italic">
                          <EyeOff className="h-4 w-4" />
                          <span>
                            เหตุผลส่วนตัว (ซ่อนข้อมูลสำหรับเพื่อนร่วมแผนกตาม PDPA)
                          </span>
                        </div>
                      ) : (
                        <p className="text-slate-800 leading-relaxed font-medium">
                          {lv.reason}
                        </p>
                      )}
                    </div>

                    {!lv.isRedacted && lv.attachmentUrl && (
                      <div className="pt-2 border-t border-slate-200/70 flex items-center gap-3">
                        {lv.attachmentUrl.startsWith('data:image/') ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewAttachment({
                                url: lv.attachmentUrl!,
                                name: lv.attachmentName || 'ใบรับรองแพทย์',
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            <span>
                              เปิดดูรูปใบรับรองแพทย์ ({lv.attachmentName})
                            </span>
                          </button>
                        ) : (
                          <a
                            href={lv.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                          >
                            <FileText className="h-4 w-4" />
                            <span>
                              เปิดลิงก์ใบรับรองแพทย์ / เอกสารแนบ (
                              {lv.attachmentName || 'คลิกเพื่อเปิด'})
                            </span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Connected Visual 2-Step Approval Stepper */}
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Step 1 Box */}
                    <div
                      className={`rounded-2xl border-2 p-4 flex flex-col justify-between shadow-2xs ${
                        step1Approval
                          ? 'border-emerald-300 bg-emerald-50/60'
                          : lv.status === 'pending_manager' ||
                              lv.status === 'pending_c_level'
                            ? 'border-amber-300 bg-amber-50/70 ring-2 ring-amber-400/20'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-slate-900 flex items-center justify-between text-xs sm:text-sm">
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black shrink-0">
                              1
                            </span>
                            <span>
                              {isCLevelStep1Workflow
                                ? 'ขั้นที่ 1: ผู้บริหาร (C-Level)'
                                : 'ขั้นที่ 1: หัวหน้าแผนก'}
                            </span>
                          </span>
                          {step1Approval ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-100 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติแล้ว
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-xs bg-amber-100 px-2 py-0.5 rounded-md">
                              <Clock className="h-3.5 w-3.5 animate-pulse" /> รออนุมัติ
                            </span>
                          )}
                        </div>

                        {step1Approval ? (
                          <div className="mt-2 text-xs text-slate-700 space-y-1">
                            <div>
                              อนุมัติโดย:{' '}
                              <strong className="text-slate-900 font-bold">
                                {step1Approval.approvedByName}
                              </strong>
                            </div>
                            {step1Approval.comment && (
                              <div className="text-xs text-slate-600 bg-white/80 rounded-lg p-2 border border-emerald-100 font-medium">
                                &ldquo;{step1Approval.comment}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-amber-900 font-medium">
                            {isCLevelStep1Workflow
                              ? 'รอผู้บริหาร (C-Level) ตรวจสอบและกดอนุมัติ'
                              : `รอหัวหน้าแผนก ${lv.department} ตรวจสอบและกดอนุมัติ`}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2 Box */}
                    <div
                      className={`rounded-2xl border-2 p-4 flex flex-col justify-between shadow-2xs ${
                        lv.hrApproval
                          ? 'border-emerald-300 bg-emerald-50/60'
                          : lv.status === 'pending_hr'
                            ? 'border-sky-300 bg-sky-50/70 ring-2 ring-sky-400/20'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-slate-900 flex items-center justify-between text-xs sm:text-sm">
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black shrink-0">
                              2
                            </span>
                            <span>
                              {lv.requesterRole === 'hr'
                                ? 'ขั้นที่ 2: HR สำรอง (HR 2)'
                                : 'ขั้นที่ 2: ฝ่ายบุคคล (HR)'}
                            </span>
                          </span>
                          {lv.hrApproval ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-100 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติแล้ว
                            </span>
                          ) : lv.status === 'pending_hr' ? (
                            <span className="inline-flex items-center gap-1 text-sky-800 font-bold text-xs bg-sky-100 px-2 py-0.5 rounded-md">
                              <Clock className="h-3.5 w-3.5 animate-pulse" /> รออนุมัติ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-xs bg-slate-200/70 px-2 py-0.5 rounded-md">
                              รอผ่านขั้นที่ 1
                            </span>
                          )}
                        </div>

                        {lv.hrApproval ? (
                          <div className="mt-2 text-xs text-slate-700 space-y-1">
                            <div>
                              อนุมัติโดย:{' '}
                              <strong className="text-slate-900 font-bold">
                                {lv.hrApproval.approvedByName}
                              </strong>
                            </div>
                            {lv.hrApproval.comment && (
                              <div className="text-xs text-slate-600 bg-white/80 rounded-lg p-2 border border-emerald-100 font-medium">
                                &ldquo;{lv.hrApproval.comment}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-slate-600 font-medium">
                            {lv.status === 'pending_hr'
                              ? lv.requesterRole === 'hr'
                                ? 'รอ HR สำรองอีกท่าน (HR 2) กดอนุมัติ'
                                : 'รอ HR กดอนุมัติเพื่อตัดโควต้า & แจ้ง C-Level'
                              : 'ต้องผ่านการอนุมัติขั้นที่ 1 ก่อนจึงจะมาถึงขั้นนี้'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {lv.rejectedBy && (
                  <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4 text-xs sm:text-sm text-rose-900">
                    <strong className="font-extrabold text-rose-950">
                      ไม่อนุมัติโดย {lv.rejectedBy.userName}:
                    </strong>{' '}
                    {lv.rejectedBy.reason}
                  </div>
                )}

                {/* Bottom Action Controls (Approve / Reject / Cancel) */}
                {((currentUser.role !== 'employee' &&
                  (approvePerm.allowed || rejectPerm.allowed)) ||
                  canCancel) && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3.5 border-t border-slate-100">
                    {currentUser.role !== 'employee' &&
                    (approvePerm.allowed || rejectPerm.allowed) ? (
                      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                        <input
                          type="text"
                          value={comments[lv.id] || ''}
                          onChange={(e) =>
                            setComments((prev) => ({
                              ...prev,
                              [lv.id]: e.target.value,
                            }))
                          }
                          placeholder="หมายเหตุการอนุมัติ / เหตุผลที่ไม่อนุมัติ (ถ้ามี)..."
                          className="flex-1 rounded-2xl border border-slate-300 px-4 py-2.5 text-base sm:text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden min-h-[44px]"
                        />

                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                          {approvePerm.allowed && (
                            <button
                              type="button"
                              disabled={processingId === lv.id}
                              onClick={() => {
                                if (window.confirm('ยืนยันการอนุมัติคำขอใบลาของ ' + lv.userName + ' ใช่หรือไม่?')) {
                                  handleAction(lv.id, 'approve');
                                }
                              }}
                              className="w-full sm:w-auto rounded-2xl bg-emerald-600 px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-md min-h-[46px] active:scale-98"
                            >
                              <CheckCircle2 className="h-4.5 w-4.5 sm:h-5 sm:w-5 shrink-0" />
                              <span className="sm:hidden truncate">
                                {approvePerm.step === 'manager' || approvePerm.step === 'c_level'
                                  ? 'อนุมัติ (ขั้น 1)'
                                  : 'อนุมัติ (ขั้น 2)'}
                              </span>
                              <span className="hidden sm:inline truncate">
                                {approvePerm.step === 'manager'
                                  ? 'อนุมัติขั้นที่ 1 (Manager -> HR)'
                                  : approvePerm.step === 'c_level'
                                    ? 'อนุมัติขั้นที่ 1 (C-Level -> HR)'
                                    : 'อนุมัติขั้นที่ 2 (ตัดโควต้า)'}
                              </span>
                            </button>
                          )}

                          {rejectPerm.allowed && (
                            <button
                              type="button"
                              disabled={processingId === lv.id}
                              onClick={() => {
                                if (window.confirm('ยืนยันการไม่อนุมัติคำขอนี้ใช่หรือไม่?')) {
                                  handleAction(lv.id, 'reject');
                                }
                              }}
                              className="w-full sm:w-auto rounded-2xl border-2 border-rose-300 bg-rose-50 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[46px] active:scale-98"
                            >
                              <XCircle className="h-4.5 w-4.5 shrink-0" />
                              <span>ไม่อนุมัติ</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}

                    {canCancel && (
                      <button
                        type="button"
                        disabled={processingId === lv.id}
                        onClick={() => {
                          if (window.confirm('คุณต้องการยกเลิกคำขอใบลาของตนเองใช่หรือไม่?')) {
                            handleAction(lv.id, 'cancel');
                          }
                        }}
                        className="w-full sm:w-auto rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 transition flex items-center justify-center gap-2 cursor-pointer shrink-0 min-h-[46px]"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        <span>ยกเลิกใบลาของฉัน</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal for Uploaded Medical Certificates */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4">
          <div className="max-w-2xl w-full rounded-2xl bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900">
                เอกสารแนบ / ใบรับรองแพทย์: {previewAttachment.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                ปิด
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto flex justify-center bg-slate-50 rounded-xl p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAttachment.url}
                alt={previewAttachment.name}
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
