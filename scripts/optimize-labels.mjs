// Turns print-resolution label files into web-ready source images.
//
//   print-originals/<name>.png  →  src/assets/labels/<name>.webp
//
// Longest side capped at 2048px, high-quality WebP with transparency kept. Only files that
// are new or changed are processed. Run with `npm run labels`.
import sharp from 'sharp';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'print-originals';
const OUT = 'src/assets/labels';
const MAX = 2048;
const QUALITY = 90;

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f));
let before = 0;
let after = 0;

for (const file of files) {
  const input = path.join(SRC, file);
  const output = path.join(OUT, `${path.parse(file).name}.webp`);
  const inStat = await stat(input);
  const outStat = await stat(output).catch(() => null);
  if (outStat && outStat.mtimeMs >= inStat.mtimeMs) continue;

  const info = await sharp(input)
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(output);
  before += inStat.size;
  after += info.size;
  console.log(`${file.padEnd(22)} ${(inStat.size / 1e6).toFixed(2)} MB → ${(info.size / 1e3).toFixed(0)} KB  (${info.width}×${info.height})`);
}

if (before) console.log(`\nTotal ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
else console.log('All labels up to date.');
