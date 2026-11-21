// Khối hiển thị kết quả: tải xuống, chia sẻ, tải tất cả dạng ZIP,
// và "Dùng tiếp với…" để chuyển tệp sang công cụ khác không cần tải về.
import { h, download, fmtSize, canShare, shareFiles, ext } from './ui.js';
import { icon } from './icons.js';
import { addRecent } from './store.js';
import { handoff } from './handoff.js';

const NEXT = {
  pdf: [
    ['#/pdf/compress', 'Nén PDF'], ['#/pdf/sign', 'Ký / đóng dấu'], ['#/pdf/number', 'Đánh số trang'],
    ['#/pdf/organize', 'Sắp xếp trang'], ['#/ocr', 'Nhận dạng chữ (OCR)'], ['#/pdf/toword', 'PDF sang Word'],
  ],
  docx: [['#/check', 'Kiểm tra thể thức'], ['#/slides', 'Tạo PowerPoint'], ['#/summary', 'Tóm tắt'], ['#/print', 'In PDF A4']],
  image: [['#/pdf/img2pdf', 'Ảnh sang PDF'], ['#/ocr', 'Nhận dạng chữ (OCR)'], ['#/print', 'In PDF A4']],
};
const kindOf = (name) => {
  const e = ext(name);
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(e)) return 'image';
  return null;
};

/**
 * @param st  đối tượng status() để hiện kết quả
 * @param outs [{blob, name}]
 * @param opts {note, tool, auto}
 */
export async function showResult(st, outs, { note = '', tool = '', auto = true } = {}) {
  if (!outs.length) return;
  const total = outs.reduce((a, o) => a + o.blob.size, 0);
  const btns = outs.slice(0, 20).map((o) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => download(o.blob, o.name) },
    h('span', { html: icon('download'), style: 'display:contents' }), outs.length > 1 ? o.name : 'Tải xuống'));
  const row = h('div', { class: 'row' }, btns);
  if (outs.length > 1) {
    row.prepend(h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: async () => {
      const { zipOutputs } = await import('./zip.js');
      download(await zipOutputs(outs), (outs[0].name.replace(/\.[^.]+$/, '') || 'ket-qua') + '_tat-ca.zip');
    } }, h('span', { html: icon('download'), style: 'display:contents' }), 'Tải tất cả (ZIP)'));
  }
  if (canShare(outs.slice(0, 10).map((o) => new File([o.blob], o.name, { type: o.blob.type })))) {
    row.append(h('button', { type: 'button', class: 'btn btn-sm', onclick: () => shareFiles(outs.slice(0, 10)) },
      h('span', { html: icon('share'), style: 'display:contents' }), 'Chia sẻ'));
  }
  const k = outs.length === 1 ? kindOf(outs[0].name) : null;
  let next = null;
  if (k && NEXT[k]) {
    const sel = h('select', { 'aria-label': 'Dùng tiếp với công cụ khác', style: 'width:auto;min-height:36px;padding:6px 10px' },
      h('option', { value: '' }, 'Dùng tiếp với…'),
      NEXT[k].filter(([href]) => !location.hash.startsWith(href)).map(([href, l]) => h('option', { value: href }, l)));
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      handoff.put([new File([outs[0].blob], outs[0].name, { type: outs[0].blob.type })]);
      location.hash = sel.value;
    });
    next = sel;
  }
  if (next) row.append(next);
  st.ok(h('b', null, 'Hoàn tất. '), `${outs.length > 1 ? outs.length + ' tệp' : outs[0].name} · ${fmtSize(total)}`, note ? ' · ' + note : '', row);
  if (auto && outs.length === 1) download(outs[0].blob, outs[0].name);
  addRecent(outs, tool);
}
