// Ghép 2 mặt thẻ (CCCD, BHYT, bằng lái…) lên một trang A4 như bản phô tô.
// Ảnh chụp điện thoại → tự bắt mép, nắn phẳng, cắt sát mép → làm sạch nền để in không bị đen
// → đặt đúng kích thước thật lên A4 → xuất PDF. Mọi xử lý chạy trên máy.
import { h, dropzone, field, num, select, seg, checkbox, button, status, run, progress, input, tick } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pref, setPref } from '../core/store.js';
import { PDFDocument, savePdf, canvasToBlob, drawBwImage, MM } from '../core/pdf.js';
import { loadBitmap, toCanvas } from '../core/image.js';
import { rot90 } from '../core/ocr.js';
import { quadEditor } from '../core/quadedit.js';
import { showResult } from '../core/result.js';
import { scanner } from './scan.js';

const A4 = [210, 297];
const TEMPLATES = {
  id1: { label: 'CCCD, BHYT, bằng lái, thẻ ATM (85,6 × 54 mm)', w: 85.6, h: 54 },
  passport: { label: 'Hộ chiếu – trang ảnh (125 × 88 mm)', w: 125, h: 88 },
  custom: { label: 'Tuỳ chỉnh' },
};
const MODES = [
  { value: 'clean', label: 'Làm sạch nền trắng (in như phô tô)' },
  { value: 'strong', label: 'Tẩy nền mạnh (bỏ hoa văn, chữ đậm)' },
  { value: 'gray', label: 'Thang xám' },
  { value: 'bw', label: 'Đen trắng' },
  { value: 'color', label: 'Màu gốc' },
];
const PREVIEW_W = 640; // độ rộng ảnh thẻ khi xem trước (điểm ảnh)

let cv = null, scanMod = null; // OpenCV và core/scan.js, nạp khi chọn ảnh đầu tiên

export function render({ sub } = {}) {
  const tabs = seg([{ value: 'pair', label: 'Ghép 2 mặt (A4)' }, { value: 'multi', label: 'Nhiều trang (ảnh → PDF)' }], sub === 'multi' ? 'multi' : 'pair', (v) => show(v));
  const pair = pairMode();
  let multi = null;
  const holder = h('div');
  const show = (v) => holder.replaceChildren(v === 'multi' ? (multi ||= scanner({ title: 'Nhiều trang ảnh → PDF', sub: 'Mỗi ảnh là một trang A4, tự bắt mép và nắn phẳng như máy scan.' })) : pair);
  show(sub === 'multi' ? 'multi' : 'pair');
  return h('div', null,
    h('section', { class: 'card' }, h('h2', null, 'Ghép 2 mặt thẻ lên một trang A4'),
      h('p', { class: 'sub' }, 'Chụp hai mặt CCCD hoặc thẻ bằng điện thoại, ứng dụng tự cắt sát mép, đặt đúng kích thước thật và xuất PDF in ra giống bản phô tô.'),
      tabs.el),
    holder);
}

