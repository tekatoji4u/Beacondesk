// Khung chung cho các công cụ xử lý MỘT tệp PDF.
import { h, dropzone, progress, status, run, button, fmtSize, field, input, baseName, tick, parsePages } from '../../core/ui.js';
import { loadPdf } from '../../core/pdf.js';
import { pageGrid } from '../../core/pages.js';
import { showResult } from '../../core/result.js';

/**
 * @param cfg.title, cfg.sub
 * @param cfg.pages  'select' | 'organize' | 'range' | null — cách chọn trang
 * @param cfg.pagesLabel  nhãn ô nhập trang
 * @param cfg.options () => {el, read}
 * @param cfg.action async ({file, doc, pages, opts, progress}) => outs[] | {outs, note}
 * @param cfg.label   chữ trên nút chạy
 */
export function pdfTool(cfg) {
  let file = null;
  const st = status();
  const pr = progress();
  const list = h('ul', { class: 'files' });
  const grid = cfg.pages === 'select' || cfg.pages === 'organize' ? pageGrid({ mode: cfg.pages, onChange: () => syncRange() }) : null;
  const rangeInput = cfg.pages ? input({ placeholder: cfg.pagesPlaceholder || 'Để trống = tất cả. VD: 1-3, 5, lẻ, chẵn', inputmode: 'text' }) : null;
  const rangeField = cfg.pages && cfg.pages !== 'organize' ? field(cfg.pagesLabel || 'Trang áp dụng', rangeInput, grid ? 'Có thể bấm chọn trên ảnh thu nhỏ bên dưới hoặc gõ khoảng trang.' : null) : null;
  let syncing = false;
  function syncRange() {
    if (!grid || cfg.pages !== 'select' || syncing) return;
    rangeInput.value = grid.selectedText();
  }
  rangeInput?.addEventListener('change', () => {
    if (!grid || !file || cfg.pages !== 'select') return;
    syncing = true;
    try { grid.setSelected(rangeInput.value.trim() ? parsePages(rangeInput.value, grid.count) : []); } catch { /* lỗi sẽ hiện khi bấm chạy */ }
    syncing = false;
  });

  const opts = cfg.options ? cfg.options() : null;
  const drop = dropzone({
    accept: '.pdf,application/pdf',
    title: 'Chọn tệp PDF',
    hint: 'Kéo thả, bấm để chọn hoặc dán (Ctrl+V)',
    iconName: cfg.icon || 'file',
    onFiles: async ([f]) => {
      st.clear();
      try {
        pr.set(5, 'Đang đọc tệp…');
        await tick();
        const doc = await loadPdf(f);
        file = f;
        list.replaceChildren(h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, `${doc.getPageCount()} trang · ${fmtSize(f.size)}`),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ tệp', onclick: () => { file = null; list.replaceChildren(); grid?.clear(); } }, '✕')));
        if (grid) { pr.set(30, 'Đang tạo ảnh thu nhỏ…'); await grid.load(f); }
        pr.hide();
        opts?.onFile?.(f, doc);
      } catch (e) { pr.hide(); st.err(e.message); }
    },
  });

  const go = button(cfg.label || 'Thực hiện', { kind: 'btn-primary', iconName: 'play' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!file) throw new Error('Hãy chọn tệp PDF.');
    pr.set(3, 'Đang xử lý…');
    await tick();
    const doc = await loadPdf(file);
    let pages = null;
    if (cfg.pages === 'organize') pages = grid.plan();
    else if (cfg.pages) pages = parsePages(rangeInput.value, doc.getPageCount(), { emptyAll: cfg.emptyAll !== false });
    try {
      const r = await cfg.action({ file, doc, pages, opts: opts?.read?.() || {}, progress: (p, t) => pr.set(p, t), base: baseName(file.name) });
      const outs = Array.isArray(r) ? r : r.outs;
      pr.hide();
      await showResult(st, outs, { note: r.note || '', tool: cfg.title });
    } finally { pr.hide(); }
  }));

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, cfg.title), h('p', { class: 'sub' }, cfg.sub),
      drop, list,
      grid ? grid.el : null,
      rangeField,
      opts ? h('div', { class: 'mt' }, opts.el) : null,
      cfg.note ? h('div', { class: 'notice info' }, cfg.note) : null,
      h('div', { class: 'actions' }, go), pr.el, st.el));
}

export const pdfOut = (blob, name) => ({ blob, name });
