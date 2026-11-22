// In ra A4: (1) ảnh chụp tài liệu → scanner (tools/scan.js);
// (2) Word/văn bản → dàn trang A4 có phông tiếng Việt; PDF khổ lạ → co về A4.
import { h, dropzone, field, select, seg, checkbox, button, status, run, progress, fmtSize, baseName, ext } from '../core/ui.js';
import { showResult } from '../core/result.js';
import { scanner } from './scan.js';

export function render({ sub } = {}) {
  const photo = scanner();
  const docs = docMode();
  const tabs = seg([{ value: 'photo', label: 'Ảnh chụp → PDF (scan)' }, { value: 'doc', label: 'Word, PDF, văn bản → A4' }], sub === 'doc' ? 'doc' : 'photo', (v) => show(v));
  const holder = h('div');
  const show = (v) => holder.replaceChildren(v === 'doc' ? docs : photo);
  show(sub === 'doc' ? 'doc' : 'photo');
  return h('div', null, h('section', { class: 'card' }, h('h2', null, 'Chuẩn bị bản in A4'), h('p', { class: 'sub' }, 'Ảnh chụp bằng điện thoại được nắn thẳng như bản scan; văn bản được dàn lại đúng khổ A4.'), tabs.el), holder);
}

// ---------- Văn bản ----------
function docMode() {
  let file = null;
  const st = status(), pr = progress();
  const list = h('ul', { class: 'files' });
  const drop = dropzone({ accept: '.docx,.pdf,.txt,.md', title: 'Chọn tệp Word, PDF hoặc .txt', hint: 'Word và văn bản được dàn lại; PDF được co về đúng khổ A4', iconName: 'printer', onFiles: ([f]) => {
    file = f;
    list.replaceChildren(h('li', null, h('span', { class: 'nm' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size))));
    const pdf = ext(f.name) === 'pdf';
    textOpts.hidden = pdf; pdfOpts.hidden = !pdf;
  } });
  const size = select([{ value: '12', label: '12 pt' }, { value: '13', label: '13 pt' }, { value: '14', label: '14 pt' }], '13');
  const marg = select([{ value: 'nd30', label: 'Văn bản hành chính (trên/dưới 20, trái 30, phải 15 mm)' }, { value: 'std', label: 'Chuẩn văn phòng (20 mm)' }, { value: 'narrow', label: 'Hẹp (15 mm)' }], 'nd30');
  const nums = checkbox('Đánh số trang ở chân trang', true);
  const fit = select([{ value: '0', label: 'Không lề (phóng tối đa)' }, { value: '5', label: '5 mm' }, { value: '10', label: '10 mm' }, { value: '15', label: '15 mm' }], '5');
  const textOpts = h('div', null, h('div', { class: 'grid2' }, field('Cỡ chữ', size), field('Lề trang', marg)), nums.el);
  const pdfOpts = h('div', { hidden: true }, field('Lề khi co trang PDF về A4', fit));
  const go = button('Tạo PDF A4', { kind: 'btn-primary', iconName: 'printer' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!file) throw new Error('Hãy chọn tệp cần chuyển.');
    const { blocksToPdf, pdfToA4 } = await import('../core/textpdf.js');
    let blob;
    pr.set(20, 'Đang đọc tệp…');
    if (ext(file.name) === 'pdf') {
      pr.set(50, 'Đang dàn trang A4…');
      blob = await pdfToA4(file, { margin: +fit.value });
    } else {
      const { readDocument } = await import('../core/text.js');
      const d = await readDocument(file);
      pr.set(50, 'Đang dàn trang A4…');
      const M = { nd30: { top: 20, bottom: 20, left: 30, right: 15 }, std: { top: 20, bottom: 20, left: 20, right: 20 }, narrow: { top: 15, bottom: 15, left: 15, right: 15 } }[marg.value];
      blob = await blocksToPdf(d.blocks, { size: +size.value, margin: M, pageNumbers: nums.get() });
    }
    pr.hide();
    await showResult(st, [{ blob, name: baseName(file.name) + '_A4.pdf' }], { note: 'khổ A4', tool: 'In A4' });
  }));
  return h('section', { class: 'card' }, drop, list, h('div', { class: 'mt' }, textOpts, pdfOpts), h('div', { class: 'row mt' }, go), pr.el, st.el);
}
