// Đọc nội dung tài liệu (PDF có lớp chữ, Word .docx, .txt) thành các khối có cấu trúc:
//   {type:'h', level, text} | {type:'p', text, align, bold} | {type:'li', text} | {type:'table', rows} | {type:'pagebreak'}
import { ext } from './ui.js';
import { openPdfjs } from './pdf.js';

export async function readDocument(file, onProgress) {
  const e = ext(file.name);
  if (e === 'pdf') return readPdf(file, onProgress);
  if (e === 'docx') return readDocx(file);
  if (e === 'txt' || e === 'md' || file.type.startsWith('text/')) return fromPlain(await file.text(), file.name);
  if (e === 'doc') throw new Error('Định dạng .doc cũ chưa được hỗ trợ. Hãy mở bằng Word và lưu lại thành .docx.');
  throw new Error('Định dạng không được hỗ trợ: .' + e);
}

export function fromPlain(text, name = '') {
  const paras = text.replace(/\r/g, '').split(/\n{2,}|\n(?=\s*(?:[-•+*]|\d+[.)])\s)/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const blocks = paras.map((t) => classify(t));
  return { blocks, title: guessTitle(blocks, name), source: 'text' };
}

function classify(t) {
  if (/^([-•+*]|\d{1,2}[.)]|[a-zđ][)])\s+/.test(t) && t.length < 400) return { type: 'li', text: t.replace(/^[-•+*]\s+/, '') };
  if (t.length < 120 && isUpper(t) && t.length > 3) return { type: 'h', level: 1, text: t };
  if (/^(Chương|Phần|Mục|Điều)\s+[\dIVXLC]+/i.test(t) && t.length < 160) return { type: 'h', level: 2, text: t };
  if (/^([IVXLC]+|\d+)\.\s+\S/.test(t) && t.length < 140 && !/[.;:]$/.test(t)) return { type: 'h', level: 2, text: t };
  return { type: 'p', text: t };
}
export const isUpper = (t) => {
  const L = t.match(/\p{L}/gu) || [];
  return L.length >= 4 && L.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / L.length >= 0.85;
};
function guessTitle(blocks, name) {
  const h = blocks.find((b) => b.type === 'h');
  return (h?.text || blocks[0]?.text || name.replace(/\.[^.]+$/, '')).slice(0, 140);
}

// ---------------- PDF ----------------
export async function readPdf(file, onProgress) {
  const doc = await openPdfjs(file);
  const pages = [];
  let chars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(i, doc.numPages);
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const [a, b, , , e, f] = it.transform;
      if (Math.abs(b) > Math.abs(a) * 0.3) continue; // bỏ chữ xoay dọc
      const [x, y] = vp.convertToViewportPoint(e, f);
      const size = Math.hypot(a, b) || it.height || 10;
      const font = tc.styles[it.fontName]?.fontFamily || '';
      items.push({ x, y, w: it.width * (vp.scale || 1), s: size, t: it.str, bold: /bold|black|heavy|semibold/i.test(it.fontName + ' ' + font) });
      chars += it.str.trim().length;
    }
    pages.push({ n: i, w: vp.width, h: vp.height, lines: toLines(items) });
  }
  doc.destroy();
  const scanned = chars < doc.numPages * 25;
  const blocks = scanned ? [] : linesToBlocks(pages);
  return { blocks, title: guessTitle(blocks, file.name), source: 'pdf', scanned, pages };
}

/** Gom các mẩu chữ thành dòng (theo toạ độ y), rồi nối theo x. */
export function toLines(items) {
  items.sort((p, q) => p.y - q.y || p.x - q.x);
  const lines = [];
  for (const it of items) {
    const L = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.s, it.s) * 0.45));
    if (L) { L.it.push(it); L.s = Math.max(L.s, it.s); } else lines.push({ y: it.y, s: it.s, it: [it] });
  }
  for (const l of lines) {
    l.it.sort((p, q) => p.x - q.x);
    let t = '', end = null;
    for (const it of l.it) {
      if (end != null) {
        const gap = it.x - end;
        if (gap > it.s * 0.18 && !/\s$/.test(t) && !/^\s/.test(it.t)) t += gap > it.s * 2.5 ? '\t' : ' ';
      }
      t += it.t;
      end = it.x + it.w;
    }
    l.t = t.replace(/[  ]{2,}/g, ' ').trim();
    l.x0 = l.it[0].x;
    l.x1 = end;
    l.bold = l.it.every((i) => i.bold || !i.t.trim());
  }
  return lines.filter((l) => l.t).sort((a, b) => a.y - b.y);
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

