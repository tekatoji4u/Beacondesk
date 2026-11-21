// Đổi tên hàng loạt: mẫu tên có số thứ tự và ngày, tìm và thay (có regex), bỏ dấu,
// đổi kiểu chữ. Ghi thẳng vào thư mục (nếu trình duyệt hỗ trợ) hoặc tải về ZIP.
import { h, field, input, select, checkbox, button, status, run, num, fmtSize, ext, baseName, noAccent, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { showResult } from '../core/result.js';

const canWriteDir = 'showDirectoryPicker' in window;

export function render() {
  let files = []; // {file, path}
  const st = status();
  const list = h('ul', { class: 'files rename-list' });

  const tpl = input({ value: '{ten}', placeholder: '{ten}', 'aria-label': 'Mẫu tên' });
  const find = input({ placeholder: 'Chữ cần tìm (để trống nếu không thay)' });
  const repl = input({ placeholder: 'Thay bằng…' });
  const useRe = checkbox('Dùng biểu thức chính quy (regex)');
  const matchCase = checkbox('Phân biệt chữ hoa/thường');
  const start = num(1, 0, 99999, 1);
  const step = num(1, 1, 1000, 1);
  const pad = select([{ value: '0', label: 'Tự động' }, { value: '2', label: '01' }, { value: '3', label: '001' }, { value: '4', label: '0001' }], '0');
  const kase = select([{ value: '', label: 'Giữ nguyên' }, { value: 'lower', label: 'chữ thường' }, { value: 'upper', label: 'CHỮ HOA' }, { value: 'title', label: 'Viết Hoa Đầu Từ' }, { value: 'sentence', label: 'Viết hoa đầu câu' }], '');
  const space = select([{ value: '', label: 'Giữ dấu cách' }, { value: '-', label: 'Thay bằng -' }, { value: '_', label: 'Thay bằng _' }, { value: 'none', label: 'Bỏ dấu cách' }], '');
  const accent = checkbox('Bỏ dấu tiếng Việt (Nguyễn → Nguyen)');
  const keepExt = checkbox('Giữ đuôi tệp', true);
  const keepDirs = checkbox('Giữ nguyên cấu trúc thư mục con', true);
  const order = select([{ value: 'pick', label: 'Theo thứ tự đã chọn' }, { value: 'name', label: 'Theo tên tệp' }, { value: 'date', label: 'Theo ngày sửa (cũ → mới)' }, { value: 'size', label: 'Theo dung lượng (nhỏ → lớn)' }], 'pick');

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function sorted() {
    const a = [...files];
    const coll = new Intl.Collator('vi', { numeric: true });
    if (order.value === 'name') a.sort((x, y) => coll.compare(x.path, y.path));
    if (order.value === 'date') a.sort((x, y) => x.file.lastModified - y.file.lastModified);
    if (order.value === 'size') a.sort((x, y) => x.file.size - y.file.size);
    return a;
  }
  /** Tính tên mới cho toàn bộ danh sách. Ném lỗi khi regex sai. */
  function plan() {
    const a = sorted();
    const width = +pad.value || String(+start.value + (a.length - 1) * +step.value).length;
    let re = null;
    if (find.value) {
      try { re = new RegExp(useRe.get() ? find.value : find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase.get() ? 'g' : 'gi'); }
      catch { throw new Error('Biểu thức tìm kiếm không hợp lệ.'); }
    }
    const today = ymd(new Date());
    return a.map((it, i) => {
      const e = ext(it.file.name);
      let name = (tpl.value || '{ten}')
        .replace(/\{ten\}/gi, baseName(it.file.name))
        .replace(/\{so\}/gi, String(+start.value + i * +step.value).padStart(width, '0'))
        .replace(/\{ngay\}/gi, ymd(new Date(it.file.lastModified)))
        .replace(/\{homnay\}/gi, today)
        .replace(/\{thumuc\}/gi, it.path.includes('/') ? it.path.split('/').slice(-2, -1)[0] : '');
      if (re) name = name.replace(re, repl.value);
      if (accent.get()) name = noAccent(name);
      if (kase.value === 'lower') name = name.toLocaleLowerCase('vi');
      if (kase.value === 'upper') name = name.toLocaleUpperCase('vi');
      if (kase.value === 'title') name = name.toLocaleLowerCase('vi').replace(/(^|[\s_\-.(])(\p{L})/gu, (m, s, c) => s + c.toLocaleUpperCase('vi'));
      if (kase.value === 'sentence') name = name.toLocaleLowerCase('vi').replace(/^\s*\p{L}/u, (c) => c.toLocaleUpperCase('vi'));
      if (space.value) name = name.replace(/\s+/g, space.value === 'none' ? '' : space.value);
      name = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || 'tep';
      if (keepExt.get() && e) name += '.' + e;
      const dir = keepDirs.get() && it.path.includes('/') ? it.path.slice(0, it.path.lastIndexOf('/') + 1) : '';
      return { it, from: it.path, to: dir + name };
    });
  }
  function paint() {
    let p;
    try { p = plan(); } catch (e) { list.replaceChildren(h('li', null, h('span', { class: 'nm', style: 'color:var(--err)' }, e.message))); return; }
    const seen = new Map();
    p.forEach((x) => seen.set(x.to.toLowerCase(), (seen.get(x.to.toLowerCase()) || 0) + 1));
    list.replaceChildren(...p.slice(0, 300).map((x) => h('li', null,
      h('span', { class: 'nm', title: x.from }, x.from),
      h('span', { html: icon('chevronRight'), style: 'display:contents' }),
      h('span', { class: 'nm', style: seen.get(x.to.toLowerCase()) > 1 ? 'color:var(--err)' : 'font-weight:700' }, x.to),
      h('span', { class: 'meta' }, fmtSize(x.it.file.size)))),
    p.length > 300 ? h('li', null, h('span', { class: 'meta' }, `… và ${p.length - 300} tệp khác`)) : '');
  }
  [tpl, find, repl, start, step].forEach((el) => el.addEventListener('input', paint));
  [pad, kase, space, order].forEach((el) => el.addEventListener('change', paint));
  [useRe, matchCase, accent, keepExt, keepDirs].forEach((c) => c.input.addEventListener('change', paint));

  const add = (fl) => {
    for (const f of fl) files.push({ file: f, path: f.webkitRelativePath || f.name });
    paint();
    st.clear();
  };
  const pickFiles = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { add(e.target.files); e.target.value = ''; } });
  const pickDir = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true, onchange: (e) => { add(e.target.files); e.target.value = ''; } });
  const drop = h('div', { class: 'drop', tabindex: '-1' },
    h('span', { html: icon('rename'), style: 'display:contents' }), h('b', null, 'Kéo thả tệp vào đây'),
    h('span', null, 'Tệp được giữ nguyên trên máy; công cụ chỉ tạo bản sao với tên mới.'),
    h('div', { class: 'row', style: 'justify-content:center' },
      button('Chọn nhiều tệp', { iconName: 'files', onClick: () => pickFiles.click() }),
      button('Chọn cả thư mục', { iconName: 'layers', onClick: () => pickDir.click() })),
    pickFiles, pickDir);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
  drop._give = add;

  const chips = h('div', { class: 'row', style: 'gap:6px' }, ['{ten}', '{so}', '{ngay}', '{homnay}', '{thumuc}'].map((t) =>
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { tpl.setRangeText(t, tpl.selectionStart ?? tpl.value.length, tpl.selectionEnd ?? tpl.value.length, 'end'); tpl.focus(); paint(); } }, t)));

  const check = () => {
    if (!files.length) throw new Error('Chưa chọn tệp nào.');
    const p = plan();
    const dup = new Set(), seen = new Set();
    for (const x of p) { const k = x.to.toLowerCase(); if (seen.has(k)) dup.add(x.to); seen.add(k); }
    if (dup.size) throw new Error(`Có ${dup.size} tên bị trùng (tô đỏ). Hãy thêm {so} vào mẫu tên.`);
    return p;
  };
  const zipBtn = button('Tải về (ZIP)', { kind: canWriteDir ? '' : 'btn-primary', iconName: 'download' });
  zipBtn.addEventListener('click', () => run(zipBtn, st, async () => {
    const p = check();
    const { zipOutputs } = await import('../core/zip.js');
    const blob = await zipOutputs(p.map((x) => ({ blob: x.it.file, name: x.to })));
    await showResult(st, [{ blob, name: `doi-ten_${p.length}-tep.zip` }], { tool: 'Đổi tên tệp' });
  }));
  const dirBtn = canWriteDir ? button('Ghi vào thư mục…', { kind: 'btn-primary', iconName: 'download' }) : null;
  dirBtn?.addEventListener('click', () => run(dirBtn, st, async () => {
    const p = check();
    let root;
    try { root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'beacondesk-rename' }); } catch { return; }
    let n = 0;
    for (const x of p) {
      const parts = x.to.split('/');
      let d = root;
      for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
      const fh = await d.getFileHandle(parts.at(-1), { create: true });
      const w = await fh.createWritable();
      await w.write(x.it.file);
      await w.close();
      n++;
    }
    st.ok(h('b', null, 'Hoàn tất. '), `Đã ghi ${n} tệp vào thư mục "${root.name}".`);
    toast(`Đã ghi ${n} tệp.`, 'ok');
  }));

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Đổi tên tệp hàng loạt'),
      h('p', { class: 'sub' }, 'Đặt tên theo mẫu, đánh số thứ tự, thêm ngày, tìm và thay, bỏ dấu tiếng Việt. Xem trước tên mới trước khi lưu.'),
      drop,
      h('div', { class: 'row mt' }, field('Sắp xếp', order), button('Xoá danh sách', { kind: 'btn-ghost', iconName: 'trash', onClick: () => { files = []; paint(); } })),
      list),
    h('section', { class: 'card' },
      h('h2', null, 'Quy tắc đặt tên'),
      field('Mẫu tên', tpl, '{ten} tên cũ · {so} số thứ tự · {ngay} ngày sửa tệp · {homnay} ngày hôm nay · {thumuc} thư mục chứa tệp'),
      chips,
      h('div', { class: 'grid3 mt' }, field('Số bắt đầu', start), field('Bước nhảy', step), field('Số chữ số', pad)),
      h('div', { class: 'grid2' }, field('Tìm', find), field('Thay bằng', repl)),
      h('div', null, useRe.el, matchCase.el),
      h('div', { class: 'grid2 mt' }, field('Kiểu chữ', kase), field('Dấu cách', space)),
      h('div', null, accent.el, keepExt.el, keepDirs.el),
      h('div', { class: 'row mt' }, dirBtn, zipBtn),
      st.el));
}
