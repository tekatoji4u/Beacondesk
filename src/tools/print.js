// In ra A4: (1) ảnh chụp tài liệu → tự tìm 4 góc, nắn phẳng, làm rõ chữ → PDF A4;
// (2) Word/văn bản → dàn trang A4 có phông tiếng Việt; PDF khổ lạ → co về A4.
import { h, dropzone, field, select, seg, checkbox, button, status, run, progress, fmtSize, baseName, ext, tick } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { PDFDocument, savePdf, canvasToBlob, MM } from '../core/pdf.js';
import { loadBitmap, toCanvas, putGray, autoContrast, adaptiveBinarize, flattenLight } from '../core/image.js';
import { showResult } from '../core/result.js';

const A4 = [595.28, 841.89];

export function render({ sub } = {}) {
  const photo = photoMode();
  const docs = docMode();
  const tabs = seg([{ value: 'photo', label: 'Ảnh chụp → PDF A4' }, { value: 'doc', label: 'Word, PDF, văn bản → A4' }], sub === 'doc' ? 'doc' : 'photo', (v) => show(v));
  const holder = h('div');
  const show = (v) => holder.replaceChildren(v === 'doc' ? docs : photo);
  show(sub === 'doc' ? 'doc' : 'photo');
  return h('div', null, h('section', { class: 'card' }, h('h2', null, 'Chuẩn bị bản in A4'), h('p', { class: 'sub' }, 'Ảnh chụp bằng điện thoại được nắn thẳng như bản scan; văn bản được dàn lại đúng khổ A4.'), tabs.el), holder);
}

// ---------- Ảnh chụp ----------
function photoMode() {
  let items = [], cur = -1;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const editor = h('div', { class: 'quad-editor', hidden: true });

  async function add(files) {
    for (const f of files) {
      try {
        pr.set(10, `Đang đọc ${f.name}…`);
        await tick();
        const bmp = await loadBitmap(f);
        const c = toCanvas(bmp, { max: 2600 });
        bmp.close?.();
        const { detectQuad } = await import('../core/warp.js');
        const quad = detectQuad(c);
        const thumb = toCanvas(c, { max: 90 }).toDataURL('image/jpeg', 0.7);
        items.push({ file: f, c, quad, auto: quad.map((p) => [...p]), full: false, thumb });
      } catch (e) { st.err(e.message); }
    }
    pr.hide();
    if (cur < 0 && items.length) cur = 0;
    paint();
  }
  function paint() {
    list.replaceChildren(...items.map((it, i) => h('li', { style: i === cur ? 'outline:2px solid var(--accent);outline-offset:-2px' : '' },
      h('img', { src: it.thumb, alt: '', style: 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex:none' }),
      h('span', { class: 'nm' }, `${i + 1}. ${it.file.name}`),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { cur = i; paint(); } }, 'Chỉnh khung'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Lên', disabled: i === 0, html: icon('up'), onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; cur = i - 1; paint(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xuống', disabled: i === items.length - 1, html: icon('down'), onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; cur = i + 1; paint(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ', html: icon('x'), onclick: () => { items.splice(i, 1); cur = Math.min(cur, items.length - 1); paint(); } }))));
    paintEditor();
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
        const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); };
        d.addEventListener('pointermove', move);
        d.addEventListener('pointerup', up);
      });
      d.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? W / 20 : W / 100;
        const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
        if (!dx && !dy) return;
        e.preventDefault();
        it.quad[k] = [Math.max(0, Math.min(W, it.quad[k][0] + dx)), Math.max(0, Math.min(H, it.quad[k][1] + dy))];
        sync();
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
      h('p', { class: 'sub' }, `Ảnh ${cur + 1}/${items.length}: kéo 4 chấm vào đúng 4 góc trang giấy (bàn phím: Tab chọn góc, phím mũi tên để dịch).`),
      h('div', { class: 'quad-stage' }, img, svg),
      h('div', { class: 'row mt' },
        button('Đặt lại khung tự động', { iconName: 'wand', onClick: () => { it.quad = it.auto.map((p) => [...p]); it.full = false; sync(); } }),
        button('Không cắt, dùng cả ảnh', { kind: 'btn-ghost', iconName: 'image', onClick: () => { it.quad = [[0, 0], [W, 0], [W, H], [0, H]]; it.full = true; sync(); } })));
  }

  const drop = dropzone({ accept: 'image/*,.heic,.heif', multiple: true, title: 'Chọn ảnh chụp tài liệu', hint: 'Có thể chọn nhiều ảnh; sắp xếp lại thứ tự bên dưới', iconName: 'image', onFiles: add });
  const cam = dropzone({ accept: 'image/*', capture: 'environment', title: 'Chụp tài liệu', hint: 'Dùng camera điện thoại', iconName: 'camera', onFiles: add });
  const enh = seg([{ value: 'color', label: 'Màu gốc' }, { value: 'contrast', label: 'Làm rõ chữ' }, { value: 'bw', label: 'Đen trắng (như scan)' }], 'contrast');
  const margin = select([{ value: '0', label: 'Không lề' }, { value: '5', label: 'Sát lề (5 mm)' }, { value: '10', label: 'Vừa (10 mm)' }, { value: '15', label: 'Rộng (15 mm)' }], '5');
  const q = select([{ value: '0.9', label: 'Cao' }, { value: '0.8', label: 'Cân bằng' }, { value: '0.65', label: 'Nhỏ gọn' }], '0.8');

  const go = button('Tạo PDF A4', { kind: 'btn-primary', iconName: 'printer' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!items.length) throw new Error('Hãy chọn ít nhất một ảnh.');
    const { warpToA4 } = await import('../core/warp.js');
    const doc = await PDFDocument.create();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      pr.set((i / items.length) * 92, `Đang nắn ảnh ${i + 1}/${items.length}…`);
      await tick();
      let c = it.full ? it.c : warpToA4(it.c, it.quad);
      if (enh.get() !== 'color') {
        const o = document.createElement('canvas');
        o.width = c.width; o.height = c.height;
        o.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0);
        let g = autoContrast(flattenLight(o));
        if (enh.get() === 'bw') g = adaptiveBinarize(g, o.width, o.height, { k: 0.15 });
        c = putGray(o, g);
      }
      const img = await doc.embedJpg(await (await canvasToBlob(c, 'image/jpeg', +q.value)).arrayBuffer());
      const [pw, ph] = c.width > c.height ? [A4[1], A4[0]] : A4;
      const m = +margin.value * MM;
      const s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - c.width * s) / 2, y: (ph - c.height * s) / 2, width: c.width * s, height: c.height * s });
    }
    const blob = await savePdf(doc);
    pr.hide();
    await showResult(st, [{ blob, name: `${baseName(items[0].file.name)}_A4.pdf` }], { note: `${items.length} trang · khổ A4`, tool: 'In A4' });
  }));

  return h('section', { class: 'card' },
    h('div', { class: 'grid2' }, drop, cam), pr.el, list, editor,
    field('Làm rõ ảnh', enh.el),
    h('div', { class: 'grid2' }, field('Lề trang', margin), field('Chất lượng ảnh', q)),
    h('div', { class: 'row mt' }, go), st.el);
}

