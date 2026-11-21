import './styles.css';
import { h, toast } from './core/ui.js';
import { icon, tintStyle } from './core/icons.js';
import { pref, setPref } from './core/store.js';
import { setupPwa } from './core/pwa.js';
import { feedVisible } from './core/handoff.js';
import LOGO from '../public/icons/icon.svg?url';

export const APP = 'BeaconDesk';
export const VERSION = __APP_VERSION__;

/** Danh mục chức năng: mỗi mục tải mã khi được mở (lazy). */
export const TOOLS = [
  { id: 'home', label: 'Trang chủ', icon: 'home', tint: 'slate', pill: 'Bộ công cụ văn phòng · All-in-one', title: 'BeaconDesk — làm việc với tài liệu ngay trên máy.', lead: 'Xử lý PDF, nhận dạng chữ tiếng Việt, soạn và kiểm tra văn bản hành chính. Không tải tài liệu lên máy chủ, dùng được cả khi mất mạng.', load: () => import('./tools/home.js') },
  { id: 'pdf', label: 'Công cụ PDF', icon: 'files', tint: 'blue', pill: 'PDF · 20 công cụ', title: 'Công cụ PDF', lead: 'Ghép, tách, sắp xếp trang bằng ảnh thu nhỏ, ký và đóng dấu, đánh số, nén dung lượng, chuyển sang Word/Excel.', desc: 'Ghép, tách, ký, nén, chuyển đổi PDF', load: () => import('./tools/pdf/index.js') },
  { id: 'ocr', label: 'Scan / ảnh → chữ', icon: 'scan', tint: 'teal', pill: 'OCR tiếng Việt', title: 'Nhận dạng chữ từ ảnh và bản scan', lead: 'Chụp hoặc chọn ảnh, PDF scan; tự xoay, chỉnh nghiêng; xuất Word, văn bản hoặc PDF tìm kiếm được.', desc: 'OCR tiếng Việt → Word, PDF tìm kiếm được', load: () => import('./tools/ocr.js') },
  { id: 'compose', label: 'Soạn văn bản', icon: 'pen', tint: 'indigo', pill: 'Nghị định 30/2020/NĐ-CP', title: 'Soạn văn bản hành chính', lead: 'Chọn loại văn bản, điền nội dung và xuất Word đúng thể thức. Thông tin cơ quan, người ký được nhớ cho lần sau.', desc: '8 loại văn bản, xuất Word đúng thể thức', load: () => import('./tools/compose.js') },
  { id: 'check', label: 'Kiểm tra văn bản', icon: 'spell', tint: 'green', pill: 'Thể thức · Chính tả · Trình bày', title: 'Kiểm tra thể thức và chính tả', lead: 'Dò lỗi lề, phông, cỡ chữ, số trang theo Nghị định 30; lỗi chính tả, dấu câu và trình bày tiếng Việt.', desc: 'Dò lỗi thể thức, chính tả, trình bày', load: () => import('./tools/check.js') },
  { id: 'rename', label: 'Đổi tên hàng loạt', icon: 'rename', tint: 'amber', pill: 'Tệp · Thư mục', title: 'Đổi tên tệp hàng loạt', lead: 'Đặt tên theo mẫu, tìm và thay, bỏ dấu, đánh số thứ tự; xem trước trước khi áp dụng.', desc: 'Đặt tên theo mẫu, bỏ dấu, đánh số', load: () => import('./tools/rename.js') },
  { id: 'slides', label: 'Tạo PowerPoint', icon: 'slides', tint: 'orange', pill: 'Word/PDF → PowerPoint', title: 'Tạo bài trình chiếu', lead: 'Chuyển Word hoặc PDF thành bài PowerPoint chỉnh sửa được, chọn bảng màu và bố cục.', desc: 'Word/PDF thành bài trình chiếu', load: () => import('./tools/slides.js') },
  { id: 'summary', label: 'Tóm tắt & dàn ý', icon: 'tree', tint: 'violet', pill: 'Tóm tắt · Từ khoá · Dàn ý', title: 'Tóm tắt và lập dàn ý', lead: 'Rút ý chính, từ khoá và dàn ý từ tài liệu dài ngay trên máy; có thể bật AI khi có mạng.', desc: 'Rút ý chính, từ khoá, dàn ý', load: () => import('./tools/summary.js') },
  { id: 'print', label: 'In ấn PDF A4', icon: 'printer', tint: 'cyan', pill: 'Ảnh chụp · Word → PDF A4', title: 'Tạo PDF A4 sẵn sàng in', lead: 'Ảnh chụp tài liệu được nắn thẳng theo 4 góc, làm rõ chữ; Word/PDF được dàn lại khổ A4 với phông tiếng Việt.', desc: 'Nắn ảnh chụp, dàn trang A4', load: () => import('./tools/print.js') },
  { sep: true },
  { id: 'settings', label: 'Cài đặt & AI', icon: 'settings', tint: 'pink', pill: 'Cài đặt', title: 'Cài đặt', lead: 'Gói ngoại tuyến, trợ lý AI tuỳ chọn, dữ liệu lưu trên máy.', load: () => import('./tools/settings.js') },
  { id: 'about', label: 'Giới thiệu', icon: 'info', tint: 'slate', pill: 'Giới thiệu', title: 'Về BeaconDesk', lead: 'Cách hoạt động, quyền riêng tư và lưu ý khi sử dụng.', load: () => import('./tools/about.js') },
];

