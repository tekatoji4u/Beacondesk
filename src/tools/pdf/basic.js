// Ghép, tách, sắp xếp, trích, xoay, xoá, nhân bản trang, thông tin tài liệu.
import { h, dropzone, progress, status, run, button, fmtSize, field, input, num, select, seg, checkbox, tick, baseName, parsePages } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { loadPdf, savePdf, PDFDocument, degrees, visualBox } from '../../core/pdf.js';
import { showResult } from '../../core/result.js';
import { zipOutputs } from '../../core/zip.js';
import { pdfTool, pdfOut } from './common.js';

const addRot = (page, deg) => page.setRotation(degrees((((page.getRotation().angle + deg) % 360) + 360) % 360));

// ---------- Ghép ----------
export function merge() {
  let items = [];
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const paint = () => list.replaceChildren(...items.map((it, i) => h('li', null,
    h('span', { class: 'nm' }, `${i + 1}. ${it.file.name}`),
    h('span', { class: 'meta' }, `${it.pages} tr · ${fmtSize(it.file.size)}`),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Lên', disabled: i === 0, html: icon('up'), onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; paint(); } }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Xuống', disabled: i === items.length - 1, html: icon('down'), onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; paint(); } }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Bỏ', html: icon('x'), onclick: () => { items.splice(i, 1); paint(); } }))));
  const drop = dropzone({
    accept: '.pdf,application/pdf', multiple: true, title: 'Chọn nhiều tệp PDF', hint: 'Có thể chọn thêm nhiều lần; sắp thứ tự bằng nút mũi tên', iconName: 'files',
    onFiles: async (files) => {
      for (const f of files) {
        try { const d = await loadPdf(f); items.push({ file: f, pages: d.getPageCount() }); } catch (e) { st.err(e.message); }
      }
      paint();
    },
  });
  const sortBtn = button('Sắp theo tên', { kind: 'btn-sm', onClick: () => { items.sort((a, b) => a.file.name.localeCompare(b.file.name, 'vi', { numeric: true })); paint(); } });
  const blank = checkbox('Chèn trang trắng giữa các tệp (thuận tiện in hai mặt)');
  const go = button('Ghép thành một tệp', { kind: 'btn-primary', iconName: 'merge' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (items.length < 2) throw new Error('Cần ít nhất 2 tệp PDF để ghép.');
    const out = await PDFDocument.create();
    for (let i = 0; i < items.length; i++) {
      pr.set((i / items.length) * 95, `Đang ghép ${i + 1}/${items.length}: ${items[i].file.name}`);
      await tick();
      const src = await loadPdf(items[i].file);
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      if (blank.get() && i < items.length - 1 && out.getPageCount() % 2 === 1) {
        const last = out.getPage(out.getPageCount() - 1);
        const { width, height } = last.getSize();
        out.addPage([width, height]);
      }
    }
    const blob = await savePdf(out);
    pr.hide();
    await showResult(st, [pdfOut(blob, `${baseName(items[0].file.name)}_ghep-${items.length}-tep.pdf`)], { note: `${out.getPageCount()} trang`, tool: 'Ghép PDF' });
  }));
  return h('section', { class: 'card' }, h('h2', null, 'Ghép nhiều PDF'), h('p', { class: 'sub' }, 'Chọn các tệp, sắp xếp thứ tự rồi ghép thành một tệp.'),
    drop, list, h('div', { class: 'row mt' }, sortBtn), blank.el, h('div', { class: 'actions' }, go), pr.el, st.el);
}

