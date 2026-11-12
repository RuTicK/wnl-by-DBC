import { NextRequest, NextResponse } from 'next/server';
import { createLeaveRequest, processLeaveAction } from '@/lib/hr-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      actorId,
      leaveType,
      durationType,
      startDate,
      endDate,
      reason,
      locationDetail,
      attachmentUrl,
      attachmentName,
    } = body;

    if (!actorId) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' },
        { status: 401 }
      );
    }

    const res = await createLeaveRequest(actorId, {
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
    const body = await req.json();
    const { actorId, leaveId, action, comment } = body;

    if (!actorId || !leaveId || !action) {
      return NextResponse.json(
        { error: 'ข้อมูลคำสั่งไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await processLeaveAction(actorId, leaveId, action, comment);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ leave: res.leave });
  } catch (err) {
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
