// Tạo PowerPoint từ Word/PDF/văn bản: tự lập dàn ý (sửa được), rút gọn đoạn dài
// thành ý chính, chọn bảng màu và phông; xuất .pptx 16:9.
import { h, dropzone, field, input, select, checkbox, button, status, run, progress, fmtSize, baseName, textarea } from '../core/ui.js';
import { showResult } from '../core/result.js';
import { PALETTES } from '../core/pptx.js';

const HELP = 'Dàn ý: "# Tiêu đề slide", "- ý chính", "  - ý phụ" (thụt 2 dấu cách), "| ô | ô |" cho bảng, "## Tên phần" cho slide chuyển phần.';

/** Dàn ý văn bản → danh sách slide. */
export function parseOutline(text, maxBullets) {
  const slides = [];
  let cur = null;
  const push = () => { if (cur && (cur.bullets.length || cur.rows.length || cur.kind === 'section')) slides.push(cur); };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    let m;
    if ((m = /^##\s+(.+)/.exec(line))) { push(); cur = { kind: 'section', title: m[1].trim(), bullets: [], rows: [] }; push(); cur = null; continue; }
    if ((m = /^#\s+(.+)/.exec(line))) { push(); cur = { kind: 'content', title: m[1].trim(), bullets: [], rows: [] }; continue; }
    cur ||= { kind: 'content', title: 'Nội dung', bullets: [], rows: [] };
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // dòng kẻ của bảng Markdown
      cur.kind = 'table';
      cur.rows.push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    const lv = /^(\s{2,}|\t)[-•*+]?\s*/.test(line) ? 1 : 0;
    cur.bullets.push({ t: line.replace(/^\s*[-•*+]\s*/, '').trim(), level: lv });
  }
  push();
  // chia slide quá dài thành nhiều slide "(tiếp)"
  const out = [];
  for (const s of slides) {
    if (s.kind !== 'content' || s.bullets.length <= maxBullets) { out.push(s); continue; }
    for (let i = 0; i < s.bullets.length; i += maxBullets) out.push({ ...s, title: s.title + (i ? ' (tiếp)' : ''), bullets: s.bullets.slice(i, i + maxBullets) });
  }
  return out;
}

/** Khối tài liệu → dàn ý văn bản. */
async function toOutline(blocks, { level, shorten, maxBullets }) {
  const { gist, summarize } = await import('../core/summarize.js');
  const lines = [];
  const isSplit = (b) => b.type === 'h' && (level === 'h1' ? b.level === 1 : level === 'h12' ? b.level <= 2 : b.level <= 3);
  const hasHead = blocks.some(isSplit);
  let count = 0;
  // đoạn dài: giữ 1–2 câu quan trọng nhất, mỗi câu thành một ý ngắn
  const ideas = (t) => (shorten && t.length > 160 ? summarize([t], { max: t.length > 400 ? 2 : 1, min: 1 }).map((x) => gist(x)) : [t]);
  for (const b of blocks) {
    if (b.type === 'pagebreak') continue;
    if (!hasHead && count % maxBullets === 0 && b.type !== 'table') {
      const t = gist(b.text || '', 9).replace(/…$/, '');
      lines.push('', '# ' + (t || 'Nội dung'));
    }
    if (isSplit(b)) { lines.push('', '# ' + b.text); count = 0; continue; }
    if (b.type === 'h') { lines.push('- ' + b.text); count++; continue; }
    if (b.type === 'table') { lines.push('', '# Bảng số liệu', ...b.rows.slice(0, 12).map((r) => '| ' + r.join(' | ') + ' |'), '', '# (tiếp)'); continue; }
    const pre = b.type === 'li' ? '  - ' : '- ';
    for (const t of ideas(b.text)) { lines.push(pre + t); count++; }
  }
  return lines.join('\n').replace(/\n# \(tiếp\)\n*$/, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function render() {
  let file = null;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const outline = textarea({ rows: 16, placeholder: '# Tiêu đề slide\n- Ý chính thứ nhất\n- Ý chính thứ hai\n  - Ý phụ\n\n# Slide tiếp theo\n- …', spellcheck: 'false', 'aria-label': 'Dàn ý' });
  const paste = textarea({ rows: 5, placeholder: 'Hoặc dán nội dung văn bản vào đây rồi bấm "Lập dàn ý".' });
  const title = input({ placeholder: 'Tự lấy từ tiêu đề văn bản' });
  const subtitle = input({ placeholder: 'VD: Báo cáo quý III / Đơn vị trình bày' });
  const presenter = input({ placeholder: 'Họ tên người trình bày (không bắt buộc)' });
  const level = select([{ value: 'h1', label: 'Chỉ tiêu đề cấp 1' }, { value: 'h12', label: 'Tiêu đề cấp 1 và 2' }, { value: 'h123', label: 'Tiêu đề cấp 1, 2 và 3' }], 'h12');
  const maxB = select([{ value: '4', label: '4 ý / slide' }, { value: '5', label: '5 ý / slide' }, { value: '6', label: '6 ý / slide' }, { value: '8', label: '8 ý / slide' }], '6');
  const pal = select(Object.entries(PALETTES).map(([value, p]) => ({ value, label: p.name })), 'navy');
  const font = select(['Arial', 'Calibri', 'Times New Roman', 'Segoe UI', 'Roboto'], 'Arial');
  const shorten = checkbox('Rút gọn đoạn văn dài thành ý chính', true);
  const cover = checkbox('Thêm slide bìa và slide cảm ơn', true);
  const count = h('span', { class: 'tag info' }, '0 slide');
  const swatches = h('div', { class: 'row', style: 'gap:6px' });
  const paintSw = () => {
    const p = PALETTES[pal.value];
    swatches.replaceChildren(...[p.cover, p.accent, p.accent2, p.bg].map((c) => h('span', { style: `width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:#${c}` })));
  };
  pal.addEventListener('change', paintSw);
  paintSw();
  const recount = () => { count.textContent = `Dự kiến ${parseOutline(outline.value, +maxB.value).length + (cover.get() ? 2 : 0)} slide`; };
  outline.addEventListener('input', recount);
  maxB.addEventListener('change', recount);
  cover.input.addEventListener('change', recount);

  async function makeOutline() {
    let blocks, t = '';
    if (file) {
      pr.set(20, 'Đang đọc tệp…');
      const { readDocument } = await import('../core/text.js');
      const d = await readDocument(file);
      if (d.scanned) throw new Error('PDF này là ảnh scan. Hãy nhận dạng chữ (OCR) trước.');
      blocks = d.blocks; t = d.title;
    } else if (paste.value.trim()) {
      const { fromPlain } = await import('../core/text.js');
      const d = fromPlain(paste.value);
      blocks = d.blocks; t = d.title;
    } else throw new Error('Chưa chọn tệp nguồn hoặc dán nội dung.');
    outline.value = await toOutline(blocks, { level: level.value, shorten: shorten.get(), maxBullets: +maxB.value });
    if (!title.value.trim()) title.value = t;
    pr.hide();
    recount();
  }
  const drop = dropzone({ accept: '.docx,.pdf,.txt,.md', title: 'Chọn tệp Word (.docx), PDF hoặc .txt', hint: 'Dàn ý được lập tự động; bạn sửa lại trước khi tạo slide', iconName: 'slides', onFiles: ([f]) => {
    file = f;
    list.replaceChildren(h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size))));
    run(mk, st, makeOutline);
  } });
  const mk = button('Lập dàn ý', { iconName: 'list' });
  mk.addEventListener('click', () => run(mk, st, makeOutline));
  level.addEventListener('change', () => { if (file || paste.value.trim()) run(mk, st, makeOutline); });

  const go = button('Tạo PowerPoint', { kind: 'btn-primary', iconName: 'slides' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!outline.value.trim()) await makeOutline();
    const body = parseOutline(outline.value, +maxB.value);
    if (!body.length) throw new Error('Không tạo được slide nào từ dàn ý này.');
    const t = title.value.trim() || body[0].title || 'Bản trình bày';
    const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const slides = cover.get()
      ? [{ kind: 'cover', title: t, subtitle: [subtitle.value.trim(), [presenter.value.trim(), today].filter(Boolean).join(' · ')].filter(Boolean).join('\n') }, ...body, { kind: 'end', title: 'Trân trọng cảm ơn!', subtitle: presenter.value.trim() }]
      : body;
    pr.set(60, 'Đang dựng slide…');
    const { buildPptx } = await import('../core/pptx.js');
    const blob = await buildPptx(slides, { palette: pal.value, font: font.value, title: t, footer: t.length < 70 ? t : '' });
    pr.hide();
    const name = (file ? baseName(file.name) : t.slice(0, 60)).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pptx';
    await showResult(st, [{ blob, name }], { note: `${slides.length} slide`, tool: 'Tạo PowerPoint' });
  }));

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Tạo PowerPoint từ văn bản'),
      h('p', { class: 'sub' }, 'Đọc Word, PDF hoặc văn bản dán vào; tự lập dàn ý theo tiêu đề; bạn chỉnh dàn ý rồi xuất tệp .pptx mở được bằng PowerPoint, Google Slides, Keynote.'),
      drop, list, h('div', { class: 'mt' }, paste),
      h('div', { class: 'grid2 mt' }, field('Tách slide theo', level), field('Số ý tối đa mỗi slide', maxB)),
      shorten.el,
      h('div', { class: 'row mt' }, mk), pr.el),
    h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { style: 'margin:0' }, 'Dàn ý'), count),
      h('p', { class: 'sub' }, HELP),
      outline),
    h('section', { class: 'card' },
      h('h2', null, 'Trình bày'),
      field('Tiêu đề bài', title),
      h('div', { class: 'grid2' }, field('Phụ đề', subtitle), field('Người trình bày', presenter)),
      h('div', { class: 'grid2' }, field('Bảng màu', h('div', null, pal, h('div', { class: 'mt' }, swatches))), field('Phông chữ', font)),
      cover.el,
      h('div', { class: 'row mt' }, go),
      st.el));
}
