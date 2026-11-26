import { NextRequest, NextResponse } from 'next/server';
import {
  doesUserMatchEmail,
  getSystemDataForUser,
  resetDemoData,
  UserNotFoundError,
} from '@/lib/hr-service';
import {
  authenticateRequest,
  getSessionFromRequest,
} from '@/lib/session';
import {
  getDatabaseState,
  getEffectiveAppSheetConfig,
  getEffectiveGoogleChatWebhookUrl,
  getEffectiveGoogleChatWebhookUrl2,
  getEffectiveGoogleClientId,
  getStorageMode,
  GoogleSheetsUnavailableError,
  isValidGoogleChatWebhookUrl,
  saveRuntimeAppConfig,
} from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'config') {
      // Public config only: NEVER expose secrets, private keys, Sheet IDs, or Google Chat webhook URLs!
      const publicPayload: Record<string, unknown> = {
        googleClientId: getEffectiveGoogleClientId(),
        storageMode: getStorageMode(),
      };

      // If caller holds a valid admin session, include non-secret boolean status flags
      const session = getSessionFromRequest(req);
      if (session) {
        try {
          const { state } = await getDatabaseState();
          const viewer = state.users.find((u) => u.id === session.uid);
          if (
            viewer?.role === 'admin' &&
            doesUserMatchEmail(viewer, session.email)
          ) {
            const appSheet = getEffectiveAppSheetConfig();
            publicPayload.appsheetConfigured = appSheet.configured;
            publicPayload.googleChatConfigured = Boolean(
              getEffectiveGoogleChatWebhookUrl()
            );
            publicPayload.googleChat2Configured = Boolean(
              getEffectiveGoogleChatWebhookUrl2()
            );
          }
        } catch {
          // Non-fatal for config endpoint
        }
      }

      return NextResponse.json(publicPayload);
    }

    // Require verified HttpOnly session cookie — NEVER trust ?userId= from client!
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const yearParam = searchParams.get('year');
    const parsedYear = yearParam ? Number(yearParam) : new Date().getFullYear();
    const year =
      Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
        ? parsedYear
        : new Date().getFullYear();

    const payload = await getSystemDataForUser(auth.user.id, year, {
      state: auth.state,
      mode: auth.mode,
      syncError: auth.syncError,
    });
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof GoogleSheetsUnavailableError) {
      return NextResponse.json(
        { error: err.message, storageUnavailable: true },
        { status: 503 }
      );
    }

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
    // Require authenticated Admin session for all system administration actions
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    if (auth.user.role !== 'admin') {
      return NextResponse.json(
        {
          error:
            'เฉพาะผู้ดูแลระบบสูงสุด (Admin) เท่านั้นที่สามารถเปลี่ยนแปลงการตั้งค่าระบบหรือรีเซ็ตข้อมูลได้',
        },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'รูปแบบข้อมูลคำขอไม่ถูกต้อง' },
          { status: 400 }
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'รูปแบบ JSON ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    if (body.action === 'reset_demo') {
      const preserveUserId =
        typeof body.preserveUserId === 'string'
          ? body.preserveUserId
          : undefined;
      const res = await resetDemoData(preserveUserId);
      if (!res.success) {
        return NextResponse.json(
          { error: res.error || 'ไม่สามารถรีเซ็ตข้อมูลเดโมได้' },
          { status: 400 }
        );
      }
      return NextResponse.json(res);
    }

    if (body.action === 'save_config') {
      const validateChatWebhook = (rawVal: unknown): boolean => {
        if (typeof rawVal !== 'string') return false;
        const candidateWebhook = rawVal.trim();
        if (!candidateWebhook) return true;
        return isValidGoogleChatWebhookUrl(candidateWebhook);
      };

      if (
        (body.googleChatWebhookUrl !== undefined &&
          !validateChatWebhook(body.googleChatWebhookUrl)) ||
        (body.googleChatWebhookUrl2 !== undefined &&
          !validateChatWebhook(body.googleChatWebhookUrl2))
      ) {
        return NextResponse.json(
          {
            error:
              'URL ของ Google Chat Webhook ต้องเป็น https://chat.googleapis.com/... เท่านั้น',
          },
          { status: 400 }
        );
      }

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
        ...(body.googleChatWebhookUrl !== undefined
          ? { googleChatWebhookUrl: String(body.googleChatWebhookUrl).trim() }
          : {}),
        ...(body.googleChatWebhookUrl2 !== undefined
          ? { googleChatWebhookUrl2: String(body.googleChatWebhookUrl2).trim() }
          : {}),
      });
      const appSheet = getEffectiveAppSheetConfig();
      return NextResponse.json({
        success: true,
        googleClientId: getEffectiveGoogleClientId(),
        appsheetConfigured: appSheet.configured,
        googleChatConfigured: Boolean(getEffectiveGoogleChatWebhookUrl()),
        googleChat2Configured: Boolean(getEffectiveGoogleChatWebhookUrl2()),
        storageMode: getStorageMode(),
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
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
          err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในระบบ',
      },
      { status: 500 }
    );
  }
}