function pairMode() {
  const st = status(), pr = progress();
  const P = pref('idcard', {});
  const tpl = select(Object.entries(TEMPLATES).map(([value, t]) => ({ value, label: t.label })), P.tpl || 'id1');
  const wIn = num(P.w ?? 85.6, 20, 200, 0.1), hIn = num(P.h ?? 54, 20, 200, 0.1);
  const scale = h('input', { type: 'range', min: 50, max: 200, step: 1, value: P.scale ?? 100 });
  const scaleIn = num(P.scale ?? 100, 50, 200, 1);
  const gap = num(P.gap ?? 10, 0, 100, 0.5), top = num(P.top ?? 22, 0, 150, 0.5);
  const dpi = select([{ value: 200, label: '200 dpi' }, { value: 300, label: '300 dpi (chuẩn)' }, { value: 600, label: '600 dpi' }], P.dpi ?? 300);
  const pad = num(P.pad ?? 0, -5, 10, 0.5);
  const round = checkbox('Bo tròn 4 góc thẻ', P.round ?? true);
  const outline = checkbox('Kẻ viền mảnh quanh thẻ (thấy rõ mép khi in nền trắng)', P.outline ?? true);
  const name = input({ value: 'CCCD_2_mat_A4.pdf', 'aria-label': 'Tên tệp' });

  const opts = () => ({
    w: Math.max(20, +wIn.value || 85.6), h: Math.max(20, +hIn.value || 54), scale: Math.max(10, +scaleIn.value || 100),
    gap: +gap.value || 0, top: +top.value || 0, dpi: +dpi.value, pad: +pad.value || 0, round: round.get(), outline: outline.get(),
  });
  const save = () => { const o = opts(); setPref('idcard', { tpl: tpl.value, w: o.w, h: o.h, scale: o.scale, gap: o.gap, top: o.top, dpi: o.dpi, pad: o.pad, round: o.round, outline: o.outline }); };

  let order = ['front', 'back'];
  const slots = { front: slot('front', '1. Mặt trước'), back: slot('back', '2. Mặt sau') };

  // ---------- Xem trước A4 ----------
  const a4 = h('canvas', { class: 'idc-a4', role: 'img', 'aria-label': 'Xem trước trang A4' });
  const a4Note = h('p', { class: 'sub idc-a4-note' });
  let a4Timer = 0;
  const paintA4 = () => { cancelAnimationFrame(a4Timer); a4Timer = requestAnimationFrame(drawA4); };
  function drawA4() {
    const o = opts();
    const cssW = Math.min(360, a4.parentElement?.clientWidth || 360);
    const k = (cssW * (devicePixelRatio || 1)) / A4[0];
    a4.width = Math.round(A4[0] * k); a4.height = Math.round(A4[1] * k);
    const g = a4.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, a4.width, a4.height);
    const rects = layout(o);
    order.forEach((id, i) => {
      const r = rects[i], s = slots[id];
      if (s.preview) g.drawImage(s.preview, r.x * k, r.y * k, r.w * k, r.h * k);
      else {
        g.setLineDash([4, 4]); g.strokeStyle = '#9aa7b6'; g.lineWidth = 1;
        g.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
        g.setLineDash([]); g.fillStyle = '#9aa7b6'; g.font = `${Math.round(3.5 * k)}px system-ui, sans-serif`; g.textAlign = 'center';
        g.fillText(id === 'front' ? 'Mặt trước' : 'Mặt sau', (r.x + r.w / 2) * k, (r.y + r.h / 2) * k);
      }
    });
    const last = rects[1];
    const over = last.y + last.h > A4[1] || last.w > A4[0];
    a4Note.textContent = `A4 · thẻ ${fmt(o.w * o.scale / 100)} × ${fmt(o.h * o.scale / 100)} mm (tỷ lệ ${fmt(o.scale)}%)` + (over ? ' — vượt quá khổ giấy, hãy giảm tỷ lệ, khoảng cách hoặc lề trên.' : '');
    a4Note.classList.toggle('warn-text', over);
  }

  // ---------- Một mặt thẻ ----------
  function slot(id, title) {
    const s = { id, c: null, quad: null, auto: null, full: false, rot: 0, fine: 0, bright: 0, contrast: 0, mode: 'clean', preview: null, file: null };
    const sst = status();
    const cardImg = h('img', { class: 'idc-card', alt: title });
    const editor = h('div', { class: 'idc-editor', hidden: true });
    const drop = dropzone({ accept: 'image/*,.heic,.heif', title: 'Chọn ảnh ' + (id === 'front' ? 'mặt trước' : 'mặt sau'), hint: 'JPG, PNG, ảnh chụp điện thoại', iconName: 'image', onFiles: ([f]) => load(f) });
    const cam = dropzone({ accept: 'image/*', capture: 'environment', title: 'Chụp ảnh', hint: 'Đặt thẻ trên nền tối, chụp thẳng, đủ 4 góc', iconName: 'camera', onFiles: ([f]) => load(f) });
    const pick = h('div', { class: 'grid2' }, drop, cam);
    const fineR = h('input', { type: 'range', min: -15, max: 15, step: 0.1, value: 0, 'aria-label': 'Xoay tinh chỉnh' });
    const fineIn = num(0, -15, 15, 0.1);
    const brR = h('input', { type: 'range', min: -100, max: 100, step: 1, value: 0, 'aria-label': 'Độ sáng' });
    const ctR = h('input', { type: 'range', min: -100, max: 100, step: 1, value: 0, 'aria-label': 'Độ tương phản' });
    const modeSel = select(MODES, 'clean');
    fineR.addEventListener('input', () => { fineIn.value = fineR.value; s.fine = +fineR.value; update(); });
    fineIn.addEventListener('input', () => { s.fine = Math.max(-15, Math.min(15, +fineIn.value || 0)); fineR.value = s.fine; update(); });
    brR.addEventListener('input', () => { s.bright = +brR.value; update(); });
    ctR.addEventListener('input', () => { s.contrast = +ctR.value; update(); });
    modeSel.addEventListener('change', () => { s.mode = modeSel.value; update(); });
    const rotBy = (d) => { s.rot = (s.rot + d + 360) % 360; update(0); };

    const editBtn = button('Chỉnh 4 góc', { iconName: 'crop', onClick: () => { editor.hidden = !editor.hidden; editBtn.setAttribute('aria-pressed', String(!editor.hidden)); } });
    const tools = h('div', { hidden: true },
      h('div', { class: 'idc-result' }, cardImg),
      h('div', { class: 'row mt' },
        button('Chọn ảnh khác', { iconName: 'image', onClick: () => drop.querySelector('input').click() }),
        editBtn,
        button('Tự bắt mép lại', { iconName: 'wand', onClick: () => { s.quad = s.auto.map((p) => [...p]); s.full = false; quad?.sync(); update(0); } }),
        button('Dùng cả ảnh', { kind: 'btn-ghost', iconName: 'image', onClick: () => { const { width: W, height: H } = s.c; s.quad = [[0, 0], [W, 0], [W, H], [0, H]]; s.full = true; quad?.sync(); update(0); } }),
        button('Khôi phục', { kind: 'btn-ghost', iconName: 'rotateL', onClick: reset })),
      editor,
      h('div', { class: 'idc-ctl mt' },
        h('span', null, 'Xoay'),
        h('div', { class: 'row idc-rot' },
          h('button', { type: 'button', class: 'btn btn-sm btn-icon', title: 'Xoay trái 90°', 'aria-label': 'Xoay trái 90°', html: icon('rotateL'), onclick: () => rotBy(-90) }),
          h('button', { type: 'button', class: 'btn btn-sm btn-icon', title: 'Xoay phải 90°', 'aria-label': 'Xoay phải 90°', html: icon('rotate'), onclick: () => rotBy(90) }),
          fineR, h('span', { class: 'idc-num' }, fineIn, '°')),
        h('span', null, 'Sáng'), brR,
        h('span', null, 'Tương phản'), ctR,
        h('span', null, 'Nền in'), modeSel),
      sst.el);
    let quad = null;

    function reset() {
      Object.assign(s, { quad: s.auto.map((p) => [...p]), full: false, rot: s.autoRot, fine: 0, bright: 0, contrast: 0, mode: 'clean' });
      fineR.value = fineIn.value = brR.value = ctR.value = 0; modeSel.value = 'clean';
      quad?.sync(); update(0);
    }

    async function load(f) {
      await run(null, sst, async () => {
        pr.set(5, 'Đang nạp bộ xử lý ảnh (lần đầu khoảng 11 MB, sau đó dùng được khi mất mạng)…');
        scanMod ||= await import('../core/scan.js');
        cv ||= await scanMod.loadCv();
        const { detectDocument } = scanMod;
        pr.set(50, `Đang bắt mép thẻ trong ${f.name}…`);
        await tick();
        const bmp = await loadBitmap(f);
        const c = toCanvas(bmp, { max: 3200 });
        bmp.close?.();
        const det = detectDocument(cv, c);
        const q = det?.quad || (await import('../core/warp.js')).detectQuad(c);
        const W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
        // thẻ chụp dọc → tự xoay ngang cho khớp khung mẫu (người dùng vẫn chỉnh được)
        const autoRot = H > W * 1.1 ? 90 : 0;
        Object.assign(s, { file: f, c, quad: q, auto: q.map((p) => [...p]), full: false, rot: autoRot, autoRot, fine: 0, bright: 0, contrast: 0, mode: 'clean' });
        fineR.value = fineIn.value = brR.value = ctR.value = 0; modeSel.value = 'clean';
        quad = quadEditor(s, { onDone: () => update(0), alt: 'Ảnh gốc ' + title });
        editor.replaceChildren(h('p', { class: 'sub' }, 'Kéo 4 chấm vào đúng 4 góc thẻ (bàn phím: Tab chọn góc, phím mũi tên để dịch).'), quad.el);
        editor.hidden = !!det?.sure;
        editBtn.setAttribute('aria-pressed', String(!editor.hidden));
        pick.hidden = true; tools.hidden = false;
        pr.hide();
        update(0);
        if (!det?.sure) sst.warn('Chưa chắc đã bắt đúng mép thẻ: hãy kéo 4 chấm vào đúng 4 góc thẻ.');
      });
      pr.hide();
    }

    let timer = 0;
    function update(delay = 120) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!s.c) return;
        const o = opts();
        s.preview = renderCard(s, o, PREVIEW_W, Math.round(PREVIEW_W * o.h / o.w));
        cardImg.src = s.preview.toDataURL('image/jpeg', 0.85);
        paintA4();
      }, delay);
    }
    s.update = update;
    s.el = h('section', { class: 'card' }, h('h2', null, title), h('div', { class: 'mt' }, pick, tools));
    return s;
  }

  // ---------- Cấu hình ----------
  const onLayout = () => { save(); paintA4(); };
  const onShape = () => { save(); for (const s of Object.values(slots)) s.update?.(); paintA4(); };
  tpl.addEventListener('change', () => { const t = TEMPLATES[tpl.value]; if (t.w) { wIn.value = t.w; hIn.value = t.h; } onShape(); });
  for (const el of [wIn, hIn]) el.addEventListener('input', () => { const t = Object.entries(TEMPLATES).find(([, v]) => v.w === +wIn.value && v.h === +hIn.value); tpl.value = t ? t[0] : 'custom'; onShape(); });
  scale.addEventListener('input', () => { scaleIn.value = scale.value; onLayout(); });
  scaleIn.addEventListener('input', () => { scale.value = scaleIn.value; onLayout(); });
  for (const el of [gap, top]) el.addEventListener('input', onLayout);
  dpi.addEventListener('change', save);
  pad.addEventListener('input', onShape);
  round.input.addEventListener('change', onShape);
  outline.input.addEventListener('change', onShape);

  const swap = button('Đảo trước ↔ sau', { iconName: 'layers', onClick: () => { order = order.reverse(); orderNote.textContent = orderText(); paintA4(); } });
  const orderText = () => `Thứ tự trên A4: ${order[0] === 'front' ? 'mặt trước' : 'mặt sau'} (trên), ${order[1] === 'front' ? 'mặt trước' : 'mặt sau'} (dưới)`;
  const orderNote = h('span', { class: 'sub', style: 'margin:0' }, orderText());

  const go = button('Xuất PDF A4', { kind: 'btn-primary', iconName: 'printer' });
  go.addEventListener('click', () => run(go, st, async () => { try { await exportPdf(); } finally { pr.hide(); } }));
  async function exportPdf() {
    const have = order.filter((id) => slots[id].c);
    if (!have.length) throw new Error('Hãy chọn ảnh mặt trước và mặt sau.');
    const o = opts();
    const rects = layout(o);
    const doc = await PDFDocument.create();
    const page = doc.addPage([A4[0] * MM, A4[1] * MM]);
    for (const [i, id] of order.entries()) {
      const s = slots[id];
      if (!s.c) continue;
      pr.set(20 + i * 40, `Đang xử lý ${id === 'front' ? 'mặt trước' : 'mặt sau'} ở ${o.dpi} dpi…`);
      await tick();
      const r = rects[i];
      const W = Math.round((r.w / 25.4) * o.dpi), H = Math.round((r.h / 25.4) * o.dpi);
      const c = renderCard(s, o, W, H);
      const box = { x: r.x * MM, y: (A4[1] - r.y - r.h) * MM, width: r.w * MM, height: r.h * MM };
      if (s.mode === 'bw') drawBwImage(doc, page, c, box);
      else page.drawImage(await doc.embedJpg(await (await canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer()), box);
      c.width = c.height = 0;
    }
    pr.set(95, 'Đang lưu PDF…');
    const blob = await savePdf(doc);
    let fn = (name.value || 'CCCD_2_mat_A4').trim().replace(/[\\/:*?"<>|]+/g, '_');
    if (!/\.pdf$/i.test(fn)) fn += '.pdf';
    await showResult(st, [{ blob, name: fn }], { note: `A4 · ${have.length === 2 ? '2 mặt' : '1 mặt'} · ${fmt(o.w * o.scale / 100)} × ${fmt(o.h * o.scale / 100)} mm · ${o.dpi} dpi`, tool: 'Ghép 2 mặt thẻ' });
  }

  const side = h('div', { class: 'idc-side' },
    h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { style: 'margin:0' }, 'Xem trước trang in A4'), swap),
      orderNote,
      h('div', { class: 'idc-a4-wrap mt' }, a4), a4Note),
    h('section', { class: 'card' },
      h('h2', null, 'Kích thước và bố cục'),
      field('Kích thước mẫu', tpl),
      h('div', { class: 'grid2' }, field('Rộng thật (mm)', wIn), field('Cao thật (mm)', hIn)),
      field('Tỷ lệ phóng to / thu nhỏ cả 2 mặt (%)', h('div', { class: 'row idc-scale' }, scale, scaleIn)),
      h('div', { class: 'grid2' }, field('Khoảng cách 2 mặt (mm)', gap), field('Lề trên (mm)', top)),
      h('div', { class: 'grid2' }, field('Độ phân giải', dpi), field('Nới viền thẻ (%)', pad, 'Số dương lấy rộng ra ngoài mép, số âm cắt sát vào trong')),
      round.el, outline.el),
    h('section', { class: 'card' },
      h('h2', null, 'Xuất tệp PDF'),
      field('Tên tệp', name),
      h('div', { class: 'row mt' }, go), pr.el, st.el));

  paintA4();
  addEventListener('resize', paintA4);
  return h('div', { class: 'idc' }, h('div', { class: 'idc-slots' }, slots.front.el, slots.back.el), side);
}

