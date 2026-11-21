// Nén PDF — 3 mức:
//  · Cân bằng (mới): nén lại ẢNH bên trong PDF, GIỮ NGUYÊN lớp chữ và đường nét.
//  · Mạnh: dựng lại mỗi trang thành ảnh (nhỏ nhất, mất lớp chữ).
//  · Nhẹ: chỉ dọn cấu trúc tệp.
import { PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, PDFRef } from 'pdf-lib';
import pako from 'pako';
import { h, seg, select, checkbox, field, fmtSize, tick } from '../../core/ui.js';
import { PDFDocument, savePdf, openPdfjs, renderPage, canvasToBlob } from '../../core/pdf.js';
import { pdfTool, pdfOut } from './common.js';

const N = (s) => PDFName.of(s);

export function compress() {
  return pdfTool({
    title: 'Nén dung lượng PDF', sub: 'Giảm dung lượng để gửi email, nộp hồ sơ trực tuyến. Tệp gốc không bị thay đổi.', label: 'Nén PDF', icon: 'shrink',
    options() {
      const mode = seg([{ value: 'balanced', label: 'Cân bằng (giữ chữ)' }, { value: 'strong', label: 'Mạnh (thành ảnh)' }, { value: 'light', label: 'Nhẹ' }], 'balanced', () => sync());
      const level = select([{ value: 'small', label: 'Nhỏ nhất — đọc trên màn hình' }, { value: 'mid', label: 'Cân bằng — khuyên dùng' }, { value: 'print', label: 'Rõ nét — in được' }], 'mid');
      const gray = checkbox('Chuyển ảnh sang thang xám (giảm thêm nhiều với tài liệu scan)');
      const n1 = h('div', { class: 'notice info' }, 'Nén lại các ảnh trong tệp (ảnh scan, ảnh chụp) nhưng giữ nguyên chữ để vẫn tìm kiếm, sao chép được. Phù hợp hầu hết tài liệu.');
      const n2 = h('div', { class: 'notice' }, 'Mỗi trang thành một ảnh: nhỏ nhất nhưng không còn chọn / sao chép được chữ. Hãy giữ lại bản gốc.');
      const n3 = h('div', { class: 'notice info' }, 'Chỉ dọn cấu trúc tệp, thường giảm 0–20%. Dùng khi tệp chủ yếu là chữ.');
      const sync = () => { const m = mode.get(); n1.hidden = m !== 'balanced'; n2.hidden = m !== 'strong'; n3.hidden = m !== 'light'; level.parentElement.parentElement.hidden = m === 'light'; gray.el.hidden = m === 'light'; };
      const el = h('div', null, field('Mức nén', mode.el), h('div', { class: 'grid2' }, field('Chất lượng', level)), gray.el, n1, n2, n3);
      queueMicrotask(sync);
      return { el, read: () => ({ mode: mode.get(), level: level.value, gray: gray.get() }) };
    },
    async action({ file, doc, opts, base, progress }) {
      let blob;
      if (opts.mode === 'light') {
        blob = await savePdf(doc);
      } else if (opts.mode === 'strong') {
        blob = await rasterize(file, opts, progress);
      } else {
        const n = await recompressImages(doc, opts, progress);
        progress(95, 'Đang lưu tệp…');
        blob = await savePdf(doc);
        if (!n) return finish(file, blob, base, 'Không có ảnh nào cần nén — tệp chủ yếu là chữ, đã dọn cấu trúc.');
      }
      return finish(file, blob, base);
    },
  });
}

function finish(file, blob, base, extra = '') {
  const ratio = 1 - blob.size / file.size;
  const note = ratio > 0.01 ? `giảm ${Math.round(ratio * 100)}% (từ ${fmtSize(file.size)})` : 'không giảm thêm được — tệp đã khá gọn';
  return { outs: [pdfOut(ratio > 0 ? blob : file, `${base}_nen.pdf`)], note: [note, extra].filter(Boolean).join(' · ') };
}

const LEVEL = { small: { maxPx: 1200, q: 0.55, dpi: 100 }, mid: { maxPx: 1700, q: 0.68, dpi: 130 }, print: { maxPx: 2500, q: 0.8, dpi: 200 } };

async function rasterize(file, opts, progress) {
  const L = LEVEL[opts.level];
  const src = await openPdfjs(file);
  const out = await PDFDocument.create();
  for (let i = 1; i <= src.numPages; i++) {
    progress((i / src.numPages) * 90, `Đang dựng trang ${i}/${src.numPages}`);
    await tick();
    const p = await src.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const c = await renderPage(p, L.dpi / 72);
    if (opts.gray) toGray(c);
    const jpg = await canvasToBlob(c, 'image/jpeg', L.q);
    const img = await out.embedJpg(await jpg.arrayBuffer());
    const page = out.addPage([vp.width, vp.height]);
    page.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    c.width = c.height = 0;
  }
  src.destroy();
  return savePdf(out);
}

function toGray(c) {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) { const g = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) | 0; a[i] = a[i + 1] = a[i + 2] = g; }
  ctx.putImageData(d, 0, 0);
}

