import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUser,
  verifyGoogleOAuthCredentials,
} from '@/lib/hr-service';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';
import { GoogleSheetsUnavailableError } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, any>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'รูปแบบข้อมูลคำขอไม่ถูกต้อง' },
          { status: 400 }
        );
      }
      body = parsed;
    } catch {
      return NextResponse.json(
        { error: 'รูปแบบ JSON ไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // 0. ออกจากระบบ (ล้าง HttpOnly Session Cookie)
    if (body.action === 'logout') {
      const res = NextResponse.json({ success: true });
      clearSessionCookie(res, req);
      return res;
    }

    // 1. นโยบาย Whitelist: การเพิ่มพนักงานใหม่ต้องทำผ่าน HR หรือ C-Level เท่านั้น (ไม่อนุญาตให้บุคคลภายนอก Self-Onboard เอง)
    if (body.action === 'onboard_google_user') {
      return NextResponse.json(
        {
          error:
            'การเพิ่มพนักงานใหม่ต้องดำเนินการโดยฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level) ผ่านหน้าจัดการพนักงานเท่านั้น',
        },
        { status: 403 }
      );
    }

    // 2. ปิดคำสั่งเปลี่ยนสิทธิ์ตัวเอง (Privilege Escalation Prevention)
    if (body.action === 'update_self_role') {
      return NextResponse.json(
        {
          error:
            'ไม่อนุญาตให้เปลี่ยนสิทธิ์หรือบทบาทด้วยตนเอง กรุณาติดต่อฝ่ายบุคคล (HR) หรือผู้ดูแลระบบ (Admin)',
        },
        { status: 403 }
      );
    }

    // 3. บังคับตรวจสอบ Google OAuth Token จริงเท่านั้น (ไม่อนุญาตให้ส่งอีเมลเปล่าหรือรหัสผ่าน 1234/GOOGLE_SSO)
    if (!body.googleIdToken && !body.googleAccessToken) {
      return NextResponse.json(
        {
          error:
            'กรุณาเข้าสู่ระบบผ่านบัญชี Google (Google Sign-In) ที่ยืนยันตัวตนแล้วเท่านั้น',
        },
        { status: 401 }
      );
    }

    const verified = await verifyGoogleOAuthCredentials({
      googleIdToken: body.googleIdToken,
      googleAccessToken: body.googleAccessToken,
    });

    if (!verified.success || !verified.profile) {
      return NextResponse.json(
        {
          error:
            verified.error ||
            'ไม่สามารถยืนยันตัวตนกับ Google OAuth ได้ กรุณาลองใหม่อีกครั้ง',
        },
        { status: 401 }
      );
    }

    const authRes = await authenticateUser(verified.profile.email, undefined, {
      isGoogleLogin: true,
      googleEmail: verified.profile.email,
      googleEnglishName: verified.profile.englishName,
      googlePicture: verified.profile.picture,
    });

    if (!authRes.success || !authRes.user) {
      return NextResponse.json(
        {
          error:
            authRes.error ||
            'ไม่พบบัญชีอีเมลนี้ในระบบพนักงาน กรุณาติดต่อฝ่ายบุคคล (HR) หรือผู้บริหาร (C-Level)',
          unregisteredEmail:
            authRes.unregisteredEmail || verified.profile.email,
        },
        { status: 403 }
      );
    }

    const res = NextResponse.json({
      user: authRes.user,
      googleProfile: verified.profile,
      storageMode: authRes.mode,
    });
    setSessionCookie(res, authRes.user, req);
    return res;
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
          err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res, req);
  return res;
}
