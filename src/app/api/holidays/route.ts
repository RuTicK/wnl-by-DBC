import { NextRequest, NextResponse } from 'next/server';
import { deleteHoliday, upsertHoliday } from '@/lib/hr-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actorId, holiday } = body;

    if (!actorId || !holiday) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await upsertHoliday(actorId, holiday);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ holiday: res.holiday });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถบันทึกข้อมูลวันหยุดได้',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const actorId = searchParams.get('actorId') || '';
    const holidayId = searchParams.get('holidayId') || '';

    const res = await deleteHoliday(actorId, holidayId);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถลบวันหยุดได้',
      },
      { status: 500 }
    );
  }
}
