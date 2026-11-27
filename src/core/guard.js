import { h, toast } from './ui.js';

/**
 * Hỏi mật khẩu khi người dùng bấm phím tắt xem mã nguồn / mở công cụ nhà phát triển.
 * Lưu ý: đây chỉ là rào chắn thông thường. Trang web tĩnh luôn có thể bị xem mã
 * bằng cách khác (gõ view-source:, mở DevTools từ menu trình duyệt, tải tệp về).
 *
 * Đổi mật khẩu: thay PASS_HASH bằng SHA-256 (hex) của mật khẩu mới, ví dụ:
 *   node -e "console.log(require('crypto').createHash('sha256').update('MAT_KHAU').digest('hex'))"
 */
const PASS_HASH = 'f960aa86710edc23ab0036199938037488192f23418a1af10fd48eac4936fbdb';
const KEY = 'bd-src-unlocked';

let unlocked = false;
try { unlocked = sessionStorage.getItem(KEY) === '1'; } catch { /* bỏ qua */ }
let dlg = null;

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ask() {
  if (dlg?.open) return;
  const pw = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Mật khẩu', 'aria-label': 'Mật khẩu' });
  const err = h('div', { class: 'notice err', hidden: true }, 'Mật khẩu không đúng.');
  const form = h('form', { method: 'dialog' },
    h('p', null, 'Cần mật khẩu để xem mã nguồn của BeaconDesk.'),
    pw, err,
    h('div', { class: 'row', style: 'margin-top:14px;justify-content:flex-end;gap:8px;display:flex' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close() }, 'Huỷ'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Mở khoá')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await sha256(pw.value) === PASS_HASH) {
      unlocked = true;
      try { sessionStorage.setItem(KEY, '1'); } catch { /* bỏ qua */ }
      dlg.close();
      toast('Đã mở khoá. Bấm lại phím tắt để xem mã nguồn.');
    } else {
      err.hidden = false; pw.select();
    }
  });
  dlg?.remove();
  dlg = h('dialog', { class: 'sheet' },
    h('div', { class: 'sh' }, h('h2', null, '🔒 Xem mã nguồn')),
    h('div', { class: 'sb' }, form));
  document.body.append(dlg);
  dlg.showModal();
  pw.focus();
}

function isSourceShortcut(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'F12') return true;
  if (mod && e.code === 'KeyU') return true; // xem nguồn (Ctrl+U, ⌘⌥U)
  if (mod && e.code === 'KeyS') return true; // lưu trang
  if (mod && (e.shiftKey || e.altKey) && ['KeyI', 'KeyJ', 'KeyC', 'KeyK'].includes(e.code)) return true; // DevTools
  return false;
}

export function setupSourceGuard() {
  addEventListener('keydown', (e) => {
    if (unlocked || !isSourceShortcut(e)) return;
    e.preventDefault(); e.stopPropagation();
    ask();
  }, true);
  // Chuột phải: vẫn cho dùng trong ô nhập liệu (sao chép / dán) và trên ảnh (lưu ảnh).
  addEventListener('contextmenu', (e) => {
    if (unlocked || e.target.closest?.('input, textarea, [contenteditable], img, canvas')) return;
    e.preventDefault();
    ask();
  }, true);
}
