import { NextRequest, NextResponse } from 'next/server';
import { createLeaveRequest, processLeaveAction } from '@/lib/hr-service';
import { authenticateRequest } from '@/lib/session';
import { GoogleSheetsUnavailableError } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    let body: Record<string, any>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'รูปแบบข้อมูลคำขอไม่ถูกต้อง' },
          { status: 400 }
        );
      }
      body = parsed as Record<string, any>;
    } catch {
      return NextResponse.json(
        { error: 'รูปแบบ JSON ไม่ถูกต้อง' },
        { status: 400 }
      );
    }
    const {
      leaveType,
      durationType,
      startDate,
      endDate,
      reason,
      locationDetail,
      attachmentUrl,
      attachmentName,
    } = body;

    const res = await createLeaveRequest(auth.user.id, {
      leaveType,
      durationType,
      startDate,
      endDate,
      reason,
      locationDetail,
      attachmentUrl,
      attachmentName,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ leave: res.leave });
  } catch (err) {
    if (err instanceof GoogleSheetsUnavailableError) {
      return NextResponse.json(
        { error: err.message, storageUnavailable: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'ไม่สามารถบันทึกใบลาได้',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    let body: Record<string, any>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'รูปแบบข้อมูลคำขอไม่ถูกต้อง' },
          { status: 400 }
        );
      }
      body = parsed as Record<string, any>;
    } catch {
      return NextResponse.json(
        { error: 'รูปแบบ JSON ไม่ถูกต้อง' },
        { status: 400 }
      );
    }
    const { leaveId, action, comment } = body;

    if (!leaveId || !action) {
      return NextResponse.json(
        { error: 'ข้อมูลคำสั่งไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await processLeaveAction(auth.user.id, leaveId, action, comment);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ leave: res.leave });
  } catch (err) {
    if (err instanceof GoogleSheetsUnavailableError) {
      return NextResponse.json(
        { error: err.message, storageUnavailable: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถดำเนินการกับใบลาได้',
      },
      { status: 500 }
    );
  }
}
