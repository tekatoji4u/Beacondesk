// Các khối giao diện dùng chung cho mọi công cụ.
import { icon } from './icons.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const ic = (name, cls) => h('span', { class: 'ic', html: icon(name, cls), style: 'display:contents' });

export const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',') + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 2 : 1).replace('.', ',') + ' MB';
}
export const ext = (name) => (/\.([^.]+)$/.exec(name || '')?.[1] || '').toLowerCase();
export const baseName = (name) => (name || 'tep').replace(/\.[^.]+$/, '');

/** Bỏ dấu tiếng Việt (dùng cho tìm kiếm và tên tệp). */
export function noAccent(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// ---------- Ô nhập liệu ----------
export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', null, hint) : null);
}
export function input(attrs = {}) {
  return h('input', { type: 'text', ...attrs });
}
export function textarea(attrs = {}) {
  return h('textarea', attrs);
}
export function num(value, min, max, step) {
  return h('input', { type: 'number', inputmode: 'decimal', value, min, max, step });
}
export function select(options, value) {
  const s = h('select', null, options.map((o) => {
    const [v, l] = typeof o === 'string' ? [o, o] : [o.value, o.label];
    return h('option', { value: v, selected: String(v) === String(value) }, l);
  }));
  return s;
}
export function checkbox(label, checked = false) {
  const i = h('input', { type: 'checkbox', checked });
  const el = h('label', { class: 'check' }, i, h('span', null, label));
  return { el, input: i, get: () => i.checked, set: (v) => { i.checked = !!v; } };
}
/** Nhóm nút chọn một (segmented control). */
export function seg(options, value, onChange) {
  let cur = value;
  const btns = options.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: () => set(o.value, true) }, o.label));
  const el = h('div', { class: 'seg', role: 'group' }, btns);
  function set(v, fire) {
    cur = v;
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    if (fire) onChange?.(v);
  }
  return { el, get: () => cur, set };
}

// ---------- Chọn tệp ----------
/**
 * Vùng kéo-thả / chọn tệp. Hỗ trợ cả dán (Ctrl+V) khi vùng đang hiển thị.
 */
export function dropzone({ accept = '', multiple = false, title, hint, iconName = 'upload', capture, onFiles }) {
  const inp = h('input', { type: 'file', accept, multiple, capture, 'aria-label': title });
  const el = h('div', { class: 'drop', tabindex: '-1' }, h('span', { html: icon(iconName) , style: 'display:contents' }), h('b', null, title), hint ? h('span', null, hint) : null, inp);
  const accepts = (f) => {
    if (!accept) return true;
    const e = '.' + ext(f.name);
    return accept.split(',').map((a) => a.trim().toLowerCase()).some((a) =>
      a === e || a === f.type || (a.endsWith('/*') && f.type.startsWith(a.slice(0, -1))));
  };
  const give = (list) => {
    const files = [...list].filter(accepts);
    if (!files.length) { if (list.length) toast('Loại tệp không phù hợp với công cụ này.', 'err'); return; }
    onFiles(multiple ? files : [files[0]]);
  };
  inp.addEventListener('change', () => { if (inp.files.length) give(inp.files); inp.value = ''; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); give(e.dataTransfer.files); });
  el._give = give; // dùng cho dán và chuyển tiếp tệp
  pasteTargets.add(el);
  return el;
}
const pasteTargets = new Set();
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  const t = [...pasteTargets].find((el) => el.isConnected && el.offsetParent !== null);
  if (t) { e.preventDefault(); t._give(files); }
});

