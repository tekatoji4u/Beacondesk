// Mô hình trình bày văn bản hành chính (Nghị định 30/2020/NĐ-CP, Phụ lục I)
// và hai bộ dựng: Word (.docx) và HTML (xem trước). Đơn vị: cỡ chữ pt, lề/thụt cm.
//
// Đoạn: {runs:[{t,b,i,u,size}], align, first, left, right, before, after, line, keepNext}
// Đường kẻ: {rule: dàiCm, w: rộngKhungCm}
// Bảng không viền: {table: true, widths: [cm…], rows: [[ [đoạn…], [đoạn…] ]]}

export const PAGE = { w: 21, h: 29.7, top: 2, bottom: 2, left: 3, right: 1.5 };
export const TEXT_W = PAGE.w - PAGE.left - PAGE.right; // 16,5 cm
const CELL_PAD = 0.19; // lề trong ô bảng (cm)

/** Ước lượng độ dài dòng chữ (cm) — đủ dùng để vẽ đường kẻ cân đối. */
export function textWidthCm(text, pt, bold = false) {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.25;
    else if (/[A-ZĐÂĂÊÔƠƯ]/.test(ch.normalize('NFD')[0]) && ch !== ch.toLowerCase()) em += 0.7;
    else if (/[-–.,;:]/.test(ch)) em += 0.3;
    else em += 0.47;
  }
  return em * pt * (bold ? 1.05 : 1) * 0.03528;
}

export const P = (text, o = {}) => ({ runs: Array.isArray(text) ? text : [{ t: text, b: o.b, i: o.i, u: o.u, size: o.size }], ...o });
export const R = (t, o = {}) => ({ t, ...o });
export const RULE = (len, w) => ({ rule: Math.min(len, w - 2 * CELL_PAD - 0.2), w });

// ---------- Word ----------
export async function toDocx(model, { font = 'Times New Roman', size = 14, title = '' } = {}) {
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, PageNumber } = D;
  const AL = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, left: AlignmentType.LEFT, justify: AlignmentType.JUSTIFIED };
  const TW = 567;
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const para = (p, boxW = TEXT_W) => {
    if (p.rule != null) {
      const inner = (p.w ?? boxW) - (p.w ? 2 * CELL_PAD : 0);
      const side = Math.max(0, (inner - p.rule) / 2);
      return new Paragraph({
        spacing: { before: 50, after: Math.round((p.after ?? 0) * 20), line: 60, lineRule: 'exact' },
        indent: { left: Math.round(side * TW), right: Math.round(side * TW) },
        border: { top: { style: BorderStyle.SINGLE, size: 6, space: 1, color: '000000' } },
        children: [new TextRun({ text: '', size: 2 })],
      });
    }
    return new Paragraph({
      alignment: AL[p.align || 'justify'],
      keepNext: !!p.keepNext,
      keepLines: true,
      spacing: { before: Math.round((p.before ?? 0) * 20), after: Math.round((p.after ?? 0) * 20), line: Math.round((p.line ?? 1) * 240), lineRule: 'auto' },
      indent: { firstLine: Math.round((p.first || 0) * TW), left: Math.round((p.left || 0) * TW), right: Math.round((p.right || 0) * TW) },
      children: p.runs.map((r) => new TextRun({ text: r.t, bold: !!r.b, italics: !!r.i, underline: r.u ? {} : undefined, size: Math.round((r.size || size) * 2), font })),
    });
  };
  const table = (t) => new Table({
    width: { size: Math.round(t.widths.reduce((a, b) => a + b, 0) * TW), type: WidthType.DXA },
    columnWidths: t.widths.map((w) => Math.round(w * TW)),
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: t.rows.map((row) => new TableRow({
      cantSplit: true,
      children: row.map((cell, j) => new TableCell({
        width: { size: Math.round(t.widths[j] * TW), type: WidthType.DXA },
        borders: { top: none, bottom: none, left: none, right: none },
        children: cell.length ? cell.map((p) => para(p, t.widths[j])) : [new Paragraph({ children: [] })],
      })),
    })),
  });
  const children = model.map((x) => (x.table ? table(x) : para(x)));
  const doc = new Document({
    creator: 'BeaconDesk', title,
    styles: { default: { document: { run: { font, size: size * 2 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: PAGE.top * TW, bottom: PAGE.bottom * TW, left: PAGE.left * TW, right: PAGE.right * TW } }, titlePage: true },
      // NĐ30: số trang ở giữa, phía trên, không đánh số trang đầu
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font, size: 26 })] })] }),
        first: new Header({ children: [] }),
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

// ---------- HTML (xem trước) ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toHtml(model, { size = 14 } = {}) {
  const para = (p, boxW = TEXT_W) => {
    if (p.rule != null) {
      return `<div style="height:0;border-top:1px solid #000;width:${p.rule}cm;margin:3pt auto ${p.after ?? 0}pt"></div>`;
    }
    const st = [`text-align:${p.align || 'justify'}`, `margin:${p.before || 0}pt ${p.right || 0}cm ${p.after || 0}pt ${p.left || 0}cm`, `text-indent:${p.first || 0}cm`, `line-height:${(p.line ?? 1) * 1.16}`];
    const runs = p.runs.map((r) => {
      const s = [`font-size:${r.size || size}pt`, r.b ? 'font-weight:700' : '', r.i ? 'font-style:italic' : '', r.u ? 'text-decoration:underline' : ''].filter(Boolean).join(';');
      return `<span style="${s}">${esc(r.t) || '&#8203;'}</span>`;
    }).join('');
    return `<p style="${st.join(';')}">${runs || '&#8203;'}</p>`;
  };
  return model.map((x) => x.table
    ? `<table style="width:${x.widths.reduce((a, b) => a + b, 0)}cm;border-collapse:collapse;table-layout:fixed"><colgroup>${x.widths.map((w) => `<col style="width:${w}cm">`).join('')}</colgroup>${x.rows.map((r) => `<tr>${r.map((c, j) => `<td style="vertical-align:top;padding:0 ${CELL_PAD}cm">${c.map((p) => para(p, x.widths[j])).join('')}</td>`).join('')}</tr>`).join('')}</table>`
    : para(x)).join('');
}
