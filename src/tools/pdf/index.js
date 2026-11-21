// Trang "Công cụ PDF": lưới công cụ có tìm kiếm (không phân biệt dấu) + mở từng công cụ.
import { h, noAccent } from '../../core/ui.js';
import { icon, tintStyle } from '../../core/icons.js';
import { feedVisible } from '../../core/handoff.js';

export const PDF_TOOLS = [
  ['Công cụ phổ biến', [
    ['merge', 'Ghép PDF', 'merge', 'blue', () => import('./basic.js').then((m) => m.merge())],
    ['split', 'Tách PDF', 'split', 'blue', () => import('./basic.js').then((m) => m.split())],
    ['organize', 'Sắp xếp trang', 'layers', 'indigo', () => import('./basic.js').then((m) => m.organize())],
    ['extract', 'Trích trang', 'extract', 'indigo', () => import('./basic.js').then((m) => m.extract())],
    ['rotate', 'Xoay trang', 'rotate', 'teal', () => import('./basic.js').then((m) => m.rotate())],
    ['delete', 'Xoá trang', 'trash', 'red', () => import('./basic.js').then((m) => m.remove())],
    ['compress', 'Nén dung lượng', 'shrink', 'green', () => import('./compress.js').then((m) => m.compress())],
    ['img2pdf', 'Ảnh sang PDF', 'image', 'amber', () => import('./images.js').then((m) => m.img2pdf())],
    ['pdf2img', 'PDF sang ảnh', 'image', 'orange', () => import('./images.js').then((m) => m.pdf2img())],
  ]],
  ['Chỉnh sửa & ghi chú', [
    ['sign', 'Ký / đóng dấu', 'signature', 'red', () => import('./stamp.js').then((m) => m.sign())],
    ['watermark', 'Watermark', 'droplet', 'cyan', () => import('./stamp.js').then((m) => m.watermark())],
    ['number', 'Đánh số trang', 'hash', 'blue', () => import('./stamp.js').then((m) => m.number())],
    ['header', 'Đầu/chân trang & Bates', 'header', 'violet', () => import('./stamp.js').then((m) => m.headerFooter())],
    ['crop', 'Cắt lề', 'crop', 'teal', () => import('./stamp.js').then((m) => m.crop())],
    ['duplicate', 'Nhân bản & đảo trang', 'copy', 'indigo', () => import('./basic.js').then((m) => m.duplicate())],
    ['background', 'Màu nền', 'palette', 'pink', () => import('./stamp.js').then((m) => m.background())],
    ['meta', 'Thông tin tài liệu', 'tag', 'slate', () => import('./basic.js').then((m) => m.meta())],
  ]],
  ['Hiệu ứng & màu sắc', [
    ['effects', 'Đảo màu · Máy quét · Đen trắng', 'contrast', 'slate', () => import('./images.js').then((m) => m.effects())],
  ]],
  ['Chuyển đổi từ PDF', [
    ['toword', 'PDF sang Word', 'word', 'blue', () => import('./convert.js').then((m) => m.toWord())],
    ['toexcel', 'PDF sang Excel', 'excel', 'green', () => import('./convert.js').then((m) => m.toExcel())],
  ]],
];
const FLAT = PDF_TOOLS.flatMap(([, list]) => list);

let root, picker, holder, current = null;
const cache = new Map();

export function render({ sub }) {
  const q = h('input', { type: 'search', placeholder: 'Tìm công cụ… (gõ không dấu cũng được: ghep, nen, ky)', class: 'tool-search', 'aria-label': 'Tìm công cụ PDF' });
  const groups = PDF_TOOLS.map(([title, list]) => {
    const tiles = list.map(([id, label, ico, tint]) => h('a', { class: 'tool-tile', href: `#/pdf/${id}`, 'data-id': id, 'data-key': noAccent(label).toLowerCase() },
      h('span', { class: 'ico', style: tintStyle(tint), html: icon(ico) }), h('span', null, label)));
    return h('div', { class: 'tool-group' }, h('h4', null, title), h('div', { class: 'tool-grid' }, tiles));
  });
  q.addEventListener('input', () => {
    const s = noAccent(q.value.trim()).toLowerCase();
    groups.forEach((g) => {
      let any = false;
      g.querySelectorAll('.tool-tile').forEach((t) => { const ok = !s || t.dataset.key.includes(s); t.hidden = !ok; any ||= ok; });
      g.hidden = !any;
    });
  });
  picker = h('section', { class: 'card' }, h('h2', null, 'Chọn công cụ'), h('p', { class: 'sub' }, 'Mọi thao tác diễn ra trên thiết bị của bạn; tệp gốc không bị thay đổi.'), q, groups);
  holder = h('div');
  root = h('div', null, picker, holder);
  show(sub?.[0]);
  return root;
}
export function onShow({ sub }) { show(sub?.[0]); }

async function show(id) {
  const t = FLAT.find((x) => x[0] === id);
  picker.hidden = !!t;
  picker.querySelectorAll('.tool-tile').forEach((a) => a.setAttribute('aria-pressed', String(a.dataset.id === id)));
  if (!t) { holder.replaceChildren(); current = null; return; }
  if (current === id && holder.firstChild) return;
  current = id;
  const back = h('a', { class: 'back-link', href: '#/pdf' }, h('span', { html: icon('arrowLeft'), style: 'display:contents' }), 'Tất cả công cụ PDF');
  let el = cache.get(id);
  if (!el) {
    holder.replaceChildren(back, h('div', { class: 'card' }, 'Đang mở…'));
    el = await t[4]();
    cache.set(id, el);
  }
  if (current === id) holder.replaceChildren(back, el);
  requestAnimationFrame(() => feedVisible(holder));
  scrollTo({ top: 0, behavior: 'smooth' });
}
