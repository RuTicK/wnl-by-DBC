'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  Lock,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { SafeUser } from '@/lib/types';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
          }) => void;
          prompt: () => void;
        };
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

interface LoginViewProps {
  onLoginSuccess: (
    user: SafeUser,
    mode: 'google_sheets' | 'demo_local'
  ) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const envClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';

  const [googleClientId, setGoogleClientId] = useState<string>(envClientId);
  const [gsiReady, setGsiReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unregisteredEmail, setUnregisteredEmail] = useState<string | null>(
    null
  );

  // Load saved Google OAuth Client ID from backend config / env
  useEffect(() => {
    let localId = '';
    try {
      localId = localStorage.getItem('hr_google_client_id')?.trim() || '';
    } catch {
      // Ignore storage access errors
    }

    if (envClientId) {
      setGoogleClientId(envClientId);
      return;
    }

    fetch('/api/system?action=config')
      .then((res) => res.json())
      .then((data) => {
        const resolvedId =
          data.googleClientId?.trim() || localId || '';
        if (resolvedId) {
          setGoogleClientId(resolvedId);
        }
      })
      .catch(() => {
        if (localId) {
          setGoogleClientId(localId);
        }
      });
  }, [envClientId]);

  // Load Google Identity Services (accounts.google.com/gsi/client) script
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.accounts) {
      setGsiReady(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', () => setGsiReady(true));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGsiReady(true);
    script.onerror = () => {
      setError(
        'ไม่สามารถโหลดสคริปต์ Google Identity Services (accounts.google.com) ได้ กรุณาตรวจสอบอินเทอร์เน็ต'
      );
    };
    document.head.appendChild(script);
  }, []);

  const verifyWithBackend = useCallback(
    async (payload: { googleIdToken?: string; googleAccessToken?: string }) => {
      setError(null);
      setUnregisteredEmail(null);
      setLoading(true);
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isGoogleLogin: true,
            ...payload,
          }),
        });
        const data = await res.json();

        if (data.unregisteredEmail) {
          setUnregisteredEmail(data.unregisteredEmail);
          return;
        }

        if (!res.ok || !data.user) {
          setError(
            data.error || 'ไม่สามารถเข้าสู่ระบบด้วยบัญชี Google ได้ กรุณาลองใหม่'
          );
          return;
        }

        onLoginSuccess(data.user, data.storageMode);
      } catch {
        setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    },
    [onLoginSuccess]
  );

  // Initialize Google Identity Services if available
  useEffect(() => {
    if (!gsiReady || !googleClientId || !window.google?.accounts?.id) return;
    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) {
            verifyWithBackend({ googleIdToken: response.credential });
          }
        },
      });
    } catch {
      // Ignore
    }
  }, [gsiReady, googleClientId, verifyWithBackend]);

  const handleOpenGoogleOAuthPopup = () => {
    setError(null);
    if (!googleClientId.trim()) {
      setError(
        'ระบบไม่พบ Google OAuth Client ID ในไฟล์การตั้งค่า (.env.local) กรุณาติดต่อผู้ดูแลระบบ'
      );
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setError(
        'กำลังโหลดระบบ Google Identity Services กรุณารอสักครู่แล้วกดอีกครั้ง'
      );
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId.trim(),
        scope: 'openid email profile',
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            setError(
              `Google OAuth ปฏิเสธการเข้าถึง (${
                tokenResponse.error_description || tokenResponse.error
              })`
            );
            return;
          }
          if (tokenResponse.access_token) {
            verifyWithBackend({
              googleAccessToken: tokenResponse.access_token,
            });
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch {
      setError(
        'ไม่สามารถเปิดหน้าต่าง Google OAuth Popup ได้ กรุณาตรวจสอบการตั้งค่าเบราว์เซอร์'
      );
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F7F8FA] flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Subtle Ambient Background Mesh */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[760px] rounded-full bg-gradient-to-b from-blue-100/70 via-sky-50/50 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[420px] rounded-full bg-gradient-to-tl from-amber-50/60 via-transparent to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[420px] animate-ui-modal">
        {unregisteredEmail ? (
          /* =================================================================
             ACCESS DENIED / WHITELIST REQUIRED VIEW
             ================================================================= */
          <div className="rounded-3xl bg-white p-6 sm:p-9 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.12)] border border-slate-200/80 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-rose-50 border border-rose-200/70 text-rose-600">
              <ShieldAlert className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>

            <div className="space-y-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200/80 text-rose-700 px-3 py-1 text-xs font-semibold tracking-wide">
                <Lock className="h-3.5 w-3.5" />
                ไม่พบบัญชีในระบบ (Access Denied)
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                ไม่พบข้อมูลพนักงานในระบบ
              </h2>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2 text-xs sm:text-sm font-mono font-semibold text-slate-700 break-all inline-block max-w-full">
                {unregisteredEmail}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/70 p-4 text-xs sm:text-sm text-left space-y-2.5">
              <div className="font-semibold text-amber-950 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>เฉพาะพนักงานที่ได้รับอนุญาตเท่านั้น</span>
              </div>
              <p className="text-amber-900/90 leading-relaxed">
                ระบบ <strong className="font-semibold">&ldquo;วันนี้ลา by DBC&rdquo;</strong> กำหนดนโยบายความปลอดภัยแบบ Whitelist เฉพาะพนักงานที่ <strong className="font-semibold">ฝ่ายบุคคล (HR)</strong> หรือ <strong className="font-semibold">ผู้บริหาร (C-Level)</strong> ได้ลงทะเบียนไว้ในระบบแล้วเท่านั้น
              </p>
              <div className="rounded-xl bg-white/90 border border-amber-200/60 p-3 text-amber-950 text-xs font-medium leading-relaxed">
                หากคุณเป็นพนักงานของบริษัท กรุณาติดต่อ <strong className="font-semibold">ฝ่ายบุคคล (HR)</strong> หรือ <strong className="font-semibold">ผู้บริหาร (C-Level)</strong> เพื่อเพิ่มอีเมลนี้เข้าสู่ระบบพนักงาน
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setUnregisteredEmail(null);
                  setError(null);
                  handleOpenGoogleOAuthPopup();
                }}
                className="w-full rounded-xl bg-[#0066FF] hover:bg-[#0052CC] active:scale-[0.99] py-3 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
              >
                <RotateCcw className="h-4 w-4 shrink-0" />
                <span>ลองเข้าสู่ระบบด้วยบัญชี Google อื่น</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnregisteredEmail(null);
                  setError(null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 px-5 text-xs sm:text-sm font-semibold text-slate-600 transition cursor-pointer min-h-[44px]"
              >
                กลับสู่หน้าหลัก
              </button>
            </div>

            {/* PDPA Privacy Footnote & Legal Links */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  นโยบายความเป็นส่วนตัว
                </a>
                <span className="text-slate-300">•</span>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  เงื่อนไขการใช้งาน
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* =================================================================
             CLEAN PRODUCTION SINGLE LOGIN BUTTON CARD
             ================================================================= */
          <div className="rounded-3xl bg-white p-7 sm:p-10 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.12)] border border-slate-200/80 text-center space-y-7">
            {/* Branding Header */}
            <div className="flex flex-col items-center">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0A2540] to-[#0066FF] text-white shadow-lg shadow-blue-600/20 mb-4">
                <CalendarCheck2 className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                  วันนี้ลา
                </h1>
                <span className="rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 px-2.5 py-0.5 text-xs font-semibold tracking-wide">
                  by DBC
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs leading-relaxed">
                ระบบบริหารจัดการวันลาและลงเวลาเข้างานออฟฟิศ / WFH / นอกสถานที่
              </p>
            </div>

            {/* Clean Capability Pills */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Check-in รายวัน
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                ยื่นใบลา &amp; WFH
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                ปฏิทินทีม
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-700 font-medium text-left">
                <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Single Login Button */}
            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={handleOpenGoogleOAuthPopup}
                className="w-full rounded-xl bg-[#0A2540] hover:bg-[#113355] active:scale-[0.99] py-3.5 px-5 text-sm sm:text-[15px] font-semibold text-white shadow-md shadow-slate-900/10 hover:shadow-lg transition flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 min-h-[50px]"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>กำลังเข้าสู่ระบบ...</span>
                  </div>
                ) : (
                  <>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shrink-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    </span>
                    <span>เข้าสู่ระบบด้วย Google</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                ใช้อีเมลองค์กร <span className="font-mono text-slate-500">@digitalbusinessconsult.asia</span> หรือ{' '}
                <span className="font-mono text-slate-500">@dbcgroup.asia</span>
              </p>
            </div>

            {/* Legal Links (Privacy Notice & Terms of Service) */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  นโยบายความเป็นส่วนตัว
                </a>
                <span className="text-slate-300">•</span>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  เงื่อนไขการใช้งาน
                </a>
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Digital Business Consult Co., Ltd. • PDPA Verified
        </p>
      </div>
    </div>
  );
}
