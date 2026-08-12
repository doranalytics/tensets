// OG card: 1200×630, name + tagline on the accent. Run: node scripts/make-og.mjs
import sharp from 'sharp';

const svg = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0716"/>
      <stop offset="100%" stop-color="#07070b"/>
    </linearGradient>
    <radialGradient id="halo" cx="78%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#7c5cff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#7c5cff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#halo)"/>
  <circle cx="960" cy="200" r="130" fill="none" stroke="#1d1d2b" stroke-width="26"/>
  <path d="M960 70 A130 130 0 1 1 845 132" fill="none" stroke="#7c5cff" stroke-width="26" stroke-linecap="round"/>
  <text x="960" y="238" text-anchor="middle" font-family="monospace" font-size="110" font-weight="700" fill="#e8e8f2">10</text>
  <text x="90" y="330" font-family="monospace" font-size="104" font-weight="700" fill="#e8e8f2" letter-spacing="4">ten<tspan fill="#7c5cff">sets</tspan></text>
  <text x="92" y="410" font-family="sans-serif" font-size="38" fill="#8b8ba3">10 sets to failure, every body part, every week.</text>
  <text x="92" y="462" font-family="sans-serif" font-size="38" fill="#8b8ba3">Tap a set. Watch the body light up.</text>
  <text x="92" y="560" font-family="monospace" font-size="30" fill="#4c4c63">tensets.fit</text>
</svg>`);

await sharp(svg).png().toFile('app/opengraph-image.png');
console.log('app/opengraph-image.png written (1200x630)');