// ---------- Tách ----------
export function split() {
  return pdfTool({
    title: 'Tách PDF', sub: 'Chia một tệp thành nhiều tệp. Nhiều tệp được gói chung trong một tệp ZIP.', label: 'Tách tệp', icon: 'split',
    options() {
      const mode = seg([{ value: 'each', label: 'Mỗi trang một tệp' }, { value: 'every', label: 'Chia đều N trang' }, { value: 'groups', label: 'Theo nhóm trang' }, { value: 'size', label: 'Theo dung lượng' }], 'each', () => sync());
      const groups = input({ placeholder: 'VD: 1-3; 4-6; 7-' });
      const every = num(5, 1, 9999);
      const size = num(5, 1, 500);
      const fg = field('Các nhóm trang (cách nhau bằng dấu chấm phẩy)', groups);
      const fe = field('Số trang mỗi tệp', every);
      const fs = field('Dung lượng tối đa mỗi tệp (MB)', size, 'Gần đúng: hữu ích khi gửi email bị giới hạn dung lượng.');
      const sync = () => { fg.hidden = mode.get() !== 'groups'; fe.hidden = mode.get() !== 'every'; fs.hidden = mode.get() !== 'size'; };
      sync();
      return { el: h('div', null, mode.el, fg, fe, fs), read: () => ({ mode: mode.get(), groups: groups.value, every: Math.max(1, +every.value || 1), size: Math.max(0.2, +size.value || 5) }) };
    },
    async action({ doc, opts, base, progress: pr }) {
      const n = doc.getPageCount();
      let sets = [];
      if (opts.mode === 'each') sets = [...Array(n).keys()].map((i) => [i]);
      else if (opts.mode === 'every') for (let i = 0; i < n; i += opts.every) sets.push([...Array(Math.min(opts.every, n - i)).keys()].map((k) => i + k));
      else if (opts.mode === 'groups') {
        sets = opts.groups.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => parsePages(s, n));
        if (!sets.length) throw new Error('Chưa nhập nhóm trang.');
      } else {
        // theo dung lượng: thêm dần trang cho tới khi vượt ngưỡng
        const limit = opts.size * 1024 * 1024;
        let cur = [];
        for (let i = 0; i < n; i++) {
          pr((i / n) * 60, `Đang ước lượng dung lượng trang ${i + 1}/${n}`);
          const test = await PDFDocument.create();
          (await test.copyPages(doc, [...cur, i])).forEach((p) => test.addPage(p));
          const bytes = (await test.save({ useObjectStreams: true })).length;
          if (bytes > limit && cur.length) { sets.push(cur); cur = [i]; } else cur.push(i);
          await tick();
        }
        if (cur.length) sets.push(cur);
      }
      const outs = [];
      for (let s = 0; s < sets.length; s++) {
        pr(60 + (s / sets.length) * 35, `Đang tạo tệp ${s + 1}/${sets.length}`);
        await tick();
        const d = await PDFDocument.create();
        (await d.copyPages(doc, sets[s])).forEach((p) => d.addPage(p));
        const a = sets[s][0] + 1, b = sets[s][sets[s].length - 1] + 1;
        outs.push(pdfOut(await savePdf(d), `${base}_tr${a === b ? a : a + '-' + b}.pdf`));
      }
      if (outs.length === 1) return outs;
      pr(97, 'Đang đóng gói ZIP…');
      return { outs: [{ blob: await zipOutputs(outs), name: `${base}_tach-${outs.length}-tep.zip` }], note: `${outs.length} tệp PDF` };
    },
  });
}

// ---------- Sắp xếp trang (kéo thả) ----------
export function organize() {
  return pdfTool({
    title: 'Sắp xếp trang', sub: 'Kéo thả ảnh thu nhỏ để đổi thứ tự (trên điện thoại: chạm giữ rồi kéo). Có thể xoay, nhân bản hoặc bỏ từng trang.', label: 'Lưu thứ tự mới', icon: 'layers',
    pages: 'organize',
    async action({ doc, pages, base }) {
      if (!pages.length) throw new Error('Không còn trang nào — hãy giữ lại ít nhất một trang.');
      const out = await PDFDocument.create();
      const copied = await out.copyPages(doc, pages.map((p) => p.src));
      copied.forEach((p, i) => { if (pages[i].rot) addRot(p, pages[i].rot); out.addPage(p); });
      return { outs: [pdfOut(await savePdf(out), `${base}_sap-xep.pdf`)], note: `${pages.length} trang` };
    },
  });
}

