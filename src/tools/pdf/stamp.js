// Ký / đóng dấu (kéo thả trên trang), watermark, đánh số trang, đầu/chân trang & Bates,
// cắt lề (kể cả tự động), màu nền. Tất cả đều xử lý đúng trang đã xoay và CropBox.
import { PDFName, PDFArray, pushGraphicsState, popGraphicsState, setFillingColor, rectangle, fill } from 'pdf-lib';
import { h, dropzone, progress, status, run, button, field, input, num, select, seg, checkbox, tick, baseName, parsePages, fmtSize, toast } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { loadPdf, savePdf, openPdfjs, renderPage, embedVnFonts, visualBox, placeBox, placeText, hexToRgb, rgb, MM } from '../../core/pdf.js';
import { loadBitmap, toCanvas } from '../../core/image.js';
import { kvGet, kvSet } from '../../core/store.js';
import { showResult } from '../../core/result.js';
import { pdfTool, pdfOut } from './common.js';

// =====================================================================
// Ký / đóng dấu
// =====================================================================
export function sign() {
  let file = null, pdfjsDoc = null, pageNo = 1, stampUrl = null, stampRatio = 0.4;
  const pos = { x: 0.6, y: 0.78, w: 0.28 }; // theo tỉ lệ trang nhìn thấy
  const st = status(), pr = progress();

  // --- nguồn chữ ký ---
  const pad = h('canvas', { class: 'sigpad', width: 920, height: 340, 'aria-label': 'Khung vẽ chữ ký' });
  const pctx = pad.getContext('2d');
  let drawing = false, hasInk = false, penColor = '#0a2a8a';
  const pt = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener('pointerdown', (e) => { drawing = true; hasInk = true; pad.setPointerCapture(e.pointerId); const [x, y] = pt(e); pctx.beginPath(); pctx.moveTo(x, y); pctx.lineTo(x + 0.1, y + 0.1); pctx.strokeStyle = penColor; pctx.lineWidth = 6; pctx.lineCap = pctx.lineJoin = 'round'; pctx.stroke(); });
  pad.addEventListener('pointermove', (e) => { if (!drawing) return; for (const ev of e.getCoalescedEvents?.() || [e]) { const [x, y] = pt(ev); pctx.lineTo(x, y); } pctx.stroke(); });
  const endDraw = () => { if (drawing) { drawing = false; useCanvasAsStamp(); } };
  pad.addEventListener('pointerup', endDraw); pad.addEventListener('pointercancel', endDraw);
  const colors = seg([{ value: '#0a2a8a', label: 'Xanh' }, { value: '#111111', label: 'Đen' }, { value: '#c8102e', label: 'Đỏ' }], penColor, (v) => { penColor = v; });
  const clearBtn = button('Xoá nét vẽ', { kind: 'btn-sm', onClick: () => { pctx.clearRect(0, 0, pad.width, pad.height); hasInk = false; } });
  const saveBtn = button('Lưu chữ ký này', { kind: 'btn-sm', iconName: 'download', onClick: async () => { if (!stampUrl) return toast('Chưa có chữ ký / con dấu.', 'err'); const list = await kvGet('stamps', []); list.unshift(stampUrl); await kvSet('stamps', list.slice(0, 8)); paintSaved(); toast('Đã lưu trên thiết bị này.'); } });

  function trimToInk(c) {
    const g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (g[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const m = 8; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m);
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }
  function useCanvasAsStamp() {
    if (!hasInk) return;
    const t = trimToInk(pad);
    if (t) setStamp(t.toDataURL('image/png'), t.height / t.width);
  }
  const removeWhite = checkbox('Xoá nền trắng của ảnh (ảnh chụp/scan con dấu, chữ ký trên giấy)', true);
  const imgDrop = dropzone({
    accept: 'image/*,.heic', title: 'Chọn ảnh chữ ký / con dấu', hint: 'PNG nền trong suốt là đẹp nhất', iconName: 'stamp',
    onFiles: async ([f]) => {
      const bmp = await loadBitmap(f);
      const c = toCanvas(bmp, { max: 1400 });
      if (removeWhite.get()) {
        const g = c.getContext('2d'); const id = g.getImageData(0, 0, c.width, c.height); const a = id.data;
        for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; const sat = Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]); if (l > 200 && sat < 40) a[i + 3] = Math.max(0, Math.round((255 - l) * 4.5)); }
        g.putImageData(id, 0, 0);
      }
      const t = trimToInk(c) || c;
      setStamp(t.toDataURL('image/png'), t.height / t.width);
    },
  });
  const savedRow = h('div', { class: 'row' });
  async function paintSaved() {
    const list = await kvGet('stamps', []);
    savedRow.replaceChildren(...(list.length ? list.map((u, i) => h('span', { style: 'position:relative;display:inline-block' },
      h('button', { type: 'button', class: 'btn btn-sm', style: 'background:#fff;padding:4px 8px', onclick: () => { const im = new Image(); im.onload = () => setStamp(u, im.height / im.width); im.src = u; } }, h('img', { src: u, alt: 'Chữ ký đã lưu', style: 'height:36px;max-width:120px' })),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xoá mẫu đã lưu', style: 'position:absolute;top:-10px;right:-10px;width:24px;height:24px;min-height:24px', html: icon('x'), onclick: async () => { list.splice(i, 1); await kvSet('stamps', list); paintSaved(); } })))
      : [h('span', { class: 'small' }, 'Chưa có mẫu nào. Vẽ hoặc chọn ảnh rồi bấm "Lưu chữ ký này".')]));
  }
  paintSaved();
  const srcSeg = seg([{ value: 'draw', label: 'Vẽ tay' }, { value: 'img', label: 'Ảnh chữ ký / con dấu' }, { value: 'saved', label: 'Mẫu đã lưu' }], 'draw', (v) => { drawBox.hidden = v !== 'draw'; imgBox.hidden = v !== 'img'; savedBox.hidden = v !== 'saved'; });
  const drawBox = h('div', null, pad, h('div', { class: 'row mt' }, colors.el, clearBtn));
  const imgBox = h('div', { hidden: true }, imgDrop, removeWhite.el);
  const savedBox = h('div', { hidden: true }, savedRow);

  // --- đặt lên trang ---
  const canvasHolder = h('div');
  const stampEl = h('div', { class: 'stamp', hidden: true, role: 'img', 'aria-label': 'Chữ ký — kéo để di chuyển, kéo chấm góc để đổi cỡ' }, h('span', { class: 'rs' }));
  const placer = h('div', { class: 'placer' }, canvasHolder, stampEl);
  const pageInfo = h('span', { class: 'small' });
  const prev = button('', { kind: 'btn-sm btn-icon', iconName: 'chevronLeft', onClick: () => goPage(pageNo - 1), attrs: { 'aria-label': 'Trang trước' } });
  const next = button('', { kind: 'btn-sm btn-icon', iconName: 'chevronRight', onClick: () => goPage(pageNo + 1), attrs: { 'aria-label': 'Trang sau' } });
  const applyTo = select([{ value: 'current', label: 'Chỉ trang đang xem' }, { value: 'last', label: 'Trang cuối' }, { value: 'all', label: 'Tất cả các trang' }, { value: 'custom', label: 'Các trang tự chọn…' }], 'current');
  const custom = input({ placeholder: 'VD: 1, 3-4' });
  const customField = field('Trang', custom);
  customField.hidden = true;
  applyTo.addEventListener('change', () => { customField.hidden = applyTo.value !== 'custom'; });
  const placeBoxEl = h('div', { hidden: true }, h('h3', null, '2. Kéo chữ ký tới đúng chỗ'), h('div', { class: 'row' }, prev, pageInfo, next), placer, h('div', { class: 'grid2' }, field('Áp dụng cho', applyTo), customField));

  function setStamp(url, ratio) {
    stampUrl = url; stampRatio = ratio;
    stampEl.style.backgroundImage = `url(${url})`;
    stampEl.hidden = !pdfjsDoc;
    layoutStamp();
  }
  function layoutStamp() {
    const c = canvasHolder.firstChild;
    if (!c) return;
    const W = c.clientWidth, Hh = c.clientHeight;
    const ar = (c.height / c.width);
    pos.w = Math.max(0.04, Math.min(0.95, pos.w));
    const wpx = pos.w * W, hpx = wpx * stampRatio;
    pos.x = Math.max(0, Math.min(1 - pos.w, pos.x));
    pos.y = Math.max(0, Math.min(1 - (pos.w * stampRatio) / ar, pos.y));
    Object.assign(stampEl.style, { left: pos.x * W + 'px', top: pos.y * Hh + 'px', width: wpx + 'px', height: hpx + 'px' });
  }
  addEventListener('resize', layoutStamp);
  // kéo / đổi cỡ
  let dragMode = null, start = null;
  stampEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragMode = e.target.classList.contains('rs') ? 'resize' : 'move';
    start = { x: e.clientX, y: e.clientY, pos: { ...pos } };
    stampEl.setPointerCapture(e.pointerId);
  });
  stampEl.addEventListener('pointermove', (e) => {
    if (!dragMode) return;
    const c = canvasHolder.firstChild; const W = c.clientWidth, Hh = c.clientHeight;
    const dx = (e.clientX - start.x) / W, dy = (e.clientY - start.y) / Hh;
    if (dragMode === 'move') { pos.x = start.pos.x + dx; pos.y = start.pos.y + dy; } else pos.w = start.pos.w + dx;
    layoutStamp();
  });
  const stop = () => { dragMode = null; };
  stampEl.addEventListener('pointerup', stop); stampEl.addEventListener('pointercancel', stop);

  async function goPage(n) {
    if (!pdfjsDoc) return;
    pageNo = Math.max(1, Math.min(pdfjsDoc.numPages, n));
    pageInfo.textContent = `Trang ${pageNo}/${pdfjsDoc.numPages}`;
    prev.disabled = pageNo <= 1; next.disabled = pageNo >= pdfjsDoc.numPages;
    const p = await pdfjsDoc.getPage(pageNo);
    const base = p.getViewport({ scale: 1 });
    const c = await renderPage(p, Math.min(2.2, 1100 / base.width));
    canvasHolder.replaceChildren(c);
    requestAnimationFrame(layoutStamp);
  }

  const drop = dropzone({
    accept: '.pdf,application/pdf', title: 'Chọn tệp PDF cần ký', hint: 'Kéo thả, bấm để chọn hoặc dán', iconName: 'signature',
    onFiles: async ([f]) => {
      try {
        st.clear();
        const d = await loadPdf(f);
        file = f;
        pdfjsDoc?.destroy();
        pdfjsDoc = await openPdfjs(f);
        fileInfo.textContent = `${f.name} · ${d.getPageCount()} trang · ${fmtSize(f.size)}`;
        placeBoxEl.hidden = false;
        stampEl.hidden = !stampUrl;
        await goPage(d.getPageCount()); // mặc định trang cuối (nơi thường ký)
      } catch (e) { st.err(e.message); }
    },
  });
  const fileInfo = h('div', { class: 'small mt' });

  const go = button('Chèn vào PDF', { kind: 'btn-primary', iconName: 'signature' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!file) throw new Error('Hãy chọn tệp PDF.');
    if (!stampUrl) throw new Error('Hãy vẽ chữ ký hoặc chọn ảnh chữ ký / con dấu.');
    pr.set(20, 'Đang chèn…');
    const doc = await loadPdf(file);
    const n = doc.getPageCount();
    const idx = applyTo.value === 'current' ? [pageNo - 1] : applyTo.value === 'last' ? [n - 1] : applyTo.value === 'all' ? [...Array(n).keys()] : parsePages(custom.value, n, { emptyAll: false });
    const png = await doc.embedPng(await (await fetch(stampUrl)).arrayBuffer());
    for (const i of idx) {
      const page = doc.getPage(i);
      const vb = visualBox(page);
      const w = pos.w * vb.vw, hh = w * stampRatio;
      const p = placeBox(vb, pos.x * vb.vw, pos.y * vb.vh, w, hh);
      page.drawImage(png, { x: p.x, y: p.y, width: w, height: hh, rotate: p.rotate });
    }
    const blob = await savePdf(doc);
    pr.hide();
    await showResult(st, [pdfOut(blob, `${baseName(file.name)}_da-ky.pdf`)], { note: `${idx.length} trang`, tool: 'Ký PDF' });
  }));

  return h('section', { class: 'card' },
    h('h2', null, 'Ký / đóng dấu PDF'),
    h('p', { class: 'sub' }, 'Vẽ chữ ký bằng chuột, bút hoặc ngón tay; hoặc dùng ảnh chữ ký, con dấu. Sau đó kéo thả lên đúng vị trí trên trang. Đây là chữ ký hình ảnh, không phải chữ ký số.'),
    drop, fileInfo,
    h('h3', null, '1. Chữ ký / con dấu'), srcSeg.el, h('div', { class: 'mt' }, drawBox, imgBox, savedBox), h('div', { class: 'row mt' }, saveBtn),
    placeBoxEl,
    h('div', { class: 'actions' }, go), pr.el, st.el);
}