const app = document.getElementById('app');
const views = new Map(); // giữ lại trạng thái từng công cụ khi chuyển qua lại

const theme = {
  get: () => document.documentElement.dataset.theme || 'light',
  set(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('bd-theme', t); } catch { /* bỏ qua */ }
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0b1726' : '#005993');
  },
};
theme.set(theme.get());

function shell() {
  const logo = h('img', { class: 'logo', src: LOGO, alt: '' });
  const net = h('span', { class: 'net-badge', title: 'Trạng thái kết nối' }, h('i'), h('span'));
  const installBtn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', hidden: true }, h('span', { html: icon('installs'), style: 'display:contents' }), 'Cài ứng dụng');
  const themeBtn = h('button', { type: 'button', class: 'theme-switch', 'aria-label': 'Đổi giao diện sáng / tối', onclick: () => theme.set(theme.get() === 'dark' ? 'light' : 'dark') },
    h('span', { html: icon('moon', 'moon'), style: 'display:contents' }), h('span', { html: icon('sun', 'sun'), style: 'display:contents' }), h('span', { class: 'knob' }));
  const header = h('header', { class: 'header' },
    h('a', { class: 'brand', href: '#/home' }, logo, h('div', null, h('strong', null, 'Beacon', h('span', null, 'Desk')), h('small', null, `Bộ công cụ văn phòng · v${VERSION}`))),
    h('div', { class: 'header-actions' }, installBtn, net, themeBtn));

  const hero = h('section', { class: 'hero' }, h('div', { class: 'pill' }), h('h1'), h('p'));

  const toggle = h('button', { type: 'button', class: 'nav-toggle', 'aria-label': 'Thu gọn thanh chức năng', html: icon('chevronLeft') });
  const navItems = TOOLS.map((t) => t.sep ? h('li', { class: 'nav-sep', role: 'separator' }) : h('li', null,
    h('a', { class: 'nav-item', href: '#/' + t.id, 'data-id': t.id, 'data-tip': t.label },
      h('span', { class: 'ico', style: tintStyle(t.tint), html: icon(t.icon) }), h('span', { class: 'lbl' }, t.label))));
  const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Chức năng' },
    h('div', { class: 'nav-head' }, h('strong', null, 'Chức năng'), toggle),
    h('div', { class: 'nav-hint' }, 'Chọn công cụ để bắt đầu'),
    h('ul', { class: 'nav' }, navItems));
  const scrim = h('div', { class: 'nav-scrim' });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  const ws = h('div', { class: 'workspace' }, sidebar, scrim, main);
  const footer = h('footer', { class: 'footer' },
    h('span', null, `${APP} v${VERSION} · ${__SINGLE__ ? 'Bản một tệp (ngoại tuyến)' : 'Ứng dụng web cài được'} · Tài liệu được xử lý ngay trên thiết bị`),
    h('a', { href: '#/about' }, 'Giới thiệu & góp ý'));

  app.replaceChildren(h('div', { class: 'wrap' }, header, hero, ws, footer));

  // --- thu gọn / mở rộng sidebar ---
  const isPhone = () => matchMedia('(max-width: 760px)').matches;
  const setNav = (open, save = true) => {
    ws.classList.toggle('nav-expanded', open);
    ws.classList.toggle('nav-collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Thu gọn thanh chức năng' : 'Mở rộng thanh chức năng');
    if (save && !isPhone()) setPref('nav-open', open);
  };
  setNav(isPhone() ? false : pref('nav-open', true), false);
  toggle.addEventListener('click', () => setNav(!ws.classList.contains('nav-expanded')));
  scrim.addEventListener('click', () => setNav(false, false));
  sidebar.addEventListener('click', (e) => { if (e.target.closest('.nav-item') && isPhone()) setNav(false, false); });
  matchMedia('(max-width: 760px)').addEventListener('change', (e) => setNav(e.matches ? false : pref('nav-open', true), false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isPhone() && ws.classList.contains('nav-expanded')) setNav(false, false); });

  // --- chú thích nổi khi sidebar thu gọn ---
  const tip = h('div', { class: 'nav-tip', role: 'tooltip' });
  document.body.append(tip);
  sidebar.addEventListener('pointerover', (e) => {
    const a = e.target.closest('.nav-item');
    if (!a || !ws.classList.contains('nav-collapsed') || e.pointerType === 'touch') return;
    const r = a.getBoundingClientRect();
    tip.textContent = a.dataset.tip;
    tip.style.left = r.right + 10 + 'px';
    tip.style.top = r.top + r.height / 2 + 'px';
    tip.classList.add('show');
  });
  sidebar.addEventListener('pointerout', () => tip.classList.remove('show'));

  // --- trạng thái mạng ---
  const updNet = () => {
    const on = navigator.onLine;
    net.classList.toggle('off', !on);
    net.lastChild.textContent = on ? 'Trực tuyến' : 'Ngoại tuyến';
    net.title = on ? 'Đang có mạng. Tài liệu vẫn chỉ xử lý trên máy.' : 'Mất mạng — các công cụ vẫn hoạt động.';
  };
  addEventListener('online', updNet); addEventListener('offline', updNet); updNet();

  if (!__SINGLE__) setupPwa(installBtn);
  return { hero, main, sidebar };
}

