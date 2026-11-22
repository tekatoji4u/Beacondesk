// Nhận dạng chữ tiếng Việt từ ảnh chụp, ảnh scan và PDF scan.
// Tiền xử lý: tự xoay, chỉnh nghiêng, tăng tương phản / khử bóng.
// Kết quả sửa được trực tiếp, xuất Word, văn bản thuần hoặc PDF tìm kiếm được.
import { h, dropzone, progress, status, run, button, fmtSize, field, input, select, seg, checkbox, tick, baseName, ext, parsePages, copyText, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { openPdfjs, renderPage, canvasToBlob, PDFDocument, savePdf, embedVnFonts } from '../core/pdf.js';
import { loadBitmap, toCanvas, grayArray, putGray, autoContrast, adaptiveBinarize, detectSkew, rotateCanvas } from '../core/image.js';
import { getOcr, recognize, stopOcr, fixOrientation, drawOcrText } from '../core/ocr.js';
import { linesToBlocks, blocksToText, fromPlain } from '../core/text.js';
import { showResult } from '../core/result.js';

const A4_LONG = 841.89;

export function render() {
  let items = []; // {file, kind:'pdf'|'img', pages}
  let results = []; // {name, text, conf, lines, w, h, jpg, k}
  let cancelled = false;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const out = h('div');

  const paint = () => list.replaceChildren(...items.map((it, i) => h('li', null,
    h('span', { class: 'nm' }, it.file.name),
    h('span', { class: 'meta' }, `${it.kind === 'pdf' ? it.pages + ' trang · ' : ''}${fmtSize(it.file.size)}`),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ ' + it.file.name, html: icon('x'), onclick: () => { items.splice(i, 1); paint(); } }))));

  const add = async (files) => {
    st.clear();
    for (const f of files) {
      if (ext(f.name) === 'pdf' || f.type === 'application/pdf') {
        try {
          const d = await openPdfjs(f);
          const pages = d.numPages;
          // PDF đã có lớp chữ thì không cần OCR
          const tc = await (await d.getPage(1)).getTextContent();
          const chars = tc.items.reduce((a, i) => a + (i.str?.trim().length || 0), 0);
          d.destroy();
          items.push({ file: f, kind: 'pdf', pages });
          if (chars > 80) st.info(`"${f.name}" đã có sẵn chữ. Có thể dùng `, h('a', { href: '#/pdf/toword' }, 'PDF sang Word'), ' để giữ chữ gốc chính xác hơn.');
        } catch (e) { st.err(e.message); }
      } else items.push({ file: f, kind: 'img' });
    }
    paint();
  };

  const drop = dropzone({ accept: 'image/*,.heic,.heif,.pdf,application/pdf', multiple: true, title: 'Chọn ảnh hoặc PDF scan', hint: 'JPG, PNG, HEIC, PDF… Kéo thả, bấm để chọn hoặc dán ảnh (Ctrl+V)', iconName: 'scan', onFiles: add });
  const cam = dropzone({ accept: 'image/*', capture: 'environment', title: 'Chụp văn bản', hint: 'Đặt giấy phẳng, đủ sáng, chụp thẳng', iconName: 'camera', onFiles: add });

  const range = input({ placeholder: 'Để trống = tất cả. VD: 1-3, 5' });
  const dpi = select([{ value: '200', label: '200 dpi – nhanh' }, { value: '300', label: '300 dpi – khuyên dùng' }, { value: '400', label: '400 dpi – chữ nhỏ' }], '300');
  const enh = seg([{ value: 'auto', label: 'Tự động' }, { value: 'photo', label: 'Ảnh chụp (khử bóng)' }, { value: 'contrast', label: 'Tăng tương phản' }, { value: 'none', label: 'Giữ nguyên' }], 'auto');
  const autoRot = checkbox('Tự xoay trang bị ngược hoặc nằm ngang', true);
  const deskew = checkbox('Tự chỉnh trang bị nghiêng', true);
  const fDocx = checkbox('Word (.docx)', true);
  const fTxt = checkbox('Văn bản (.txt)', false);
  const fPdf = checkbox('PDF tìm kiếm được (ảnh gốc + lớp chữ ẩn)', false);
  const breaks = checkbox('Mỗi trang một trang Word', true);

  const go = button('Nhận dạng', { kind: 'btn-primary', iconName: 'play' });
  const stop = button('Dừng', { iconName: 'stop', attrs: { hidden: true } });
  stop.addEventListener('click', () => { cancelled = true; stop.disabled = true; pr.set(100, 'Đang dừng…'); });

  go.addEventListener('click', () => run(go, st, async () => {
    if (!items.length) throw new Error('Hãy chọn ảnh hoặc tệp PDF.');
    cancelled = false;
    stop.hidden = false; stop.disabled = false;
    out.replaceChildren();
    results = [];
    try {
      pr.set(2, 'Đang nạp bộ nhận dạng chữ…');
      const { n } = await getOcr((t, f) => pr.set(2 + f * 8, t));
      // Danh sách trang cần làm
      const jobs = [];
      for (const it of items) {
        if (it.kind === 'img') jobs.push({ it, name: it.file.name });
        else {
          const idx = parsePages(range.value, it.pages);
          for (const p of idx) jobs.push({ it, page: p + 1, name: `${it.file.name} – trang ${p + 1}` });
        }
      }
      const total = jobs.length;
      let done = 0;
      const inflight = new Set();
      const pdfDocs = new Map();
      for (let j = 0; j < total; j++) {
        if (cancelled) break;
        const job = jobs[j];
        pr.set(10 + (done / total) * 85, `Đang chuẩn bị trang ${j + 1}/${total}…`);
        await tick();
        const prep = await prepare(job, pdfDocs);
        const p = (async () => {
          const r = await recognizePage(prep);
          results[j] = { name: job.name, ...r };
          done++;
          pr.set(10 + (done / total) * 85, `Đã nhận dạng ${done}/${total} trang`);
        })();
        inflight.add(p);
        p.finally(() => inflight.delete(p));
        if (inflight.size >= n) await Promise.race(inflight);
      }
      await Promise.all(inflight);
      for (const d of pdfDocs.values()) d.destroy();
      results = results.filter(Boolean);
      if (!results.length) throw new Error(cancelled ? 'Đã dừng.' : 'Không nhận dạng được trang nào.');
      showPages();
      pr.hide();
      await exportAll();
    } finally {
      pr.hide();
      stop.hidden = true;
      if (cancelled) { await stopOcr(); toast('Đã dừng nhận dạng.'); }
    }
  }));

  /** Đọc ảnh/trang PDF thành canvas đã tiền xử lý. */
  async function prepare(job, pdfDocs) {
    let c, k;
    if (job.it.kind === 'pdf') {
      let d = pdfDocs.get(job.it.file);
      if (!d) { d = await openPdfjs(job.it.file); pdfDocs.set(job.it.file, d); }
      const page = await d.getPage(job.page);
      const scale = +dpi.value / 72;
      c = await renderPage(page, scale, { maxSide: 5000 });
      k = c.width / page.getViewport({ scale: 1, rotation: page.rotate }).width; // pixel / pt
    } else {
      const bmp = await loadBitmap(job.it.file);
      c = toCanvas(bmp, { min: 1800, max: 4000 });
      bmp.close?.();
      k = Math.max(c.width, c.height) / A4_LONG;
    }
    return { c, k, photo: job.it.kind === 'img' };
  }

  /** Xoay đúng chiều, chỉnh nghiêng, nhận dạng; trả về kết quả kèm ảnh JPEG để làm PDF. */
  async function recognizePage({ c, k, photo }) {
    if (autoRot.get()) c = await fixOrientation(c);
    if (deskew.get()) { const a = detectSkew(c); if (a) c = rotateCanvas(c, -a); }
    const work = enhance(c, enh.get() === 'auto' ? (photo ? 'photo' : 'contrast') : enh.get());
    const r = await recognize(work);
    const jpg = fPdf.get() ? await canvasToBlob(c, 'image/jpeg', 0.82) : null;
    const res = { ...r, w: c.width, h: c.height, k, jpg };
    if (work !== c) work.width = work.height = 0;
    c.width = c.height = 0;
    return res;
  }

  function showPages() {
    const avg = results.reduce((a, r) => a + r.conf, 0) / results.length;
    out.replaceChildren(h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', { style: 'margin:0' }, 'Kết quả nhận dạng'),
        h('span', { class: 'tag' }, `Độ tin cậy trung bình ${Math.round(avg)}%`)),
      h('p', { class: 'sub' }, 'Có thể sửa trực tiếp. Bấm "Xuất lại" để tạo tệp theo nội dung đã sửa.'),
      avg < 60 ? h('div', { class: 'notice' }, 'Độ tin cậy thấp. Thử chụp lại thẳng và đủ sáng, chọn "Ảnh chụp (khử bóng)" hoặc tăng dpi.') : null,
      ...results.map((r, i) => {
        r.text = toText(r);
        const ta = h('textarea', { rows: Math.min(18, Math.max(6, r.text.split('\n').length + 1)), 'aria-label': 'Nội dung ' + r.name, spellcheck: 'false' }, r.text);
        ta.addEventListener('input', () => { r.text = ta.value; r.edited = true; });
        return h('div', { class: 'mt' },
          h('div', { class: 'row', style: 'justify-content:space-between' },
            h('b', null, `${i + 1}. ${r.name}`),
            h('div', { class: 'row' },
              h('span', { class: 'meta' }, `${Math.round(r.conf)}%`),
              h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => { await copyText(ta.value); toast('Đã chép nội dung trang.'); } }, h('span', { html: icon('copy'), style: 'display:contents' }), 'Chép'))),
          ta);
      }),
      h('div', { class: 'row mt' },
        button('Chép toàn bộ', { iconName: 'copy', onClick: async () => { await copyText(results.map((r) => r.text).join('\n\n')); toast('Đã chép toàn bộ nội dung.'); } }),
        button('Xuất lại', { kind: 'btn-primary', iconName: 'download', onClick: () => run(null, st, exportAll) }))));
  }

  async function exportAll() {
    const base = baseName(items[0]?.file.name || 'ocr') + '_ocr';
    const outs = [];
    if (fDocx.get()) {
      const { blocksToDocx } = await import('../core/docx.js');
      const blocks = results.flatMap((r, i) => [...(i && breaks.get() ? [{ type: 'pagebreak' }] : []), ...fromPlain(r.text).blocks]);
      outs.push({ blob: await blocksToDocx(blocks, { title: base }), name: base + '.docx' });
    }
    if (fTxt.get()) outs.push({ blob: new Blob(['﻿' + results.map((r) => r.text).join('\n\n\f\n\n')], { type: 'text/plain;charset=utf-8' }), name: base + '.txt' });
    if (fPdf.get()) {
      if (results.some((r) => !r.jpg)) throw new Error('Hãy bật "PDF tìm kiếm được" rồi bấm Nhận dạng lại.');
      pr.set(96, 'Đang tạo PDF tìm kiếm được…');
      outs.push({ blob: await searchablePdf(results), name: base + '.pdf' });
      pr.hide();
    }
    if (!outs.length) { st.info('Chưa chọn định dạng xuất. Nội dung đã hiện bên dưới để chép.'); return; }
    const edited = results.some((r) => r.edited);
    await showResult(st, outs, { note: `${results.length} trang${edited && fPdf.get() ? ' · lớp chữ PDF theo kết quả gốc' : ''}`, tool: 'Nhận dạng chữ' });
  }

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Nhận dạng chữ (OCR) tiếng Việt'),
      h('p', { class: 'sub' }, 'Ảnh và tài liệu được xử lý ngay trên thiết bị. Lần đầu cần tải bộ nhận dạng (khoảng 6 MB), sau đó dùng được khi mất mạng.'),
      h('div', { class: 'grid2' }, drop, cam), list,
      h('div', { class: 'grid2 mt' },
        field('Trang của PDF', range),
        field('Độ phân giải khi đọc PDF', dpi)),
      field('Làm rõ ảnh', enh.el),
      h('div', { class: 'mt' }, autoRot.el, deskew.el),
      h('fieldset', { class: 'mt' }, h('legend', null, 'Xuất ra'), fDocx.el, fTxt.el, fPdf.el, breaks.el),
      h('div', { class: 'row mt' }, go, stop),
      pr.el, st.el),
    out);
}

// ---------- Tiền xử lý ----------
function enhance(c, mode) {
  if (mode === 'none') return c;
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  o.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0);
  let g = autoContrast(grayArray(o));
  if (mode === 'photo') g = adaptiveBinarize(g, o.width, o.height);
  return putGray(o, g);
}

/** Văn bản của một trang: gom dòng thành đoạn (giống PDF sang Word). */
function toText(r) {
  if (!r.lines.length) return r.text.trim();
  return blocksToText(linesToBlocks([{ lines: r.lines, h: r.h }]));
}

// ---------- PDF tìm kiếm được ----------
async function searchablePdf(results) {
  const doc = await PDFDocument.create();
  const { regular: font } = await embedVnFonts(doc);
  for (const r of results) {
    const k = r.k; // pixel / pt
    const pw = r.w / k, ph = r.h / k;
    const page = doc.addPage([pw, ph]);
    const img = await doc.embedJpg(await r.jpg.arrayBuffer());
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    drawOcrText(page, font, r.lines, { s: 1 / k, h: r.h });
  }
  return savePdf(doc);
}
