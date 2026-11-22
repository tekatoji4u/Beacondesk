// Sao chép tài nguyên OCR (Tesseract) từ node_modules vào public/ocr để
// phục vụ cùng nguồn (same-origin) — không phụ thuộc CDN, chạy được offline.
import { mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });
mkdirSync(join(root, 'public', 'cv'), { recursive: true });

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz', 'vie.traineddata.gz'],
  // OpenCV.js cho công cụ Scan tài liệu → PDF
  ['node_modules/@techstark/opencv-js/dist/opencv.js', '../cv/opencv.js'],
];
for (const [src, name] of files) {
  const s = join(root, src), d = join(out, name);
  if (!existsSync(d) || statSync(d).size !== statSync(s).size) copyFileSync(s, d);
}
console.log('OCR and OpenCV assets ready in public/ocr, public/cv');
