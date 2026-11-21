// Xuất tệp Word (.docx) từ các khối nội dung — khổ A4, lề theo Nghị định 30.
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle, Footer, Header, PageNumber } from 'docx';

const CM = 567; // twip / cm
export const ND30_MARGIN = { top: 2 * CM, bottom: 2 * CM, left: 3 * CM, right: 1.5 * CM };
const AL = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, left: AlignmentType.LEFT, justify: AlignmentType.JUSTIFIED };

/** Tách chuỗi theo **đậm** và *nghiêng* đơn giản. */
export function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const bold = m[0].startsWith('**');
    out.push(new TextRun({ text: m[0].replace(/^\*\*?|\*\*?$/g, ''), ...base, bold: bold || base.bold, italics: !bold || base.italics }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out.length ? out : [new TextRun({ text: '', ...base })];
}

export async function blocksToDocx(blocks, { title = '', font = 'Times New Roman', size = 14, pageNumbers = false, indent = true } = {}) {
  const sz = size * 2;
  const children = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (b.type === 'h') {
      children.push(new Paragraph({
        heading: b.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        alignment: b.level === 1 ? AlignmentType.CENTER : AL[b.align] || AlignmentType.LEFT,
        spacing: { before: 160, after: 100 }, keepNext: true,
        children: [new TextRun({ text: b.text, bold: true, size: b.level === 1 ? sz : sz, font, color: '000000' })],
      }));
      continue;
    }
    if (b.type === 'li') {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 312 }, indent: { left: 567, hanging: 283 }, children: runs('- ' + b.text, { font, size: sz }) }));
      continue;
    }
    if (b.type === 'table') { children.push(tableOf(b.rows, font, sz - 2)); continue; }
    children.push(new Paragraph({
      alignment: AL[b.align] || AlignmentType.JUSTIFIED,
      spacing: { after: 120, line: 312 },
      indent: indent && b.align !== 'center' ? { firstLine: 567 } : undefined,
      children: runs(b.text, { font, size: sz, bold: !!b.bold, italics: !!b.italic }),
    }));
  }
  if (!children.length) children.push(new Paragraph({ children: [] }));
  const doc = new Document({
    creator: 'BeaconDesk',
    title,
    styles: {
      default: { document: { run: { font, size: sz } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: sz, bold: true, color: '000000' } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font, size: sz, bold: true, color: '000000' } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: ND30_MARGIN }, titlePage: pageNumbers },
      headers: pageNumbers ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font, size: sz })] })] }), first: new Header({ children: [] }) } : undefined,
      footers: undefined,
      children,
    }],
  });
  return Packer.toBlob(doc);
}

export function tableOf(rows, font = 'Times New Roman', sz = 24) {
  const n = Math.max(...rows.map((r) => r.length));
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0,
      children: [...Array(n).keys()].map((j) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: r[j] || '', font, size: sz, bold: i === 0 })] })],
      })),
    })),
  });
}
export { Footer };