export function linesToBlocks(pages, { keepPageBreaks = false } = {}) {
  const all = pages.flatMap((p) => p.lines);
  const body = median(all.map((l) => l.s)) || 11;
  const left = median(all.map((l) => l.x0));
  const right = median(all.map((l) => l.x1));
  const width = Math.max(50, right - left);
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur) { cur.text = cur.text.replace(/\s+/g, ' ').trim(); if (cur.text) blocks.push(cur); cur = null; } };
  pages.forEach((pg, pi) => {
    if (pi > 0 && keepPageBreaks) { flush(); blocks.push({ type: 'pagebreak' }); }
    const lines = pg.lines.filter((l, i, arr) => {
      // bỏ số trang đứng một mình ở đầu/cuối trang
      const edge = i === 0 || i === arr.length - 1;
      return !(edge && /^[-–\s]*\d{1,4}[-–\s]*$/.test(l.t) && (l.y < pg.h * 0.1 || l.y > pg.h * 0.9));
    });
    let prev = null;
    for (const l of lines) {
      const gap = prev ? l.y - prev.y : 0;
      const big = l.s > body * 1.18;
      const center = Math.abs((l.x0 + l.x1) / 2 - (left + right) / 2) < width * 0.08 && l.x1 - l.x0 < width * 0.8;
      const headingLike = (big || (l.bold && l.t.length < 140) || (isUpper(l.t) && l.t.length < 120)) && !/[,;]$/.test(l.t);
      const listLike = /^([-•+*▪●]|\d{1,2}[.)]|[a-zđ][)])\s+/.test(l.t);
      const indent = l.x0 - left > body * 0.9;
      const prevShort = prev && prev.x1 < right - width * 0.15;
      const newPara = !prev || gap > Math.max(prev.s, l.s) * 1.65 || listLike || (indent && !cur?.li) || (prevShort && /[.:;!?…"”)]$/.test(prev.t)) || headingLike !== !!cur?.heading;
      if (newPara) {
        flush();
        if (headingLike) cur = { type: 'h', level: big && l.s > body * 1.45 ? 1 : 2, text: l.t, heading: true, align: center ? 'center' : 'left' };
        else if (listLike) cur = { type: 'li', text: l.t.replace(/^[-•+*▪●]\s+/, ''), li: true };
        else cur = { type: 'p', text: l.t, align: center ? 'center' : 'justify', bold: l.bold };
      } else {
        // nối dòng: bỏ gạch nối cuối dòng
        cur.text = /[^\s]-$/.test(cur.text) ? cur.text.slice(0, -1) + l.t : cur.text + ' ' + l.t;
        if (cur.type === 'p' && !center) cur.align = 'justify';
      }
      prev = l;
    }
  });
  flush();
  // tiêu đề cấp 1 dài quá thì hạ thành đoạn đậm
  return blocks.map((b) => (b.type === 'h' && b.text.length > 160 ? { type: 'p', text: b.text, bold: true } : b)).map(({ heading, li, ...b }) => b);
}

// ---------------- DOCX ----------------
export async function readDocx(file) {
  const mammoth = (await import('mammoth')).default;
  const buf = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf }, { includeDefaultStyleMap: true });
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const blocks = [];
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  for (const el of tpl.content.children) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { const t = txt(el); if (t) blocks.push({ type: 'h', level: Math.min(3, +tag[1]), text: t }); }
    else if (tag === 'ul' || tag === 'ol') el.querySelectorAll(':scope > li').forEach((li) => { const t = txt(li); if (t) blocks.push({ type: 'li', text: t }); });
    else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map(txt));
      if (rows.length) blocks.push({ type: 'table', rows });
    } else {
      const t = txt(el);
      if (!t) continue;
      const strong = el.querySelector('strong') && txt(el.querySelector('strong')) === t;
      blocks.push(strong && t.length < 140 ? { type: 'h', level: 2, text: t } : classify(t));
    }
  }
  return { blocks, title: guessTitle(blocks, file.name), source: 'docx', buffer: buf };
}

/** Văn bản thuần từ các khối (dùng cho tóm tắt, kiểm tra chính tả). */
export function blocksToText(blocks) {
  return blocks.map((b) => (b.type === 'table' ? b.rows.map((r) => r.join(' | ')).join('\n') : b.type === 'pagebreak' ? '' : b.text)).filter(Boolean).join('\n\n');
}
