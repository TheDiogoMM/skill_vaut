import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, '../src/assets/logo-symbol.png');
const outDir = path.join(__dirname, '../public');

// #0f1115 (--color-bg from the dark theme)
const BACKGROUND = { r: 15, g: 17, b: 21, alpha: 1 };

async function makeIcon(size, logoScale, filename) {
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, filename));

  console.log(`Wrote ${filename}`);
}

// 65% fill matches the padded "respiro" treatment approved during brainstorming.
await makeIcon(192, 0.65, 'icon-192.png');
await makeIcon(512, 0.65, 'icon-512.png');
// Maskable icons need extra safe-zone margin so Android doesn't clip the logo
// when applying a circle/squircle mask, hence the smaller 50% fill here.
await makeIcon(512, 0.5, 'icon-512-maskable.png');
