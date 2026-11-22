// Bộ nhận dạng chữ (Tesseract, tiếng Việt) chạy hoàn toàn trên máy.
// Bản web: tệp OCR nằm ở ocr/ (service worker lưu lại). Bản một tệp: nhúng sẵn.
import { getAsset } from './assets.js';
import { grayArray, putGray, autoContrast } from './image.js';

let poolP = null;

/** Số worker chạy song song: 2 nếu máy đủ mạnh, ngược lại 1. */
function workerCount() {
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  return cores >= 4 && mem >= 4 ? 2 : 1;
}

/** Khởi tạo (một lần) và trả về {scheduler, n}. onStatus(text, fraction) báo tiến độ nạp. */
export function getOcr(onStatus) {
  poolP ||= (async () => {
    const T = await import('tesseract.js');
    const { createWorker, createScheduler } = T.default || T;
    const base = __SINGLE__
      ? { workerPath: await getAsset('ocrWorker'), corePath: 'https://beacondesk.local/ocr/core.js', langPath: 'https://beacondesk.local/ocr' }
      : { workerPath: await getAsset('ocrWorker'), corePath: await getAsset('ocrCoreDir'), langPath: await getAsset('ocrCoreDir') };
    const n = workerCount();
    const scheduler = createScheduler();
    const label = { 'loading tesseract core': 'Đang nạp bộ nhận dạng', 'loading language traineddata': 'Đang nạp dữ liệu tiếng Việt', 'initializing api': 'Đang khởi động' };
    for (let i = 0; i < n; i++) {
      const w = await createWorker('vie', 1, {
        ...base,
        workerBlobURL: false,
        cacheMethod: 'none',
        gzip: true,
        logger: (m) => { if (label[m.status]) onStatus?.(`${label[m.status]}${n > 1 ? ` (${i + 1}/${n})` : ''}…`, (i + (m.progress || 0)) / n); },
        errorHandler: (e) => console.warn('OCR', e),
      });
      await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      scheduler.addWorker(w);
    }
    return { scheduler, n };
  })().catch((e) => {
    poolP = null;
    throw new Error('Không khởi động được bộ nhận dạng chữ. ' + (navigator.onLine ? '' : 'Thiết bị đang mất mạng và gói OCR chưa được tải về (vào Cài đặt → Tải gói ngoại tuyến). ') + (e?.message || ''));
  });
  return poolP;
}

/** Giải phóng bộ nhớ (gọi khi huỷ hoặc rời công cụ lâu). */
export async function stopOcr() {
  const p = poolP;
  poolP = null;
  if (p) await (await p.catch(() => null))?.scheduler.terminate().catch(() => {});
}

/** Nhận dạng một canvas. Trả về {text, conf, lines:[{t,x0,x1,y (chân chữ),s,words:[{t,x0,y0,x1,y1}]}]}. */
export async function recognize(canvas) {
  const { scheduler } = await getOcr();
  const { data } = await scheduler.addJob('recognize', canvas, {}, { text: true, blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    const words = l.words.filter((w) => w.text.trim()).map((w) => ({ t: w.text.normalize('NFC'), conf: w.confidence, ...w.bbox }));
    if (!words.length) continue;
    // y = đường chân chữ, s = chiều cao dòng: ổn định hơn khung bao (bị dấu tiếng Việt làm cao lên)
    const y = l.baseline?.y0 ?? l.bbox.y1;
    const s = l.rowAttributes?.rowHeight || (l.bbox.y1 - l.bbox.y0) * 0.8;
    lines.push({ t: cleanLine(words.map((w) => w.t).join(' ')), x0: l.bbox.x0, x1: l.bbox.x1, y, s, bold: false, words });
  }
  const wc = lines.flatMap((l) => l.words);
  const conf = wc.length ? wc.reduce((a, w) => a + w.conf, 0) / wc.length : 0;
  return { text: data.text.normalize('NFC'), conf, lines };
}

/** Sửa lỗi khoảng trắng hay gặp sau OCR. */
function cleanLine(s) {
  return s
    .replace(/\s+([,.;:!?%)\]”])/g, '$1')
    .replace(/([(\[“])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Thử 4 hướng trên ảnh thu nhỏ, chọn hướng có độ tin cậy cao nhất. Trả về canvas đã xoay. */
export async function fixOrientation(c) {
  const S = Math.min(1, 1400 / Math.max(c.width, c.height));
  const small = document.createElement('canvas');
  small.width = Math.round(c.width * S); small.height = Math.round(c.height * S);
  small.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0, small.width, small.height);
  putGray(small, autoContrast(grayArray(small)));
  const score = async (deg) => {
    const r = await recognize(rot90(small, deg));
    const words = r.lines.flatMap((l) => l.words).filter((w) => w.t.length > 1);
    return words.length ? (r.conf * Math.min(1, words.length / 20)) : 0;
  };
  const s0 = await score(0);
  if (s0 > 70) return c; // đã đúng chiều: bỏ qua cho nhanh
  let best = 0, bs = s0;
  for (const d of [90, 180, 270]) { const s = await score(d); if (s > bs + 8) { bs = s; best = d; } }
  small.width = small.height = 0;
  return best ? rot90(c, best) : c;
}
export function rot90(c, deg) {
  if (!deg) return c;
  const o = document.createElement('canvas');
  const swap = deg === 90 || deg === 270;
  o.width = swap ? c.height : c.width; o.height = swap ? c.width : c.height;
  const g = o.getContext('2d');
  g.translate(o.width / 2, o.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

/**
 * Vẽ lớp chữ ẩn (tìm kiếm, bôi đen, copy được) lên trang PDF.
 * Ảnh rộng h điểm ảnh được đặt tại (x, y) với tỉ lệ s (pt / điểm ảnh).
 */
export function drawOcrText(page, font, lines, { x = 0, y = 0, s, h }) {
  for (const l of lines) for (const w of l.words) {
    const t = safeText(font, w.t);
    if (!t) continue;
    const bw = (w.x1 - w.x0) * s, lh = l.s * s;
    const unit = font.widthOfTextAtSize(t, 1) || 1;
    const size = Math.max(1, Math.min(lh * 1.5, bw / unit));
    page.drawText(t, { x: x + w.x0 * s, y: y + (h - l.y) * s, size, font, opacity: 0 });
  }
}
function safeText(font, t) {
  try { font.encodeText(t); return t; } catch { return [...t].filter((ch) => { try { font.encodeText(ch); return true; } catch { return false; } }).join(''); }
}