// ---------- Tiến trình và trạng thái ----------
export function progress() {
  const bar = h('i');
  const txt = h('div', { class: 'txt' });
  const el = h('div', { class: 'progress', hidden: true, role: 'status', 'aria-live': 'polite' }, h('div', { class: 'bar' }, bar), txt);
  return {
    el,
    set(p, t) { el.hidden = false; bar.style.width = Math.max(0, Math.min(100, p)) + '%'; if (t != null) txt.textContent = t; },
    hide() { el.hidden = true; bar.style.width = '0'; txt.textContent = ''; },
  };
}
export function status() {
  const el = h('div', { 'aria-live': 'polite' });
  const show = (cls, ...c) => { el.replaceChildren(h('div', { class: 'notice ' + cls }, ...c)); };
  return {
    el,
    ok: (...c) => show('ok', ...c),
    err: (msg) => show('err', msg),
    info: (...c) => show('info', ...c),
    warn: (...c) => show('', ...c),
    clear: () => el.replaceChildren(),
  };
}
/** Chạy một tác vụ có nút bấm: khoá nút, bắt lỗi và hiện thông báo. */
export async function run(btn, st, fn) {
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  st?.clear();
  try {
    await fn();
  } catch (e) {
    console.error(e);
    st?.err(e?.message || String(e));
  } finally {
    if (btn) btn.disabled = false;
  }
}
export function button(label, { kind = '', iconName, onClick, attrs } = {}) {
  return h('button', { type: 'button', class: 'btn ' + kind, onclick: onClick, ...attrs }, iconName ? h('span', { html: icon(iconName), style: 'display:contents' }) : null, label);
}

// ---------- Tải xuống / chia sẻ ----------
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function canShare(files) {
  try { return !!navigator.canShare && navigator.canShare({ files }); } catch { return false; }
}
export async function shareFiles(outs) {
  const files = outs.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
  try { await navigator.share({ files }); } catch (e) { if (e.name !== 'AbortError') toast('Không chia sẻ được: ' + e.message, 'err'); }
}

let toastBox;
export function toast(msg, kind = '', action) {
  toastBox ||= document.body.appendChild(h('div', { class: 'toasts' }));
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, h('span', null, msg), action ? h('button', { type: 'button', onclick: () => { action.fn(); t.remove(); } }, action.label) : null);
  toastBox.append(t);
  setTimeout(() => t.remove(), action ? 12000 : 4200);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Đã sao chép.'); }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('Đã sao chép.');
  }
}

// ---------- Khoảng trang ----------
/**
 * Đọc chuỗi trang như "1-3, 5, 8-", "lẻ", "chẵn", "tất cả", "10-1" (đảo ngược).
 * Trả về chỉ số trang (bắt đầu từ 0). Chuỗi rỗng = tất cả.
 */
export function parsePages(text, total, { emptyAll = true } = {}) {
  const s = noAccent(String(text || '')).toLowerCase().replace(/\s+/g, '').replace(/;/g, ',');
  const all = [...Array(total).keys()];
  if (!s) { if (emptyAll) return all; throw new Error('Chưa nhập trang nào.'); }
  if (s === 'all' || s === 'tatca') return all;
  if (s === 'le' || s === 'odd') return all.filter((i) => i % 2 === 0);
  if (s === 'chan' || s === 'even') return all.filter((i) => i % 2 === 1);
  if (s === 'cuoi' || s === 'last') return [total - 1];
  const out = [];
  for (const part of s.split(',')) {
    if (!part) continue;
    let m;
    if ((m = /^(\d+)-(\d*)$/.exec(part))) {
      const a = +m[1], b = m[2] ? +m[2] : total;
      if (a < 1 || a > total || b < 1 || b > total) throw new Error(`Khoảng "${part}" vượt quá số trang (tệp có ${total} trang).`);
      if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1);
      else for (let i = a; i >= b; i--) out.push(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n < 1 || n > total) throw new Error(`Trang ${n} không tồn tại (tệp có ${total} trang).`);
      out.push(n - 1);
    } else {
      throw new Error(`Không hiểu khoảng trang "${part}". Ví dụ đúng: 1-3, 5, 8-`);
    }
  }
  if (!out.length) throw new Error('Chưa nhập trang nào.');
  return out;
}
/** Chuỗi gọn từ danh sách chỉ số trang: [0,1,2,4] → "1-3, 5" */
export function pagesToText(idx) {
  const s = [...new Set(idx)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`);
    i = j;
  }
  return parts.join(', ');
}

export function card(title, sub, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', null, title) : null, sub ? h('p', { class: 'sub' }, sub) : null, ...children);
}
export function notice(kind, ...c) {
  return h('div', { class: 'notice ' + kind }, ...c);
}
