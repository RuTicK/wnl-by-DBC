import fs from 'node:fs';
import path from 'node:path';

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

// 3. Copy environment configuration
const envLocalPath = path.join(rootDir, '.env.local');
const envProdDest = path.join(standaloneDir, '.env.production');
const envLocalDest = path.join(standaloneDir, '.env.local');

if (fs.existsSync(envLocalPath)) {
  fs.copyFileSync(envLocalPath, envProdDest);
  fs.copyFileSync(envLocalPath, envLocalDest);
  console.log('✅ Copied .env.local -> .next/standalone/.env.production and .env.local');
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

// 5. Create PM2 ecosystem.config.cjs
const ecosystemContent = `module.exports = {
  apps: [
    {
      name: 'hr-dbc',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        PORT: 3000,
        NODE_ENV: 'production'
      }
    }
  ]
};
`;
fs.writeFileSync(path.join(standaloneDir, 'ecosystem.config.cjs'), ecosystemContent);
console.log('✅ Created ecosystem.config.cjs for PM2');

// 6. Create README for Server Admin
const readmeContent = `========================================================
คู่มือการติดตั้งและเปิดใช้งานระบบ "วันนี้ลา by DBC" บน Server
โดเมนเป้าหมาย: hr.dbcgroup.asia
========================================================

สำหรับเจ้าหน้าที่ดูแล Server (System Administrator / DevOps):

โครงสร้างโปรเจกต์:
- พัฒนาด้วย Next.js 15 (Node.js) ในโหมด Standalone Production Build
- ไฟล์และโมดูลทั้งหมดถูก bundle ไว้พร้อมรันในโฟลเดอร์นี้เรียบร้อยแล้ว
- ค่า Config และ Key ต่างๆ (Google Sheets / Google OAuth / Google Chat) อยู่ในไฟล์ .env.production

ขั้นตอนการรันระบบ (เลือกวิธีตามสภาพแวดล้อมของ Server):

วิธีที่ 1: รันด้วย PM2 (แนะนำที่สุดสำหรับ Linux / VPS)
--------------------------------------------------------
1. เข้ามาที่โฟลเดอร์นี้
2. รันคำสั่ง:
   pm2 start ecosystem.config.cjs
   pm2 save
3. ตั้งค่า Nginx หรือ Apache Reverse Proxy ให้ชี้ subdomain hr.dbcgroup.asia ไปที่ http://127.0.0.1:3000

วิธีที่ 2: รันผ่าน cPanel (Setup Node.js App)
--------------------------------------------------------
1. ใน cPanel ไปที่ "Setup Node.js App"
2. Node.js version: เลือก 18.x หรือ 20.x
3. Application root: ระบุพาธโฟลเดอร์นี้
4. Application URL: เลือก hr.dbcgroup.asia
5. Application startup file: ระบุเป็น "server.js"
6. กด Save และกด Start App

วิธีที่ 3: รันด้วยคำสั่ง Node ตรงๆ
--------------------------------------------------------
NODE_ENV=production PORT=3000 node server.js
========================================================
`;
fs.writeFileSync(path.join(standaloneDir, 'README_SERVER_ADMIN.txt'), readmeContent);
console.log('✅ Created README_SERVER_ADMIN.txt for Server Administrator');

// 7. Automatically create hr-dbc-deploy.zip
import { execSync } from 'node:child_process';
const zipPath = path.join(rootDir, 'hr-dbc-deploy.zip');
try {
  console.log('📦 Zipping standalone files into hr-dbc-deploy.zip...');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${standaloneDir}\\*' -DestinationPath '${zipPath}' -Force"`);
  console.log(`✅ Created ready-to-upload zip: ${zipPath}`);
} catch (err) {
  console.log('⚠️ Note: Auto-zip skipped or failed:', err.message);
}

console.log('\n🎉 Standalone package ready at: .next/standalone/');
console.log('📦 Deployment zip file: hr-dbc-deploy.zip');
console.log('👉 To run locally for testing:');
console.log('   cd .next/standalone && node server.js');
