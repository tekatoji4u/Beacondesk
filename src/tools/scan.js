// Scan tài liệu → PDF: ảnh chụp điện thoại thành trang "như scan máy thật".
// Tìm 4 góc, nắn phối cảnh, khử bóng, làm đều sáng, chế độ màu/xám/đen trắng,
// tự xoay đúng chiều, lớp chữ OCR tuỳ chọn, khổ trang chuẩn, nén theo từng trang.
import { h, dropzone, field, select, seg, checkbox, button, status, run, progress, baseName, tick } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { PDFDocument, savePdf, canvasToBlob, embedVnFonts, drawBwImage, MM } from '../core/pdf.js';
import { loadBitmap, toCanvas } from '../core/image.js';
import { showResult } from '../core/result.js';

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const QUALITY = { high: { side: 3000, q: 0.9 }, normal: { side: 2480, q: 0.82 }, small: { side: 1800, q: 0.7 } };

/** Giao diện scanner dùng chung cho "Ảnh sang PDF" và "In ấn PDF A4". */
export function scanner({ title, sub } = {}) {
  let items = [], cur = -1, cv = null;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const editor = h('div', { class: 'scan-editor', hidden: true });

  async function ensureCv() {
    if (cv) return cv;
    const { loadCv } = await import('../core/scan.js');
    pr.set(5, 'Đang nạp bộ xử lý ảnh (lần đầu khoảng 11 MB, sau đó dùng được khi mất mạng)…');
    cv = await loadCv();
    return cv;
  }

  async function add(files) {
    await run(null, st, async () => {
      const { detectDocument } = await import('../core/scan.js');
      await ensureCv();
      for (const f of files) {
        pr.set(30, `Đang tìm khung trang trong ${f.name}…`);
        await tick();
        const bmp = await loadBitmap(f);
        const c = toCanvas(bmp, { max: 3200 });
        bmp.close?.();
        const det = detectDocument(cv, c);
        const found = !!det?.sure;
        const quad = det?.quad || (await import('../core/warp.js')).detectQuad(c);
        items.push({ file: f, c, quad, auto: quad.map((p) => [...p]), found, full: false, rot: 0, thumb: toCanvas(c, { max: 90 }).toDataURL('image/jpeg', 0.7) });
      }
      pr.hide();
      if (cur < 0 && items.length) cur = 0;
      paint();
      const miss = items.filter((it) => !it.found).length;
      if (miss) st.warn(`${miss} ảnh chưa tìm chắc được 4 góc trang: hãy kéo các chấm vào đúng góc giấy.`);
    });
    pr.hide();
  }

  function paint() {
    list.replaceChildren(...items.map((it, i) => h('li', { style: i === cur ? 'outline:2px solid var(--accent);outline-offset:-2px' : '' },
      h('img', { src: it.thumb, alt: '', style: `width:40px;height:40px;object-fit:cover;border-radius:6px;flex:none;transform:rotate(${it.rot}deg)` }),
      h('span', { class: 'nm' }, `${i + 1}. ${it.file.name}`, it.found ? null : h('span', { class: 'tag warn', style: 'margin-left:6px' }, 'cần chỉnh góc')),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { cur = i; paint(); } }, 'Chỉnh'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xoay 90°', title: 'Xoay 90°', html: icon('rotate'), onclick: () => { it.rot = (it.rot + 90) % 360; cur = i; paint(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Lên', disabled: i === 0, html: icon('up'), onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; cur = i - 1; paint(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xuống', disabled: i === items.length - 1, html: icon('down'), onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; cur = i + 1; paint(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ', html: icon('x'), onclick: () => { items.splice(i, 1); cur = Math.min(cur, items.length - 1); paint(); } }))));
    paintEditor();
  }

  // Xem trước trang hiện tại (ảnh nhỏ cho nhanh), cập nhật khi kéo góc hoặc đổi chế độ
  const previewImg = h('img', { alt: 'Xem trước trang scan' });
  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const it = items[cur];
      if (!it || !cv) return;
      const c = await processPage(it, { side: 1000, preview: true });
      previewImg.src = c.canvas.toDataURL('image/jpeg', 0.85);
    }, 180);
  }

  function paintEditor() {
    const it = items[cur];
    editor.hidden = !it;
    if (!it) return;
    const W = it.c.width, H = it.c.height;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const r = Math.max(W, H) / 45;
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('class', 'quad');
    poly.setAttribute('stroke-width', String(r / 4));
    svg.append(poly);
    const dots = it.quad.map((p, k) => {
      const d = document.createElementNS(NS, 'circle');
      d.setAttribute('r', String(r));
      d.setAttribute('class', 'quad-dot');
      d.setAttribute('tabindex', '0');
      d.setAttribute('aria-label', ['Góc trên trái', 'Góc trên phải', 'Góc dưới phải', 'Góc dưới trái'][k]);
      svg.append(d);
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        d.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const b = svg.getBoundingClientRect();
          it.quad[k] = [Math.max(0, Math.min(W, (ev.clientX - b.left) * W / b.width)), Math.max(0, Math.min(H, (ev.clientY - b.top) * H / b.height))];
          it.full = false;
          sync();
        };
        const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); schedulePreview(); };
        d.addEventListener('pointermove', move);
        d.addEventListener('pointerup', up);
      });
      d.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? W / 20 : W / 100;
        const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
        if (!dx && !dy) return;
        e.preventDefault();
        it.quad[k] = [Math.max(0, Math.min(W, it.quad[k][0] + dx)), Math.max(0, Math.min(H, it.quad[k][1] + dy))];
        it.full = false;
        sync();
        schedulePreview();
      });
      return d;
    });
    const sync = () => {
      poly.setAttribute('points', it.quad.map((p) => p.join(',')).join(' '));
      it.quad.forEach((p, k) => { dots[k].setAttribute('cx', p[0]); dots[k].setAttribute('cy', p[1]); });
    };
    sync();
    const img = h('img', { src: it.c.toDataURL('image/jpeg', 0.8), alt: 'Ảnh ' + it.file.name });
    editor.replaceChildren(
      h('p', { class: 'sub' }, `Trang ${cur + 1}/${items.length}: kéo 4 chấm vào đúng 4 góc tờ giấy (bàn phím: Tab chọn góc, phím mũi tên để dịch). Bên phải là kết quả.`),
      h('div', { class: 'scan-stage' },
        h('div', { class: 'quad-stage' }, img, svg),
        h('div', { class: 'scan-preview' }, previewImg)),
      h('div', { class: 'row mt' },
        button('Tự tìm lại khung', { iconName: 'wand', onClick: () => { it.quad = it.auto.map((p) => [...p]); it.full = false; sync(); schedulePreview(); } }),
        button('Không cắt, dùng cả ảnh', { kind: 'btn-ghost', iconName: 'image', onClick: () => { it.quad = [[0, 0], [W, 0], [W, H], [0, H]]; it.full = true; sync(); schedulePreview(); } })));
    previewImg.removeAttribute('src');
    schedulePreview();
  }

  const drop = dropzone({ accept: 'image/*,.heic,.heif', multiple: true, title: 'Chọn ảnh chụp tài liệu', hint: 'Chọn nhiều ảnh cùng lúc; mỗi ảnh là một trang', iconName: 'image', onFiles: add });
  const cam = dropzone({ accept: 'image/*', capture: 'environment', title: 'Chụp tài liệu', hint: 'Đặt giấy trên nền tối màu, đủ sáng, chụp thấy đủ 4 góc', iconName: 'camera', onFiles: add });
  const mode = seg([{ value: 'auto', label: 'Tự động (màu)' }, { value: 'gray', label: 'Thang xám' }, { value: 'bw', label: 'Đen trắng' }, { value: 'original', label: 'Ảnh gốc' }], 'auto', () => schedulePreview());
  const autoRot = checkbox('Tự xoay trang đúng chiều chữ (dùng bộ nhận dạng chữ)', true);
  const ocrLayer = checkbox('Thêm lớp chữ ẩn để tìm kiếm, bôi đen, copy chữ trong PDF', false);
  const size = select([{ value: 'a4', label: 'A4 (tự xoay dọc/ngang)' }, { value: 'letter', label: 'Letter' }, { value: 'img', label: 'Theo kích thước trang scan' }], 'a4');
  const margin = select([{ value: '0', label: 'Không lề' }, { value: '5', label: '5 mm' }, { value: '10', label: '10 mm' }], '0');
  const quality = select([{ value: 'high', label: 'Cao (~250 dpi)' }, { value: 'normal', label: 'Cân bằng (~200 dpi)' }, { value: 'small', label: 'Nhỏ gọn (~150 dpi)' }], 'normal');

  /** Nắn, xoay, làm đẹp một trang. */
  async function processPage(it, { side, preview = false }) {
    const { warpDocument, enhanceDocument } = await import('../core/scan.js');
    const { rot90 } = await import('../core/ocr.js');
    let c = it.full ? toCanvas(it.c, { max: side }) : warpDocument(cv, it.c, it.quad, { maxSide: side, snapA4: size.value !== 'img', trim: 0.006 });
    c = rot90(c, it.rot);
    if (!preview && autoRot.get()) {
      const { fixOrientation } = await import('../core/ocr.js');
      c = await fixOrientation(c);
    }
    return enhanceDocument(cv, c, mode.get());
  }

  const go = button('Tạo PDF', { kind: 'btn-primary', iconName: 'printer' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!items.length) throw new Error('Hãy chọn hoặc chụp ít nhất một ảnh.');
    await ensureCv();
    const Q = QUALITY[quality.value];
    const doc = await PDFDocument.create();
    const font = ocrLayer.get() ? (await embedVnFonts(doc)).regular : null;
    if (autoRot.get() || ocrLayer.get()) {
      const { getOcr } = await import('../core/ocr.js');
      await getOcr((t, f) => pr.set(5 + 10 * (f || 0), t));
    }
    let bytesBw = 0;
    for (let i = 0; i < items.length; i++) {
      pr.set(15 + (i / items.length) * 80, `Đang xử lý trang ${i + 1}/${items.length}…`);
      await tick();
      const { canvas: c, bw } = await processPage(items[i], { side: Q.side });
      const m = +margin.value * MM;
      let pw, ph;
      if (size.value === 'img') { const k = 595.28 / (c.width > c.height ? c.height : c.width); pw = c.width * k + 2 * m; ph = c.height * k + 2 * m; }
      else { const [a, b] = SIZES[size.value]; [pw, ph] = c.width > c.height ? [b, a] : [a, b]; }
      const s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
      const box = { x: (pw - c.width * s) / 2, y: (ph - c.height * s) / 2, width: c.width * s, height: c.height * s };
      const page = doc.addPage([pw, ph]);
      if (bw) { drawBwImage(doc, page, c, box); bytesBw++; }
      else page.drawImage(await doc.embedJpg(await (await canvasToBlob(c, 'image/jpeg', Q.q)).arrayBuffer()), box);
      if (font) {
        pr.set(15 + ((i + 0.6) / items.length) * 80, `Đang nhận dạng chữ trang ${i + 1}/${items.length}…`);
        const { recognize, drawOcrText } = await import('../core/ocr.js');
        const r = await recognize(c);
        drawOcrText(page, font, r.lines, { x: box.x, y: box.y, s, h: c.height });
      }
      c.width = c.height = 0;
    }
    const blob = await savePdf(doc);
    pr.hide();
    const note = [`${items.length} trang`, size.value === 'img' ? null : size.value.toUpperCase(), bytesBw ? 'đen trắng nén 1 bit' : null, font ? 'có lớp chữ' : null].filter(Boolean).join(' · ');
    await showResult(st, [{ blob, name: `${baseName(items[0].file.name)}_scan.pdf` }], { note, tool: 'Scan → PDF' });
  }));

  return h('section', { class: 'card' },
    title ? h('h2', null, title) : null, sub ? h('p', { class: 'sub' }, sub) : null,
    h('div', { class: 'grid2' }, drop, cam), pr.el, list, editor,
    field('Chế độ màu', mode.el),
    h('div', { class: 'mt' }, autoRot.el, ocrLayer.el),
    h('div', { class: 'grid3' }, field('Khổ trang', size), field('Lề trang', margin), field('Chất lượng', quality)),
    h('div', { class: 'row mt' }, go), st.el);
}
