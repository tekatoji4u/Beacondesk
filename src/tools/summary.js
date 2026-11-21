// Tóm tắt văn bản ngay trên máy (trích câu quan trọng, từ khoá, dàn ý theo mục).
// Nếu người dùng đã bật AI trong Cài đặt (bản online), có thêm nút "Tóm tắt bằng AI".
import { h, dropzone, field, select, button, status, run, progress, fmtSize, baseName, textarea, copyText, toast } from '../core/ui.js';
import { showResult } from '../core/result.js';
import { summarize, keywords } from '../core/summarize.js';

export function render() {
  let file = null, last = null;
  const st = status(), pr = progress();
  const out = h('div');
  const list = h('ul', { class: 'files' });
  const paste = textarea({ rows: 6, placeholder: 'Hoặc dán nội dung cần tóm tắt vào đây…' });
  const len = select([{ value: '0.12', label: 'Ngắn (khoảng 10%)' }, { value: '0.22', label: 'Vừa (khoảng 20%)' }, { value: '0.35', label: 'Chi tiết (khoảng 35%)' }], '0.22');
  const mode = select([{ value: 'bullets', label: 'Gạch đầu dòng' }, { value: 'para', label: 'Đoạn văn' }, { value: 'outline', label: 'Dàn ý theo mục' }], 'bullets');
  const drop = dropzone({ accept: '.docx,.pdf,.txt,.md', title: 'Chọn tệp Word, PDF hoặc .txt', hint: 'Nội dung được xử lý ngay trên thiết bị của bạn', iconName: 'list', onFiles: ([f]) => {
    file = f;
    list.replaceChildren(h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size))));
    go.click();
  } });

  async function source() {
    const { readDocument, fromPlain } = await import('../core/text.js');
    if (file) {
      pr.set(20, 'Đang đọc tệp…');
      const d = await readDocument(file);
      pr.hide();
      if (d.scanned) throw new Error('PDF này là ảnh scan. Hãy nhận dạng chữ (OCR) trước.');
      return d;
    }
    if (paste.value.trim()) return fromPlain(paste.value);
    throw new Error('Hãy chọn tệp hoặc dán văn bản cần tóm tắt.');
  }

  const go = button('Tóm tắt', { kind: 'btn-primary', iconName: 'list' });
  go.addEventListener('click', () => run(go, st, async () => {
    const d = await source();
    const paras = d.blocks.filter((b) => b.type === 'p' || b.type === 'li').map((b) => b.text);
    const text = paras.join('\n');
    if (text.length < 200) throw new Error('Nội dung quá ngắn để tóm tắt (cần khoảng 200 ký tự trở lên).');
    const ratio = +len.value;
    let blocks;
    if (mode.value === 'outline') {
      // mỗi tiêu đề kèm 1–3 câu quan trọng nhất của mục đó
      blocks = [];
      let head = null, buf = [];
      const flush = () => {
        if (!buf.length) return;
        if (head) blocks.push({ type: 'h', level: 2, text: head });
        summarize(buf, { ratio, max: 3, min: 1 }).forEach((s) => blocks.push({ type: 'li', text: s }));
        buf = [];
      };
      for (const b of d.blocks) {
        if (b.type === 'h') { flush(); head = b.text; } else if (b.text) buf.push(b.text);
      }
      flush();
    } else {
      const ss = summarize(paras, { ratio, max: 30 });
      blocks = mode.value === 'para' ? [{ type: 'p', text: ss.join(' ') }] : ss.map((s) => ({ type: 'li', text: s }));
    }
    last = { title: d.title, blocks, text };
    show(blocks, keywords(text, 12), text);
  }));

  function show(blocks, kw, text) {
    const plain = blocks.map((b) => (b.type === 'h' ? '\n' + b.text : b.type === 'li' ? '- ' + b.text : b.text)).join('\n').trim();
    const words = text.split(/\s+/).length;
    const outWords = plain.split(/\s+/).length;
    const aiBox = h('div');
    out.replaceChildren(h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { style: 'margin:0' }, 'Tóm tắt'),
        h('span', { class: 'tag info' }, `${outWords.toLocaleString('vi-VN')} / ${words.toLocaleString('vi-VN')} từ · đọc khoảng ${Math.max(1, Math.round(outWords / 200))} phút`)),
      kw.length ? h('div', { class: 'row mt', style: 'gap:6px' }, h('b', { style: 'font-size:13px' }, 'Từ khoá:'), kw.map(({ k }) => h('span', { class: 'tag ok', style: 'font-weight:600' }, k))) : null,
      h('div', { class: 'summary-out mt' }, blocks.map((b) => (b.type === 'h' ? h('h3', null, b.text) : b.type === 'li' ? h('p', { class: 'li' }, '• ' + b.text) : h('p', null, b.text)))),
      h('div', { class: 'row mt' },
        button('Sao chép tóm tắt', { iconName: 'copy', onClick: async () => { await copyText(plain); toast('Đã chép tóm tắt.'); } }),
        button('Tải Word', { iconName: 'word', onClick: () => run(null, st, async () => {
          const { blocksToDocx } = await import('../core/docx.js');
          const blob = await blocksToDocx([{ type: 'h', level: 1, text: 'TÓM TẮT: ' + (last.title || '').toLocaleUpperCase('vi') }, ...last.blocks], { title: last.title });
          await showResult(st, [{ blob, name: (file ? baseName(file.name) : 'van-ban') + '_tom-tat.docx' }], { tool: 'Tóm tắt' });
        }) })),
      aiBox));
    paintAi(aiBox, text);
  }

  async function paintAi(box, text) {
    const { aiReady } = await import('../core/ai.js');
    if (!(await aiReady())) {
      if (!__SINGLE__) box.replaceChildren(h('p', { class: 'sub mt' }, 'Muốn bản tóm tắt viết lại mượt hơn? Có thể bật AI (dùng khoá API Claude của bạn) trong ', h('a', { href: '#/settings' }, 'Cài đặt'), '.'));
      return;
    }
    const res = h('div', { class: 'ai-box mt', hidden: true });
    const b = button('Tóm tắt bằng AI', { iconName: 'sparkles' });
    b.addEventListener('click', () => run(b, st, async () => {
      const { askClaude } = await import('../core/ai.js');
      const style = { bullets: 'dạng gạch đầu dòng, mỗi ý một dòng', para: 'thành một đến hai đoạn văn liền mạch', outline: 'thành dàn ý theo các mục chính của văn bản' }[mode.value];
      const pct = Math.round(+len.value * 100);
      const answer = await askClaude(
        'Bạn là trợ lý tóm tắt văn bản hành chính tiếng Việt. Chỉ dùng thông tin có trong văn bản, giữ nguyên số liệu, tên riêng, ngày tháng. Viết tiếng Việt chuẩn mực, không thêm lời mở đầu hay kết luận ngoài nội dung tóm tắt.',
        `Tóm tắt văn bản sau ${style}, độ dài khoảng ${pct}% bản gốc.\n\n<van_ban>\n${text}\n</van_ban>`);
      res.hidden = false;
      res.replaceChildren(h('b', null, 'Tóm tắt bằng AI'), h('div', { class: 'summary-out', style: 'white-space:pre-wrap' }, answer),
        h('div', { class: 'row mt' }, button('Sao chép', { iconName: 'copy', onClick: async () => { await copyText(answer); toast('Đã chép.'); } })));
    }));
    box.replaceChildren(h('div', { class: 'row mt' }, b), res);
  }

  return h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Tóm tắt và lập dàn ý'),
      h('p', { class: 'sub' }, 'Chọn câu quan trọng nhất theo từ khoá, vị trí và số liệu; giữ nguyên câu chữ gốc nên không sai lệch nội dung. Chạy hoàn toàn trên máy.'),
      drop, list, h('div', { class: 'mt' }, paste),
      h('div', { class: 'grid2 mt' }, field('Độ dài', len), field('Cách trình bày', mode)),
      h('div', { class: 'row mt' }, go), pr.el, st.el),
    out);
}
