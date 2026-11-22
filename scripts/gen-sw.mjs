// Sinh dist/sw.js: danh sách tệp cần lưu sẵn (precache) + phiên bản theo nội dung.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const all = walk(dist).map((p) => relative(dist, p).split('\\').join('/'));
// OCR (≈5 MB) và OpenCV (≈11 MB) chỉ tải khi dùng tới, hoặc khi người dùng bấm "Tải gói ngoại tuyến".
const isLazy = (p) => p.startsWith('ocr/') || p.startsWith('cv/') || /heic2any/.test(p);
const lazy = all.filter(isLazy);
const precache = all.filter((p) => !isLazy(p) && p !== 'sw.js' && !p.endsWith('.map'));
const hash = createHash('sha256');
for (const p of precache.sort()) hash.update(p).update(readFileSync(join(dist, p)));
const version = hash.digest('hex').slice(0, 12);

const tpl = readFileSync(join(root, 'src', 'sw-template.js'), 'utf8');
const out = tpl
  .replace('__VERSION__', JSON.stringify(version))
  .replace('__PRECACHE__', JSON.stringify(['./', ...precache.map((p) => './' + p)]))
  .replace('__LAZY__', JSON.stringify(lazy.map((p) => './' + p)));
writeFileSync(join(dist, 'sw.js'), out);
console.log(`sw.js: ${precache.length} tệp lưu sẵn, ${lazy.length} tệp OCR tải khi cần, phiên bản ${version}`);
