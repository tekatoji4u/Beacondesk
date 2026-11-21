// Kiểm tra văn bản: thể thức theo NĐ30 (với tệp .docx), chính tả tiếng Việt,
// lỗi trình bày và văn phong. Có sửa nhanh lề/khổ giấy/phông và tự sửa lỗi trình bày.
import { h, dropzone, status, run, button, fmtSize, ext, seg, baseName, textarea, toast, copyText } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { checkText, autoFix } from '../core/vnlang.js';
import { showResult } from '../core/result.js';

const SEV = { err: 'Lỗi', warn: 'Cảnh báo', info: 'Gợi ý', ok: 'Đạt' };
const ORDER = { err: 0, warn: 1, info: 2, ok: 3 };

export function render() {
  let file = null;
  const st = status();
  const out = h('div');
  const list = h('ul', { class: 'files' });
  const paste = textarea({ rows: 6, placeholder: 'Hoặc dán văn bản vào đây để kiểm tra chính tả và trình bày (không kiểm tra được lề, phông chữ).' });
  const setFile = (f) => {
    file = f;
    list.replaceChildren(f ? h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size)),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ tệp', html: icon('x'), onclick: () => setFile(null) })) : '');
    if (f) go.click();
  };
  const drop = dropzone({ accept: '.docx,.pdf,.txt,.md', title: 'Chọn tệp Word (.docx), PDF hoặc .txt', hint: 'Chỉ tệp .docx mới kiểm tra được lề, phông chữ, cỡ chữ, số trang', iconName: 'spell', onFiles: ([f]) => setFile(f) });

  const go = button('Kiểm tra', { kind: 'btn-primary', iconName: 'check' });
  go.addEventListener('click', () => run(go, st, async () => {
    out.replaceChildren();
    let paras, fmt = null, info = null, source;
    if (file) {
      source = file.name;
      const e = ext(file.name);
      if (e === 'docx') {
        const { inspectDocx, checkFormat } = await import('../core/docxinspect.js');
        info = await inspectDocx(await file.arrayBuffer());
        paras = info.paras.map((p) => p.text);
        fmt = checkFormat(info);
      } else if (e === 'pdf') {
        const { readDocument, blocksToText } = await import('../core/text.js');
        const d = await readDocument(file);
        if (d.scanned) throw new Error('PDF này là ảnh scan, chưa có chữ để kiểm tra. Hãy nhận dạng chữ (OCR) trước.');
        paras = blocksToText(d.blocks).split('\n');
      } else paras = (await file.text()).replace(/\r/g, '').split('\n');
    } else if (paste.value.trim()) { paras = paste.value.split('\n'); source = 'văn bản đã dán'; }
    else throw new Error('Hãy chọn tệp hoặc dán văn bản cần kiểm tra.');
    const lang = checkText(paras.map((s) => s.replace(/\s+$/, '')));
    showReport({ fmt, lang, paras, source, info });
  }));

  function showReport({ fmt, lang, paras, source }) {
    const all = [...(fmt?.out || []), ...lang];
    const n = (s) => all.filter((x) => x.sev === s).length;
    const items = h('ul', { class: 'issues' });
    let filter = 'all';
    const cats = ['Thể thức', 'Chính tả', 'Trình bày', 'Văn phong'].filter((c) => all.some((x) => x.cat === c));
    const paint = () => items.replaceChildren(...all
      .filter((x) => filter === 'all' || x.cat === filter)
      .filter((x) => filter !== 'all' || x.sev !== 'ok' || x.cat === 'Thể thức')
      .sort((a, b) => ORDER[a.sev] - ORDER[b.sev] || (a.para || 0) - (b.para || 0))
      .slice(0, 400)
      .map((x) => h('li', { class: 'issue' },
        h('span', { class: 'tag ' + x.sev }, SEV[x.sev]),
        h('div', null,
          h('div', { class: 'msg' }, x.msg, x.para ? h('span', { class: 'meta' }, ` · đoạn ${x.para}`) : null),
          x.ctx ? ctxEl(x.ctx) : null))));
    const filt = seg([{ value: 'all', label: 'Tất cả' }, ...cats.map((c) => ({ value: c, label: `${c} (${all.filter((x) => x.cat === c && x.sev !== 'ok').length})` }))], 'all', (v) => { filter = v; paint(); });
    paint();

    const actions = h('div', { class: 'row mt' });
    if (file && ext(file.name) === 'docx' && fmt?.out.some((x) => x.sev === 'err' && /Khổ giấy|Lề|Phông/.test(x.msg))) {
      actions.append(button('Sửa nhanh khổ giấy, lề, phông chữ', { kind: 'btn-primary', iconName: 'wand', onClick: () => run(null, st, async () => {
        const { fixDocx } = await import('../core/docxinspect.js');
        const blob = await fixDocx(await file.arrayBuffer());
        await showResult(st, [{ blob, name: baseName(file.name) + '_da-sua.docx' }], { note: 'Đã đặt A4, lề theo quy định, phông Times New Roman', tool: 'Kiểm tra văn bản' });
      }) }));
    }
    const fixed = autoFix(paras.join('\n'));
    if (fixed !== paras.join('\n')) {
      actions.append(button('Tự sửa lỗi khoảng trắng, dấu câu, ngày tháng', { iconName: 'wand', onClick: async () => {
        if (!file) { paste.value = fixed; toast('Đã sửa trong ô văn bản. Bấm Kiểm tra để xem lại.'); return; }
        await copyText(fixed);
        toast('Đã chép văn bản đã sửa vào bộ nhớ tạm (định dạng gốc không đổi).');
      } }));
    }
    out.replaceChildren(
      h('section', { class: 'card' },
        h('h2', null, 'Kết quả kiểm tra'),
        h('p', { class: 'sub' }, `Nguồn: ${source} · ${paras.filter((p) => p.trim()).length} đoạn`),
        h('div', { class: 'score' },
          h('div', null, h('b', { style: 'color:var(--err)' }, n('err')), h('span', null, 'lỗi')),
          h('div', null, h('b', { style: 'color:var(--warn)' }, n('warn')), h('span', null, 'cảnh báo')),
          h('div', null, h('b', { style: 'color:var(--info)' }, n('info')), h('span', null, 'gợi ý')),
          h('div', null, h('b', { style: 'color:var(--ok)' }, n('ok')), h('span', null, 'mục đạt'))),
        fmt ? h('div', { class: 'row mt', style: 'gap:6px' }, fmt.params.map(([k, v]) => h('span', { class: 'tag info', style: 'font-weight:600' }, `${k}: ${v}`))) : h('div', { class: 'notice info mt' }, 'Chỉ tệp Word (.docx) mới kiểm tra được thể thức trang (lề, phông, cỡ chữ, số trang).'),
        actions),
      h('section', { class: 'card' },
        h('div', { class: 'seg-wrap' }, filt.el),
        all.length ? items : h('div', { class: 'notice ok mt' }, 'Không phát hiện lỗi nào.')));
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Kiểm tra thể thức và chính tả'),
      h('p', { class: 'sub' }, 'Đối chiếu Nghị định 30/2020/NĐ-CP; dò lỗi chính tả theo cấu tạo âm tiết tiếng Việt, lỗi dấu câu, khoảng trắng, ngày tháng và văn phong.'),
      drop, list, h('div', { class: 'mt' }, paste),
      h('div', { class: 'row mt' }, go),
      st.el),
    out);
}

function ctxEl({ text, i, len }) {
  if (!len) return h('div', { class: 'ctx' }, text.length > 160 ? text.slice(0, 160) + '…' : text);
  const a = Math.max(0, i - 40), b = Math.min(text.length, i + len + 40);
  return h('div', { class: 'ctx' }, (a ? '…' : '') + text.slice(a, i), h('mark', null, text.slice(i, i + len)), text.slice(i + len, b) + (b < text.length ? '…' : ''));
}
