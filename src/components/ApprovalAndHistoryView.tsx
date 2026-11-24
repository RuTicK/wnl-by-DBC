'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!previewAttachment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewAttachment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewAttachment]);

  // รายการที่รอให้ผู้ใช้งานคนนี้กดอนุมัติตามสายบังคับบัญชา (แยกตามสายบังคับบัญชาแผนก)
  const actionQueueLeaves = useMemo(() => {
    return leaves.filter((l) => {
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
      {/* Sub-navigation Segmented Tabs */}
      {currentUser.role === 'employee' ? (
        <div className="flex items-center justify-between border-b border-slate-200/75 pb-3.5">
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Clock className="h-4.5 w-4.5 text-[#0066FF]" />
            <span>ประวัติการลาของฉัน</span>
            <span className="rounded-full bg-slate-100 border border-slate-200/70 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
              {myLeaves.length}
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar momentum-scroll pb-1">
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => setSubTab('ACTION_QUEUE')}
              className={`rounded-lg px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer min-h-[38px] shrink-0 ${
                subTab === 'ACTION_QUEUE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ShieldCheck
                className={`h-4 w-4 ${
                  subTab === 'ACTION_QUEUE' ? 'text-[#0066FF]' : 'text-slate-400'
                }`}
              />
              <span>รอฉันอนุมัติ</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  subTab === 'ACTION_QUEUE'
                    ? actionQueueLeaves.length > 0
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                    : actionQueueLeaves.length > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200/80 text-slate-500'
                }`}
              >
                {actionQueueLeaves.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('MY_LEAVES')}
              className={`rounded-lg px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer min-h-[38px] shrink-0 ${
                subTab === 'MY_LEAVES'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Clock
                className={`h-4 w-4 ${
                  subTab === 'MY_LEAVES' ? 'text-[#0066FF]' : 'text-slate-400'
                }`}
              />
              <span>ประวัติการลาของฉัน ({myLeaves.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('ALL')}
              className={`rounded-lg px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer min-h-[38px] shrink-0 ${
                subTab === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserCheck
                className={`h-4 w-4 ${
                  subTab === 'ALL' ? 'text-[#0066FF]' : 'text-slate-400'
                }`}
              />
              <span>
                {currentUser.role === 'admin' ||
                currentUser.role === 'hr' ||
                currentUser.role === 'c_level'
                  ? `ทั้งหมด (${leaves.length})`
                  : `แผนก ${currentUser.department} (${deptLeaves.length})`}
              </span>
            </button>
          </div>
        </div>
      )}

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
            className="text-xs font-semibold opacity-75 hover:opacity-100 ml-4 cursor-pointer shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Leave Cards List */}
      {displayedLeaves.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/75 p-12 text-center space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/70 text-slate-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            ไม่มีรายการใบลาในหมวดหมู่นี้
          </p>
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
                className="rounded-2xl bg-white border border-slate-200/75 p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-300/80 transition space-y-4"
              >
                {/* Top Row: Requester Info, Dates, and Status Pill */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 min-w-0">
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold self-start sm:shrink-0 sm:mt-0.5 leading-snug ${typeMeta.badgeClass}`}
                    >
                      {typeMeta.label}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight">
                          {lv.userName}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          แผนก {lv.department}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          #{lv.id}
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm text-slate-600 mt-1 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                        <span>
                          <strong className="text-slate-800 font-semibold">
                            {formatThaiDate(lv.startDate)}
                            {lv.endDate !== lv.startDate
                              ? ` – ${formatThaiDate(lv.endDate)}`
                              : ''}
                          </strong>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>{durMeta.label}</span>
                        <span className="text-slate-300">·</span>
                        <strong className="text-[#0066FF] font-bold tabular-nums">
                          รวมสุทธิ {lv.totalDays} วันทำการ
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5 self-start shrink-0">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.badgeClass}`}
                    >
                      {statusMeta.label}
                    </span>
                    {lv.cLevelNotifiedAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/70 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                        <BellRing className="h-3 w-3 text-amber-600" />
                        แจ้งเตือน C-Level แล้ว
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Row: Reason & Clean 2-Step Approval Stepper */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch text-xs sm:text-sm">
                  {/* Left: Reason & Location */}
                  <div className="lg:col-span-5 space-y-2.5 rounded-xl bg-slate-50/75 p-4 border border-slate-200/60 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                        เหตุผลการลา
                      </div>

                      {lv.locationDetail && (
                        <div className="flex items-center gap-2 rounded-lg bg-teal-50/80 border border-teal-200/70 px-3 py-2 text-teal-900 font-medium text-xs">
                          <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                          <span>สถานที่/ลูกค้า: {lv.locationDetail}</span>
                        </div>
                      )}

                      {lv.isRedacted ? (
                        <div className="flex items-center gap-1.5 text-slate-400 italic text-xs sm:text-sm">
                          <EyeOff className="h-4 w-4 shrink-0" />
                          <span>
                            เหตุผลส่วนตัว (ซ่อนข้อมูลตาม PDPA)
                          </span>
                        </div>
                      ) : (
                        <p className="text-slate-700 leading-relaxed">
                          {lv.reason}
                        </p>
                      )}
                    </div>

                    {!lv.isRedacted && lv.attachmentUrl && (
                      <div className="pt-2.5 border-t border-slate-200/60 flex items-center gap-3">
                        {lv.attachmentUrl.startsWith('data:image/') ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewAttachment({
                                url: lv.attachmentUrl!,
                                name: lv.attachmentName || 'ใบรับรองแพทย์',
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200/70 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100/80 transition cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>ดูรูปใบรับรองแพทย์</span>
                          </button>
                        ) : (
                          <a
                            href={lv.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200/70 px-3 py-1.5 text-xs font-semibold text-[#0066FF] hover:bg-blue-100/80 transition"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>ดูเอกสารแนบ</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Clean Visual 2-Step Approval Stepper */}
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Step 1 Box */}
                    {(() => {
                      const skipsStep1 =
                        !step1Approval &&
                        (lv.requesterRole === 'c_level' ||
                          lv.requesterRole === 'admin');
                      const isStep1Pending =
                        !step1Approval &&
                        (lv.status === 'pending_manager' ||
                          lv.status === 'pending_c_level');
                      const isStep1Rejected =
                        !step1Approval && lv.status === 'rejected';
                      const isStep1Cancelled =
                        !step1Approval && lv.status === 'cancelled';

                      return (
                        <div
                          className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                            step1Approval
                              ? 'border-emerald-200/80 bg-emerald-50/35'
                              : isStep1Pending
                                ? 'border-amber-200/90 bg-amber-50/40'
                                : isStep1Rejected
                                  ? 'border-rose-200/80 bg-rose-50/35'
                                  : 'border-slate-200/70 bg-slate-50/60'
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="font-semibold text-slate-900 flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${
                                    step1Approval
                                      ? 'bg-emerald-600 text-white'
                                      : isStep1Pending
                                        ? 'bg-amber-500 text-white'
                                        : isStep1Rejected
                                          ? 'bg-rose-500 text-white'
                                          : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  1
                                </span>
                                <span className="truncate">
                                  {isCLevelStep1Workflow
                                    ? 'ขั้น 1: ผู้บริหาร (C-Level)'
                                    : 'ขั้น 1: หัวหน้าแผนก'}
                                </span>
                              </span>
                              {step1Approval ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full shrink-0">
                                  <CheckCircle2 className="h-3 w-3" /> อนุมัติแล้ว
                                </span>
                              ) : skipsStep1 ? (
                                <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px] bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                  ข้ามขั้น 1
                                </span>
                              ) : isStep1Rejected ? (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px] bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-full shrink-0">
                                  <XCircle className="h-3 w-3" /> ไม่อนุมัติ
                                </span>
                              ) : isStep1Cancelled ? (
                                <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px] bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                  ยกเลิกแล้ว
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-800 font-semibold text-[11px] bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-full shrink-0">
                                  <Clock className="h-3 w-3" /> รออนุมัติ
                                </span>
                              )}
                            </div>

                            {step1Approval ? (
                              <div className="text-xs text-slate-600 space-y-1.5">
                                <div>
                                  อนุมัติโดย:{' '}
                                  <strong className="text-slate-900 font-semibold">
                                    {step1Approval.approvedByName}
                                  </strong>
                                </div>
                                {step1Approval.comment && (
                                  <div className="text-xs text-slate-600 bg-white rounded-lg p-2 border border-slate-200/60">
                                    &ldquo;{step1Approval.comment}&rdquo;
                                  </div>
                                )}
                              </div>
                            ) : skipsStep1 ? (
                              <div className="text-xs text-slate-500">
                                ส่งตรงให้ฝ่ายบุคคล (HR) รับทราบ/บันทึกข้อมูล
                              </div>
                            ) : isStep1Rejected ? (
                              <div className="text-xs text-rose-700">
                                คำขอไม่ได้รับการอนุมัติในขั้นที่ 1
                              </div>
                            ) : isStep1Cancelled ? (
                              <div className="text-xs text-slate-500">
                                ผู้ยื่นคำขอได้ยกเลิกใบลาแล้ว
                              </div>
                            ) : (
                              <div className="text-xs text-amber-900/85">
                                {isCLevelStep1Workflow
                                  ? 'รอ C-Level อนุมัติ'
                                  : `รอหัวหน้าฝ่าย ${lv.department} อนุมัติ`}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 2 Box */}
                    <div
                      className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                        lv.hrApproval
                          ? 'border-emerald-200/80 bg-emerald-50/35'
                          : lv.status === 'pending_hr'
                            ? 'border-blue-200/90 bg-blue-50/40'
                            : lv.status === 'rejected' && Boolean(step1Approval)
                              ? 'border-rose-200/80 bg-rose-50/35'
                              : 'border-slate-200/70 bg-slate-50/60'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="font-semibold text-slate-900 flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${
                                lv.hrApproval
                                  ? 'bg-emerald-600 text-white'
                                  : lv.status === 'pending_hr'
                                    ? 'bg-[#0066FF] text-white'
                                    : lv.status === 'rejected' && Boolean(step1Approval)
                                      ? 'bg-rose-500 text-white'
                                      : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              2
                            </span>
                            <span className="truncate">
                              {lv.requesterRole === 'hr'
                                ? 'ขั้น 2: HR สำรอง'
                                : 'ขั้น 2: ฝ่ายบุคคล (HR)'}
                            </span>
                          </span>
                          {lv.hrApproval ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full shrink-0">
                              <CheckCircle2 className="h-3 w-3" /> อนุมัติแล้ว
                            </span>
                          ) : lv.status === 'pending_hr' ? (
                            <span className="inline-flex items-center gap-1 text-blue-700 font-semibold text-[11px] bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-full shrink-0">
                              <Clock className="h-3 w-3" /> รออนุมัติ
                            </span>
                          ) : lv.status === 'cancelled' ? (
                            <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px] bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                              ยกเลิกแล้ว
                            </span>
                          ) : lv.status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px] bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-full shrink-0">
                              <XCircle className="h-3 w-3" /> ไม่อนุมัติ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 font-medium text-[11px] bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                              รอขั้น 1
                            </span>
                          )}
                        </div>

                        {lv.hrApproval ? (
                          <div className="text-xs text-slate-600 space-y-1.5">
                            <div>
                              อนุมัติโดย:{' '}
                              <strong className="text-slate-900 font-semibold">
                                {lv.hrApproval.approvedByName}
                              </strong>
                            </div>
                            {lv.hrApproval.comment && (
                              <div className="text-xs text-slate-600 bg-white rounded-lg p-2 border border-slate-200/60">
                                &ldquo;{lv.hrApproval.comment}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">
                            {lv.status === 'pending_hr'
                              ? lv.requesterRole === 'hr'
                                ? 'รอ HR สำรองอนุมัติ'
                                : 'รอ HR อนุมัติ'
                              : lv.status === 'cancelled'
                                ? 'คำขอถูกยกเลิกแล้ว'
                                : lv.status === 'rejected'
                                  ? 'คำขอไม่ได้รับการอนุมัติ'
                                  : 'รอขั้น 1'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {lv.rejectedBy && (
                  <div className="rounded-xl bg-rose-50/80 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-900">
                    <strong className="font-semibold text-rose-950">
                      ไม่อนุมัติโดย {lv.rejectedBy.userName}:
                    </strong>{' '}
                    {lv.rejectedBy.reason}
                  </div>
                )}

                {/* Bottom Action Controls (Approve / Reject / Cancel) */}
                {((currentUser.role !== 'employee' &&
                  (approvePerm.allowed || rejectPerm.allowed)) ||
                  canCancel) && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3.5 border-t border-slate-100">
                    {currentUser.role !== 'employee' &&
                    (approvePerm.allowed || rejectPerm.allowed) ? (
                      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                          className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0066FF] focus:bg-white focus:outline-hidden min-h-[42px] transition"
                        />

                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                          {approvePerm.allowed && (
                            <button
                              type="button"
                              disabled={processingId === lv.id}
                              onClick={() => {
                                if (window.confirm('ยืนยันการอนุมัติคำขอใบลาของ ' + lv.userName + ' ใช่หรือไม่?')) {
                                  handleAction(lv.id, 'approve');
                                }
                              }}
                              className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-white disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[42px]"
                            >
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
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
                              className="w-full sm:w-auto rounded-xl border border-rose-200 bg-white hover:bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-rose-600 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px] active:scale-[0.98]"
                            >
                              <XCircle className="h-4 w-4 shrink-0" />
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
                        className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[42px]"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ดูเอกสารแนบ"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4 animate-ui-fade"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-w-2xl w-full rounded-2xl bg-white p-5 shadow-2xl border border-slate-200/80 space-y-3 animate-ui-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-sm text-slate-900 truncate">
                เอกสารแนบ / ใบรับรองแพทย์: {previewAttachment.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer shrink-0"
              >
                ปิด
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto flex justify-center bg-slate-50 rounded-xl p-2 border border-slate-200/60">
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
