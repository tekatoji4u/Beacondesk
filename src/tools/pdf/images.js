// Ảnh sang PDF, PDF sang ảnh, hiệu ứng (đảo màu, máy quét, đen trắng, chỉnh màu).
import { h, dropzone, progress, status, run, button, fmtSize, field, num, select, seg, checkbox, tick, baseName } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { PDFDocument, savePdf, openPdfjs, renderPage, canvasToBlob, MM } from '../../core/pdf.js';
import { loadBitmap, toCanvas, grayArray, putGray, autoContrast, adaptiveBinarize } from '../../core/image.js';
import { showResult } from '../../core/result.js';
import { zipOutputs } from '../../core/zip.js';
import { pdfTool, pdfOut } from './common.js';

const A4 = [595.28, 841.89];

// ---------- Ảnh sang PDF ----------
export function img2pdf() {
  let items = [];
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const paint = () => list.replaceChildren(...items.map((it, i) => h('li', null,
    it.thumb, h('span', { class: 'nm' }, `${i + 1}. ${it.file.name}`), h('span', { class: 'meta' }, fmtSize(it.file.size)),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Lên', disabled: i === 0, html: icon('up'), onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; paint(); } }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xuống', disabled: i === items.length - 1, html: icon('down'), onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; paint(); } }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ', html: icon('x'), onclick: () => { items.splice(i, 1); paint(); } }))));
  const add = async (files) => {
    for (const f of files) {
      const thumb = h('img', { alt: '', style: 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex:none;background:#fff' });
      items.push({ file: f, thumb });
      loadBitmap(f).then((b) => { const c = toCanvas(b, { max: 80 }); thumb.src = c.toDataURL('image/jpeg', 0.7); b.close?.(); }).catch(() => {});
    }
    paint();
  };
  const drop = dropzone({ accept: 'image/*,.heic,.heif', multiple: true, title: 'Chọn ảnh (JPG, PNG, WEBP, HEIC…)', hint: 'Thứ tự trang theo danh sách bên dưới', iconName: 'image', onFiles: add });
  const cam = dropzone({ accept: 'image/*', capture: 'environment', title: 'Chụp ảnh', hint: 'Dùng camera của thiết bị', iconName: 'camera', onFiles: add });
  const size = select([{ value: 'a4', label: 'A4 – tự xoay dọc/ngang theo ảnh' }, { value: 'a4p', label: 'A4 dọc' }, { value: 'img', label: 'Theo kích thước ảnh' }], 'a4');
  const margin = select([{ value: '0', label: 'Không lề' }, { value: '10', label: '10 mm' }, { value: '20', label: '20 mm' }], '10');
  const q = select([{ value: '0.92', label: 'Cao' }, { value: '0.8', label: 'Cân bằng' }, { value: '0.6', label: 'Nhỏ gọn' }], '0.8');
  const go = button('Tạo PDF', { kind: 'btn-primary', iconName: 'play' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!items.length) throw new Error('Chưa chọn ảnh.');
    const doc = await PDFDocument.create();
    for (let i = 0; i < items.length; i++) {
      pr.set((i / items.length) * 95, `Đang xử lý ảnh ${i + 1}/${items.length}`);
      await tick();
      const bmp = await loadBitmap(items[i].file);
      const c = toCanvas(bmp, { max: 3000 });
      bmp.close?.();
      const isPng = /png/i.test(items[i].file.type) && items[i].file.size < 3e6;
      const bytes = await (await canvasToBlob(c, isPng ? 'image/png' : 'image/jpeg', +q.value)).arrayBuffer();
      const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const m = +margin.value * MM;
      let pw, ph;
      if (size.value === 'img') { pw = c.width * 0.75 + 2 * m; ph = c.height * 0.75 + 2 * m; }
      else if (size.value === 'a4' && c.width > c.height) [pw, ph] = [A4[1], A4[0]];
      else [pw, ph] = A4;
      const s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
      const w = c.width * s, hh = c.height * s;
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
      c.width = c.height = 0;
    }
    const blob = await savePdf(doc);
    pr.hide();
    await showResult(st, [pdfOut(blob, `${baseName(items[0].file.name)}_${items.length}-anh.pdf`)], { note: `${items.length} trang`, tool: 'Ảnh sang PDF' });
  }));
  return h('section', { class: 'card' }, h('h2', null, 'Ảnh sang PDF'), h('p', { class: 'sub' }, 'Gộp nhiều ảnh thành một tệp PDF. Ảnh chụp tài liệu cần nắn thẳng, làm rõ chữ thì dùng mục "In ấn PDF A4".'),
    h('div', { class: 'grid2' }, drop, cam), list,
    h('div', { class: 'grid3' }, field('Khổ trang', size), field('Lề', margin), field('Chất lượng ảnh', q)),
    h('div', { class: 'actions' }, go), pr.el, st.el);
}

// ---------- PDF sang ảnh ----------
export function pdf2img() {
  return pdfTool({
    title: 'PDF sang ảnh', sub: 'Xuất các trang thành ảnh JPG hoặc PNG. Nhiều trang được gói trong một tệp ZIP.', label: 'Xuất ảnh', icon: 'image',
    pages: 'select', pagesLabel: 'Trang cần xuất',
    options() {
      const fmt = seg([{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }], 'jpg');
      const dpi = select([{ value: '96', label: '96 dpi – xem trên màn hình' }, { value: '150', label: '150 dpi – cân bằng' }, { value: '200', label: '200 dpi – rõ nét' }, { value: '300', label: '300 dpi – in ấn' }], '150');
      return { el: h('div', { class: 'grid2' }, field('Định dạng', fmt.el), field('Độ phân giải', dpi)), read: () => ({ fmt: fmt.get(), dpi: +dpi.value }) };
    },
    async action({ file, pages, opts, base, progress: pr }) {
      const src = await openPdfjs(file);
      const outs = [];
      for (let k = 0; k < pages.length; k++) {
        pr((k / pages.length) * 90, `Đang xuất trang ${pages[k] + 1}`);
        await tick();
        const c = await renderPage(await src.getPage(pages[k] + 1), opts.dpi / 72, { maxSide: 7000 });
        const blob = await canvasToBlob(c, opts.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.9);
        outs.push({ blob, name: `${base}_tr${pages[k] + 1}.${opts.fmt}` });
        c.width = c.height = 0;
      }
      src.destroy();
      if (outs.length === 1) return outs;
      pr(95, 'Đang đóng gói ZIP…');
      return { outs: [{ blob: await zipOutputs(outs), name: `${base}_anh.zip` }], note: `${outs.length} ảnh` };
    },
  });
}

// ---------- Hiệu ứng ----------
export function effects() {
  return pdfTool({
    title: 'Đảo màu · Máy quét · Đen trắng', sub: 'Mỗi trang được dựng lại thành ảnh nên sẽ không còn chọn được chữ.', label: 'Áp dụng hiệu ứng', icon: 'contrast',
    pages: 'select', pagesLabel: 'Trang áp dụng (các trang khác giữ nguyên)',
    options() {
      const fx = select([
        { value: 'invert', label: 'Đảo ngược màu (đọc ban đêm)' }, { value: 'scan', label: 'Hiệu ứng máy quét (giấy hơi nghiêng, nhiễu nhẹ)' },
        { value: 'bw', label: 'Đen trắng rõ nét (văn bản)' }, { value: 'gray', label: 'Thang xám' }, { value: 'adjust', label: 'Điều chỉnh sáng / tương phản / màu' },
      ], 'invert');
      const dpi = select([{ value: '110', label: '110 dpi – nhẹ' }, { value: '150', label: '150 dpi – cân bằng' }, { value: '200', label: '200 dpi – nét' }], '150');
      const br = h('input', { type: 'range', min: '-60', max: '60', value: '0' });
      const ct = h('input', { type: 'range', min: '-60', max: '80', value: '0' });
      const sa = h('input', { type: 'range', min: '-100', max: '100', value: '0' });
      const adj = h('div', { class: 'grid3' }, field('Độ sáng', br), field('Tương phản', ct), field('Độ bão hoà màu', sa));
      const sync = () => { adj.hidden = fx.value !== 'adjust'; };
      fx.addEventListener('change', sync); sync();
      return { el: h('div', null, h('div', { class: 'grid2' }, field('Hiệu ứng', fx), field('Độ phân giải', dpi)), adj), read: () => ({ fx: fx.value, dpi: +dpi.value, br: +br.value, ct: +ct.value, sa: +sa.value }) };
    },
    async action({ file, doc, pages, opts, base, progress: pr }) {
      const src = await openPdfjs(file);
      const sel = new Set(pages);
      const out = await PDFDocument.create();
      const n = doc.getPageCount();
      for (let i = 0; i < n; i++) {
        pr((i / n) * 92, `Đang xử lý trang ${i + 1}/${n}`);
        await tick();
        if (!sel.has(i)) { out.addPage((await out.copyPages(doc, [i]))[0]); continue; }
        const p = await src.getPage(i + 1);
        const vp = p.getViewport({ scale: 1 });
        let c = await renderPage(p, opts.dpi / 72);
        c = applyFx(c, opts);
        const jpg = await canvasToBlob(c, 'image/jpeg', 0.85);
        const img = await out.embedJpg(await jpg.arrayBuffer());
        out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }
      src.destroy();
      return [pdfOut(await savePdf(out), `${base}_${opts.fx}.pdf`)];
    },
  });
}

function applyFx(c, o) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (o.fx === 'gray' || o.fx === 'bw') {
    let g = grayArray(c);
    if (o.fx === 'bw') g = adaptiveBinarize(autoContrast(g), c.width, c.height);
    return putGray(c, g);
  }
  if (o.fx === 'scan') {
    const g = autoContrast(grayArray(c));
    for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, g[i] * 0.94 + 8 + (Math.random() - 0.5) * 14));
    putGray(c, g);
    const o2 = document.createElement('canvas');
    o2.width = c.width; o2.height = c.height;
    const g2 = o2.getContext('2d');
    g2.fillStyle = '#f4f3ee'; g2.fillRect(0, 0, o2.width, o2.height);
    g2.translate(o2.width / 2, o2.height / 2); g2.rotate(((Math.random() - 0.5) * 1.2 * Math.PI) / 180);
    g2.filter = 'blur(0.35px)';
    g2.drawImage(c, -c.width / 2, -c.height / 2);
    return o2;
  }
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const a = id.data;
  if (o.fx === 'invert') {
    // đảo độ sáng nhưng giữ sắc màu (giống chế độ tối của trình đọc)
    for (let i = 0; i < a.length; i += 4) { a[i] = 255 - a[i]; a[i + 1] = 255 - a[i + 1]; a[i + 2] = 255 - a[i + 2]; }
  } else {
    const b = o.br * 2.2, k = (259 * (o.ct * 2.55 + 255)) / (255 * (259 - o.ct * 2.55)), s = 1 + o.sa / 100;
    for (let i = 0; i < a.length; i += 4) {
      let r = a[i], g = a[i + 1], bl = a[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = l + (r - l) * s; g = l + (g - l) * s; bl = l + (bl - l) * s;
      a[i] = k * (r + b - 128) + 128; a[i + 1] = k * (g + b - 128) + 128; a[i + 2] = k * (bl + b - 128) + 128;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