/** Vị trí 2 thẻ trên A4 (mm): căn giữa ngang, xếp dọc từ lề trên. */
function layout(o) {
  const w = (o.w * o.scale) / 100, hh = (o.h * o.scale) / 100, x = (A4[0] - w) / 2;
  return [{ x, y: o.top, w, h: hh }, { x, y: o.top + hh + o.gap, w, h: hh }];
}

/** Dựng ảnh một mặt thẻ đúng kích thước W×H điểm ảnh. */
function renderCard(s, o, W, H) {
  // 1. Nắn phẳng và cắt theo 4 góc (hoặc dùng cả ảnh)
  let c;
  if (s.full) c = s.c;
  else {
    const { warpDocument } = scanMod;
    c = warpDocument(cv, s.c, s.quad, { maxSide: Math.max(W, H) * 1.2, snapA4: false, trim: -o.pad / 100 });
  }
  c = rot90(c, s.rot);
  // 2. Đặt vào khung mẫu, xoay tinh chỉnh quanh tâm
  let out = document.createElement('canvas');
  out.width = W; out.height = H;
  let g = out.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = 'high';
  g.save();
  g.translate(W / 2, H / 2);
  if (s.fine) g.rotate((s.fine * Math.PI) / 180);
  if (s.full) { const k = Math.min(W / c.width, H / c.height); g.drawImage(c, -c.width * k / 2, -c.height * k / 2, c.width * k, c.height * k); }
  else g.drawImage(c, -W / 2, -H / 2, W, H);
  g.restore();
  // 3. Sáng / tương phản, rồi làm sạch nền (đen trắng: chỉnh trước để làm ngưỡng)
  const bw = s.mode === 'bw';
  if (bw) adjust(out, s.bright, s.contrast);
  if (s.mode === 'clean') cleanCard(out);
  else if (s.mode !== 'color') out = scanMod.enhanceDocument(cv, out, { strong: 'auto', gray: 'gray', bw: 'bw' }[s.mode]).canvas;
  if (!bw) adjust(out, s.bright, s.contrast);
  // 4. Bo góc như thẻ thật (bán kính 3,18 mm theo chuẩn ID-1), kẻ viền mảnh
  const rad = o.round ? (3.18 / o.w) * W : 0;
  if (rad || o.outline) {
    const f = document.createElement('canvas');
    f.width = W; f.height = H;
    g = f.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const lw = o.outline ? Math.max(1, W / 450) : 0;
    g.save(); roundRect(g, lw / 2, lw / 2, W - lw, H - lw, rad); g.clip(); g.drawImage(out, 0, 0); g.restore();
    if (lw) { g.lineWidth = lw; g.strokeStyle = bw ? '#000' : '#6b7280'; roundRect(g, lw / 2, lw / 2, W - lw, H - lw, rad); g.stroke(); }
    out = f;
  }
  return out;
}

