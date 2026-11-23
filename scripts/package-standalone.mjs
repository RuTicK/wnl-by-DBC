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

// 3. Create .htaccess for Apache / cPanel reverse proxy
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

// 4. Create PM2 ecosystem.config.cjs
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

console.log('\n🎉 Standalone package ready at: .next/standalone/');
console.log('👉 To run locally for testing:');
console.log('   cd .next/standalone && node server.js');
