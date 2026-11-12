import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage, { metadata as privacyMetadata } from '@/app/privacy/page';
import TermsOfServicePage, { metadata as termsMetadata } from '@/app/terms/page';
import fs from 'fs';
import path from 'path';

describe('Enterprise Legal Pages (/privacy & /terms) Verification', () => {
  describe('1. Privacy Policy Page (/privacy)', () => {
    it('exports proper metadata for SEO and Google OAuth Consent Screen', () => {
      expect(privacyMetadata).toBeDefined();
      expect(privacyMetadata.title).toContain('นโยบายความเป็นส่วนตัว');
      expect(privacyMetadata.title).toContain('วันนี้ลา by DBC');
      expect(privacyMetadata.description).toContain('PDPA');
      expect(privacyMetadata.description).toContain('Google API Services User Data Policy');
    });

    it('renders with all required enterprise PDPA and Google OAuth disclosures', () => {
      const html = renderToStaticMarkup(<PrivacyPolicyPage />);

      // Data controller
      expect(html).toContain('Digital Business Consult');
      expect(html).toContain('DBC');
      expect(html).toContain('Wan-Nee-La by DBC');

      // Contact email & DPO
      expect(html).toContain('rut.wa@digitalbusinessconsult.asia');

      // Google OAuth Scopes (Non-sensitive)
      expect(html).toContain('openid');
      expect(html).toContain('email');
      expect(html).toContain('profile');
      expect(html).toContain('Non-sensitive');

      // No sensitive scopes statement
      expect(html).toContain('ไม่มีการขอสิทธิ์');

      // Google API Services User Data Policy & Official English Limited Use Statement
      expect(html).toContain('Google API Services User Data Policy');
      expect(html).toContain('Limited Use');
      expect(html).toContain('Wan-Nee-La by DBC');
      expect(html).toContain('adhere to');
      expect(html).toContain('ไม่มีการจำหน่ายหรือแลกเปลี่ยนข้อมูล');
      expect(html).toContain('ไม่มีการใช้เพื่อการโฆษณา');
      expect(html).toContain('ไม่มีการนำไปเทรน AI Models');

      // Data Minimization items
      expect(html).toContain('ชื่อ-นามสกุล');
      expect(html).toContain('รูปโปรไฟล์จาก Google OAuth');
      expect(html).toContain('ประวัติการลงเวลา Check-in');
      expect(html).toContain('คำขอลา');

      // Explicit non-collection items
      expect(html).toContain('หมายเลขโทรศัพท์ส่วนบุคคล');
      expect(html).toContain('เลขบัตรประจำตัวประชาชน');

      // Role-based privacy redaction
      expect(html).toContain('PDPA Data Redaction');
      expect(html).toContain('เหตุผลส่วนตัว (ซ่อนข้อมูล)');

      // Complete PDPA Rights (Access, Rectification, Erasure, Data Portability, etc.)
      expect(html).toContain('สิทธิของเจ้าของข้อมูลส่วนบุคคล');
      expect(html).toContain('สิทธิขอเข้าถึงและรับสำเนาข้อมูล');
      expect(html).toContain('สิทธิขอแก้ไขข้อมูลให้ถูกต้อง');
      expect(html).toContain('สิทธิขอลบหรือทำลายข้อมูล');
      expect(html).toContain('สิทธิขอถ่ายโอนข้อมูลส่วนบุคคล');
      expect(html).toContain('Right to Data Portability');
      expect(html).toContain('สิทธิคัดค้านการประมวลผล');
      expect(html).toContain('สิทธิขอให้ระงับการใช้ข้อมูล');
      expect(html).toContain('สิทธิเพิกถอนความยินยอม');
      expect(html).toContain('สิทธิในการร้องเรียน');

      // User Data Deletion callback instructions & Google account permissions link
      expect(html).toContain('การขอลบข้อมูลผู้ใช้งาน');
      expect(html).toContain('https://myaccount.google.com/permissions');

      // Navigation & Responsive layout
      expect(html).toContain('กลับสู่หน้าหลัก');
      expect(html).toContain('/terms');
      expect(html).toContain('href="/"');
    });
  });

  describe('2. Terms of Service Page (/terms)', () => {
    it('exports proper metadata for Terms of Service', () => {
      expect(termsMetadata).toBeDefined();
      expect(termsMetadata.title).toContain('ข้อกำหนดและเงื่อนไขการใช้งาน');
      expect(termsMetadata.title).toContain('วันนี้ลา by DBC');
      expect(termsMetadata.description).toContain('Digital Business Consult');
    });

    it('renders with all required enterprise terms and work regulations', () => {
      const html = renderToStaticMarkup(<TermsOfServicePage />);

      // Company info
      expect(html).toContain('Digital Business Consult');
      expect(html).toContain('DBC');
      expect(html).toContain('Wan-Nee-La by DBC');
      expect(html).toContain('rut.wa@digitalbusinessconsult.asia');

      // English Executive Summary
      expect(html).toContain('Terms of Service Summary (English Version)');
      expect(html).toContain('Enterprise Internal System');

      // Authorized Whitelist users & Role-Based Access Control
      expect(html).toContain('Whitelist');
      expect(html).toContain('ผู้ใช้งานที่ได้รับอนุญาตเท่านั้น');
      expect(html).toContain('Role-Based Access Control');
      expect(html).toContain('พนักงานทั่วไป (Employee)');
      expect(html).toContain('ผู้จัดการ/หัวหน้างาน (Manager)');
      expect(html).toContain('ฝ่ายทรัพยากรบุคคล (HR)');
      expect(html).toContain('ผู้บริหารระดับสูง (C-Level / Admin)');

      // Attendance and Leave accuracy
      expect(html).toContain('ความถูกต้องในการบันทึกเวลาและการยื่นคำขอลา');
      expect(html).toContain('Check-in');
      expect(html).toContain('Probation 120 วัน');

      // Intellectual property
      expect(html).toContain('ทรัพย์สินทางปัญญาและลิขสิทธิ์');

      // Governing law of Thailand
      expect(html).toContain('กฎหมายแห่งราชอาณาจักรไทย');

      // Navigation
      expect(html).toContain('กลับสู่หน้าหลัก');
      expect(html).toContain('/privacy');
      expect(html).toContain('href="/"');
    });
  });

  describe('3. LoginView & Main App Legal Links Verification', () => {
    it('LoginView.tsx includes target="_blank" rel="noopener noreferrer" links to /privacy and /terms', () => {
      const loginViewPath = path.resolve(__dirname, '../../components/LoginView.tsx');
      const fileContent = fs.readFileSync(loginViewPath, 'utf-8');

      expect(fileContent).toContain('href="/privacy"');
      expect(fileContent).toContain('href="/terms"');
      expect(fileContent).toContain('target="_blank"');
      expect(fileContent).toContain('rel="noopener noreferrer"');
    });

    it('HomePage in app/page.tsx includes links to /privacy and /terms in both footer and sidebar', () => {
      const homePagePath = path.resolve(__dirname, '../../app/page.tsx');
      const fileContent = fs.readFileSync(homePagePath, 'utf-8');

      expect(fileContent).toContain('href="/privacy"');
      expect(fileContent).toContain('href="/terms"');
      expect(fileContent).toContain('target="_blank"');
      expect(fileContent).toContain('rel="noopener noreferrer"');

      // Confirm presence in footer and sidebar
      const occurrencesOfPrivacy = (fileContent.match(/href="\/privacy"/g) || []).length;
      expect(occurrencesOfPrivacy).toBeGreaterThanOrEqual(2);
    });
  });
});

