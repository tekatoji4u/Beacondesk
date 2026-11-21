// Tạo tệp PowerPoint (.pptx, 16:9) từ danh sách slide, không cần thư viện ngoài JSZip.
// slide: {kind:'cover'|'section'|'content'|'table'|'end', title, subtitle, bullets:[{t, level}], rows:[[…]]}

export const PALETTES = {
  navy: { name: 'Xanh biển đêm', bg: 'FFFFFF', title: '0B2545', text: '1F2937', accent: '1D4ED8', accent2: '93C5FD', cover: '0B2545', coverText: 'FFFFFF', muted: '64748B' },
  blue: { name: 'Xanh dương', bg: 'F8FAFF', title: '1E3A8A', text: '1F2937', accent: '2563EB', accent2: 'BFDBFE', cover: '2563EB', coverText: 'FFFFFF', muted: '64748B' },
  green: { name: 'Xanh lá', bg: 'FFFFFF', title: '14532D', text: '1F2937', accent: '16A34A', accent2: 'BBF7D0', cover: '166534', coverText: 'FFFFFF', muted: '64748B' },
  red: { name: 'Đỏ trang trọng', bg: 'FFFFFF', title: '7F1D1D', text: '1F2937', accent: 'B91C1C', accent2: 'FDE68A', cover: '991B1B', coverText: 'FFF7ED', muted: '6B7280' },
  slate: { name: 'Xám than', bg: '1E293B', title: 'F8FAFC', text: 'E2E8F0', accent: '38BDF8', accent2: '334155', cover: '0F172A', coverText: 'F8FAFC', muted: '94A3B8' },
};

const W = 12192000, H = 6858000, EMU = 12700; // EMU / pt
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function run(t, { sz = 24, b = false, color = '000000', font = 'Arial', i = false } = {}) {
  return `<a:r><a:rPr lang="vi-VN" sz="${Math.round(sz * 100)}"${b ? ' b="1"' : ''}${i ? ' i="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${esc(font)}"/><a:ea typeface="${esc(font)}"/><a:cs typeface="${esc(font)}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
}
let shapeId = 2;
function box({ x, y, w, h, paras, fill, anchor = 't', name = 'Text', inset = 0.1 }) {
  const ins = Math.round(inset * 914400);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId++}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}</p:spPr>`
    + `<p:txBody><a:bodyPr wrap="square" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="vi-VN"/></a:p>'}</p:txBody></p:sp>`;
}
function rect({ x, y, w, h, fill, name = 'Shape' }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId++}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}
const para = (runs, { algn = 'l', before = 0, after = 0, bullet = null, level = 0, line = 100 } = {}) => {
  const mar = bullet ? 342900 + level * 457200 : 0;
  const bu = bullet ? `<a:buClr><a:srgbClr val="${bullet.color}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${level ? '–' : '•'}"/>` : '<a:buNone/>';
  return `<a:p><a:pPr marL="${mar}" indent="${bullet ? -342900 : 0}" algn="${algn}"><a:lnSpc><a:spcPct val="${line * 1000}"/></a:lnSpc><a:spcBef><a:spcPts val="${before * 100}"/></a:spcBef><a:spcAft><a:spcPts val="${after * 100}"/></a:spcAft>${bu}</a:pPr>${runs}</a:p>`;
};

