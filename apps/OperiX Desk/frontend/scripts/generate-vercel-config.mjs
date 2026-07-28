import fs from 'fs';

const raw = (process.env.VITE_API_URL || process.env.BACKEND_URL || '').trim();
const backendBase = raw.replace(/\/api\/?$/, '');

const rewrites = [];

if (backendBase) {
  rewrites.push({
    source: '/api/:path*',
    destination: `${backendBase}/api/:path*`,
  });
  console.log(`API proxy: /api -> ${backendBase}/api`);
}

rewrites.push({
  source: '/(.*)',
  destination: '/index.html',
});

fs.writeFileSync('vercel.json', `${JSON.stringify({ rewrites }, null, 2)}\n`);
