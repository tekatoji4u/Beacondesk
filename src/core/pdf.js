// Hàm dùng chung cho PDF: mở tệp (pdf-lib, pdf.js), vẽ trang, phông tiếng Việt,
// và đặt nội dung đúng vị trí kể cả khi trang bị xoay (/Rotate) hoặc có CropBox.
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { getAsset } from './assets.js';

export { PDFDocument, degrees, rgb };

export async function loadPdf(file, { ignoreEncryption = false } = {}) {
  const buf = file instanceof ArrayBuffer || ArrayBuffer.isView(file) ? file : await file.arrayBuffer();
  try {
    return await PDFDocument.load(buf, { ignoreEncryption, updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error(`"${file.name || 'Tệp'}" đang đặt mật khẩu. Hãy bỏ mật khẩu rồi thử lại.`);
    throw new Error(`Không đọc được "${file.name || 'tệp'}" (tệp hỏng hoặc không phải PDF).`);
  }
}
export async function savePdf(doc) {
  doc.setProducer('BeaconDesk – Powered by Hải Đăng');
  doc.setModificationDate(new Date());
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---------- pdf.js (đọc và vẽ trang) ----------
let pdfjsP;
export function pdfjs() {
  pdfjsP ||= (async () => {
    const lib = await import('pdfjs-dist');
    if (__SINGLE__) {
      // file:// không chạy được module worker từ blob: — pdf.js chạy trên luồng chính
      globalThis.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
    } else {
      lib.GlobalWorkerOptions.workerPort = new Worker(await getAsset('pdfWorker'), { type: 'module' });
    }
    return lib;
  })().catch((e) => { pdfjsP = null; throw e; });
  return pdfjsP;
}
export async function openPdfjs(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(file instanceof Blob ? await file.arrayBuffer() : file);
  try {
    const task = lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true, disableFontFace: false });
    const doc = await task.promise;
    // pdf.js mới bỏ doc.destroy(): giải phóng qua loadingTask
    if (typeof doc.destroy !== 'function') doc.destroy = () => task.destroy();
    return doc;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error(`"${file.name || 'Tệp'}" đang đặt mật khẩu. Hãy bỏ mật khẩu rồi thử lại.`);
    throw new Error(`Không đọc được "${file.name || 'tệp'}" (tệp hỏng hoặc không phải PDF).`);
  }
}
/** Vẽ một trang ra canvas. scale = pixel / point (1 = 72 dpi). */
export async function renderPage(page, scale, { maxSide = 4000, background = '#fff', rotation } = {}) {
  let vp = page.getViewport({ scale, rotation: rotation ?? page.rotate });
  const big = Math.max(vp.width, vp.height);
  if (big > maxSide) vp = page.getViewport({ scale: scale * (maxSide / big), rotation: rotation ?? page.rotate });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width));
  c.height = Math.max(1, Math.round(vp.height));
  const ctx = c.getContext('2d', { willReadFrequently: false });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  return c;
}
export const canvasToBlob = (c, type = 'image/jpeg', q = 0.85) => new Promise((r) => c.toBlob(r, type, q));

// ---------- Phông chữ tiếng Việt ----------
let fontBytes;
export async function embedVnFonts(doc) {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  doc.registerFontkit(fontkit);
  fontBytes ||= Promise.all(['fontRegular', 'fontBold', 'fontItalic'].map((k) => getAsset(k).then((u) => fetch(u)).then((r) => r.arrayBuffer())));
  const [r, b, i] = await fontBytes;
  return {
    regular: await doc.embedFont(r, { subset: true }),
    bold: await doc.embedFont(b, { subset: true }),
    italic: await doc.embedFont(i, { subset: true }),
  };
}

// ---------- Hình học trang (xử lý /Rotate và CropBox) ----------
/** Kích thước trang như người xem nhìn thấy (đã tính xoay và vùng cắt). */
export function visualBox(page) {
  const cb = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  return { x: cb.x, y: cb.y, w: cb.width, h: cb.height, rot: r, vw: swap ? cb.height : cb.width, vh: swap ? cb.width : cb.height };
}
/** Đổi toạ độ "nhìn thấy" (gốc trên-trái, đơn vị pt) sang toạ độ PDF. */
export function toPdf(box, vx, vy) {
  const { x, y, w, h, rot } = box;
  switch (rot) {
    case 90: return { x: x + vy, y: y + vx };
    case 180: return { x: x + w - vx, y: y + vy };
    case 270: return { x: x + w - vy, y: y + h - vx };
    default: return { x: x + vx, y: y + h - vy };
  }
}
/**
 * Vị trí vẽ một hộp (vx, vy, rộng, cao theo hướng nhìn) để nội dung hiện thẳng đứng.
 * Trả về {x, y, rotate} dùng cho drawImage/drawText (gốc = góc dưới-trái của hộp).
 */
export function placeBox(box, vx, vy, bw, bh) {
  const p = toPdf(box, vx, vy + bh);
  return { x: p.x, y: p.y, rotate: degrees(box.rot) };
}
/** Vẽ một dòng chữ với gốc ở (vx, baselineVy) theo hướng nhìn, có thể xoay thêm. */
export function placeText(box, vx, vy, extraDeg = 0) {
  const p = toPdf(box, vx, vy);
  return { x: p.x, y: p.y, rotate: degrees(box.rot + extraDeg) };
}

export function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0, 0, 0);
}
export const MM = 72 / 25.4;