/**
 * Làm sạch nền thẻ nhẹ tay: bù ánh sáng không đều (lưới thô nên không ăn vào ảnh chân dung),
 * đẩy nền và hoa văn nhạt về trắng, bỏ ám màu ở vùng gần trắng — in ra không bị đen, ảnh vẫn rõ.
 */
function cleanCard(c) {
  const W = c.width, H = c.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  // 1. Độ sáng nền theo lưới 8×5 ô (phân vị 95% mỗi ô), làm mượt, rồi phóng lên cỡ ảnh
  const gx = 8, gy = 5, cell = new Float32Array(gx * gy);
  const step = Math.max(1, Math.round(W / 300));
  for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
    const v = [];
    for (let y = Math.floor(cy * H / gy); y < (cy + 1) * H / gy; y += step) for (let x = Math.floor(cx * W / gx); x < (cx + 1) * W / gx; x += step) v.push(lum((y * W + x) * 4));
    v.sort((a, b) => a - b);
    cell[cy * gx + cx] = v[Math.floor(v.length * 0.95)] || 255;
  }
  const top = Math.max(...cell);
  const sm = document.createElement('canvas');
  sm.width = gx; sm.height = gy;
  const sg = sm.getContext('2d', { willReadFrequently: true });
  const si = sg.createImageData(gx, gy);
  // không bù quá 1/3: ô tối hơn thế là nội dung (ảnh, chữ đậm), không phải bóng
  cell.forEach((v, i) => { si.data[i * 4] = si.data[i * 4 + 1] = si.data[i * 4 + 2] = Math.max(v, top * 0.75); si.data[i * 4 + 3] = 255; });
  sg.putImageData(si, 0, 0);
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const bgc = big.getContext('2d', { willReadFrequently: true });
  bgc.imageSmoothingQuality = 'high';
  bgc.drawImage(sm, 0, 0, W, H);
  const bg = bgc.getImageData(0, 0, W, H).data;
  // 2. Chia cho nền: hết bóng đổ, nền về gần trắng
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const k = 250 / Math.max(1, bg[i]);
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    hist[lum(i) | 0]++;
  }
  // 3. Kéo mức: điểm đen = phân vị 1%, điểm trắng = phân vị 55% (nền thẻ chiếm phần lớn diện tích)
  const n = W * H, at = (q) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * q) return i; } return 255; };
  const black = Math.min(60, at(0.01)), white = Math.max(black + 60, Math.min(248, Math.max(200, at(0.55) - 4)));
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = 255 * Math.min(1, Math.max(0, (i - black) / (white - black))) ** 1.1;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]], gg = lut[d[i + 1]], b = lut[d[i + 2]];
    // 4. Vùng gần trắng bỏ ám màu (hoa văn xanh nhạt thành xám rất nhạt), màu đậm giữ nguyên
    const L = r * 0.299 + gg * 0.587 + b * 0.114, k = Math.min(1, Math.max(0, (245 - L) / 75));
    d[i] = L + (r - L) * k; d[i + 1] = L + (gg - L) * k; d[i + 2] = L + (b - L) * k;
  }
  g.putImageData(id, 0, 0);
}

/** Sáng b và tương phản k (−100…100) bằng bảng tra trên từng điểm ảnh. */
function adjust(c, b, k) {
  if (!b && !k) return;
  const lut = new Uint8ClampedArray(256), ck = 1 + k / 100 * (k > 0 ? 1.5 : 0.8);
  for (let i = 0; i < 256; i++) lut[i] = (i - 128) * ck + 128 + b * 0.8;
  const g = c.getContext('2d', { willReadFrequently: true });
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  g.putImageData(id, 0, 0);
}

function roundRect(g, x, y, w, hh, r) {
  r = Math.min(r, w / 2, hh / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const fmt = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
