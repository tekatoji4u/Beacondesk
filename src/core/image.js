// Đọc ảnh từ tệp (kể cả ảnh HEIC của iPhone) và các phép xử lý ảnh cơ bản.
import { ext } from './ui.js';

const isHeic = (f) => /^(heic|heif)$/.test(ext(f.name)) || /image\/hei[cf]/.test(f.type);

/** Trả về ImageBitmap đã xoay đúng theo EXIF. */
export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    if (isHeic(file)) {
      const { default: heic2any } = await import('heic2any');
      const jpg = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      return createImageBitmap(Array.isArray(jpg) ? jpg[0] : jpg);
    }
    throw new Error(`Không mở được ảnh "${file.name}" (định dạng không được hỗ trợ).`);
  }
}

/** Vẽ ảnh lên canvas, co giãn để cạnh dài nằm trong [min, max] pixel. */
export function toCanvas(bmp, { min = 0, max = 4000 } = {}) {
  const w = bmp.width, h = bmp.height, big = Math.max(w, h);
  let s = 1;
  if (big > max) s = max / big; else if (min && big < min) s = Math.min(2.5, min / big);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export function grayArray(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const g = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  return g;
}
export function putGray(c, g) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const id = ctx.createImageData(c.width, c.height);
  const d = id.data;
  for (let i = 0, j = 0; j < g.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = g[j]; d[i + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Kéo giãn độ tương phản (cắt 2% hai đầu histogram). */
export function autoContrast(g) {
  const hist = new Uint32Array(256);
  for (const v of g) hist[v]++;
  const cut = g.length * 0.02;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cut) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cut) { hi = i; break; } }
  if (hi - lo < 30) return g;
  const k = 255 / (hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, (g[i] - lo) * k));
  return g;
}

/** Nhị phân hoá thích nghi (Sauvola gần đúng bằng ảnh tích phân) — tốt cho ảnh chụp đổ bóng. */
export function adaptiveBinarize(g, w, h, { win = 0, k = 0.2 } = {}) {
  const r = win || Math.max(8, Math.round(Math.min(w, h) / 40));
  const I = new Float64Array((w + 1) * (h + 1));
  const I2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let s = 0, s2 = 0;
    for (let x = 1; x <= w; x++) {
      const v = g[(y - 1) * w + (x - 1)];
      s += v; s2 += v * v;
      I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + s;
      I2[y * (w + 1) + x] = I2[(y - 1) * (w + 1) + x] + s2;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const A = y1 * (w + 1) + x1, B = y0 * (w + 1) + x1, C = y1 * (w + 1) + x0, D = y0 * (w + 1) + x0;
      const sum = I[A] - I[B] - I[C] + I[D];
      const sum2 = I2[A] - I2[B] - I2[C] + I2[D];
      const m = sum / n;
      const sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
      const t = m * (1 + k * (sd / 128 - 1));
      out[y * w + x] = g[y * w + x] > t ? 255 : 0;
    }
  }
  return out;
}

/** Ước lượng góc nghiêng của dòng chữ (độ, trong ±maxDeg) bằng phép chiếu ngang. */
export function detectSkew(c, maxDeg = 8) {
  const S = 900 / Math.max(c.width, c.height);
  const w = Math.max(50, Math.round(c.width * Math.min(1, S))), h = Math.max(50, Math.round(c.height * Math.min(1, S)));
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  t.getContext('2d').drawImage(c, 0, 0, w, h);
  const g = grayArray(t);
  let sum = 0;
  for (const v of g) sum += v;
  const thr = (sum / g.length) * 0.75;
  const pts = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 2) if (g[y * w + x] < thr) pts.push(x, y);
  if (pts.length < 200) return 0;
  const score = (deg) => {
    const a = (deg * Math.PI) / 180, sn = Math.sin(a), cs = Math.cos(a);
    const bins = new Float64Array(h * 2 + w);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.round(pts[i + 1] * cs - pts[i] * sn) + w;
      if (yy >= 0 && yy < bins.length) bins[yy]++;
    }
    let s = 0;
    for (let i = 1; i < bins.length; i++) { const d = bins[i] - bins[i - 1]; s += d * d; }
    return s;
  };
  let best = 0, bs = -1;
  for (let d = -maxDeg; d <= maxDeg; d += 0.5) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  for (let d = best - 0.5; d <= best + 0.5; d += 0.1) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  return Math.abs(best) < 0.15 ? 0 : best;
}

/** Xoay canvas một góc (độ), nền trắng. */
export function rotateCanvas(c, deg) {
  if (!deg) return c;
  const a = (deg * Math.PI) / 180;
  const sn = Math.abs(Math.sin(a)), cs = Math.abs(Math.cos(a));
  const w = Math.round(c.width * cs + c.height * sn), hh = Math.round(c.width * sn + c.height * cs);
  const o = document.createElement('canvas');
  o.width = w; o.height = hh;
  const g = o.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh);
  g.translate(w / 2, hh / 2); g.rotate(a); g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
