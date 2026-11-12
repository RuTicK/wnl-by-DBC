import { NextRequest, NextResponse } from 'next/server';
import { recordCheckIn, recordCheckOut } from '@/lib/hr-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actorId, date, checkInTime, workLocation, note } = body;

    if (!actorId) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนลงเวลา Check-in' },
        { status: 401 }
      );
    }

    const res = await recordCheckIn(actorId, {
      date,
      checkInTime,
      workLocation: workLocation || 'office',
      note,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ record: res.record });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถบันทึกเวลา Check-in ได้',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { actorId, date, checkOutTime, note } = body;

    if (!actorId) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนลงเวลา Check-out' },
        { status: 401 }
      );
    }

    const res = await recordCheckOut(actorId, {
      date,
      checkOutTime,
      note,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ record: res.record });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถบันทึกเวลา Check-out ได้',
      },
      { status: 500 }
    );
  }
}
