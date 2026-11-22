// Cài đặt: gói ngoại tuyến, cài ứng dụng, AI tuỳ chọn (khoá API của người dùng), dữ liệu trên máy.
import { h, field, input, checkbox, button, status, run, progress, toast } from '../core/ui.js';
import { kvGet, kvSet, clearRecent } from '../core/store.js';
import { isIOS, isStandalone } from '../core/pwa.js';

export function render() {
  return h('div', null,
    __SINGLE__ ? singleCard() : offlineCard(),
    !__SINGLE__ && isIOS() && !isStandalone() ? iosCard() : null,
    __SINGLE__ ? null : aiCard(),
    dataCard());
}

function singleCard() {
  return h('section', { class: 'card' },
    h('h2', null, 'Dùng khi mất mạng'),
    h('div', { class: 'notice ok' }, 'Đây là bản một tệp HTML: mọi thành phần (kể cả nhận dạng chữ tiếng Việt) đã nằm sẵn trong tệp, không cần mạng và không kết nối ra ngoài.'));
}

function offlineCard() {
  const st = status(), pr = progress();
  const state = h('div');
  const paint = async () => {
    if (!('serviceWorker' in navigator)) { state.replaceChildren(h('div', { class: 'notice err' }, 'Trình duyệt này không hỗ trợ chạy ngoại tuyến. Hãy dùng Chrome, Edge, Safari hoặc Firefox bản mới.')); return; }
    const { offlineStatus } = await import('../core/pwa.js');
    const s = await offlineStatus();
    state.replaceChildren(h('div', { class: 'score' },
      h('div', null, h('b', { style: `color:var(--${s.ready ? 'ok' : 'warn'})` }, s.ready ? 'Sẵn sàng' : 'Chưa đủ'), h('span', null, 'Giao diện và công cụ PDF, Word')),
      h('div', null, h('b', { style: `color:var(--${s.ocr ? 'ok' : 'warn'})` }, s.ocr ? 'Sẵn sàng' : 'Chưa tải'), h('span', null, 'Nhận dạng chữ (OCR) tiếng Việt')),
      h('div', null, h('b', { style: `color:var(--${s.cv ? 'ok' : 'warn'})` }, s.cv ? 'Sẵn sàng' : 'Chưa tải'), h('span', null, 'Xử lý ảnh scan (OpenCV)'))));
  };
  paint();
  // Bản một tệp HTML chỉ có trên trang đã đăng (GitHub Pages, xem .github/workflows/pages.yml)
  const single = __DOWNLOAD__ ? h('a', { class: 'btn btn-ghost', href: './download/BeaconDesk.html', download: 'BeaconDesk.html' }, 'Tải bản một tệp HTML') : null;
  const go = button('Tải gói ngoại tuyến', { kind: 'btn-primary', iconName: 'download' });
  go.addEventListener('click', () => run(go, st, async () => {
    const { cacheEverything } = await import('../core/pwa.js');
    pr.set(2, 'Đang tải…');
    await cacheEverything((d, t) => pr.set((d / t) * 95, `Đã tải ${d}/${t} tệp`));
    pr.hide();
    st.ok(h('b', null, 'Xong. '), 'Có thể dùng toàn bộ chức năng khi mất mạng.');
    paint();
  }));
  return h('section', { class: 'card' },
    h('h2', null, 'Dùng khi mất mạng'),
    h('p', { class: 'sub' }, 'Giao diện và công cụ PDF, Word được lưu tự động sau lần mở đầu tiên. Bộ nhận dạng chữ (khoảng 6 MB) và bộ xử lý ảnh scan (khoảng 11 MB) chỉ tải khi dùng lần đầu, hoặc tải trước tại đây để dùng khi không có mạng. Bản một tệp HTML chạy được cả khi mở thẳng từ máy, không cần cài.'),
    state, h('div', { class: 'row mt' }, go, single), pr.el, st.el);
}

function iosCard() {
  return h('section', { class: 'card' },
    h('h2', null, 'Cài lên iPhone, iPad'),
    h('ol', { class: 'steps' },
      h('li', null, 'Mở trang này bằng Safari.'),
      h('li', null, 'Bấm nút Chia sẻ (hình vuông có mũi tên lên).'),
      h('li', null, 'Chọn "Thêm vào MH chính" rồi bấm "Thêm".'),
      h('li', null, 'Mở BeaconDesk từ biểu tượng trên màn hình chính, dùng được cả khi không có mạng.')));
}

