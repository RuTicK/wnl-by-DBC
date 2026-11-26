import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const publicDir = path.join(rootDir, 'public');
const staticSrcDir = path.join(rootDir, '.next', 'static');
const staticDestDir = path.join(standaloneDir, '.next', 'static');
const publicDestDir = path.join(standaloneDir, 'public');

console.log('📦 Preparing standalone deployment package...');

if (!fs.existsSync(standaloneDir)) {
  console.error('❌ .next/standalone does not exist. Please run `next build` first.');
  process.exit(1);
}

// 1. Copy public assets into standalone/public
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, publicDestDir, { recursive: true });
  console.log('✅ Copied public/ -> .next/standalone/public/');
}

// 2. Copy .next/static into standalone/.next/static
if (fs.existsSync(staticSrcDir)) {
  fs.cpSync(staticSrcDir, staticDestDir, { recursive: true });
  console.log('✅ Copied .next/static/ -> .next/standalone/.next/static/');
}

// 3. Security: NEVER bundle .env* files with live secrets into deployment zip/folder!
for (const entry of fs.readdirSync(standaloneDir)) {
  if (/^\.env($|\.)/i.test(entry)) {
    const targetPath = path.join(standaloneDir, entry);
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`🔒 Removed secret env file from standalone package: ${entry}`);
  }
}

// Also remove any local runtime .data directory traced by Next.js (may contain local app-config.json / hr-store.json)
const standaloneDataDir = path.join(standaloneDir, '.data');
if (fs.existsSync(standaloneDataDir)) {
  fs.rmSync(standaloneDataDir, { recursive: true, force: true });
  console.log('🔒 Removed local .data/ directory from standalone package');
}

const envExampleSrc = path.join(rootDir, '.env.example');
if (fs.existsSync(envExampleSrc)) {
  fs.copyFileSync(envExampleSrc, path.join(standaloneDir, '.env.production.example'));
  console.log('✅ Copied .env.example -> .next/standalone/.env.production.example (no secrets bundled)');
}

// Hard safety check before syncing/zipping: abort build if any secret .env* or .data remains
const forbiddenLeftovers = fs
  .readdirSync(standaloneDir)
  .filter(
    (entry) =>
      entry === '.data' ||
      (/^\.env($|\.)/i.test(entry) && entry !== '.env.production.example')
  );
if (forbiddenLeftovers.length > 0) {
  console.error(
    `❌ Security abort: secret files still present in standalone package: ${forbiddenLeftovers.join(', ')}`
  );
  process.exit(1);
}

// 4. Create .htaccess for Apache / cPanel reverse proxy
const htaccessContent = `# Apache Reverse Proxy to Node.js App (Next.js on port 3000)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
</IfModule>
`;
fs.writeFileSync(path.join(standaloneDir, '.htaccess'), htaccessContent);
console.log('✅ Created .htaccess reverse proxy template');

// 5. Create PM2 ecosystem.config.cjs (single instance / fork mode so in-memory cache & write lock stay consistent)
const ecosystemContent = `module.exports = {
  apps: [
    {
      name: 'hr-dbc',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3000,
        NODE_ENV: 'production'
      }
    }
  ]
};
`;
fs.writeFileSync(path.join(standaloneDir, 'ecosystem.config.cjs'), ecosystemContent);
console.log('✅ Created ecosystem.config.cjs for PM2 (instances: 1, fork mode)');