// ---------- Nén ảnh bên trong PDF ----------
function nameOf(o) { return o instanceof PDFName ? o.asString().slice(1) : null; }
function filters(dict) {
  const f = dict.lookup(N('Filter'));
  if (!f) return [];
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(dict.context.lookup(x)));
  return [nameOf(f)];
}
function colorInfo(dict) {
  const cs = dict.lookup(N('ColorSpace'));
  if (!cs) return null;
  const n = nameOf(cs);
  if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
  if (n === 'DeviceGray' || n === 'CalGray') return 1;
  if (cs instanceof PDFArray) {
    const kind = nameOf(cs.lookup(0));
    if (kind === 'ICCBased') {
      const icc = cs.lookup(1);
      const nn = icc?.dict?.lookup(N('N'));
      const v = nn instanceof PDFNumber ? nn.asNumber() : 0;
      return v === 3 || v === 1 ? v : null;
    }
    if (kind === 'CalRGB') return 3;
    if (kind === 'CalGray') return 1;
  }
  return null; // CMYK, Indexed, Separation… → bỏ qua cho an toàn
}
const numOf = (d, k) => { const v = d.lookup(N(k)); return v instanceof PDFNumber ? v.asNumber() : 0; };

function unpredict(data, width, colors, predictor) {
  if (predictor < 10) return predictor === 1 ? data : null;
  const row = width * colors;
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  for (let y = 0; y < rows; y++) {
    const ft = data[y * (row + 1)];
    const src = y * (row + 1) + 1;
    const dst = y * row;
    for (let x = 0; x < row; x++) {
      const raw = data[src + x];
      const left = x >= colors ? out[dst + x - colors] : 0;
      const up = y > 0 ? out[dst - row + x] : 0;
      const ul = y > 0 && x >= colors ? out[dst - row + x - colors] : 0;
      let v;
      switch (ft) {
        case 0: v = raw; break;
        case 1: v = raw + left; break;
        case 2: v = raw + up; break;
        case 3: v = raw + ((left + up) >> 1); break;
        case 4: { const p = left + up - ul; const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul); break; }
        default: return null;
      }
      out[dst + x] = v & 255;
    }
  }
  return out;
}

async function decodeImage(stream, dict, fl) {
  const w = numOf(dict, 'Width'), hgt = numOf(dict, 'Height');
  if (fl.length === 1 && fl[0] === 'DCTDecode') {
    const bmp = await createImageBitmap(new Blob([stream.contents], { type: 'image/jpeg' }));
    return { bmp, w: bmp.width, h: bmp.height };
  }
  if (fl.length === 1 && fl[0] === 'FlateDecode') {
    if (numOf(dict, 'BitsPerComponent') !== 8) return null;
    const colors = colorInfo(dict);
    if (!colors) return null;
    let data = pako.inflate(stream.contents);
    const parms = dict.lookup(N('DecodeParms'));
    if (parms instanceof PDFDict) {
      const pred = numOf(parms, 'Predictor') || 1;
      data = unpredict(data, w, colors, pred);
      if (!data) return null;
    }
    if (data.length < w * hgt * colors) return null;
    const id = new ImageData(w, hgt);
    const a = id.data;
    for (let i = 0, j = 0; i < w * hgt; i++, j += colors) {
      a[i * 4] = data[j]; a[i * 4 + 1] = data[j + (colors === 3 ? 1 : 0)]; a[i * 4 + 2] = data[j + (colors === 3 ? 2 : 0)]; a[i * 4 + 3] = 255;
    }
    return { bmp: await createImageBitmap(id), w, h: hgt };
  }
  return null;
}

async function recompressImages(doc, opts, progress) {
  const L = LEVEL[opts.level];
  const ctx = doc.context;
  const list = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(N('Subtype')) === N('Image'));
  let changed = 0;
  for (let k = 0; k < list.length; k++) {
    const [ref, obj] = list[k];
    progress(5 + (k / Math.max(1, list.length)) * 85, `Đang nén ảnh ${k + 1}/${list.length}`);
    if (k % 3 === 0) await tick();
    const d = obj.dict;
    if (obj.contents.length < 24 * 1024) continue; // ảnh nhỏ: bỏ qua
    if (d.lookup(N('ImageMask')) || d.lookup(N('Decode')) || d.lookup(N('Mask')) instanceof PDFArray) continue;
    const fl = filters(d);
    if (fl[0] === 'DCTDecode' && !colorInfo(d)) continue; // JPEG CMYK…
    let img;
    try { img = await decodeImage(obj, d, fl); } catch { img = null; }
    if (!img) continue;
    const s = Math.min(1, L.maxPx / Math.max(img.w, img.h));
    const c = new OffscreenCanvas(Math.max(1, Math.round(img.w * s)), Math.max(1, Math.round(img.h * s)));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img.bmp, 0, 0, c.width, c.height);
    img.bmp.close?.();
    let gray = opts.gray;
    if (gray) {
      const id = g.getImageData(0, 0, c.width, c.height); const a = id.data;
      for (let i = 0; i < a.length; i += 4) { const v = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) | 0; a[i] = a[i + 1] = a[i + 2] = v; }
      g.putImageData(id, 0, 0);
    }
    const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: L.q })).arrayBuffer());
    if (jpg.length > obj.contents.length * 0.9) continue; // không lợi: giữ nguyên
    const nd = d.clone(ctx);
    nd.set(N('Filter'), N('DCTDecode'));
    nd.delete(N('DecodeParms'));
    nd.set(N('Width'), PDFNumber.of(c.width));
    nd.set(N('Height'), PDFNumber.of(c.height));
    nd.set(N('BitsPerComponent'), PDFNumber.of(8));
    nd.set(N('ColorSpace'), N('DeviceRGB'));
    ctx.assign(ref, PDFRawStream.of(nd, jpg));
    changed++;
  }
  return changed;
}