const ui = shell();

async function route() {
  const [, id = 'home', ...rest] = (location.hash || '#/home').split('/');
  const tool = TOOLS.find((t) => t.id === id) || TOOLS[0];
  ui.sidebar.querySelectorAll('.nav-item').forEach((a) => {
    if (a.dataset.id === tool.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const [pill, h1, p] = ui.hero.children;
  pill.textContent = tool.pill; h1.textContent = tool.title; p.textContent = tool.lead;
  document.title = tool.id === 'home' ? `${APP} – Bộ công cụ văn phòng` : `${tool.label} · ${APP}`;

  let v = views.get(tool.id);
  if (!v) {
    ui.main.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'sub', style: 'margin:0' }, 'Đang mở công cụ…')));
    try {
      const mod = await tool.load();
      v = { el: mod.render({ sub: rest }), mod };
      views.set(tool.id, v);
    } catch (e) {
      console.error(e);
      ui.main.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'notice err' }, 'Không mở được công cụ: ' + e.message + (navigator.onLine ? '' : ' (có thể gói ngoại tuyến chưa được tải đủ — hãy mở lại khi có mạng).'))));
      return;
    }
  }
  if (ui.main.firstChild !== v.el) ui.main.replaceChildren(v.el);
  v.mod.onShow?.({ sub: rest });
  requestAnimationFrame(() => feedVisible(ui.main));
  if (matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0 });
}
addEventListener('hashchange', route);
route();

// Mở tệp từ hệ điều hành (File Handling API) hoặc từ chia sẻ (Share Target).
import('./core/incoming.js').then((m) => m.listenIncoming()).catch(() => {});

// Báo lỗi không mong muốn một cách thân thiện.
addEventListener('unhandledrejection', (e) => {
  const m = e.reason?.message || '';
  if (/out of memory|allocation|Array buffer allocation/i.test(m)) toast('Thiết bị không đủ bộ nhớ cho tệp này. Hãy thử tệp nhỏ hơn hoặc chia nhỏ tài liệu.', 'err');
});