// 6. Create README for Server Admin
const readmeContent = `========================================================
คู่มือการติดตั้งและเปิดใช้งานระบบ "วันนี้ลา by DBC" บน Server
โดเมนเป้าหมาย: hr.dbcgroup.asia
========================================================

สำหรับเจ้าหน้าที่ดูแล Server (System Administrator / DevOps):

โครงสร้างโปรเจกต์:
- พัฒนาด้วย Next.js 15 (Node.js) ในโหมด Standalone Production Build
- ไฟล์และโมดูลทั้งหมดถูก bundle ไว้พร้อมรันในโฟลเดอร์นี้เรียบร้อยแล้ว
- เพื่อความปลอดภัย ไฟล์ .env.production ที่มี Key/Secret จะไม่ถูกแพ็กรวมในไฟล์ zip

ขั้นตอนการตั้งค่า Environment Variables บน Server (ทำครั้งเดียวก่อนเปิดใช้งาน):
--------------------------------------------------------
1. คัดลอกไฟล์ .env.production.example เป็น .env.production บน Server โดยตรง:
   cp .env.production.example .env.production
   chmod 600 .env.production
2. กรอกค่า Environment Variables จริงลงใน .env.production:
   - SESSION_SECRET (สุ่มด้วยคำสั่ง: openssl rand -hex 32)
   - GOOGLE_SHEET_ID
   - GOOGLE_SERVICE_ACCOUNT_EMAIL
   - GOOGLE_PRIVATE_KEY
   - NEXT_PUBLIC_GOOGLE_CLIENT_ID
   - GOOGLE_CHAT_WEBHOOK_URL (แชทแรก: แจ้งเตือนทุกขั้นตอนใบลา, WFH พร้อมลิงก์ Meet และ Check-in นอกสถานที่)
   - GOOGLE_CHAT_WEBHOOK_URL_2 (แชทที่ 2: แจ้งเตือนขั้นสุดท้ายเมื่อใบลาอนุมัติครบแล้ว, WFH พร้อมลิงก์ Meet และ Check-in นอกสถานที่)
   - APPSHEET_APP_ID / APPSHEET_ACCESS_KEY (ถ้าใช้งาน AppSheet)

ขั้นตอนการรันระบบ (เลือกวิธีตามสภาพแวดล้อมของ Server):

วิธีที่ 1: รันด้วย PM2 (แนะนำที่สุดสำหรับ Linux / VPS)
--------------------------------------------------------
1. เข้ามาที่โฟลเดอร์นี้
2. รันคำสั่ง:
   pm2 start ecosystem.config.cjs
   pm2 save
   (หมายเหตุ: ecosystem.config.cjs ตั้งค่า instances: 1 เพื่อป้องกันความไม่สอดคล้องของ in-memory lock/cache)
3. ตั้งค่า Nginx หรือ Apache Reverse Proxy ให้ชี้ subdomain hr.dbcgroup.asia ไปที่ http://127.0.0.1:3000

วิธีที่ 2: รันผ่าน cPanel (Setup Node.js App)
--------------------------------------------------------
1. ใน cPanel ไปที่ "Setup Node.js App"
2. Node.js version: เลือก 18.x หรือ 20.x
3. Application root: ระบุพาธโฟลเดอร์นี้
4. Application URL: เลือก hr.dbcgroup.asia
5. Application startup file: ระบุเป็น "server.js"
6. เพิ่ม Environment Variables ตามรายการด้านบน กด Save และกด Start App

วิธีที่ 3: รันด้วยคำสั่ง Node ตรงๆ
--------------------------------------------------------
NODE_ENV=production PORT=3000 node server.js
========================================================
`;
fs.writeFileSync(path.join(standaloneDir, 'README_SERVER_ADMIN.txt'), readmeContent);
console.log('✅ Created README_SERVER_ADMIN.txt for Server Administrator');

// 7. Sync into UPLOAD_TO_SERVER folder (unzipped, ready to drag-and-drop)
const uploadDir = path.join(rootDir, 'UPLOAD_TO_SERVER');
try {
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  fs.cpSync(standaloneDir, uploadDir, { recursive: true });
  console.log('✅ Synchronized unzipped files into folder: UPLOAD_TO_SERVER/');
} catch (err) {
  console.log('⚠️ Note: Sync to UPLOAD_TO_SERVER failed:', err.message);
}

// 8. Automatically create hr-dbc-deploy.zip
const zipPath = path.join(rootDir, 'hr-dbc-deploy.zip');
try {
  console.log('📦 Zipping standalone files into hr-dbc-deploy.zip...');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${standaloneDir}\\*' -DestinationPath '${zipPath}' -Force"`);
  console.log(`✅ Created ready-to-upload zip: ${zipPath}`);
} catch (err) {
  console.log('⚠️ Note: Auto-zip skipped or failed:', err.message);
}

console.log('\n🎉 Standalone package ready at: .next/standalone/');
console.log('📂 Ready-to-upload unzipped folder: UPLOAD_TO_SERVER/');
console.log('📦 Deployment zip file: hr-dbc-deploy.zip (verified clean of .env secrets)');
console.log('👉 To run locally for testing:');
console.log('   cd .next/standalone && node server.js');
