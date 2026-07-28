import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = '/root/OperiX';
const brand = path.join(root, 'apps/OperiX Suite/public/brand');
const out = path.join(root, 'social');
fs.mkdirSync(out, { recursive: true });

const b64 = (file) => fs.readFileSync(file).toString('base64');
const bg = b64('/root/.codex/generated_images/019f8f93-3f5c-7c22-b977-52087ccf2a85/exec-4fa54563-45e3-4ef1-813c-9e2aa69a887b.png');
const font = b64(path.join(brand, 'fonts/OblivianText-Bold.otf'));
const suiteMark = b64(path.join(brand, 'operix-wordmark-blue.svg'));
const invoiceMark = b64(path.join(brand, 'operix-invoice-logo.svg'));
const hrMark = b64(path.join(brand, 'operix-hr-office-logo.svg'));

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function frame({ eyebrow, title, title2, body, cta, badge, mark = suiteMark, dark = false, accent = '#004FFE', pills = [] }) {
  const text = dark ? '#FFFFFF' : '#0A2148';
  const muted = dark ? '#D7E7FF' : '#526784';
  const bgLayer = dark ? `<rect width="1080" height="1080" fill="#061D46"/><image href="data:image/png;base64,${bg}" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" opacity=".36"/>` : `<image href="data:image/png;base64,${bg}" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" opacity=".95"/><rect width="1080" height="1080" fill="white" opacity=".48"/>`;
  const badgeSvg = badge ? `<rect x="72" y="390" width="${Math.max(178, badge.length * 14 + 42)}" height="42" rx="21" fill="${dark ? '#123E83' : '#E6F0FF'}"/><text x="93" y="418" class="badge" fill="${accent}">${esc(badge.toUpperCase())}</text>` : '';
  const pillSvg = pills.map((p, i) => `<rect x="${72 + i * 166}" y="875" width="150" height="38" rx="19" fill="${dark ? '#123E83' : '#FFFFFF'}" stroke="${dark ? '#4E87E8' : '#BFD8FF'}"/><text x="${147 + i * 166}" y="899" class="pill" fill="${dark ? '#FFFFFF' : '#275385'}" text-anchor="middle">${esc(p)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs><style>
    @font-face{font-family:OperiX;src:url(data:font/otf;base64,${font})}
    .display{font-family:OperiX,Arial,sans-serif;font-weight:700;letter-spacing:-2px}
    .body,.badge,.pill,.cta{font-family:Arial,sans-serif}
    .display{font-size:76px}.body{font-size:29px;line-height:1.35}.badge{font-size:15px;font-weight:700;letter-spacing:2px}.pill{font-size:16px;font-weight:700;letter-spacing:.2px}.cta{font-size:20px;font-weight:700}
  </style></defs>
  ${bgLayer}
  <rect x="52" y="52" width="976" height="976" rx="42" fill="${dark ? '#061D46' : '#FFFFFF'}" opacity="${dark ? '.42' : '.28'}" stroke="${dark ? '#477ECF' : '#D7E7FF'}"/>
  ${dark ? '<rect x="62" y="66" width="210" height="80" rx="18" fill="#D7E7FF" opacity=".96"/>' : ''}
  <image href="data:image/svg+xml;base64,${mark}" x="72" y="76" width="176" height="60" preserveAspectRatio="xMinYMid meet"/>
  <text x="72" y="270" class="body" fill="${accent}" font-weight="700" letter-spacing="3">${esc(eyebrow.toUpperCase())}</text>
  <text x="72" y="330" class="display" fill="${text}">${esc(title)}</text>
  <text x="72" y="414" class="display" fill="${text}">${esc(title2)}</text>
  ${badgeSvg.replace('y="390"', 'y="460"').replace('y="418"', 'y="488"')}
  <text x="72" y="560" class="body" fill="${muted}">${esc(body[0])}</text>
  <text x="72" y="600" class="body" fill="${muted}">${esc(body[1])}</text>
  <rect x="72" y="680" width="${Math.max(230, cta.length * 15 + 100)}" height="64" rx="32" fill="${accent}"/><text x="${72 + Math.max(230, cta.length * 15 + 100) / 2}" y="720" class="cta" fill="#FFFFFF" text-anchor="middle">${esc(cta)}  →</text>
  <line x1="72" y1="840" x2="1008" y2="840" stroke="${dark ? '#477ECF' : '#D7E7FF'}"/>
  ${pillSvg.replaceAll('y="875"', 'y="895"').replaceAll('y="913"', 'y="933"').replaceAll('y="899"', 'y="919"')}
  <text x="1008" y="990" class="body" fill="${muted}" font-size="18" text-anchor="end">operixsuite.com</text>
  </svg>`;
}

const posts = [
  ['01-suite', frame({ eyebrow: 'OperiX Suite', title: 'One Suite.', title2: 'Complete Control.', body: ['Invoice, HR, reporting, and more —', 'connected in one workspace.'], cta: 'Explore the Suite', badge: 'The connected workspace', pills: ['Invoice', 'HR', 'Reports'] })],
  ['02-invoice', frame({ eyebrow: 'OperiX Invoice', title: 'Get paid.', title2: 'Stay in control.', body: ['Create, send, track, and manage', 'every invoice with less busywork.'], cta: 'See Invoice', badge: 'Invoicing, simplified', mark: invoiceMark, pills: ['Create', 'Track', 'Get paid'] })],
  ['03-hr', frame({ eyebrow: 'OperiX HR Office', title: 'People ops,', title2: 'made simple.', body: ['Employees, time, leave, payroll, and', 'records — all in one clear view.'], cta: 'See HR Office', badge: 'Built for better teams', mark: hrMark, pills: ['People', 'Time', 'Payroll'] })],
  ['04-operations', frame({ eyebrow: 'OperiX Suite', title: 'Make work', title2: 'flow better.', body: ['Bring your business operations into', 'one smarter, scalable system.'], cta: 'Book a Demo', badge: 'Built for modern business', dark: true, pills: ['Clarity', 'Speed', 'Scale'] })],
];

for (const [name, svg] of posts) {
  const svgPath = path.join(out, `operix-${name}.svg`);
  const pngPath = path.join(out, `operix-${name}.png`);
  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
}

console.log(`Built ${posts.length} social posts in ${out}`);
