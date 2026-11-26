import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { doesUserMatchEmail } from './leave-utils';
import {
  DatabaseState,
  getDatabaseState,
  GoogleSheetsUnavailableError,
} from './storage';
import { User } from './types';

export const SESSION_COOKIE_NAME = 'hr_dbc_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  uid: string;
  email: string;
  iat: number;
  exp: number;
  v: 1;
}

const SESSION_SECRET_FILE = path.join(process.cwd(), '.data', '.session-secret');
let cachedFallbackSecret: string | null = null;

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return 'vitest-only-deterministic-session-secret-do-not-use-in-prod';
  }

  // Deterministic derivation ONLY from high-entropy server-only secrets so stateless Vercel lambdas
  // share the same signing key even before SESSION_SECRET is explicitly provisioned.
  // NEVER derive from non-secret identifiers like GOOGLE_SHEET_ID (which appears in Sheet URLs).
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim() || '';
  const appSheetKey = process.env.APPSHEET_ACCESS_KEY?.trim() || '';

  const seedMaterial = [privateKey, appSheetKey].filter(Boolean).join('|');
  if (seedMaterial) {
    return crypto
      .createHash('sha256')
      .update(`hr-dbc-session-v1:${seedMaterial}`)
      .digest('hex');
  }

  if (cachedFallbackSecret) {
    return cachedFallbackSecret;
  }

  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) {
        cachedFallbackSecret = existing;
        return cachedFallbackSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    const dir = path.dirname(SESSION_SECRET_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSION_SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
    cachedFallbackSecret = generated;
    return cachedFallbackSecret;
  } catch {
    cachedFallbackSecret = crypto.randomBytes(32).toString('hex');
    return cachedFallbackSecret;
  }
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createSessionToken(
  user: { id: string; email: string },
  ttlSeconds: number = SESSION_TTL_SECONDS
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: user.id.trim(),
    email: user.email.trim().toLowerCase(),
    iat: nowSec,
    exp: nowSec + ttlSeconds,
    v: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = signPayload(encoded);
  const providedBuf = Buffer.from(providedSig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    ) as Partial<SessionPayload>;

    if (
      decoded.v !== 1 ||
      typeof decoded.uid !== 'string' ||
      !decoded.uid.trim() ||
      typeof decoded.email !== 'string' ||
      !decoded.email.trim() ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded.exp <= nowSec) {
      return null;
    }

    return {
      uid: decoded.uid.trim(),
      email: decoded.email.trim().toLowerCase(),
      iat: decoded.iat,
      exp: decoded.exp,
      v: 1,
    };
  } catch {
    return null;
  }
}

function isSecureCookie(req?: NextRequest): boolean {
  if (process.env.SESSION_COOKIE_SECURE === 'true') return true;
  if (process.env.SESSION_COOKIE_SECURE === 'false') return false;
  if (process.env.VERCEL === '1') return true;

  if (req) {
    const forwardedProto = req.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto === 'https') return true;
    if (forwardedProto === 'http') return false;
    if (req.url.startsWith('https://')) return true;

    if (process.env.NODE_ENV === 'production') {
      const rawHost =
        req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
      let host = rawHost.split(',')[0]?.trim() || '';
      if (!host) {
        try {
          host = new URL(req.url).host;
        } catch {
          host = '';
        }
      }
      const hostname = host.split(':')[0].trim().toLowerCase();
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return true;
      }
      return false;
    }
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(
  res: NextResponse,
  user: { id: string; email: string },
  req?: NextRequest
): string {
  const token = createSessionToken(user);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export function clearSessionCookie(res: NextResponse, req?: NextRequest): void {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    path: '/',
    maxAge: 0,
  });
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const cookieVal = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieVal) {
    return verifySessionToken(cookieVal);
  }
  // Fallback manual Cookie header parse (helpful for synthetic Request objects)
  const rawCookieHeader = req.headers.get('cookie');
  if (!rawCookieHeader) return null;
  for (const part of rawCookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      try {
        return verifySessionToken(decodeURIComponent(value));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export type AuthenticateRequestResult =
  | {
      ok: true;
      user: User;
      session: SessionPayload;
      mode: 'google_sheets' | 'demo_local';
      state: DatabaseState;
      syncError?: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * ตรวจสอบ Signed HttpOnly Session Cookie และดึงข้อมูลผู้ใช้งานปัจจุบันจากฐานข้อมูล
 * (ไม่เชื่อ actorId / userId จากฝั่ง client เด็ดขาด)
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthenticateRequestResult> {
  const session = getSessionFromRequest(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ (ไม่พบเซสชันที่ถูกต้อง)',
          sessionExpired: true,
          currentUser: null,
        },
        { status: 401 }
      ),
    };
  }

  try {
    const { state, mode, syncError } = await getDatabaseState();
    const user = state.users.find((u) => u.id === session.uid);

    if (!user || !doesUserMatchEmail(user, session.email)) {
      const res = NextResponse.json(
        {
          error: 'ไม่พบข้อมูลผู้ใช้งานในระบบหรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
          sessionExpired: true,
          currentUser: null,
        },
        { status: 401 }
      );
      clearSessionCookie(res, req);
      return { ok: false, response: res };
    }

    return { ok: true, user, session, mode, state, syncError };
  } catch (err) {
    if (err instanceof GoogleSheetsUnavailableError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: err.message, storageUnavailable: true },
          { status: 503 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้',
        },
        { status: 500 }
      ),
    };
  }
}
