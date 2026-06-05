const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const width = 560;
const height = 360;

function createSvg(scale) {
  const s = (n) => n * scale;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s(width)}" height="${s(height)}">
  <!-- Background -->
  <rect width="${s(width)}" height="${s(height)}" fill="#EEF3FA"/>

  <!-- Card border + panel -->
  <rect x="${s(27)}" y="${s(27)}" width="${s(506)}" height="${s(306)}" rx="${s(19)}" fill="#ADBDE6"/>
  <rect x="${s(29)}" y="${s(29)}" width="${s(502)}" height="${s(302)}" rx="${s(17)}" fill="white"/>

  <!-- Icon placeholders -->
  <rect x="${s(95)}" y="${s(160)}" width="${s(100)}" height="${s(100)}" rx="${s(20)}" fill="#CEE0FF"/>
  <rect x="${s(365)}" y="${s(160)}" width="${s(100)}" height="${s(100)}" rx="${s(20)}" fill="#CEE0FF"/>

  <!-- Guide text -->
  <text x="${s(280)}" y="${s(177)}"
        text-anchor="middle"
        font-family="-apple-system, Helvetica Neue, Arial, sans-serif"
        font-size="${s(13)}"
        fill="#97A4B8">Drag to Applications</text>

  <!-- Arrow shaft -->
  <line x1="${s(215)}" y1="${s(205)}" x2="${s(309)}" y2="${s(205)}"
        stroke="#005CE6" stroke-width="${s(10)}" stroke-linecap="round"/>

  <!-- Arrowhead -->
  <polygon points="${s(309)},${s(189)} ${s(345)},${s(205)} ${s(309)},${s(221)}" fill="#005CE6"/>
</svg>`;
}

async function createBackground(scale, fileName) {
  const outDir = path.join(__dirname, 'resources');
  fs.mkdirSync(outDir, { recursive: true });

  await sharp(Buffer.from(createSvg(scale)))
    .png()
    .toFile(path.join(outDir, fileName));
}

async function main() {
  await createBackground(1, 'background.png');
  await createBackground(2, 'background@2x.png');
}

main().catch((err) => { console.error(err); process.exit(1); });