function aiCard() {
  const st = status();
  const enabled = checkbox('Bật trợ lý AI (Claude) cho chức năng Tóm tắt');
  const key = input({ type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false' });
  const show = checkbox('Hiện khoá');
  show.input.addEventListener('change', () => { key.type = show.get() ? 'text' : 'password'; });
  (async () => {
    const { aiSettings } = await import('../core/ai.js');
    const s = await aiSettings();
    enabled.set(s.enabled); key.value = s.key || '';
  })();
  const save = button('Lưu', { kind: 'btn-primary', iconName: 'check' });
  save.addEventListener('click', () => run(save, st, async () => {
    const k = key.value.trim();
    if (enabled.get() && !/^sk-ant-/.test(k)) throw new Error('Khoá API Claude thường bắt đầu bằng "sk-ant-". Hãy kiểm tra lại.');
    const { saveAiSettings } = await import('../core/ai.js');
    await saveAiSettings({ enabled: enabled.get(), key: k });
    st.ok(enabled.get() ? 'Đã bật AI. Nút "Tóm tắt bằng AI" sẽ hiện trong phần Tóm tắt khi có mạng.' : 'Đã tắt AI.');
  }));
  const forget = button('Xoá khoá', { kind: 'btn-ghost', iconName: 'trash', onClick: async () => {
    const { saveAiSettings } = await import('../core/ai.js');
    await saveAiSettings({ enabled: false, key: '' });
    enabled.set(false); key.value = '';
    toast('Đã xoá khoá API khỏi thiết bị.');
  } });
  return h('section', { class: 'card' },
    h('h2', null, 'Trợ lý AI (tuỳ chọn)'),
    h('p', { class: 'sub' }, 'Mặc định tắt. Mọi chức năng đều chạy trên máy mà không cần AI. Khi bật, nội dung chỉ được gửi tới Claude (Anthropic) mỗi lần bạn bấm nút AI và xác nhận; khoá API chỉ lưu trên thiết bị này.'),
    h('div', { class: 'notice info' }, 'Không dùng AI cho tài liệu mật hoặc có thông tin cá nhân. Khoá API lấy tại console.anthropic.com và tính phí theo tài khoản của bạn.'),
    enabled.el,
    field('Khoá API Claude', key),
    show.el,
    h('div', { class: 'row mt' }, save, forget),
    st.el);
}

function dataCard() {
  const st = status();
  const keep = checkbox('Lưu 12 tệp kết quả gần nhất để tải lại (trên trang chủ)', true);
  kvGet('keepRecent', true).then((v) => keep.set(v));
  keep.input.addEventListener('change', async () => {
    await kvSet('keepRecent', keep.get());
    if (!keep.get()) await clearRecent();
    toast(keep.get() ? 'Đã bật lưu tệp gần đây.' : 'Đã tắt và xoá danh sách tệp gần đây.');
  });
  const wipe = button('Xoá toàn bộ dữ liệu đã lưu', { kind: 'btn-red', iconName: 'trash' });
  wipe.addEventListener('click', () => run(wipe, st, async () => {
    if (!confirm('Xoá chữ ký, con dấu đã lưu, thông tin cơ quan, bản nháp, tệp gần đây, khoá AI và cài đặt trên thiết bị này?')) return;
    await new Promise((res) => { const r = indexedDB.deleteDatabase('beacondesk'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    try { Object.keys(localStorage).filter((k) => k.startsWith('bd-')).forEach((k) => localStorage.removeItem(k)); } catch { /* bỏ qua */ }
    st.ok('Đã xoá. Trang sẽ tải lại.');
    setTimeout(() => location.reload(), 900);
  }));
  return h('section', { class: 'card' },
    h('h2', null, 'Dữ liệu trên thiết bị'),
    h('p', { class: 'sub' }, 'BeaconDesk không có máy chủ và không thu thập dữ liệu. Những gì được lưu đều nằm trong trình duyệt của bạn: chữ ký, con dấu, thông tin cơ quan và người ký, bản nháp, tệp gần đây.'),
    keep.el,
    h('div', { class: 'row mt' }, wipe), st.el);
}
