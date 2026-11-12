import { NextRequest, NextResponse } from 'next/server';
import { deleteEmployee, upsertEmployee } from '@/lib/hr-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actorId, employee } = body;

    if (!actorId || !employee) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await upsertEmployee(actorId, employee);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ user: res.user });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถบันทึกข้อมูลพนักงานได้',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const actorId = searchParams.get('actorId') || '';
    const targetUserId = searchParams.get('userId') || '';

    const res = await deleteEmployee(actorId, targetUserId);
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
            : 'ไม่สามารถลบข้อมูลพนักงานได้',
      },
      { status: 500 }
    );
  }
}
