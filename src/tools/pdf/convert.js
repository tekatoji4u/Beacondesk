// PDF sang Word (.docx) và PDF sang Excel (.xlsx) — cho PDF có lớp chữ.
import JSZip from 'jszip';
import { h, seg, select, checkbox, field } from '../../core/ui.js';
import { readPdf, linesToBlocks } from '../../core/text.js';
import { blocksToDocx } from '../../core/docx.js';
import { pdfTool } from './common.js';

const scannedMsg = 'PDF này không có lớp chữ (bản scan hoặc ảnh chụp). Hãy dùng mục "Scan / ảnh → chữ" để nhận dạng chữ trước.';

export function toWord() {
  return pdfTool({
    title: 'PDF sang Word', sub: 'Trích chữ từ PDF có lớp văn bản, tự nhận ra tiêu đề, đoạn văn, gạch đầu dòng và xuất .docx chỉnh sửa được.', label: 'Chuyển sang Word', icon: 'word',
    pages: 'select', pagesLabel: 'Trang chuyển',
    options() {
      const mode = seg([{ value: 'para', label: 'Nối dòng thành đoạn' }, { value: 'lines', label: 'Giữ nguyên ngắt dòng' }], 'para');
      const breaks = checkbox('Ngắt trang như bản gốc', true);
      const font = select(['Times New Roman', 'Arial', 'Calibri'], 'Times New Roman');
      const size = select([{ value: '13', label: '13 pt' }, { value: '14', label: '14 pt' }, { value: '12', label: '12 pt' }], '13');
      return { el: h('div', null, mode.el, h('div', { class: 'grid2' }, field('Phông chữ', font), field('Cỡ chữ', size)), breaks.el), read: () => ({ mode: mode.get(), breaks: breaks.get(), font: font.value, size: +size.value }) };
    },
    async action({ file, pages, opts, base, progress }) {
      const r = await readPdf(file, (i, n) => progress((i / n) * 70, `Đang đọc trang ${i}/${n}`));
      if (r.scanned) throw new Error(scannedMsg);
      const sel = new Set(pages);
      const pgs = r.pages.filter((p) => sel.has(p.n - 1));
      let blocks;
      if (opts.mode === 'lines') {
        blocks = pgs.flatMap((p, i) => [...(i && opts.breaks ? [{ type: 'pagebreak' }] : []), ...p.lines.map((l) => ({ type: 'p', text: l.t.replace(/\t/g, '    '), align: 'left' }))]);
      } else blocks = linesToBlocks(pgs, { keepPageBreaks: opts.breaks });
      progress(85, 'Đang tạo tệp Word…');
      const blob = await blocksToDocx(blocks, { title: r.title, font: opts.font, size: opts.size, indent: opts.mode === 'para' });
      return { outs: [{ blob, name: `${base}.docx` }], note: `${pgs.length} trang` };
    },
  });
}

// ---------------- PDF sang Excel ----------------
const colName = (n) => { let s = ''; for (n++; n > 0; n = ((n - 1) / 26) | 0) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/** Nhận dạng số kiểu Việt Nam: 1.234.567,89 · 12,5 · 1234 · 15% */
export function numOf(s) {
  const t = s.trim().replace(/\s/g, '');
  if (!t || t.length > 20) return null;
  if (/^-?\d+$/.test(t) && !(t.length > 1 && t[0] === '0')) return +t;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) return +t.replace(/\./g, '').replace(',', '.');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return +t.replace(/,/g, '');
  if (/^\(\d[\d.,]*\)$/.test(t)) { const v = numOf(t.slice(1, -1)); return v == null ? null : -v; }
  return null;
}
function rowsOf(lines) {
  // gom ô trong từng dòng theo khoảng trống, rồi gom cột theo vị trí x
  const R = lines.map((l) => {
    const cells = [];
    let end = null;
    for (const it of l.it) {
      if (!it.t.trim()) continue;
      if (cells.length && it.x - end <= Math.max(it.s * 0.9, 4)) {
        const c = cells[cells.length - 1];
        c.t += (it.x - end > it.s * 0.15 && !/\s$/.test(c.t) ? ' ' : '') + it.t;
      } else cells.push({ x: it.x, t: it.t });
      end = it.x + it.w;
    }
    return cells;
  });
  const sizes = lines.map((l) => l.s).sort((a, b) => a - b);
  const tol = (sizes[sizes.length >> 1] || 10) * 1.5;
  const xs = R.flat().map((c) => c.x).sort((a, b) => a - b);
  const cols = [];
  xs.forEach((x) => { const q = cols[cols.length - 1]; if (!q || x - q.max > tol) cols.push({ min: x, max: x }); else q.max = x; });
  return R.map((r) => {
    const o = Array(cols.length).fill('');
    r.forEach((c) => { const j = Math.max(0, cols.findIndex((q) => c.x <= q.max + 0.5)); o[j] = o[j] ? o[j] + ' ' + c.t.trim() : c.t.trim(); });
    return o;
  });
}
function sheetXml(rows) {
  const w = Math.max(1, ...rows.map((r) => r.length));
  const widths = [...Array(w).keys()].map((j) => Math.min(60, Math.max(8, ...rows.map((r) => (r[j] || '').length + 2))));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<cols>' + widths.map((v, j) => `<col min="${j + 1}" max="${j + 1}" width="${v}" customWidth="1"/>`).join('') + '</cols><sheetData>'
    + rows.map((r, i) => `<row r="${i + 1}">` + r.map((v, j) => {
      if (v === '') return '';
      const ref = colName(j) + (i + 1), n = numOf(v);
      return n !== null ? `<c r="${ref}"><v>${n}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('') + '</row>').join('') + '</sheetData></worksheet>';
}
export async function xlsxBook(sheets) {
  const z = new JSZip();
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  z.file('[Content_Types].xml', H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
  z.file('_rels/.rels', H + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file('xl/workbook.xml', H + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>` + sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>');
  sheets.forEach((s, i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)));
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function toExcel() {
  return pdfTool({
    title: 'PDF sang Excel', sub: 'Tách bảng và các cột chữ trong PDF có lớp văn bản thành ô Excel; số kiểu Việt Nam (1.234,5) được nhận thành số.', label: 'Chuyển sang Excel', icon: 'excel',
    pages: 'select', pagesLabel: 'Trang chuyển',
    note: 'Kết quả tốt nhất với bảng có cột thẳng hàng. Hãy kiểm tra lại các ô trước khi dùng.',
    options() {
      const m = seg([{ value: 'page', label: 'Mỗi trang một sheet' }, { value: 'one', label: 'Tất cả trong một sheet' }], 'page');
      return { el: m.el, read: () => ({ m: m.get() }) };
    },
    async action({ file, pages, opts, base, progress }) {
      const r = await readPdf(file, (i, n) => progress((i / n) * 80, `Đang đọc trang ${i}/${n}`));
      if (r.scanned) throw new Error(scannedMsg);
      const sel = new Set(pages);
      const pgs = r.pages.filter((p) => sel.has(p.n - 1));
      let sheets;
      if (opts.m === 'one') {
        const rows = pgs.flatMap((p) => rowsOf(p.lines));
        sheets = [{ name: 'Dữ liệu', rows }];
      } else sheets = pgs.map((p) => ({ name: `Trang ${p.n}`, rows: rowsOf(p.lines) }));
      return { outs: [{ blob: await xlsxBook(sheets), name: `${base}.xlsx` }], note: `${sheets.length} sheet` };
    },
  });
}
