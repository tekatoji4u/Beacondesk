// Dàn trang văn bản (khối nội dung) lên khổ A4 bằng pdf-lib với phông tiếng Việt.
import { PDFDocument, rgb, degrees, savePdf, embedVnFonts, loadPdf, MM } from './pdf.js';

const A4 = [595.28, 841.89];

/**
 * @param blocks khối nội dung từ text.js
 * @param o {size, margin:{top,bottom,left,right} (mm), pageNumbers, lineGap}
 */
export async function blocksToPdf(blocks, { size = 13, margin = { top: 20, bottom: 20, left: 30, right: 15 }, pageNumbers = true, lineGap = 1.3 } = {}) {
  const doc = await PDFDocument.create();
  const F = await embedVnFonts(doc);
  const L = margin.left * MM, R = A4[0] - margin.right * MM, T = A4[1] - margin.top * MM, B = margin.bottom * MM;
  const W = R - L;
  let page, y;
  const black = rgb(0, 0, 0);
  const newPage = () => { page = doc.addPage(A4); y = T; };
  newPage();
  const width = (t, font, sz) => font.widthOfTextAtSize(t, sz);
  const safe = (font, t) => { try { font.encodeText(t); return t; } catch { return [...t].map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join(''); } };

  /** Chia chữ thành các dòng vừa khung rộng `w` (dòng đầu có thể thụt `first`). */
  function wrap(text, font, sz, w, first = 0) {
    const words = safe(font, text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = [], cw = 0, avail = w - first;
    const sp = width(' ', font, sz);
    for (const wd of words) {
      const ww = width(wd, font, sz);
      if (cur.length && cw + sp + ww > avail) { lines.push({ words: cur, avail }); cur = []; cw = 0; avail = w; }
      cw += (cur.length ? sp : 0) + ww; cur.push(wd);
    }
    if (cur.length) lines.push({ words: cur, avail, last: true });
    if (lines.length) lines.at(-1).last = true;
    return lines;
  }
  function para(text, { font = F.regular, sz = size, align = 'justify', first = 0, left = 0, before = 0, after = sz * 0.5, prefix = null } = {}) {
    const lh = sz * lineGap;
    const w = W - left;
    const lines = wrap(text, font, sz, w, first);
    y -= before;
    lines.forEach((ln, i) => {
      if (y - lh < B) newPage();
      y -= lh;
      const x0 = L + left + (i === 0 ? first : 0);
      if (i === 0 && prefix) page.drawText(prefix, { x: L + left - width(prefix, font, sz) - 2, y: y + sz * 0.25, size: sz, font, color: black });
      const total = ln.words.reduce((a, wd) => a + width(wd, font, sz), 0);
      const sp = width(' ', font, sz);
      const natural = total + sp * (ln.words.length - 1);
      let x = x0, gap = sp;
      if (align === 'center') x = L + left + (w - natural) / 2;
      else if (align === 'right') x = L + left + w - natural;
      else if (align === 'justify' && !ln.last && ln.words.length > 1) gap = (ln.avail - total) / (ln.words.length - 1);
      for (const wd of ln.words) { page.drawText(wd, { x, y: y + sz * 0.25, size: sz, font, color: black }); x += width(wd, font, sz) + gap; }
    });
    y -= after;
  }
  function table(rows) {
    const n = Math.max(...rows.map((r) => r.length));
    const cw = W / n, sz = size - 2, lh = sz * 1.25, pad = 3;
    for (const [ri, r] of rows.entries()) {
      const font = ri === 0 ? F.bold : F.regular;
      const cells = [...Array(n).keys()].map((j) => wrap(String(r[j] ?? ''), font, sz, cw - 2 * pad));
      const hgt = Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * pad;
      if (y - hgt < B) newPage();
      cells.forEach((c, j) => {
        const x = L + j * cw;
        page.drawRectangle({ x, y: y - hgt, width: cw, height: hgt, borderColor: black, borderWidth: 0.6 });
        c.forEach((ln, k) => page.drawText(ln.words.join(' '), { x: x + pad, y: y - pad - (k + 1) * lh + sz * 0.3, size: sz, font, color: black }));
      });
      y -= hgt;
    }
    y -= size * 0.6;
  }

  for (const b of blocks) {
    if (b.type === 'pagebreak') { newPage(); continue; }
    if (b.type === 'h') { if (y < B + size * 5) newPage(); para(b.text, { font: F.bold, sz: b.level === 1 ? size + 1 : size, align: b.level === 1 ? 'center' : 'left', before: size * 0.6, after: size * 0.4 }); continue; }
    if (b.type === 'li') { para(b.text, { left: 18, prefix: '•', after: size * 0.25 }); continue; }
    if (b.type === 'table') { table(b.rows); continue; }
    para(b.text, { font: b.bold ? F.bold : b.italic ? F.italic : F.regular, align: b.align === 'center' ? 'center' : b.align === 'right' ? 'right' : 'justify', first: b.align === 'center' ? 0 : 1 / 2.54 * 72 });
  }
  if (pageNumbers && doc.getPageCount() > 1) {
    doc.getPages().forEach((p, i) => { const t = String(i + 1); p.drawText(t, { x: (A4[0] - width(t, F.regular, 11)) / 2, y: B / 2 - 4, size: 11, font: F.regular, color: black }); });
  }
  return savePdf(doc);
}

/** Đặt từng trang PDF vào khổ A4 (co giãn giữ tỉ lệ, tự xoay dọc/ngang). */
export async function pdfToA4(file, { margin = 10 } = {}) {
  const src = await loadPdf(file);
  const doc = await PDFDocument.create();
  const m = margin * MM;
  for (const sp of src.getPages()) {
    const cb = sp.getCropBox();
    const ep = await doc.embedPage(sp, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height });
    const rot = ((sp.getRotation().angle % 360) + 360) % 360;
    const vw = rot % 180 ? ep.height : ep.width, vh = rot % 180 ? ep.width : ep.height;
    const [pw, ph] = vw > vh ? [A4[1], A4[0]] : A4;
    const s = Math.min((pw - 2 * m) / vw, (ph - 2 * m) / vh);
    const page = doc.addPage([pw, ph]);
    const w = vw * s, h = vh * s, x = (pw - w) / 2, y = (ph - h) / 2;
    // embedPage bỏ qua /Rotate: tự xoay lại để giữ hướng nhìn
    if (rot === 90) page.drawPage(ep, { x: x, y: y + h, xScale: s, yScale: s, rotate: degrees(-90) });
    else if (rot === 180) page.drawPage(ep, { x: x + w, y: y + h, xScale: s, yScale: s, rotate: degrees(180) });
    else if (rot === 270) page.drawPage(ep, { x: x + w, y: y, xScale: s, yScale: s, rotate: degrees(90) });
    else page.drawPage(ep, { x, y, xScale: s, yScale: s });
  }
  return savePdf(doc);
}