// ---------- Trích trang ----------
export function extract() {
  return pdfTool({
    title: 'Trích trang', sub: 'Lấy các trang mong muốn thành tệp mới. Khi gõ khoảng trang, thứ tự gõ là thứ tự trang mới (VD: 3, 1, 2 hoặc 10-1 để đảo ngược).', label: 'Trích thành tệp mới', icon: 'extract',
    pages: 'select', pagesLabel: 'Các trang cần lấy', emptyAll: false, pagesPlaceholder: 'VD: 1-3, 5, 8-  ·  lẻ  ·  chẵn',
    options() {
      const sep = checkbox('Mỗi trang thành một tệp riêng');
      return { el: sep.el, read: () => ({ sep: sep.get() }) };
    },
    async action({ doc, pages, opts, base }) {
      if (opts.sep) {
        const outs = [];
        for (const i of pages) { const d = await PDFDocument.create(); d.addPage((await d.copyPages(doc, [i]))[0]); outs.push(pdfOut(await savePdf(d), `${base}_tr${i + 1}.pdf`)); }
        return outs.length > 1 ? { outs: [{ blob: await zipOutputs(outs), name: `${base}_trich-${outs.length}-trang.zip` }], note: `${outs.length} tệp` } : outs;
      }
      const d = await PDFDocument.create();
      (await d.copyPages(doc, pages)).forEach((p) => d.addPage(p));
      return { outs: [pdfOut(await savePdf(d), `${base}_trich.pdf`)], note: `${pages.length} trang` };
    },
  });
}

// ---------- Xoay ----------
export function rotate() {
  return pdfTool({
    title: 'Xoay trang', sub: 'Xoay các trang được chọn (để trống = tất cả). Muốn xoay từng trang khác nhau, dùng "Sắp xếp trang".', label: 'Xoay', icon: 'rotate',
    pages: 'select', pagesLabel: 'Trang cần xoay',
    options() {
      const dir = seg([{ value: 90, label: 'Phải 90°' }, { value: 270, label: 'Trái 90°' }, { value: 180, label: '180°' }], 90);
      return { el: field('Hướng xoay', dir.el), read: () => ({ deg: dir.get() }) };
    },
    async action({ doc, pages, opts, base }) {
      pages.forEach((i) => addRot(doc.getPage(i), opts.deg));
      return { outs: [pdfOut(await savePdf(doc), `${base}_xoay.pdf`)], note: `${pages.length} trang` };
    },
  });
}

// ---------- Xoá ----------
export function remove() {
  return pdfTool({
    title: 'Xoá trang', sub: 'Chọn các trang muốn xoá; các trang còn lại giữ nguyên thứ tự.', label: 'Xoá các trang đã chọn', icon: 'trash',
    pages: 'select', pagesLabel: 'Các trang cần xoá', emptyAll: false,
    async action({ doc, pages, base }) {
      const del = new Set(pages);
      if (del.size >= doc.getPageCount()) throw new Error('Không thể xoá toàn bộ các trang.');
      [...del].sort((a, b) => b - a).forEach((i) => doc.removePage(i));
      return { outs: [pdfOut(await savePdf(doc), `${base}_da-xoa.pdf`)], note: `còn ${doc.getPageCount()} trang` };
    },
  });
}