function slideXml(s, i, n, pal, font, footer) {
  shapeId = 2;
  const sh = [];
  let bg = pal.bg;
  const M = 0.6 * 914400; // lề 0,6 inch
  if (s.kind === 'cover' || s.kind === 'end' || s.kind === 'section') {
    bg = pal.cover;
    sh.push(rect({ x: M, y: H * 0.36, w: 1.2 * 914400, h: 0.08 * 914400, fill: pal.accent2, name: 'Accent' }));
    const big = s.kind === 'section' ? 36 : 40;
    const tlen = (s.title || '').length;
    const sz = tlen > 90 ? big - 12 : tlen > 60 ? big - 6 : big;
    sh.push(box({ x: M, y: H * 0.40, w: W - 2 * M, h: H * 0.30, anchor: 't', name: 'Title', paras: para(run(s.title, { sz, b: true, color: pal.coverText, font }), { line: 95 }) }));
    if (s.subtitle) sh.push(box({ x: M, y: H * 0.72, w: W - 2 * M, h: H * 0.18, name: 'Subtitle', paras: s.subtitle.split('\n').map((l, k) => para(run(l, { sz: k ? 16 : 20, color: pal.coverText, font }), { before: k ? 4 : 0 })).join('') }));
  } else {
    sh.push(rect({ x: 0, y: 0, w: 0.16 * 914400, h: H, fill: pal.accent, name: 'Bar' }));
    const tsz = (s.title || '').length > 70 ? 24 : 30;
    sh.push(box({ x: M, y: 0.35 * 914400, w: W - 2 * M, h: 1.05 * 914400, anchor: 'b', name: 'Title', paras: para(run(s.title, { sz: tsz, b: true, color: pal.title, font })) }));
    sh.push(rect({ x: M + 0.1 * 914400, y: 1.48 * 914400, w: 1.1 * 914400, h: 0.05 * 914400, fill: pal.accent, name: 'Rule' }));
    const top = 1.75 * 914400, bodyH = H - top - 0.7 * 914400;
    if (s.kind === 'table' && s.rows?.length) sh.push(table(s.rows, { x: M, y: top, w: W - 2 * M, h: bodyH }, pal, font));
    else {
      const bl = s.bullets || [];
      const chars = bl.reduce((a, b) => a + b.t.length, 0);
      const sz = chars > 900 ? 15 : chars > 650 ? 17 : chars > 420 ? 19 : chars > 250 ? 22 : 24;
      sh.push(box({ x: M, y: top, w: W - 2 * M, h: bodyH, name: 'Body', paras: bl.map((b) => para(run(b.t, { sz: b.level ? sz - 3 : sz, color: pal.text, font }), { before: b.level ? 3 : 9, bullet: { color: pal.accent }, level: b.level || 0 })).join('') }));
    }
    sh.push(box({ x: W - M - 1.2 * 914400, y: H - 0.55 * 914400, w: 1.2 * 914400, h: 0.4 * 914400, name: 'Number', anchor: 'ctr', paras: para(run(`${i + 1} / ${n}`, { sz: 11, color: pal.muted, font }), { algn: 'r' }) }));
    if (footer) sh.push(box({ x: M, y: H - 0.55 * 914400, w: W * 0.6, h: 0.4 * 914400, name: 'Footer', anchor: 'ctr', paras: para(run(footer, { sz: 11, color: pal.muted, font })) }));
  }
  return `${XML}<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${sh.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function table(rows, { x, y, w, h }, pal, font) {
  const cols = Math.max(...rows.map((r) => r.length));
  const rowsCut = rows.slice(0, 12);
  const rh = Math.min(Math.round(h / rowsCut.length), 0.55 * 914400);
  const cw = Math.round(w / cols);
  const sz = cols > 5 || rowsCut.length > 8 ? 12 : 14;
  const cell = (t, head, odd) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(run(t, { sz, b: head, color: head ? 'FFFFFF' : pal.text, font }))}</a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720"><a:solidFill><a:srgbClr val="${head ? pal.accent : odd ? 'F1F5F9' : 'FFFFFF'}"/></a:solidFill></a:tcPr></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId++}" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${cw * cols}" cy="${rh * rowsCut.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${cw}"/>`).join('')}</a:tblGrid>${rowsCut.map((r, ri) => `<a:tr h="${rh}">${Array.from({ length: cols }, (_, ci) => cell(r[ci] ?? '', ri === 0, ri % 2 === 0)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const THEME = (pal, font) => `${XML}<a:theme ${NS.split(' ')[0]} name="BeaconDesk"><a:themeElements><a:clrScheme name="BeaconDesk"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${pal.title}"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2><a:accent1><a:srgbClr val="${pal.accent}"/></a:accent1><a:accent2><a:srgbClr val="${pal.accent2}"/></a:accent2><a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="7C3AED"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="BeaconDesk"><a:majorFont><a:latin typeface="${esc(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="BeaconDesk"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const MASTER = `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
const LAYOUT = `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Trống"><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const REL = (items) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`;

export async function buildPptx(slides, { palette = 'navy', font = 'Arial', title = '', footer = '' } = {}) {
  const JSZip = (await import('jszip')).default;
  const pal = PALETTES[palette] || PALETTES.navy;
  const z = new JSZip();
  const n = slides.length;
  const PML = 'application/vnd.openxmlformats-officedocument.presentationml';
  z.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/ppt/presentation.xml" ContentType="${PML}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${PML}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${PML}.slideLayout+xml"/>`
    + slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${PML}.slide+xml"/>`).join('')
    + `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${PML}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${PML}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${PML}.tableStyles+xml"/>`
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  z.file('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  z.file('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>BeaconDesk</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  z.file('docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>BeaconDesk</Application><Slides>${n}</Slides></Properties>`);
  z.file('ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', REL([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ['rId3', 'presProps', 'presProps.xml'], ['rId4', 'viewProps', 'viewProps.xml'], ['rId5', 'tableStyles', 'tableStyles.xml'], ...slides.map((_, i) => [`rId${10 + i}`, 'slide', `slides/slide${i + 1}.xml`])]));
  z.file('ppt/presProps.xml', `${XML}<p:presentationPr ${NS}/>`);
  z.file('ppt/viewProps.xml', `${XML}<p:viewPr ${NS}><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  z.file('ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  z.file('ppt/theme/theme1.xml', THEME(pal, font));
  z.file('ppt/slideMasters/slideMaster1.xml', MASTER);
  z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', REL([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  z.file('ppt/slideLayouts/slideLayout1.xml', LAYOUT);
  z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', REL([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  slides.forEach((s, i) => {
    z.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s, i, n, pal, font, footer));
    z.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, REL([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]));
  });
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
}
