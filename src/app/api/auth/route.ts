import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateUser,
  registerGoogleUser,
  updateOwnTestingProfile,
  verifyGoogleOAuthCredentials,
} from '@/lib/hr-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    // 2. กรณีผู้ใช้งานสลับ Role หรือสถานะทดลองงาน 120 วันของบัญชีตัวเองเพื่อทดสอบสิทธิ์
    if (body.action === 'update_self_role') {
      const res = await updateOwnTestingProfile(body.userId, {
        role: body.role,
        startDate: body.startDate,
        department: body.department,
        name: body.name,
      });
      if (!res.success) {
        return NextResponse.json(
          { error: res.error || 'อัปเดตบทบาทไม่สำเร็จ' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        user: res.user,
        storageMode: res.mode,
      });
    }

    // 3. กรณีล็อกอินผ่าน Google OAuth 2.0 / Google Identity Services จริง (ส่ง googleIdToken หรือ googleAccessToken มาตรวจสอบ)
    if (body.googleIdToken || body.googleAccessToken) {
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

      const authRes = await authenticateUser(
        verified.profile.email,
        undefined,
        {
          isGoogleLogin: true,
          googleEmail: verified.profile.email,
          googleEnglishName: verified.profile.englishName,
          googlePicture: verified.profile.picture,
        }
      );

      if (!authRes.success) {
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

      return NextResponse.json({
        user: authRes.user,
        googleProfile: verified.profile,
        storageMode: authRes.mode,
      });
    }

    // 4. กรณีเรียก authenticateUser โดยตรง (รองรับทั้ง Google Email Lookup & Unit Tests)
    const {
      identifier,
      password,
      isGoogleLogin,
      googleEmail,
      googleEnglishName,
    } = body;

    const result = await authenticateUser(identifier, password, {
      isGoogleLogin: Boolean(isGoogleLogin),
      googleEmail,
      googleEnglishName,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'เข้าสู่ระบบไม่สำเร็จ',
          unregisteredEmail: result.unregisteredEmail,
        },
        { status: result.unregisteredEmail ? 403 : 401 }
      );
    }

    return NextResponse.json({
      user: result.user,
      storageMode: result.mode,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ',
      },
      { status: 500 }
    );
  }
}
