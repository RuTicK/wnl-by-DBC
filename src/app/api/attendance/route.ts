import { NextRequest, NextResponse } from 'next/server';
import { recordCheckIn, recordCheckOut } from '@/lib/hr-service';
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
    const { date, checkInTime, workLocation, locationName, meetLink, note } =
      body;

    const res = await recordCheckIn(auth.user.id, {
      date,
      checkInTime,
      workLocation: workLocation || 'office',
      locationName,
      meetLink,
      note,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ record: res.record });
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
            : 'ไม่สามารถบันทึกเวลา Check-in ได้',
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
    const { date, checkOutTime, note } = body;

    const res = await recordCheckOut(auth.user.id, {
      date,
      checkOutTime,
      note,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ record: res.record });
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
            : 'ไม่สามารถบันทึกเวลา Check-out ได้',
      },
      { status: 500 }
    );
  }
}
