import { NextRequest, NextResponse } from 'next/server';
import { deleteHoliday, upsertHoliday } from '@/lib/hr-service';
import { authenticateRequest } from '@/lib/session';
import { GoogleSheetsUnavailableError } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const { holiday } = body;

    if (!holiday) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const res = await upsertHoliday(auth.user.id, holiday);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ holiday: res.holiday });
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
            : 'ไม่สามารถบันทึกข้อมูลวันหยุดได้',
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
    const holidayId = searchParams.get('holidayId') || '';

    const res = await deleteHoliday(auth.user.id, holidayId);
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
            : 'ไม่สามารถลบวันหยุดได้',
      },
      { status: 500 }
    );
  }
}