// =====================================================================
// Watermark
// =====================================================================
export function watermark() {
  return pdfTool({
    title: 'Watermark', sub: 'Đóng dấu chữ mờ lên trang, hỗ trợ đầy đủ tiếng Việt.', label: 'Đóng watermark', icon: 'droplet',
    pages: 'range',
    options() {
      const t = input({ value: 'BẢN SAO' });
      const s = num(64, 8, 300), o = num(22, 5, 100), g = num(45, -180, 180);
      const c = h('input', { type: 'color', value: '#808080' });
      const m = seg([{ value: 'c', label: 'Một dấu giữa trang' }, { value: 't', label: 'Lặp kín trang' }], 'c');
      return {
        el: h('div', null, field('Nội dung', t), h('div', { class: 'grid4' }, field('Cỡ chữ', s), field('Độ đậm (%)', o), field('Góc xoay (°)', g), field('Màu chữ', c)), field('Kiểu', m.el)),
        read: () => ({ t: t.value || ' ', s: +s.value || 64, o: (+o.value || 22) / 100, g: +g.value || 0, c: c.value, m: m.get() }),
      };
    },
    async action({ doc, pages, opts, base }) {
      const f = (await embedVnFonts(doc)).bold;
      const w = f.widthOfTextAtSize(opts.t, opts.s), hh = opts.s * 0.7;
      const a = (opts.g * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
      for (const i of pages) {
        const page = doc.getPage(i);
        const vb = visualBox(page);
        // tâm chữ tại (cx, cy) theo hướng nhìn; gốc vẽ = tâm lùi nửa chữ theo hướng xoay
        const put = (cx, cy) => {
          // gốc vẽ (đường chân chữ, bên trái) sao cho TÂM dòng chữ nằm tại (cx, cy)
          const ox = cx - (w / 2) * cs + (hh / 2) * sn;
          const oy = cy + (w / 2) * sn + (hh / 2) * cs;
          const q = placeText(vb, ox, oy, opts.g);
          page.drawText(opts.t, { x: q.x, y: q.y, size: opts.s, font: f, color: hexToRgb(opts.c), opacity: opts.o, rotate: q.rotate });
        };
        if (opts.m === 'c') put(vb.vw / 2, vb.vh / 2);
        else {
          const stepY = hh * 4 + Math.abs(w * sn), stepX = w * Math.abs(cs) + 80;
          let k = 0;
          for (let y = stepY / 2; y < vb.vh + stepY; y += stepY, k++) for (let x = (k % 2) * (stepX / 2); x < vb.vw + stepX; x += stepX) put(x, y);
        }
      }
      return [pdfOut(await savePdf(doc), `${base}_watermark.pdf`)];
    },
  });
}

// =====================================================================
// Đánh số trang
// =====================================================================
export function number() {
  return pdfTool({
    title: 'Đánh số trang', sub: 'Mẫu "Hành chính" đặt số ở giữa lề trên và không đánh số trang đầu, đúng thể thức Nghị định 30/2020/NĐ-CP.', label: 'Đánh số', icon: 'hash',
    pages: 'range', pagesLabel: 'Trang được đánh số',
    options() {
      const pos = select([{ value: 'nd30', label: 'Hành chính – giữa lề trên, bỏ trang đầu' }, { value: 'bc', label: 'Giữa lề dưới' }, { value: 'br', label: 'Góc dưới bên phải' }, { value: 'tr', label: 'Góc trên bên phải' }, { value: 'outer', label: 'Góc ngoài (in hai mặt)' }], 'nd30');
      const fmt = select([{ value: '{n}', label: '1, 2, 3…' }, { value: 'Trang {n}', label: 'Trang 1' }, { value: 'Trang {n}/{t}', label: 'Trang 1/10' }, { value: '- {n} -', label: '- 1 -' }], '{n}');
      const start = num(1, 0, 99999), size = num(13, 6, 36), margin = num(12, 3, 60);
      return {
        el: h('div', null, h('div', { class: 'grid2' }, field('Vị trí', pos), field('Định dạng', fmt)), h('div', { class: 'grid3' }, field('Bắt đầu từ số', start), field('Cỡ chữ (pt)', size), field('Cách mép (mm)', margin))),
        read: () => ({ pos: pos.value, fmt: fmt.value, start: +start.value || 1, size: +size.value || 13, margin: (+margin.value || 12) * MM }),
      };
    },
    async action({ doc, pages, opts, base }) {
      const f = (await embedVnFonts(doc)).regular;
      let list = pages;
      if (opts.pos === 'nd30') list = pages.filter((i) => i !== 0);
      const total = doc.getPageCount();
      list.forEach((i, k) => {
        const page = doc.getPage(i);
        const vb = visualBox(page);
        const n = opts.pos === 'nd30' ? opts.start + k + 1 : opts.start + k;
        const t = opts.fmt.replace('{n}', n).replace('{t}', opts.pos === 'nd30' ? total : opts.start + list.length - 1);
        const w = f.widthOfTextAtSize(t, opts.size);
        let x, y;
        const top = opts.margin + opts.size * 0.8, bottom = vb.vh - opts.margin;
        switch (opts.pos) {
          case 'nd30': x = (vb.vw - w) / 2; y = top; break;
          case 'bc': x = (vb.vw - w) / 2; y = bottom; break;
          case 'br': x = vb.vw - opts.margin - w; y = bottom; break;
          case 'tr': x = vb.vw - opts.margin - w; y = top; break;
          default: x = (i % 2 === 0) ? vb.vw - opts.margin - w : opts.margin; y = bottom;
        }
        const p = placeText(vb, x, y);
        page.drawText(t, { x: p.x, y: p.y, size: opts.size, font: f, color: rgb(0, 0, 0), rotate: p.rotate });
      });
      return { outs: [pdfOut(await savePdf(doc), `${base}_danh-so.pdf`)], note: `${list.length} trang được đánh số` };
    },
  });
}

// =====================================================================
// Đầu trang, chân trang & Bates
// =====================================================================
export function headerFooter() {
  return pdfTool({
    title: 'Đầu trang, chân trang & Bates', sub: 'Dùng {n} = số trang, {t} = tổng số trang, {date} = ngày hôm nay, {file} = tên tệp.', label: 'Áp dụng', icon: 'header',
    pages: 'range',
    options() {
      const mk = () => ({ l: input(), c: input(), r: input() });
      const hd = mk(), ft = mk();
      ft.c.placeholder = 'VD: Trang {n}/{t}';
      const size = num(10, 6, 36), margin = num(10, 2, 60);
      const bp = input({ placeholder: 'VD: HS-  (trống = không dùng)' }), b0 = num(1, 0, 999999), bd = num(6, 1, 10);
      const row = (label, o) => h('div', null, h('div', { class: 'small', style: 'font-weight:700;margin-top:12px' }, label), h('div', { class: 'grid3' }, field('Trái', o.l), field('Giữa', o.c), field('Phải', o.r)));
      return {
        el: h('div', null, row('Đầu trang', hd), row('Chân trang', ft), h('div', { class: 'grid2' }, field('Cỡ chữ (pt)', size), field('Cách mép (mm)', margin)),
          h('div', { class: 'small', style: 'font-weight:700;margin-top:14px' }, 'Đánh số Bates (hồ sơ pháp lý) — ở góc dưới phải'), h('div', { class: 'grid3' }, field('Tiền tố', bp), field('Số bắt đầu', b0), field('Số chữ số', bd))),
        read: () => ({ hd: [hd.l.value, hd.c.value, hd.r.value], ft: [ft.l.value, ft.c.value, ft.r.value], size: +size.value || 10, m: (+margin.value || 10) * MM, bp: bp.value, b0: +b0.value || 0, bd: +bd.value || 6 }),
      };
    },
    async action({ doc, pages, opts, base, file }) {
      const f = (await embedVnFonts(doc)).regular;
      const total = doc.getPageCount();
      const date = new Date().toLocaleDateString('vi-VN');
      const fill = (s, i) => s.replaceAll('{n}', i + 1).replaceAll('{t}', total).replaceAll('{date}', date).replaceAll('{file}', baseName(file.name));
      pages.forEach((i, k) => {
        const page = doc.getPage(i);
        const vb = visualBox(page);
        const draw = (text, align, y) => {
          if (!text) return;
          const t = fill(text, i), w = f.widthOfTextAtSize(t, opts.size);
          const x = align === 0 ? opts.m : align === 1 ? (vb.vw - w) / 2 : vb.vw - opts.m - w;
          const p = placeText(vb, x, y);
          page.drawText(t, { x: p.x, y: p.y, size: opts.size, font: f, color: rgb(0, 0, 0), rotate: p.rotate });
        };
        opts.hd.forEach((t, a) => draw(t, a, opts.m + opts.size * 0.8));
        opts.ft.forEach((t, a) => draw(t, a, vb.vh - opts.m));
        if (opts.bp) draw(opts.bp + String(opts.b0 + k).padStart(opts.bd, '0'), 2, vb.vh - opts.m - (opts.ft.some(Boolean) ? opts.size + 4 : 0));
      });
      return [pdfOut(await savePdf(doc), `${base}_dau-chan-trang.pdf`)];
    },
  });
}

// =====================================================================
// Cắt lề
// =====================================================================
export function crop() {
  return pdfTool({
    title: 'Cắt lề PDF', sub: 'Cắt bớt lề theo hướng trang đang hiển thị. Nội dung gốc vẫn được giữ trong tệp (chỉ ẩn phần bị cắt).', label: 'Cắt lề', icon: 'crop',
    pages: 'range',
    options() {
      const mode = seg([{ value: 'auto', label: 'Tự động bỏ lề trắng' }, { value: 'manual', label: 'Nhập số mm' }], 'auto', () => sync());
      const t = num(10, 0, 300), b = num(10, 0, 300), l = num(10, 0, 300), r = num(10, 0, 300);
      const pad = num(4, 0, 50);
      const man = h('div', { class: 'grid4' }, field('Trên (mm)', t), field('Dưới (mm)', b), field('Trái (mm)', l), field('Phải (mm)', r));
      const auto = field('Chừa lại quanh nội dung (mm)', pad);
      const sync = () => { man.hidden = mode.get() !== 'manual'; auto.hidden = mode.get() !== 'auto'; };
      sync();
      return { el: h('div', null, mode.el, man, auto), read: () => ({ mode: mode.get(), t: +t.value * MM, b: +b.value * MM, l: +l.value * MM, r: +r.value * MM, pad: +pad.value * MM }) };
    },
    async action({ file, doc, pages, opts, base, progress: pr }) {
      const js = opts.mode === 'auto' ? await openPdfjs(file) : null;
      for (let k = 0; k < pages.length; k++) {
        const i = pages[k];
        const page = doc.getPage(i);
        const vb = visualBox(page);
        let m = { t: opts.t, b: opts.b, l: opts.l, r: opts.r };
        if (js) {
          pr((k / pages.length) * 90, `Đang dò lề trang ${i + 1}`);
          await tick();
          const c = await renderPage(await js.getPage(i + 1), 0.6);
          const bb = contentBox(c);
          if (!bb) continue;
          const sx = vb.vw / c.width, sy = vb.vh / c.height;
          m = { t: Math.max(0, bb.y0 * sy - opts.pad), b: Math.max(0, (c.height - bb.y1) * sy - opts.pad), l: Math.max(0, bb.x0 * sx - opts.pad), r: Math.max(0, (c.width - bb.x1) * sx - opts.pad) };
        }
        if (m.l + m.r >= vb.vw - 10 || m.t + m.b >= vb.vh - 10) throw new Error(`Lề cắt lớn hơn kích thước trang ${i + 1}.`);
        // đổi lề "nhìn thấy" sang các cạnh của CropBox chưa xoay
        const side = { 0: [m.l, m.b, m.r, m.t], 90: [m.t, m.l, m.b, m.r], 180: [m.r, m.t, m.l, m.b], 270: [m.b, m.r, m.t, m.l] }[vb.rot];
        const [L, B, R, T] = side; // trái, dưới, phải, trên của hệ toạ độ PDF
        const x = vb.x + L, y = vb.y + B, w = vb.w - L - R, hh = vb.h - B - T;
        page.setCropBox(x, y, w, hh);
        page.setTrimBox(x, y, w, hh);
      }
      js?.destroy();
      return [pdfOut(await savePdf(doc), `${base}_cat-le.pdf`)];
    },
  });
}
function contentBox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// =====================================================================
// Màu nền (đặt PHÍA SAU nội dung, giữ nguyên chữ)
// =====================================================================
export function background() {
  return pdfTool({
    title: 'Màu nền', sub: 'Đặt màu nền phía sau nội dung (giữ nguyên chữ và nét vẽ, không chuyển thành ảnh).', label: 'Đổi màu nền', icon: 'palette',
    pages: 'range',
    options() {
      const c = h('input', { type: 'color', value: '#fff8e1' });
      const presets = h('div', { class: 'row' }, ['#fff8e1', '#eef7ee', '#e8f2fb', '#f3f0ff', '#f5f5f5'].map((v) => h('button', { type: 'button', class: 'btn btn-sm', style: `background:${v};color:#123;width:44px`, 'aria-label': 'Màu ' + v, onclick: () => { c.value = v; } }, ' ')));
      return { el: h('div', null, h('div', { class: 'grid2' }, field('Màu nền', c)), presets), read: () => ({ c: c.value }) };
    },
    async action({ doc, pages, opts, base }) {
      const col = hexToRgb(opts.c);
      for (const i of pages) {
        const page = doc.getPage(i);
        const mb = page.getMediaBox();
        const ops = [pushGraphicsState(), setFillingColor(col), rectangle(mb.x, mb.y, mb.width, mb.height), fill(), popGraphicsState()];
        const stream = doc.context.contentStream(ops);
        const ref = doc.context.register(stream);
        const node = page.node;
        const cur = node.get(PDFName.of('Contents'));
        const arr = PDFArray.withContext(doc.context);
        arr.push(ref);
        if (cur instanceof PDFArray) cur.asArray().forEach((x) => arr.push(x));
        else if (cur) arr.push(cur);
        node.set(PDFName.of('Contents'), arr);
      }
      return [pdfOut(await savePdf(doc), `${base}_mau-nen.pdf`)];
    },
  });
}
