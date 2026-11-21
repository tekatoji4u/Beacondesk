// Bộ nhận dạng chữ (Tesseract, tiếng Việt) chạy hoàn toàn trên máy.
// Bản web: tệp OCR nằm ở ocr/ (service worker lưu lại). Bản một tệp: nhúng sẵn.
import { getAsset } from './assets.js';

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