// ---------- Văn bản ----------
function docMode() {
  let file = null;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const drop = dropzone({ accept: '.docx,.pdf,.txt,.md', title: 'Chọn tệp Word, PDF hoặc .txt', hint: 'Word và văn bản được dàn lại; PDF được co về đúng khổ A4', iconName: 'printer', onFiles: ([f]) => {
    file = f;
    list.replaceChildren(h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size))));
    const pdf = ext(f.name) === 'pdf';
    textOpts.hidden = pdf; pdfOpts.hidden = !pdf;
  } });
  const size = select([{ value: '12', label: '12 pt' }, { value: '13', label: '13 pt' }, { value: '14', label: '14 pt' }], '13');
  const marg = select([{ value: 'nd30', label: 'Văn bản hành chính (trên/dưới 20, trái 30, phải 15 mm)' }, { value: 'std', label: 'Chuẩn văn phòng (20 mm)' }, { value: 'narrow', label: 'Hẹp (15 mm)' }], 'nd30');
  const nums = checkbox('Đánh số trang ở chân trang', true);
  const fit = select([{ value: '0', label: 'Không lề (phóng tối đa)' }, { value: '5', label: '5 mm' }, { value: '10', label: '10 mm' }, { value: '15', label: '15 mm' }], '5');
  const textOpts = h('div', null, h('div', { class: 'grid2' }, field('Cỡ chữ', size), field('Lề trang', marg)), nums.el);
  const pdfOpts = h('div', { hidden: true }, field('Lề khi co trang PDF về A4', fit));
  const go = button('Tạo PDF A4', { kind: 'btn-primary', iconName: 'printer' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!file) throw new Error('Hãy chọn tệp cần chuyển.');
    const { blocksToPdf, pdfToA4 } = await import('../core/textpdf.js');
    let blob;
    pr.set(20, 'Đang đọc tệp…');
    if (ext(file.name) === 'pdf') {
      pr.set(50, 'Đang dàn trang A4…');
      blob = await pdfToA4(file, { margin: +fit.value });
    } else {
      const { readDocument } = await import('../core/text.js');
      const d = await readDocument(file);
      pr.set(50, 'Đang dàn trang A4…');
      const M = { nd30: { top: 20, bottom: 20, left: 30, right: 15 }, std: { top: 20, bottom: 20, left: 20, right: 20 }, narrow: { top: 15, bottom: 15, left: 15, right: 15 } }[marg.value];
      blob = await blocksToPdf(d.blocks, { size: +size.value, margin: M, pageNumbers: nums.get() });
    }
    pr.hide();
    await showResult(st, [{ blob, name: baseName(file.name) + '_A4.pdf' }], { note: 'khổ A4', tool: 'In A4' });
  }));
  return h('section', { class: 'card' }, drop, list, h('div', { class: 'mt' }, textOpts, pdfOpts), h('div', { class: 'row mt' }, go), pr.el, st.el);
}
