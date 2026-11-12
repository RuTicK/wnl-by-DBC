import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Database,
  Mail,
  Building2,
  FileText,
  CheckCircle2,
  Scale,
  Clock,
  ExternalLink,
  ShieldAlert,
  Trash2,
  UserCheck,
  Server,
  Share2,
  Globe,
  EyeOff,
  Download,
  Info,
} from 'lucide-react';

export const metadata = {
  title: 'นโยบายความเป็นส่วนตัว (Privacy Policy) | วันนี้ลา by DBC',
  description:
    'นโยบายความเป็นส่วนตัวและการคุ้มครองข้อมูลส่วนบุคคลของระบบ วันนี้ลา by DBC ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) และ Google API Services User Data Policy',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่หน้าหลัก</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline transition-colors"
            >
              ข้อกำหนดการใช้งาน (Terms)
            </Link>
          </div>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 via-sky-50/40 to-transparent rounded-bl-full pointer-events-none -mr-16 -mt-16" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-bold mb-4">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>PDPA &amp; Google API Services User Data Policy Compliant</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  นโยบายความเป็นส่วนตัว
                </h1>
                <p className="text-sm sm:text-base font-semibold text-blue-600 mt-1">
                  Privacy Policy • วันนี้ลา by DBC (Wan-Nee-La by DBC)
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบบริหารจัดการวันลาและเวลาปฏิบัติงานออนไลน์ (HR Leave &amp; Attendance Management System)
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-600 sm:text-right shrink-0 space-y-1">
                <div className="font-bold text-slate-800">ผู้ควบคุมข้อมูลส่วนบุคคล (Data Controller)</div>
                <div className="text-slate-700 font-medium">Digital Business Consult Co., Ltd. (DBC)</div>
                <div className="text-slate-500 font-mono text-xs">ปรับปรุงล่าสุด: 10 พฤศจิกายน 2569 (v1.1)</div>
              </div>
            </div>

            {/* Quick Summary Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6">
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100/80">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs mb-1">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>เฉพาะการใช้งานภายใน</span>
                </div>
                <p className="text-xs text-blue-950/80 leading-relaxed">
                  ใช้สำหรับบุคลากรของบริษัท DBC เท่านั้น เข้าสู่ระบบผ่าน Google Workspace Whitelist ที่ได้รับอนุมัติ
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100/80">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs mb-1">
                  <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Non-Sensitive Scopes</span>
                </div>
                <p className="text-xs text-emerald-950/80 leading-relaxed">
                  ขอสิทธิ์เข้าถึงเฉพาะข้อมูลพื้นฐาน ได้แก่ openid, email, profile ไม่มีสิทธิ์เข้าถึง Gmail หรือ Drive
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100/80">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs mb-1">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>ไม่จำหน่ายข้อมูล 100%</span>
                </div>
                <p className="text-xs text-amber-950/80 leading-relaxed">
                  ปฏิบัติตาม Limited Use ไม่ขาย ไม่โฆษณา ไม่ถ่ายโอน และไม่นำไปเทรน AI Models ทั่วไปเด็ดขาด
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================
            GOOGLE OAUTH VERIFICATION OFFICIAL DISCLOSURE (ENGLISH SUMMARY)
            For Google Cloud Trust & Safety Review Team & International Audits
            ================================================================= */}
        <div className="bg-gradient-to-br from-[#07192C] via-[#0A2540] to-[#0B192C] text-white rounded-3xl p-6 sm:p-8 shadow-md border border-blue-800/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-700/40 pb-4">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  Google Cloud OAuth 2.0 Verification Disclosure (English)
                </h2>
                <p className="text-xs text-blue-200">
                  Official disclosure for Google Trust &amp; Safety Reviewers &amp; International Compliance
                </p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Limited Use Compliant
            </span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-blue-100 leading-relaxed">
            <p>
              <strong>Application Name:</strong> วันนี้ลา by DBC (Wan-Nee-La by DBC)
            </p>
            <p>
              <strong>Data Controller / Organization:</strong> Digital Business Consult Co., Ltd. (DBC)
            </p>
            <p>
              <strong>Admin / Developer Contact:</strong>{' '}
              <a
                href="mailto:rut.wa@digitalbusinessconsult.asia"
                className="text-amber-300 hover:text-amber-200 underline font-mono font-bold"
              >
                rut.wa@digitalbusinessconsult.asia
              </a>
            </p>
            <p>
              <strong>Requested Google OAuth Scopes:</strong>{' '}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-200 font-mono text-xs">openid</code>,{' '}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-200 font-mono text-xs">email</code>,{' '}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-200 font-mono text-xs">profile</code>{' '}
              (All classified as Non-sensitive scopes).
            </p>
            <p>
              <strong>Scope Justification &amp; Purpose:</strong> Google OAuth 2.0 is used strictly for internal employee identity authentication. We retrieve the user&apos;s verified Google email to match against our pre-approved internal employee whitelist, and display the user&apos;s name and profile image inside the attendance and leave management interface.
            </p>
            <div className="rounded-2xl bg-[#07192C]/90 border border-blue-500/30 p-4 text-xs space-y-2">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Google API Services User Data Policy Limited Use Statement:</span>
              </div>
              <p className="italic text-slate-200">
                &ldquo;Wan-Nee-La by DBC (วันนี้ลา by DBC)&apos;s use and transfer to any other app of information received from Google APIs will adhere to{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 underline font-semibold inline-flex items-center gap-0.5"
                >
                  Google API Services User Data Policy
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
                , including the Limited Use requirements.&rdquo;
              </p>
            </div>
            <p className="text-xs text-blue-200">
              <strong>User Data Deletion Callback / Revocation:</strong> Users can request complete deletion of their account data by emailing{' '}
              <a
                href="mailto:rut.wa@digitalbusinessconsult.asia?subject=Data%20Deletion%20Request"
                className="text-amber-300 underline font-mono"
              >
                rut.wa@digitalbusinessconsult.asia
              </a>{' '}
              or instantly revoke access at any time via{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300 underline inline-flex items-center gap-0.5"
              >
                Google Account Permissions
                <ExternalLink className="w-3 h-3 inline" />
              </a>
              .
            </p>
          </div>
        </div>

        {/* Content Document */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-10 space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Section 1: Data Controller */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span>1. ข้อมูลเกี่ยวกับผู้ควบคุมข้อมูลส่วนบุคคล (Data Controller)</span>
            </h2>
            <p className="text-slate-600">
              นโยบายความเป็นส่วนตัวฉบับนี้ จัดทำขึ้นโดย <strong>บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. หรือ &quot;DBC&quot;)</strong> เพื่อชี้แจงแนวทางการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของผู้ใช้งานระบบ <strong>&quot;วันนี้ลา by DBC&quot; (Wan-Nee-La by DBC)</strong> ซึ่งเป็นระบบสารสนเทศเพื่อการบริหารงานบุคคล การลงเวลาทำงาน และการขออนุมัติวันลาภายในองค์กร ให้สอดคล้องกับพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) และนโยบายข้อมูลผู้ใช้บริการ API ของ Google (Google API Services User Data Policy)
            </p>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs text-slate-700">
              <p><strong>ชื่อองค์กรผู้ควบคุมข้อมูล:</strong> บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. / DBC)</p>
              <p><strong>ผู้ดูแลระบบและเจ้าหน้าที่คุ้มครองข้อมูล (Admin / DPO Contact):</strong> rut.wa@digitalbusinessconsult.asia</p>
              <p><strong>ชื่อระบบแอปพลิเคชัน:</strong> วันนี้ลา by DBC (Wan-Nee-La by DBC)</p>
              <p><strong>ขอบเขตการใช้งาน:</strong> ใช้งานเป็นการภายในองค์กร สำหรับพนักงานและผู้ได้รับอนุญาตเท่านั้น (Internal Enterprise Only)</p>
            </div>
          </section>

          {/* Section 2: Data Collection & Minimization */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Database className="w-5 h-5 text-blue-600 shrink-0" />
              <span>2. ข้อมูลส่วนบุคคลที่เราจัดเก็บและสิทธิ์ Google OAuth (Data Collection &amp; Scopes)</span>
            </h2>
            <p className="text-slate-600">
              ระบบยึดมั่นตามหลักการจำกัดการจัดเก็บข้อมูลเท่าที่จำเป็นอย่างเคร่งครัด (Data Minimization) เพื่อวัตถุประสงค์ในการบริหารงานบุคคลและบันทึกเวลาทำงานเท่านั้น:
            </p>

            <div className="space-y-3 pt-1">
              <h3 className="font-bold text-slate-900 text-sm">2.1 ข้อมูลจาก Google Identity Services (Google OAuth 2.0)</h3>
              <p className="text-slate-600">
                เมื่อท่านลงชื่อเข้าใช้งานด้วยบัญชี Google Workspace ขององค์กร ระบบจะขอสิทธิ์เข้าถึงเฉพาะข้อมูลในระดับ <strong>Non-Sensitive Scopes</strong> เท่านั้น:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">openid</span>
                    <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Non-sensitive</span>
                  </div>
                  <p className="font-bold text-slate-900 text-xs">ยืนยันตัวตนผ่าน OpenID</p>
                  <p className="text-xs text-slate-600 leading-normal">
                    ใช้รหัสประจำตัวทางเทคนิคเพื่อยืนยันตัวตนผู้ใช้งานอย่างปลอดภัยตามมาตรฐานความปลอดภัยสากล
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">email</span>
                    <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Non-sensitive</span>
                  </div>
                  <p className="font-bold text-slate-900 text-xs">ที่อยู่อีเมล Google</p>
                  <p className="text-xs text-slate-600 leading-normal">
                    ใช้เปรียบเทียบกับบัญชีรายชื่อพนักงานที่ได้รับอนุญาต (Whitelist) เพื่ออนุมัติสิทธิ์การเข้าใช้งานระบบ
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">profile</span>
                    <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Non-sensitive</span>
                  </div>
                  <p className="font-bold text-slate-900 text-xs">ชื่อและรูปภาพโปรไฟล์</p>
                  <p className="text-xs text-slate-600 leading-normal">
                    ใช้แสดงชื่อ-นามสกุลและรูปโปรไฟล์บนหน้าเว็บ เพื่อให้เพื่อนร่วมงานและหัวหน้างานระบุตัวบุคคลได้อย่างถูกต้อง
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>การไม่ขอสิทธิ์ Sensitive หรือ Restricted Scopes</span>
                </div>
                <p>
                  ระบบ <strong>ไม่มีการขอสิทธิ์</strong> เข้าถึงกล่องจดหมาย (Gmail), ไฟล์ใน Google Drive ส่วนตัว, ข้อมูลปฏิทินส่วนบุคคลภายนอก, หรือข้อมูลอ่อนไหวอื่นใดของ Google Account ทั้งสิ้น
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="font-bold text-slate-900 text-sm">2.2 ข้อมูลการปฏิบัติงานและประวัติในระบบ (HR Operational Data)</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li><strong>ชื่อ-นามสกุล และข้อมูลโปรไฟล์:</strong> รหัสพนักงาน (EmployeeID), ชื่อภาษาไทย, ชื่อภาษาอังกฤษ (จาก Google Profile), แผนก/ฝ่าย, บทบาทหน้าที่ (Employee, Manager, HR, C-Level) และวันเริ่มงาน (เพื่อคำนวณระยะทดลองงาน 119 วัน)</li>
                <li><strong>ที่อยู่อีเมล Google:</strong> เพื่อการสื่อสารและการยืนยันสิทธิ์ในระบบ</li>
                <li><strong>รูปโปรไฟล์จาก Google OAuth:</strong> เพื่อใช้แสดงตัวตนในระบบและปฏิทิน</li>
                <li><strong>ประวัติการลงเวลา Check-in (Attendance Logs):</strong> วันที่และเวลาลงเวลาเข้า-ออกงาน (Check-in / Check-out timestamps), ประเภทสถานที่ปฏิบัติงาน (Office, Remote / WFH, Offsite) และบันทึกหมายเหตุการทำงาน</li>
                <li><strong>ข้อมูลคำขอลา (Leave Requests):</strong> ประเภทการลาตามโครงสร้างระบบ 6 รูปแบบ ได้แก่:
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1.5 mb-1 text-xs">
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">1. ลาป่วย (sick)</span>
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">2. ลากิจ (personal)</span>
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">3. ลาพักร้อน (vacation)</span>
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">4. WFH (ทำงานที่บ้าน)</span>
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">5. WFA (ทำงานนอกสถานที่)</span>
                    <span className="bg-slate-100 px-2 py-1 rounded font-medium text-slate-800">6. นอกสถานที่ (offsite)</span>
                  </div>
                  รวมถึงช่วงวันที่และเวลาที่ลา, เหตุผลการลา, ลิงก์แนบเอกสาร (ถ้ามี) และสถานะการพิจารณาอนุมัติ
                </li>
              </ul>

              {/* Data Minimization Explicit Exclusions */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>หลักความจำเป็นและรายการข้อมูลที่ &quot;ไม่มีการจัดเก็บ&quot; (Explicit Non-Collection Policy):</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  เพื่อคุ้มครองความเป็นส่วนตัวสูงสุดตามหลัก Data Minimization ระบบ <strong>ไม่มีการจัดเก็บ</strong>:
                  (1) หมายเลขโทรศัพท์ส่วนบุคคล (2) เลขบัตรประจำตัวประชาชน (3) ที่อยู่พักอาศัยส่วนบุคคล (4) ข้อมูลทางการเงินหรือบัญชีธนาคาร และ (5) รหัสผ่านบัญชีผู้ใช้ (เนื่องจากยืนยันตัวตนผ่าน Google OAuth Token 100%)
                </p>
              </div>

              {/* Role-Based Redaction Feature Disclosure */}
              <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-4 text-xs text-blue-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <EyeOff className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>มาตรการปกป้องข้อมูลส่วนบุคคลและการซ่อนเหตุผลการลาสำหรับเพื่อนร่วมงาน (PDPA Data Redaction):</span>
                </div>
                <p className="text-blue-900/90 leading-relaxed">
                  ระบบมีกลไกทางเทคนิคในการคุ้มครองข้อมูลสุขภาพและข้อมูลส่วนบุคคล โดยกรณีที่พนักงานทั่วไป (Employee) ดูข้อมูลการลาของเพื่อนร่วมงานในแผนกเดียวกัน ระบบจะทำการ <strong>ซ่อนเหตุผลการลา</strong> โดยแสดงผลเป็น <em>&quot;เหตุผลส่วนตัว (ซ่อนข้อมูล)&quot;</em> และ <strong>ซ่อนไฟล์แนบ</strong> ทั้งหมดโดยอัตโนมัติ เพื่อให้ผู้บังคับบัญชาสายตรง (Manager, HR, C-Level) เท่านั้นที่สามารถตรวจสอบรายละเอียดเพื่อการอนุมัติตามหน้าที่ได้
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Purpose of Processing */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span>3. วัตถุประสงค์ในการประมวลผลข้อมูล (Purposes of Processing)</span>
            </h2>
            <p className="text-slate-600">
              เราประมวลผลข้อมูลส่วนบุคคลของท่านภายใต้ฐานความจำเป็นตามสัญญาการจ้างงาน ระเบียบการทำงาน และประโยชน์โดยชอบด้วยกฎหมายของบริษัท เพื่อวัตถุประสงค์ดังต่อไปนี้:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
                <div className="font-bold text-slate-900">1. การยืนยันตัวตนและการเข้าถึง (Authentication)</div>
                <p className="text-slate-600">เพื่อตรวจสอบสิทธิ์การเข้าถึงระบบเฉพาะพนักงานที่มีรายชื่อใน Whitelist ของบริษัทเท่านั้น</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
                <div className="font-bold text-slate-900">2. การบันทึกเวลาปฏิบัติงาน (Attendance Tracking)</div>
                <p className="text-slate-600">เพื่อบันทึกเวลาเข้างานและแสดงสถานะปัจจุบันในออฟฟิศ เพื่อการประสานงานภายในทีม</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
                <div className="font-bold text-slate-900">3. การคำนวณและบริหารโควต้าวันลา (Quota Management)</div>
                <p className="text-slate-600">เพื่อคำนวณสิทธิ์วันลาคงเหลือตามอายุงาน กฎหมายคุ้มครองแรงงาน และระเบียบบริษัท</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-1">
                <div className="font-bold text-slate-900">4. กระบวนการอนุมัติคำขอลา (Approval Workflow)</div>
                <p className="text-slate-600">เพื่อให้ผู้บังคับบัญชาและฝ่ายบุคคลพิจารณาอนุมัติคำขอลาตามสายการบังคับบัญชา 2 ระดับ</p>
              </div>
            </div>
          </section>

          {/* Section 4: Limited Use & Google API Compliance */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Scale className="w-5 h-5 text-blue-600 shrink-0" />
              <span>4. การปฏิบัติตามนโยบาย Google API Services User Data Policy (Limited Use)</span>
            </h2>
            <p className="text-slate-600">
              การเข้าถึง การจัดเก็บ และการใช้งานข้อมูลที่ได้รับจาก Google APIs ของแอปพลิเคชัน &quot;วันนี้ลา by DBC&quot; เป็นไปตาม{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline font-semibold inline-flex items-center gap-1"
              >
                Google API Services User Data Policy
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              รวมถึงข้อกำหนด Limited Use Requirements อย่างเคร่งครัด ดังนี้:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>ไม่มีการจำหน่ายหรือแลกเปลี่ยนข้อมูล (No Data Selling):</strong> เราจะไม่นำข้อมูลส่วนบุคคลหรือข้อมูล Google User Data ไปขาย โอน หรือแจกจ่ายแก่บุคคลภายนอก นายหน้าขายข้อมูล (Data Brokers) หรือบุคคลอื่นใดโดยเด็ดขาด</li>
              <li><strong>ไม่มีการใช้เพื่อการโฆษณา (No Advertising):</strong> ข้อมูลจะไม่ถูกนำไปใช้ในการยิงโฆษณา (Targeted Ads), การตลาด หรือการสร้างโปรไฟล์ผู้บริโภค</li>
              <li><strong>ไม่มีการนำไปเทรน AI Models (No AI Training):</strong> ข้อมูลส่วนบุคคลของผู้ใช้งานจะไม่ถูกส่งต่อไปเทรนโมเดลปัญญาประดิษฐ์ (AI/ML Models) ทั่วไปโดยไม่ได้รับความยินยอมเป็นลายลักษณ์อักษร</li>
              <li><strong>การส่งต่อข้อมูลเฉพาะที่จำเป็นตามกฎหมาย:</strong> ไม่มีการส่งต่อข้อมูลผู้ใช้ไปยังบุคคลภายนอก เว้นแต่เป็นการปฏิบัติตามคำสั่งศาลหรือกฎหมายที่มีผลผูกพัน</li>
            </ul>
          </section>

          {/* Section 5: Security & Storage */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Server className="w-5 h-5 text-blue-600 shrink-0" />
              <span>5. การจัดเก็บ ความปลอดภัย และระยะเวลาเก็บรักษาข้อมูล (Storage &amp; Retention)</span>
            </h2>
            <div className="space-y-2 text-slate-600">
              <p>
                <strong>โครงสร้างการจัดเก็บข้อมูล:</strong> ข้อมูลของระบบถูกจัดเก็บบน Google Cloud Platform และ Google Workspace Sheets ภายใต้โดเมนองค์กรของ Digital Business Consult ซึ่งมีการกำหนดสิทธิ์การเข้าถึงอย่างเคร่งครัด (Role-Based Access Control)
              </p>
              <p>
                <strong>มาตรการความปลอดภัยทางเทคนิค:</strong> ข้อมูลทั้งหมดที่ส่งผ่านเครือข่ายได้รับการเข้ารหัสด้วยโพรโทคอล HTTPS/TLS 1.3 และระบบยืนยันตัวตนด้วย Google OAuth 2.0 Token Verification เพื่อป้องกันการเข้าถึงโดยไม่ได้รับอนุญาต
              </p>
              <p>
                <strong>ระยะเวลาการจัดเก็บข้อมูล (Data Retention):</strong> ระบบจะจัดเก็บข้อมูลของท่านตลอดระยะเวลาที่ท่านมีสถานะเป็นบุคลากรของบริษัท และจะจัดเก็บต่อเนื่องตามกรอบระยะเวลาที่กฎหมายคุ้มครองแรงงานและกฎหมายภาษีอากรกำหนด (โดยทั่วไป 2-5 ปี) หลังจากนั้นข้อมูลจะถูกลบหรือทำลายอย่างปลอดภัย
              </p>
            </div>
          </section>

          {/* Section 6: Data Subject Rights Under PDPA */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span>6. สิทธิของเจ้าของข้อมูลส่วนบุคคลตาม PDPA (Data Subject Rights)</span>
            </h2>
            <p className="text-slate-600">
              ท่านมีสิทธิ์ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) อย่างครบถ้วน ดังต่อไปนี้:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  1. สิทธิขอเข้าถึงและรับสำเนาข้อมูล (Right of Access)
                </span>
                <p className="text-slate-600">ตรวจสอบประวัติการลงเวลาและใบลาของตนเองในระบบ หรือขอรับสำเนาข้อมูลส่วนบุคคลที่เกี่ยวกับตนได้</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  2. สิทธิขอแก้ไขข้อมูลให้ถูกต้อง (Right to Rectification)
                </span>
                <p className="text-slate-600">ขอให้ฝ่ายบุคคลแก้ไขข้อมูลโปรไฟล์ แผนก ตำแหน่ง หรือคำนวณโควต้าให้ตรงตามความจริงและเป็นปัจจุบัน</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  3. สิทธิขอลบหรือทำลายข้อมูล (Right to Erasure / Deletion)
                </span>
                <p className="text-slate-600">ขอลบ ทำลาย หรือทำให้เป็นข้อมูลนิรนามเมื่อพ้นความจำเป็นตามสัญญาจ้างงานหรือกรอบเวลากฎหมายแรงงาน</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  4. สิทธิขอถ่ายโอนข้อมูลส่วนบุคคล (Right to Data Portability)
                </span>
                <p className="text-slate-600">ขอรับข้อมูลส่วนบุคคลของตนเองในรูปแบบที่สามารถอ่านหรือใช้งานได้โดยทั่วไปด้วยเครื่องมือหรืออุปกรณ์อัตโนมัติ (เช่น รูปแบบ CSV/JSON/Spreadsheet)</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  5. สิทธิคัดค้านการประมวลผล (Right to Object)
                </span>
                <p className="text-slate-600">คัดค้านการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลในกรณีที่เป็นไปตามหลักเกณฑ์ที่กฎหมาย PDPA กำหนด</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  6. สิทธิขอให้ระงับการใช้ข้อมูล (Right to Restriction)
                </span>
                <p className="text-slate-600">ขอให้ระงับการใช้ข้อมูลส่วนบุคคลชั่วคราวในระหว่างการตรวจสอบความถูกต้องหรือการดำเนินการตามสิทธิ</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  7. สิทธิเพิกถอนความยินยอม (Right to Withdraw Consent)
                </span>
                <p className="text-slate-600">เพิกถอนความยินยอมในการเชื่อมต่อบัญชี Google Account ได้ทุกเมื่อผ่านหน้าความปลอดภัยของ Google</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  8. สิทธิในการร้องเรียน (Right to Lodge a Complaint)
                </span>
                <p className="text-slate-600">ยื่นข้อร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส. / PDPC) หากพบการปฏิบัติที่ไม่เป็นไปตามกฎหมาย</p>
              </div>
            </div>
          </section>

          {/* Section 7: User Data Deletion Instructions */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Trash2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span>7. การขอลบข้อมูลผู้ใช้งานและการยกเลิกการเชื่อมต่อ (User Data Deletion &amp; Revocation)</span>
            </h2>
            <div className="space-y-2 text-slate-600">
              <p>
                <strong>วิธีการขอลบข้อมูลผู้ใช้ (User Data Deletion Request Callback &amp; Instructions):</strong> หากท่านประสงค์จะขอลบข้อมูลบัญชี ข้อมูลการลงเวลา หรือข้อมูลส่วนบุคคลใดๆ ออกจากระบบอย่างถาวร กรุณาส่งอีเมลคำขอมายังผู้ดูแลระบบที่{' '}
                <a
                  href="mailto:rut.wa@digitalbusinessconsult.asia?subject=Request%20for%20User%20Data%20Deletion%20-%20HR%20System"
                  className="font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  rut.wa@digitalbusinessconsult.asia
                </a>{' '}
                พร้อมระบุชื่อ-นามสกุล และอีเมล Google Workspace ที่ใช้งาน ทีมงานจะดำเนินการตรวจสอบยืนยันตัวตนและดำเนินการลบข้อมูลให้แล้วเสร็จภายใน 30 วันทำการ พร้อมมีหนังสือยืนยันทางอีเมล
              </p>
              <p>
                <strong>การเพิกถอนสิทธิ์ Google Account ด้วยตนเอง:</strong> ท่านสามารถยกเลิกสิทธิ์การเข้าถึงข้อมูลของแอปพลิเคชัน &quot;วันนี้ลา by DBC&quot; ได้ด้วยตนเองตลอดเวลา ผ่านหน้าความปลอดภัยของ Google ที่{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                >
                  Google Account Permissions
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </section>

          {/* Section 8: Contact Channel */}
          <section className="space-y-3 pt-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Mail className="w-5 h-5 text-blue-600 shrink-0" />
              <span>8. ช่องทางการติดต่อ (Contact Information)</span>
            </h2>
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100 p-5 space-y-3">
              <p className="text-slate-800 font-bold">
                หากท่านมีข้อสงสัย ข้อเสนอแนะ หรือต้องการใช้สิทธิของเจ้าของข้อมูลส่วนบุคคล (PDPA Rights) สามารถติดต่อได้ที่:
              </p>
              <div className="space-y-1.5 text-xs sm:text-sm text-slate-700">
                <p><strong>ผู้ควบคุมข้อมูล (Data Controller):</strong> บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. / DBC)</p>
                <p>
                  <strong>อีเมลผู้ดูแลระบบ / DPO:</strong>{' '}
                  <a
                    href="mailto:rut.wa@digitalbusinessconsult.asia"
                    className="font-mono font-bold text-blue-600 hover:text-blue-800 underline"
                  >
                    rut.wa@digitalbusinessconsult.asia
                  </a>
                </p>
                <p><strong>ระบบ:</strong> วันนี้ลา by DBC (HR Leave &amp; Attendance Management System)</p>
              </div>
            </div>
          </section>

          {/* Bottom Nav / Footer */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              <p>© 2026 Digital Business Consult Co., Ltd. สงวนลิขสิทธิ์ทั้งหมด</p>
              <p className="text-xs text-slate-400 mt-0.5">
                ประกาศ ณ วันที่ 10 พฤศจิกายน 2569 (เวอร์ชัน 1.1 - Production OAuth &amp; PDPA Compliant)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/terms"
                className="font-bold text-blue-600 hover:text-blue-800 underline"
              >
                ข้อกำหนดการใช้งาน (Terms of Service)
              </Link>
              <span>•</span>
              <Link
                href="/"
                className="font-bold text-slate-700 hover:text-slate-900"
              >
                กลับสู่หน้าหลัก
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

