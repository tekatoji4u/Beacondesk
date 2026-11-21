// Trang chủ: lối tắt tới các công cụ, tệp gần đây, gợi ý cài ứng dụng.
import { h, fmtSize, download } from '../core/ui.js';
import { icon, tintStyle } from '../core/icons.js';
import { listRecent, clearRecent } from '../core/store.js';
import { TOOLS } from '../main.js';

const QUICK = [
  ['#/pdf/merge', 'Ghép PDF', 'merge', 'blue', 'Gộp nhiều tệp, sắp thứ tự'],
  ['#/pdf/compress', 'Nén PDF', 'shrink', 'green', 'Giảm dung lượng, giữ nguyên chữ'],
  ['#/pdf/sign', 'Ký / đóng dấu', 'signature', 'red', 'Kéo thả chữ ký, con dấu lên trang'],
  ['#/pdf/organize', 'Sắp xếp trang', 'layers', 'indigo', 'Kéo thả, xoay, xoá trang'],
];

let recentBox;
export function render() {
  const tools = TOOLS.filter((t) => !t.sep && t.desc).map((t) => h('a', { class: 'home-card', href: '#/' + t.id },
    h('span', { class: 'ico', style: tintStyle(t.tint), html: icon(t.icon) }), h('div', null, h('b', null, t.label), h('span', null, t.desc))));
  const quick = QUICK.map(([href, l, ic, tint, d]) => h('a', { class: 'home-card', href },
    h('span', { class: 'ico', style: tintStyle(tint), html: icon(ic) }), h('div', null, h('b', null, l), h('span', null, d))));
  recentBox = h('div');
  paintRecent();
  return h('div', null,
    h('section', { class: 'card' }, h('h2', null, 'Dùng nhiều nhất'), h('div', { class: 'home-grid mt' }, quick)),
    h('section', { class: 'card' }, h('h2', null, 'Tất cả chức năng'), h('div', { class: 'home-grid mt' }, tools)),
    recentBox,
    h('section', { class: 'card' }, h('h2', null, 'Vì sao dùng BeaconDesk'),
      h('ul', { class: 'feat' },
        h('li', null, h('span', { html: icon('shield'), style: 'display:contents' }), h('div', null, h('b', null, 'Dữ liệu ở lại trên máy'), h('span', null, 'Tài liệu được xử lý ngay trong trình duyệt, không tải lên máy chủ nào.'))),
        h('li', null, h('span', { html: icon('wifiOff'), style: 'display:contents' }), h('div', null, h('b', null, 'Dùng được khi mất mạng'), h('span', null, 'Mở một lần khi có mạng là dùng được mãi, kể cả nhận dạng chữ.'))),
        h('li', null, h('span', { html: icon('phone'), style: 'display:contents' }), h('div', null, h('b', null, 'Máy tính, điện thoại, máy tính bảng'), h('span', null, 'Cài như ứng dụng; nhận tệp chia sẻ từ Zalo, email, ứng dụng Tệp.'))))));
}
export function onShow() { paintRecent(); }

async function paintRecent() {
  if (!recentBox) return;
  const list = await listRecent();
  if (!list.length) { recentBox.replaceChildren(); return; }
  recentBox.replaceChildren(h('section', { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { style: 'margin:0' }, 'Tệp vừa tạo'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => { await clearRecent(); paintRecent(); } }, 'Xoá danh sách')),
    h('p', { class: 'sub' }, 'Chỉ lưu trên thiết bị này để tải lại khi cần. Có thể tắt trong Cài đặt.'),
    h('ul', { class: 'files' }, list.map((r) => h('li', null,
      h('span', { class: 'nm' }, r.name),
      h('span', { class: 'meta' }, `${r.tool ? r.tool + ' · ' : ''}${new Date(r.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })} · ${fmtSize(r.size)}`),
      h('button', { type: 'button', class: 'btn btn-sm btn-icon', 'aria-label': 'Tải lại ' + r.name, html: icon('download'), onclick: () => download(r.blob, r.name) }))))));
}
