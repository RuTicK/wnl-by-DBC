import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LeavePolicyModal from '@/components/LeavePolicyModal';

describe('Leave Quota in Navbar & Sidebar Layout Verification', () => {
  const pagePath = path.resolve(__dirname, '../../app/page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf-8');

  it('removes bulky standalone quota cards from the main body content', () => {
    // The main body should no longer contain the old grid-cols-3 quota strip
    expect(pageContent).not.toMatch(
      /Personal Quota Strip \(Sick, Personal, Vacation with fixed quota\)/
    );
    expect(pageContent).not.toContain(
      "{activeTab === 'CALENDAR' && (\n          <div className=\"grid grid-cols-1 sm:grid-cols-3"
    );
  });

  it('integrates a compact quota widget into the desktop sidebar navigation', () => {
    // Check desktop quota section header and items
    expect(pageContent).toContain('โควต้าวันลาคงเหลือ');
    expect(pageContent).toContain('Desktop Quota Display Widget');
    expect(pageContent).toContain("(['sick', 'personal', 'vacation'] as LeaveType[])");
  });

  it('provides a mobile compact quota pill bar and expandable drawer in the header', () => {
    expect(pageContent).toContain('Mobile Quota Quick Bar');
    expect(pageContent).toContain('Mobile Expandable Quota Drawer / Popover');
    expect(pageContent).toContain('isMobileQuotaOpen');
    expect(pageContent).toContain('รายละเอียดโควต้าวันลา');
  });

  it('includes quick at-a-glance quota indicators on desktop header', () => {
    expect(pageContent).toContain('Desktop Quick Quota Pill Indicator');
  });

  it('preserves legal links (/privacy and /terms) across footer and sidebar', () => {
    const privacyMatches = pageContent.match(/href="\/privacy"/g) || [];
    const termsMatches = pageContent.match(/href="\/terms"/g) || [];
    expect(privacyMatches.length).toBeGreaterThanOrEqual(2);
    expect(termsMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('provides click-outside backdrop dismiss and Escape key dismiss for mobile quota popover', () => {
    expect(pageContent).toContain('Backdrop: clicking outside dismisses drawer');
    expect(pageContent).toContain('onClick={() => setIsMobileQuotaOpen(false)}');
    expect(pageContent).toContain("if (e.key === 'Escape')");
    expect(pageContent).toContain('setIsMobileQuotaOpen(false)');
    // Automatically close mobile quota popover on activeTab change
    expect(pageContent).toContain('Close mobile quota popover on active tab change');
  });

  it('protects short labels from text truncation with shrink-0 in mobile quick bar', () => {
    // Look for shrink-0 on meta.shortLabel so "พักร้อน" is never truncated
    expect(pageContent).toMatch(
      /<span[^>]*font-bold[^>]*shrink-0[^>]*>\s*\{meta\.shortLabel\}\s*<\/span>/
    );
  });

  it('wires isPolicyOnlyView correctly so viewing terms does not trigger leave submission flow', () => {
    expect(pageContent).toContain('const [isPolicyOnlyView, setIsPolicyOnlyView] = useState<boolean>(false);');
    expect(pageContent).toContain('handleOpenPolicyOnlyModal');
    expect(pageContent).toContain('onlyView={isPolicyOnlyView}');
  });

  it('renders LeavePolicyModal properly in onlyView mode vs request mode', () => {
    // In onlyView=true mode (viewing terms from sidebar or quota drawer):
    const viewOnlyHtml = renderToStaticMarkup(
      <LeavePolicyModal isOpen={true} onClose={() => {}} onlyView={true} />
    );
    expect(viewOnlyHtml).toContain('ปิดหน้าต่าง');
    expect(viewOnlyHtml).not.toContain('รับทราบเงื่อนไขและยื่นใบลา');

    // In onlyView=false mode (filing a leave request):
    const filingHtml = renderToStaticMarkup(
      <LeavePolicyModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        onlyView={false}
      />
    );
    expect(filingHtml).toContain('รับทราบเงื่อนไขและยื่นใบลา');
    expect(filingHtml).toContain('ยกเลิก');
  });
});
