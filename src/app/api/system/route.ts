import { NextRequest, NextResponse } from 'next/server';
import {
  getSystemDataForUser,
  resetDemoData,
  UserNotFoundError,
} from '@/lib/hr-service';
import {
  getEffectiveAppSheetConfig,
  getEffectiveGoogleClientId,
  getStorageMode,
  saveRuntimeAppConfig,
} from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'config') {
      const appSheet = getEffectiveAppSheetConfig();
      return NextResponse.json({
        googleClientId: getEffectiveGoogleClientId(),
        appsheetAppId: appSheet.appId,
        appsheetConfigured: appSheet.configured,
        storageMode: getStorageMode(),
        googleSheetId:
          process.env.GOOGLE_SHEET_ID?.trim() ||
          '1cm3fCZR8eblrugsYA_Ncdn7M-IfQeysGcyl9-vNsb4c',
      });
    }

    const userId = searchParams.get('userId') || '';
    const yearParam = searchParams.get('year');
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();

    if (!userId) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสผู้ใช้งาน (userId)' },
        { status: 400 }
      );
    }

    const payload = await getSystemDataForUser(userId, year);
    return NextResponse.json(payload);
  } catch (err) {
    if (
      err instanceof UserNotFoundError ||
      (err instanceof Error && err.message.includes('ไม่พบข้อมูลผู้ใช้งาน'))
    ) {
      return NextResponse.json(
        {
          error: err.message,
          sessionExpired: true,
          currentUser: null,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถดึงข้อมูลระบบได้',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'reset_demo') {
      const res = await resetDemoData(body.preserveUserId);
      return NextResponse.json(res);
    }
    if (body.action === 'save_config') {
      saveRuntimeAppConfig({
        ...(body.googleClientId !== undefined
          ? { googleClientId: String(body.googleClientId).trim() }
          : {}),
        ...(body.appsheetAppId !== undefined
          ? { appsheetAppId: String(body.appsheetAppId).trim() }
          : {}),
        ...(body.appsheetAccessKey !== undefined
          ? { appsheetAccessKey: String(body.appsheetAccessKey).trim() }
          : {}),
        ...(body.googleSheetId !== undefined
          ? { googleSheetId: String(body.googleSheetId).trim() }
          : {}),
        ...(body.googleServiceAccountEmail !== undefined
          ? {
              googleServiceAccountEmail: String(
                body.googleServiceAccountEmail
              ).trim(),
            }
          : {}),
        ...(body.googlePrivateKey !== undefined
          ? { googlePrivateKey: String(body.googlePrivateKey).trim() }
          : {}),
      });
      const appSheet = getEffectiveAppSheetConfig();
      return NextResponse.json({
        success: true,
        googleClientId: getEffectiveGoogleClientId(),
        appsheetAppId: appSheet.appId,
        appsheetConfigured: appSheet.configured,
        storageMode: getStorageMode(),
      });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในระบบ',
      },
      { status: 500 }
    );
  }
}
