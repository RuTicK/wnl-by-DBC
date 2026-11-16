import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock Next.js navigation redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import PrivacyPolicyPage from '@/app/privacy/page';
import TermsOfServicePage, { metadata as termsMetadata } from '@/app/terms/page';
import { redirect } from 'next/navigation';

describe('Enterprise Legal Pages (/privacy & /terms) Verification', () => {
  describe('1. Privacy Policy Page (/privacy)', () => {
    it('redirects immediately to dbcgroup.asia official privacy notice URL', () => {
      PrivacyPolicyPage();
      expect(redirect).toHaveBeenCalledWith(
        'https://dbcgroup.asia/privacy-notice-employee-applicant/'
      );
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
      expect(html).toContain('Probation 119 วัน');

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