// ---------- Nhân bản & đảo trang ----------
export function duplicate() {
  return pdfTool({
    title: 'Nhân bản & đảo trang', sub: 'Nhân bản trang, lặp cả tệp, đảo ngược thứ tự hoặc chèn trang trắng.', label: 'Thực hiện', icon: 'copy',
    options() {
      const m = select([{ value: 'dup', label: 'Mỗi trang nhân thành N bản' }, { value: 'rep', label: 'Lặp lại cả tệp N lần' }, { value: 'rev', label: 'Đảo ngược thứ tự trang' }, { value: 'blank', label: 'Chèn trang trắng sau mỗi trang' }, { value: 'booklet', label: 'Xếp trang để in hai mặt (lẻ trước, chẵn sau)' }], 'dup');
      const k = num(2, 1, 50);
      const fk = field('Số bản (N)', k);
      const sync = () => { fk.hidden = !['dup', 'rep'].includes(m.value); };
      m.addEventListener('change', sync); sync();
      return { el: h('div', null, field('Kiểu thao tác', m), fk), read: () => ({ m: m.value, k: Math.max(1, +k.value || 1) }) };
    },
    async action({ doc, opts, base }) {
      const n = doc.getPageCount();
      const all = [...Array(n).keys()];
      let order;
      if (opts.m === 'dup') order = all.flatMap((i) => Array(opts.k).fill(i));
      else if (opts.m === 'rep') order = Array(opts.k).fill(all).flat();
      else if (opts.m === 'rev') order = all.slice().reverse();
      else if (opts.m === 'booklet') order = [...all.filter((i) => i % 2 === 0), ...all.filter((i) => i % 2 === 1).reverse()];
      else order = all.flatMap((i) => [i, -1]);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(doc, order.filter((i) => i >= 0));
      let pi = 0;
      for (const i of order) {
        if (i < 0) { const v = visualBox(out.getPage(out.getPageCount() - 1)); out.addPage([v.vw, v.vh]); } else out.addPage(pages[pi++]);
      }
      return { outs: [pdfOut(await savePdf(out), `${base}_${opts.m}.pdf`)], note: `${out.getPageCount()} trang` };
    },
  });
}

// ---------- Thông tin tài liệu ----------
export function meta() {
  const f = { title: input(), author: input(), subject: input(), keywords: input({ placeholder: 'cách nhau bằng dấu phẩy' }), creator: input() };
  const clear = checkbox('Xoá toàn bộ thông tin (ẩn danh tài liệu trước khi gửi đi)');
  const info = h('div', { class: 'small mt' });
  return pdfTool({
    title: 'Thông tin tài liệu', sub: 'Xem và sửa tiêu đề, tác giả, chủ đề, từ khoá của PDF.', label: 'Lưu thông tin', icon: 'tag',
    options() {
      return {
        el: h('div', null, h('div', { class: 'grid2' }, field('Tiêu đề', f.title), field('Tác giả', f.author), field('Chủ đề', f.subject), field('Từ khoá', f.keywords), field('Ứng dụng tạo', f.creator)), clear.el, info),
        read: () => ({}),
        onFile(file, doc) {
          f.title.value = doc.getTitle() || ''; f.author.value = doc.getAuthor() || ''; f.subject.value = doc.getSubject() || '';
          f.keywords.value = doc.getKeywords() || ''; f.creator.value = doc.getCreator() || '';
          const c = doc.getCreationDate(), m = doc.getModificationDate();
          info.textContent = `Tạo lúc: ${c ? c.toLocaleString('vi-VN') : '—'} · Sửa lúc: ${m ? m.toLocaleString('vi-VN') : '—'} · Phần mềm: ${doc.getProducer() || '—'}`;
        },
      };
    },
    async action({ doc, base }) {
      if (clear.get()) {
        const { PDFName } = await import('pdf-lib');
        const info = doc.getInfoDict();
        ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'].forEach((k) => info.delete(PDFName.of(k)));
        doc.catalog.delete(PDFName.of('Metadata'));
        const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
        return [pdfOut(new Blob([bytes], { type: 'application/pdf' }), `${base}_an-danh.pdf`)];
      }
      doc.setTitle(f.title.value.trim(), { showInWindowTitleBar: true });
      doc.setAuthor(f.author.value.trim());
      doc.setSubject(f.subject.value.trim());
      doc.setKeywords(f.keywords.value.split(',').map((s) => s.trim()).filter(Boolean));
      doc.setCreator(f.creator.value.trim());
      return [pdfOut(await savePdf(doc), `${base}.pdf`)];
    },
  });
}
