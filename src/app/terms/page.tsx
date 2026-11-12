import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Scale,
  Building2,
  Lock,
  Mail,
  UserCheck,
  HelpCircle,
  Clock,
  Briefcase,
  Globe,
  ExternalLink,
} from 'lucide-react';

export const metadata = {
  title: 'ข้อกำหนดและเงื่อนไขการใช้งาน (Terms of Service) | วันนี้ลา by DBC',
  description:
    'ข้อกำหนดและเงื่อนไขการใช้งานระบบ วันนี้ลา by DBC สำหรับบุคลากรของบริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. - DBC)',
};

export default function TermsOfServicePage() {
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
              href="/privacy"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline transition-colors"
            >
              นโยบายความเป็นส่วนตัว (Privacy)
            </Link>
          </div>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 via-sky-50/40 to-transparent rounded-bl-full pointer-events-none -mr-16 -mt-16" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-bold mb-4">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Enterprise Terms of Service &amp; Work Regulations</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  ข้อกำหนดและเงื่อนไขการใช้งาน
                </h1>
                <p className="text-sm sm:text-base font-semibold text-blue-600 mt-1">
                  Terms of Service • วันนี้ลา by DBC (Wan-Nee-La by DBC)
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบบริหารจัดการวันลาและเวลาปฏิบัติงานออนไลน์ (HR Leave &amp; Attendance Management System)
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-600 sm:text-right shrink-0 space-y-1">
                <div className="font-bold text-slate-800">ผู้ให้บริการและเจ้าของลิขสิทธิ์</div>
                <div className="text-slate-700 font-medium">Digital Business Consult Co., Ltd. (DBC)</div>
                <div className="text-slate-500 font-mono text-xs">ปรับปรุงล่าสุด: 10 พฤศจิกายน 2569 (v1.1)</div>
              </div>
            </div>

            {/* Quick Summary Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6">
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100/80">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs mb-1">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>ระบบภายในองค์กร</span>
                </div>
                <p className="text-xs text-blue-950/80 leading-relaxed">
                  สำหรับบุคลากรของบริษัท DBC เท่านั้น เข้าสู่ระบบด้วยอีเมล Whitelist ที่ได้รับอนุมัติล่วงหน้า
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100/80">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs mb-1">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>บันทึกตามข้อเท็จจริง</span>
                </div>
                <p className="text-xs text-emerald-950/80 leading-relaxed">
                  ผู้ใช้งานต้องบันทึกเวลา Check-in และยื่นคำขอลาตามความเป็นจริงและระเบียบการทำงานของบริษัท
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100/80">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs mb-1">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>สงวนลิขสิทธิ์ของ DBC</span>
                </div>
                <p className="text-xs text-amber-950/80 leading-relaxed">
                  ระบบ ซอฟต์แวร์ และข้อมูลทั้งหมดเป็นทรัพย์สินทางปัญญาของบริษัท DBC แต่เพียงผู้เดียว
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================
            TERMS OF SERVICE ENGLISH EXECUTIVE SUMMARY
            For Google Cloud Reviewers & International Audits
            ================================================================= */}
        <div className="bg-gradient-to-br from-[#07192C] via-[#0A2540] to-[#0B192C] text-white rounded-3xl p-6 sm:p-8 shadow-md border border-blue-800/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-700/40 pb-4">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  Terms of Service Summary (English Version)
                </h2>
                <p className="text-xs text-blue-200">
                  For Google Verification Reviewers &amp; International Compliance
                </p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Enterprise Internal System
            </span>
          </div>

          <div className="space-y-2.5 text-xs sm:text-sm text-blue-100 leading-relaxed">
            <p>
              <strong>Platform Description:</strong> &quot;วันนี้ลา by DBC&quot; (Wan-Nee-La by DBC) is a proprietary enterprise human resource management and attendance recording web application operated exclusively by <strong>Digital Business Consult Co., Ltd. (DBC)</strong>.
            </p>
            <p>
              <strong>Authorized Access:</strong> Access is restricted strictly to active company employees, contractors, and authorized personnel who are listed in the internal Google Workspace Whitelist. Unauthenticated or unregistered accounts will receive an &quot;Access Denied&quot; notification.
            </p>
            <p>
              <strong>User Conduct &amp; Authenticity:</strong> All users are required to submit accurate attendance check-in logs and honest leave requests. Falsification of records constitutes a serious breach of company policy and Thai Labor Law.
            </p>
            <p>
              <strong>Intellectual Property:</strong> All source code, user interface designs, trademarks, and associated documentation are the exclusive intellectual property of Digital Business Consult Co., Ltd.
            </p>
            <p>
              <strong>Governing Law:</strong> These terms are governed by and construed in accordance with the laws of the Kingdom of Thailand.
            </p>
          </div>
        </div>

        {/* Content Document */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-10 space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Section 1: Acceptance of Terms */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span>1. การยอมรับข้อกำหนด (Acceptance of Terms)</span>
            </h2>
            <p className="text-slate-600">
              ยินดีต้อนรับสู่ระบบ <strong>&quot;วันนี้ลา by DBC&quot; (Wan-Nee-La by DBC)</strong> ซึ่งพัฒนาและดำเนินการโดย <strong>บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. หรือ &quot;DBC&quot;)</strong> การเข้าถึง การลงชื่อเข้าใช้งาน หรือการใช้งานระบบนี้ ไม่ว่าจะผ่านทางเว็บเบราว์เซอร์บนคอมพิวเตอร์หรือโทรศัพท์เคลื่อนที่ ถือว่าท่านได้รับทราบ เข้าใจ และตกลงที่จะปฏิบัติตามข้อกำหนดและเงื่อนไขการใช้งานฉบับนี้ ตลอดจนระเบียบข้อบังคับเกี่ยวกับการทำงานของบริษัท และนโยบายความเป็นส่วนตัว (Privacy Policy) ทุกประการ
            </p>
          </section>

          {/* Section 2: Eligibility & Authentication */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <UserCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span>2. สิทธิ์การใช้งานและการยืนยันตัวตน (Authorized Users &amp; Whitelist Authentication)</span>
            </h2>
            <div className="space-y-2 text-slate-600">
              <p>
                <strong>2.1 ผู้ใช้งานที่ได้รับอนุญาตเท่านั้น (Internal Enterprise Only):</strong> ระบบนี้จัดทำขึ้นเพื่อการใช้งานภายในองค์กร สำหรับพนักงานประจำ พนักงานทดลองงาน ผู้บริหาร กรรมการ หรือบุคคลที่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากบริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด เท่านั้น
              </p>
              <p>
                <strong>2.2 นโยบายความปลอดภัยแบบ Whitelist:</strong> การเข้าสู่ระบบดำเนินการผ่าน Google Workspace Identity Services โดยระบบจะอนุญาตให้เข้าใช้งานเฉพาะบัญชีอีเมลที่ได้รับการลงทะเบียนล่วงหน้าโดยฝ่ายบุคคล (HR) หรือผู้บริหารระดับสูง (C-Level) เท่านั้น บัญชีภายนอกที่ไม่มีรายชื่อในระบบจะไม่สามารถเข้าถึงข้อมูลใดๆ ได้ (Access Denied)
              </p>
              <p>
                <strong>2.3 สิทธิ์ตามบทบาทและการอนุมัติ 2 ขั้นตอน (Role-Based Access Control):</strong> ระบบแบ่งระดับสิทธิ์เป็น 4 บทบาทหลัก ได้แก่:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li><strong>พนักงานทั่วไป (Employee):</strong> บันทึก Check-in, ยื่นคำขอลา, ตรวจสอบโควต้า และดูปฏิทินของทีม (โดยระบบจะซ่อนเหตุผลการลาของเพื่อนร่วมงานตามหลัก PDPA)</li>
                <li><strong>ผู้จัดการ/หัวหน้างาน (Manager):</strong> อนุมัติคำขอลาขั้นที่ 1 สำหรับลูกทีมในแผนกตนเอง</li>
                <li><strong>ฝ่ายทรัพยากรบุคคล (HR):</strong> ตรวจสอบสถิติทั้งองค์กร, จัดการข้อมูลพนักงานและวันหยุด และอนุมัติขั้นสุดท้าย</li>
                <li><strong>ผู้บริหารระดับสูง (C-Level / Admin):</strong> สิทธิ์กำกับดูแลภาพรวม อนุมัติคำขอลาของผู้จัดการ/HR และบริหารจัดการระบบ</li>
              </ul>
            </div>
          </section>

          {/* Section 3: Account Responsibilities */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Lock className="w-5 h-5 text-blue-600 shrink-0" />
              <span>3. บัญชีผู้ใช้และความรับผิดชอบต่อความปลอดภัย (User Account &amp; Security)</span>
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>การรักษาความลับของบัญชี:</strong> ผู้ใช้งานมีหน้าที่รักษาความปลอดภัยของบัญชี Google Workspace อุปกรณ์ และรหัสผ่านของตนเองอย่างเคร่งครัด</li>
              <li><strong>ห้ามใช้บัญชีแทนกัน:</strong> ห้ามมิให้ส่งต่อ อนุญาต หรือยินยอมให้บุคคลอื่นเข้าถึงหรือใช้งานบัญชีของตนเองเพื่อทำการบันทึกเวลา Check-in หรือยื่นคำขอลาแทนกันโดยเด็ดขาด</li>
              <li><strong>การแจ้งเหตุผิดปกติ:</strong> หากพบหรือสงสัยว่ามีบุคคลอื่นเข้าถึงบัญชีของท่านโดยมิได้รับอนุญาต ต้องแจ้งผู้ดูแลระบบที่ <code className="text-blue-600 font-mono">rut.wa@digitalbusinessconsult.asia</code> ทันที</li>
            </ul>
          </section>

          {/* Section 4: Attendance & Leave Accuracy */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Briefcase className="w-5 h-5 text-blue-600 shrink-0" />
              <span>4. ความถูกต้องในการบันทึกเวลาและการยื่นคำขอลา (Attendance &amp; Leave Regulations)</span>
            </h2>
            <div className="space-y-2.5 text-slate-600">
              <p>
                <strong>4.1 การบันทึกเวลา Check-in และ Check-out:</strong> ผู้ใช้งานมีหน้าที่บันทึกเวลาเข้า-ออกงานตามความเป็นจริง พร้อมทั้งระบุประเภทสถานที่ปฏิบัติงาน (Office, Remote / WFH, Offsite) ให้สอดคล้องกับข้อเท็จจริงและข้อตกลงกับหัวหน้างาน
              </p>
              <p>
                <strong>4.2 การยื่นคำขอลาหยุดงานตามประเภทที่กำหนด:</strong> การยื่นคำขอลาต้องดำเนินการผ่านระบบล่วงหน้าตามระเบียบบริษัท โดยระบุประเภทวันลา 6 รูปแบบ (ลาป่วย sick, ลากิจ personal, ลาพักร้อน vacation, Work From Home wfh, Work From Anywhere wfa, ทำงานนอกสถานที่ offsite) ให้ตรงตามวัตถุประสงค์ พร้อมแนบเอกสารรับรองที่จำเป็น (เช่น ใบรับรองแพทย์กรณีลาป่วยตามที่บริษัทกำหนด)
              </p>
              <p>
                <strong>4.3 เงื่อนไขการผ่านทดลองงาน (Probation 120 วัน):</strong> พนักงานที่อยู่ระหว่างทดลองงาน (อายุงานน้อยกว่า 120 วัน) ระบบจะคำนวณและแสดงผลสถานะวันทำงานคงเหลือโดยอัตโนมัติ โดยไม่อนุญาตให้ใช้สิทธิ์ลาพักร้อน (vacation), WFH หรือ WFA ในระหว่างช่วงทดลองงาน เว้นแต่กรณีลาป่วย (sick), ลากิจจำเป็น (personal) หรือทำงานนอกสถานที่ (offsite) ตามที่ได้รับอนุญาต
              </p>
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>บทลงโทษทางวินัยกรณีบันทึกข้อมูลเท็จ</span>
                </div>
                <p>
                  การเจตนาบันทึกเวลาเท็จ การ Check-in แทนผู้อื่น หรือการสร้างคำขอลาอันเป็นเท็จ ถือเป็นการฝ่าฝืนข้อบังคับเกี่ยวกับการทำงานอย่างร้ายแรง และอาจนำไปสู่การดำเนินการทางวินัยตามระเบียบบริษัทและพระราชบัญญัติคุ้มครองแรงงาน
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Intellectual Property */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span>5. ทรัพย์สินทางปัญญาและลิขสิทธิ์ (Intellectual Property &amp; Proprietary Rights)</span>
            </h2>
            <p className="text-slate-600">
              บรรดาสิทธิ์ ทรัพย์สินทางปัญญา ลิขสิทธิ์ เครื่องหมายการค้า ชื่อทางการค้า โค้ดต้นฉบับ (Source Code) การออกแบบส่วนติดต่อผู้ใช้ (UI/UX) และฐานข้อมูลทั้งหมดของระบบ <strong>&quot;วันนี้ลา by DBC&quot;</strong> เป็นกรรมสิทธิ์ของ <strong>บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (DBC)</strong> แต่เพียงผู้เดียว
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>ห้ามทำซ้ำ ดัดแปลง แก้ไข ลอกเลียนแบบ หรือสร้างงานสืบเนื่องจากส่วนใดส่วนหนึ่งของระบบ</li>
              <li>ห้ามทำวิศวกรรมย้อนกลับ (Reverse Engineering), ถอดรหัส (Decompile) หรือพยายามเข้าถึงซอร์สโค้ดโดยไม่ได้รับอนุญาต</li>
              <li>ห้ามนำระบบ ส่วนประกอบ หรือข้อมูลใดๆ ไปใช้ประโยชน์ในเชิงพาณิชย์ หรือแจกจ่ายต่อบุคคลภายนอก เว้นแต่จะได้รับความยินยอมเป็นลายลักษณ์อักษรจากบริษัท</li>
            </ul>
          </section>

          {/* Section 6: System Availability */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span>6. ความพร้อมใช้งานและการบำรุงรักษาระบบ (System Availability &amp; Maintenance)</span>
            </h2>
            <div className="space-y-2 text-slate-600">
              <p>
                บริษัทมุ่งมั่นพัฒนาระบบให้มีความเสถียร ปลอดภัย และพร้อมใช้งานอย่างต่อเนื่อง อย่างไรก็ดี บริษัทขอสงวนสิทธิ์ในการระงับหรือหยุดการให้บริการชั่วคราว เพื่อการบำรุงรักษา ปรับปรุงระบบ หรือแก้ไขปัญหาความปลอดภัย โดยจะแจ้งให้ผู้ใช้งานทราบล่วงหน้าตามความเหมาะสม
              </p>
              <p>
                ในกรณีเกิดเหตุสุดวิสัย ปัญหาเครือข่ายอินเทอร์เน็ต หรือความขัดข้องจากผู้ให้บริการภายนอก (อาทิ Google Cloud Platform / Google Workspace) บริษัทจะเร่งดำเนินการประสานงานเพื่อกู้คืนการทำงานโดยเร็วที่สุด
              </p>
            </div>
          </section>

          {/* Section 7: Limitation of Liability */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Scale className="w-5 h-5 text-blue-600 shrink-0" />
              <span>7. ข้อจำกัดความรับผิด (Limitation of Liability)</span>
            </h2>
            <p className="text-slate-600">
              ในขอบเขตสูงสุดที่กฎหมายอนุญาต บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด กรรมการ ผู้บริหาร และพนักงาน จะไม่ต้องรับผิดต่อความเสียหายทางอ้อม ความเสียหายสืบเนื่อง หรือการสูญหายของข้อมูล อันเกิดจากการใช้งานผิดวิธีของผู้ใช้ การละเลยมาตรการความปลอดภัย หรือเหตุขัดข้องทางเทคนิคที่อยู่นอกเหนือการควบคุมตามสมควร
            </p>
          </section>

          {/* Section 8: Termination */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0" />
              <span>8. การระงับและการสิ้นสุดสิทธิ์การใช้งาน (Suspension &amp; Termination)</span>
            </h2>
            <p className="text-slate-600">
              สิทธิ์การเข้าใช้งานระบบจะสิ้นสุดลงโดยอัตโนมัติเมื่อพนักงานพ้นสภาพจากการเป็นบุคลากรของบริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด นอกจากนี้ บริษัทขอสงวนสิทธิ์ในการระงับหรือยกเลิกการเข้าถึงระบบของผู้ใช้งานทันที หากพบว่ามีการกระทำที่ฝ่าฝืนข้อกำหนดนี้ นโยบายความปลอดภัย หรือมีเจตนาทุจริตต่อองค์กร
            </p>
          </section>

          {/* Section 9: Governing Law */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Scale className="w-5 h-5 text-blue-600 shrink-0" />
              <span>9. กฎหมายที่ใช้บังคับและการระงับข้อพิพาท (Governing Law &amp; Jurisdiction)</span>
            </h2>
            <p className="text-slate-600">
              ข้อกำหนดและเงื่อนไขการใช้งานฉบับนี้ อยู่ภายใต้การบังคับใช้และการตีความตาม <strong>กฎหมายแห่งราชอาณาจักรไทย</strong> ข้อพิพาทหรือข้อเรียกร้องใดๆ ที่เกิดขึ้นอันเกี่ยวเนื่องกับการใช้งานระบบนี้ ให้อยู่ภายใต้เขตอำนาจการพิจารณาของศาลไทยที่มีอำนาจตามกฎหมาย
            </p>
          </section>

          {/* Section 10: Contact Information */}
          <section className="space-y-3 pt-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Mail className="w-5 h-5 text-blue-600 shrink-0" />
              <span>10. ช่องทางการติดต่อ (Contact Information)</span>
            </h2>
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100 p-5 space-y-3">
              <p className="text-slate-800 font-bold">
                หากท่านมีข้อสงสัยเกี่ยวกับข้อกำหนดการใช้งานนี้ หรือต้องการความช่วยเหลือทางเทคนิค สามารถติดต่อได้ที่:
              </p>
              <div className="space-y-1.5 text-xs sm:text-sm text-slate-700">
                <p><strong>ผู้ให้บริการ:</strong> บริษัท ดิจิทัล บิสิเนส คอนซัลท์ จำกัด (Digital Business Consult Co., Ltd. / DBC)</p>
                <p>
                  <strong>อีเมลผู้ดูแลระบบ / ผู้พัฒนา:</strong>{' '}
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
                ประกาศ ณ วันที่ 10 พฤศจิกายน 2569 (เวอร์ชัน 1.1 - Production Enterprise Terms)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/privacy"
                className="font-bold text-blue-600 hover:text-blue-800 underline"
              >
                นโยบายความเป็นส่วนตัว (Privacy Policy)
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

