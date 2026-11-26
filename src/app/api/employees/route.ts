import { NextRequest, NextResponse } from 'next/server';
import { deleteEmployee, upsertEmployee } from '@/lib/hr-service';
import { authenticateRequest } from '@/lib/session';
import { GoogleSheetsUnavailableError } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const { employee } = body;

    if (!employee) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await upsertEmployee(auth.user.id, employee);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ user: res.user });
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
            : 'ไม่สามารถบันทึกข้อมูลพนักงานได้',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId') || '';

    const res = await deleteEmployee(auth.user.id, targetUserId);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
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
            : 'ไม่สามารถลบข้อมูลพนักงานได้',
      },
      { status: 500 }
    );
  }
}
