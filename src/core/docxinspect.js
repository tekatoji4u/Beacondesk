// Đọc thông số trình bày của tệp Word (.docx) và đối chiếu với thể thức
// Nghị định 30/2020/NĐ-CP. Có thể sửa nhanh khổ giấy, lề và phông chữ.
import { noAccent } from './ui.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TW_PER_MM = 56.6929;
const mm = (tw) => tw / TW_PER_MM;
const f1 = (x) => x.toFixed(1).replace('.', ',');
const els = (n, tag) => (n ? [...n.getElementsByTagNameNS(W, tag)] : []);
const at = (n, a) => (n ? n.getAttributeNS(W, a) ?? n.getAttribute('w:' + a) : null) || null;
const onOff = (n) => n != null && !/^(0|false|off)$/i.test(at(n, 'val') || '');
const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');

export async function inspectDocx(buf) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Không phải tệp .docx hợp lệ.');
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) || '';
  const doc = parse(docXml);
  const sty = stylesXml ? parse(stylesXml) : null;

  const fontOf = (rPr) => { const f = els(rPr, 'rFonts')[0]; return f ? at(f, 'ascii') || at(f, 'hAnsi') || at(f, 'cs') || (at(f, 'asciiTheme') ? '(phông theo giao diện)' : null) : null; };
  const szOf = (rPr) => { const s = els(rPr, 'sz')[0]; return s ? +at(s, 'val') : null; };
  const spOf = (pPr) => { const s = els(pPr, 'spacing')[0]; return s && at(s, 'line') ? { line: +at(s, 'line'), rule: at(s, 'lineRule') || 'auto' } : null; };
  const firstOf = (pPr) => { const s = els(pPr, 'ind')[0]; return s && (at(s, 'firstLine') ?? at(s, 'firstLineChars')) != null ? +(at(s, 'firstLine') ?? 0) : null; };
  const jcOf = (pPr) => { const s = els(pPr, 'jc')[0]; return s ? at(s, 'val') : null; };
  const boldOf = (rPr) => { const b = els(rPr, 'b')[0]; return b ? onOff(b) : null; };

  const styles = new Map();
  for (const s of els(sty, 'style')) {
    const rPr = els(s, 'rPr')[0], pPr = els(s, 'pPr')[0];
    styles.set(at(s, 'styleId'), { basedOn: at(els(s, 'basedOn')[0], 'val'), font: fontOf(rPr), sz: szOf(rPr), sp: spOf(pPr), first: firstOf(pPr), jc: jcOf(pPr), b: boldOf(rPr), isDefault: at(s, 'default') === '1' && at(s, 'type') === 'paragraph' });
  }
  const defStyle = [...styles].find(([, v]) => v.isDefault)?.[0];
  const dd = els(sty, 'docDefaults')[0];
  const defFont = fontOf(els(dd, 'rPrDefault')[0]);
  const defSz = szOf(els(dd, 'rPrDefault')[0]) || 20;
  const fromStyle = (id, key) => {
    let s = id || defStyle;
    for (let n = 0; s && n < 12; n++) { const v = styles.get(s); if (!v) break; if (v[key] != null) return v[key]; s = v.basedOn; }
    return null;
  };

  const fontChars = new Map(), sizeChars = new Map(), bodySizes = new Map();
  const paras = [], body = [];
  for (const p of els(doc, 'p')) {
    const pPr = els(p, 'pPr')[0];
    const sid = at(els(pPr, 'pStyle')[0], 'val');
    let text = '', firstSz = null, allBold = true, anyRun = false;
    for (const r of els(p, 'r')) {
      const rPr = els(r, 'rPr')[0];
      const t = [...r.childNodes].map((c) => (c.localName === 't' ? c.textContent : c.localName === 'tab' ? '\t' : c.localName === 'br' ? '\n' : '')).join('');
      text += t;
      if (!t.trim()) continue;
      anyRun = true;
      const font = fontOf(rPr) || fromStyle(sid, 'font') || defFont;
      const sz = szOf(rPr) || fromStyle(sid, 'sz') || defSz;
      firstSz ??= sz;
      if (!(boldOf(rPr) ?? fromStyle(sid, 'b'))) allBold = false;
      fontChars.set(font, (fontChars.get(font) || 0) + t.length);
      sizeChars.set(sz, (sizeChars.get(sz) || 0) + t.length);
    }
    let inTable = false;
    for (let n = p.parentNode; n; n = n.parentNode) if (n.localName === 'tc') { inTable = true; break; }
    const clean = text.replace(/[\t\r\n]+/g, ' ').replace(/ /g, ' ').trim();
    paras.push({ text: clean, sz: firstSz, bold: anyRun && allBold, inTable });
    if (!inTable && clean.length >= 80) {
      body.push({ sp: spOf(pPr) || fromStyle(sid, 'sp'), first: firstOf(pPr) ?? fromStyle(sid, 'first'), jc: jcOf(pPr) || fromStyle(sid, 'jc'), sz: firstSz });
      bodySizes.set(firstSz, (bodySizes.get(firstSz) || 0) + clean.length);
    }
  }
  const sect = els(doc, 'sectPr').pop();
  const pgSz = els(sect, 'pgSz')[0], pgMar = els(sect, 'pgMar')[0];
  let w = pgSz ? +at(pgSz, 'w') : null, h = pgSz ? +at(pgSz, 'h') : null;
  if (pgSz && at(pgSz, 'orient') === 'landscape' && w > h) [w, h] = [h, w];
  const margins = pgMar ? { top: +at(pgMar, 'top'), bottom: +at(pgMar, 'bottom'), left: +at(pgMar, 'left'), right: +at(pgMar, 'right') } : null;
  let pageNumIn = null, pageNumCenter = false;
  for (const name of Object.keys(zip.files)) {
    const m = /^word\/(header|footer)\d*\.xml$/.exec(name);
    if (!m) continue;
    const x = await zip.file(name).async('string');
    if (/instrText[^>]*>\s*PAGE\b|w:instr="\s*PAGE\b|<w:fldSimple[^>]*PAGE\b/i.test(x)) {
      pageNumIn = pageNumIn === 'header' ? 'header' : m[1];
      pageNumCenter ||= /<w:jc[^>]*w:val="center"/.test(x);
    }
  }
  const sorted = (m) => [...m].sort((a, b) => b[1] - a[1]);
  return { paras, body, w, h, margins, fontChars: sorted(fontChars), sizeChars: sorted(sizeChars), bodySizes: sorted(bodySizes), pageNumIn, pageNumCenter, titlePg: els(sect, 'titlePg').length > 0 };
}

const DOC_TYPES = ['QUYẾT ĐỊNH', 'THÔNG BÁO', 'TỜ TRÌNH', 'BÁO CÁO', 'KẾ HOẠCH', 'BIÊN BẢN', 'GIẤY MỜI', 'CHỈ THỊ', 'NGHỊ QUYẾT', 'QUY CHẾ', 'QUY ĐỊNH', 'HƯỚNG DẪN', 'CHƯƠNG TRÌNH', 'PHƯƠNG ÁN', 'ĐỀ ÁN', 'DỰ ÁN', 'HỢP ĐỒNG', 'GIẤY GIỚI THIỆU', 'GIẤY NGHỈ PHÉP', 'CÔNG ĐIỆN', 'BẢN GHI NHỚ', 'BẢN THỎA THUẬN', 'GIẤY ỦY QUYỀN', 'PHIẾU GỬI', 'PHIẾU CHUYỂN', 'THƯ CÔNG'];
const NEED_VEVIEC = new Set(['QUYET DINH', 'THONG BAO', 'TO TRINH', 'BAO CAO', 'KE HOACH', 'CHI THI', 'HUONG DAN', 'PHUONG AN', 'DE AN', 'DU AN']);
const key = (s) => noAccent(s).toUpperCase().replace(/\s+/g, ' ').trim();

/** Đối chiếu thông số với NĐ30. Trả về {out: [{sev,cat,msg,ctx}], params: [[tên, giá trị]]}. */
export function checkFormat(info) {
  const out = [], params = [];
  const add = (sev, msg, ctx) => out.push({ sev, cat: 'Thể thức', msg, ctx: ctx ? { text: ctx, i: 0, len: 0 } : null });

  if (info.w && info.h) {
    const a = mm(info.w), b = mm(info.h);
    params.push(['Khổ giấy', `${Math.round(a)} × ${Math.round(b)} mm`]);
    if (Math.abs(a - 210) < 1.5 && Math.abs(b - 297) < 1.5) add('ok', 'Khổ giấy A4 (210 × 297 mm).');
    else add('err', `Khổ giấy phải là A4 (210 × 297 mm), tệp đang là ${Math.round(a)} × ${Math.round(b)} mm.`);
  } else add('info', 'Không đọc được khổ giấy.');

  if (info.margins) {
    const spec = { top: ['trên', 20, 25], bottom: ['dưới', 20, 25], left: ['trái', 30, 35], right: ['phải', 15, 20] };
    let bad = 0;
    for (const [k, [label, lo, hi]] of Object.entries(spec)) {
      const v = mm(info.margins[k]);
      params.push([`Lề ${label}`, `${f1(v)} mm`]);
      if (v < lo - 0.6 || v > hi + 0.6) { bad++; add('err', `Lề ${label} là ${f1(v)} mm, quy định ${lo}–${hi} mm.`); }
    }
    if (!bad) add('ok', 'Lề trang đúng quy định (trên, dưới 20–25; trái 30–35; phải 15–20 mm).');
  }

  const total = info.fontChars.reduce((a, [, n]) => a + n, 0) || 1;
  const [font] = info.fontChars[0] || [null];
  params.push(['Phông chữ chính', font || 'không xác định']);
  if (!font || /giao diện/.test(font)) add('warn', 'Không xác định được phông chữ chính (đang dùng phông theo giao diện). Nên đặt rõ Times New Roman.');
  else if (/times new roman/i.test(font)) add('ok', 'Phông chữ Times New Roman.');
  else add('err', `Phông chữ chính là "${font}". Quy định dùng phông Times New Roman (bộ mã Unicode).`);
  const others = info.fontChars.filter(([f, n], i) => i > 0 && f && !/times new roman/i.test(f) && n / total > 0.05);
  if (others.length) add('warn', 'Có dùng thêm phông khác: ' + others.map(([f, n]) => `${f} (${Math.round((n / total) * 100)}%)`).join(', '));

  const sz = (info.bodySizes[0] || info.sizeChars[0] || [null])[0];
  if (sz) {
    params.push(['Cỡ chữ nội dung', `${sz / 2} pt`]);
    if (sz >= 26 && sz <= 28) add('ok', `Cỡ chữ nội dung ${sz / 2} pt (quy định 13–14 pt).`);
    else add('err', `Cỡ chữ nội dung là ${sz / 2} pt, quy định 13–14 pt.`);
  }
  const ls = info.body.map((b) => (b.sp ? (b.sp.rule === 'auto' ? b.sp.line / 240 : b.sp.line / 20 / ((sz || 28) / 2 * 1.15)) : null)).filter((x) => x != null).sort((a, b) => a - b);
  if (ls.length) {
    const med = ls[ls.length >> 1];
    params.push(['Giãn dòng', f1(med) + ' dòng']);
    if (med >= 0.98 && med <= 1.52) add('ok', `Khoảng cách dòng khoảng ${f1(med)} (từ dòng đơn đến 1,5 dòng).`);
    else add('warn', `Khoảng cách dòng khoảng ${f1(med)}, quy định từ dòng đơn đến 1,5 dòng.`);
  }
  if (info.body.length >= 3) {
    const ok = info.body.filter((b) => b.first != null && b.first >= 500 && b.first <= 740).length;
    if (ok / info.body.length >= 0.6) add('ok', 'Đoạn văn lùi đầu dòng 1–1,27 cm.');
    else add('warn', 'Phần lớn đoạn văn chưa lùi đầu dòng 1–1,27 cm.');
    const just = info.body.filter((b) => b.jc === 'both' || b.jc === 'distribute').length;
    if (just / info.body.length < 0.6) add('info', 'Nội dung văn bản nên căn đều hai lề.');
  }
  if (info.pageNumIn) {
    if (info.pageNumIn === 'header') add('ok', 'Có đánh số trang ở lề trên.');
    else add('warn', 'Số trang đang đặt ở lề dưới; quy định đặt giữa, ở lề trên.');
    if (!info.pageNumCenter) add('warn', 'Số trang nên căn giữa.');
    if (!info.titlePg) add('info', 'Không hiển thị số trang ở trang đầu (bật "Trang đầu khác" trong Word).');
  } else add('info', 'Chưa có số trang (bắt buộc nếu văn bản có từ 2 trang trở lên).');

  const P = info.paras.filter((p) => p.text);
  const top = P.slice(0, 45);
  const qh = P.find((p) => key(p.text).includes('CONG HOA XA HOI CHU NGHIA VIET NAM'));
  if (!qh) add('err', 'Thiếu Quốc hiệu "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM".');
  else {
    const letters = qh.text.replace(/[^\p{L}]/gu, '');
    if (letters !== letters.toLocaleUpperCase('vi')) add('err', 'Quốc hiệu phải viết in hoa toàn bộ.', qh.text);
    else if (qh.sz && (qh.sz < 24 || qh.sz > 26)) add('warn', `Quốc hiệu cỡ ${qh.sz / 2} pt, quy định 12–13 pt.`, qh.text);
    else if (!qh.bold) add('warn', 'Quốc hiệu phải in đậm.', qh.text);
    else add('ok', 'Quốc hiệu đúng (in hoa, đậm).');
  }
  const tn = P.find((p) => /độc lập/i.test(p.text) && /tự do/i.test(p.text) && /hạnh phúc/i.test(p.text));
  if (!tn) add('err', 'Thiếu Tiêu ngữ "Độc lập - Tự do - Hạnh phúc".');
  else if (!/Độc lập - Tự do - Hạnh phúc/.test(tn.text)) add('err', 'Tiêu ngữ phải viết đúng "Độc lập - Tự do - Hạnh phúc" (gạch nối có dấu cách hai bên, viết hoa chữ đầu mỗi cụm).', tn.text);
  else if (tn.sz && (tn.sz < 26 || tn.sz > 28)) add('warn', `Tiêu ngữ cỡ ${tn.sz / 2} pt, quy định 13–14 pt.`, tn.text);
  else add('ok', 'Tiêu ngữ đúng mẫu.');

  const so = top.find((p) => /(^|\s)Số\s*:/.test(p.text));
  if (!so) add('err', 'Thiếu số và ký hiệu văn bản ("Số: …/…").');
  else {
    const m = /Số\s*:\s*(\S*)/.exec(so.text);
    if (!m || !m[1] || /…|\.\.\.|^\//.test(m[1])) add('info', 'Số văn bản đang để trống (điền khi vào sổ).', so.text);
    else if (/^\d+\/[\p{L}\d-]+(\/[\p{L}\d-]+)*$/u.test(m[1])) add('ok', `Số, ký hiệu: ${m[1]}.`);
    else add('warn', `Số, ký hiệu "${m[1]}" chưa đúng dạng "Số: 12/QĐ-ABC".`, so.text);
  }
  const date = top.find((p) => /ngày\s+\S+\s+tháng\s+\S+\s+năm/i.test(p.text));
  if (!date) add('err', 'Thiếu địa danh và ngày tháng năm ban hành ("…, ngày … tháng … năm …").');
  else {
    const m = /^(.*?),\s*ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i.exec(date.text);
    if (!m) add('info', 'Ngày tháng năm chưa điền đủ hoặc chưa đúng dạng "…, ngày dd tháng mm năm yyyy".', date.text);
    else {
      const [, , d, mo] = m, bad = [];
      if (+d < 10 && d.length < 2) bad.push('ngày nhỏ hơn 10 phải có số 0 phía trước');
      if (+mo < 3 && mo.length < 2) bad.push('tháng 1, 2 phải có số 0 phía trước');
      if (+d < 1 || +d > 31 || +mo < 1 || +mo > 12) bad.push('ngày hoặc tháng không hợp lệ');
      if (bad.length) add('warn', 'Ngày tháng: ' + bad.join('; ') + '.', date.text);
      else add('ok', 'Địa danh, ngày tháng năm đúng dạng.');
    }
  }
  const typeLine = top.find((p) => DOC_TYPES.some((t) => key(t) === key(p.text)));
  const vv = top.find((p) => /^V\/v\b/i.test(p.text));
  if (typeLine) {
    add('ok', `Tên loại văn bản: ${typeLine.text.toLocaleUpperCase('vi')}.`);
    const i = P.indexOf(typeLine);
    const next = P.slice(i + 1, i + 3).find((p) => p.text)?.text || '';
    if (NEED_VEVIEC.has(key(typeLine.text)) && next && !/^(Về việc|V\/v|Về)/i.test(next) && next.length > 6) add('info', 'Trích yếu ngay dưới tên loại thường bắt đầu bằng "Về việc …" hoặc "Về …".', next);
  } else if (vv) add('ok', 'Công văn có trích yếu "V/v …".');
  else add('warn', 'Không nhận diện được tên loại văn bản (in hoa) hoặc trích yếu "V/v" của công văn.');
  if (((typeLine && /^(TO TRINH|BAO CAO)$/.test(key(typeLine.text))) || (!typeLine && vv)) && !P.some((p) => /Kính gửi\s*:/.test(p.text))) add('warn', 'Văn bản này thường có dòng "Kính gửi:".');

  const ni = P.findIndex((p) => /Nơi nhận\s*:/.test(p.text));
  if (ni < 0) add('err', 'Thiếu phần "Nơi nhận:".');
  else {
    add('ok', 'Có phần "Nơi nhận:".');
    if (!P.slice(ni, ni + 14).some((p) => /Lưu\s*:/.test(p.text))) add('info', 'Danh sách nơi nhận thường kết thúc bằng dòng "- Lưu: VT, …".');
  }
  const dieu = P.map((p) => /^Điều\s+(\d+)/.exec(p.text)).filter(Boolean).map((m) => +m[1]);
  if (dieu.length) {
    const bad = dieu.findIndex((n, i) => n !== i + 1);
    if (bad >= 0) add('err', `Đánh số Điều không liên tục: sau Điều ${dieu[bad - 1] || 0} là Điều ${dieu[bad]}.`);
    else add('ok', `Các Điều đánh số liên tục (1–${dieu.length}).`);
  }
  const tail = P.slice(Math.max(0, ni >= 0 ? ni : P.length - 20)).concat(P.slice(-16));
  if (!tail.some((p) => { const l = p.text.replace(/[^\p{L}]/gu, ''); return l.length >= 4 && l === l.toLocaleUpperCase('vi') && !/NƠI NHẬN/i.test(p.text); })) add('warn', 'Chưa thấy chức vụ người ký (in hoa) ở cuối văn bản.');
  const blanks = P.filter((p) => /…{2,}|\.{4,}|\[\s*\]|X{3,}/.test(p.text) && !/ngày\s*…/.test(p.text)).length;
  if (blanks) add('warn', `Còn ${blanks} đoạn có chỗ trống chưa điền (……, ...., XXX).`);
  return { out, params };
}

/** Sửa nhanh: khổ A4, lề trong khoảng quy định, phông Times New Roman. Trả về Blob .docx. */
export async function fixDocx(buf) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  let x = await zip.file('word/document.xml').async('string');
  const clamp = (tw, lo, hi) => Math.round(Math.min(hi, Math.max(lo, mm(tw))) * TW_PER_MM);
  x = x.replace(/<w:pgSz\b[^>]*\/>/g, (tag) => (/w:orient="landscape"/.test(tag) ? tag.replace(/w:w="\d+"/, 'w:w="16838"').replace(/w:h="\d+"/, 'w:h="11906"') : tag.replace(/w:w="\d+"/, 'w:w="11906"').replace(/w:h="\d+"/, 'w:h="16838"')));
  x = x.replace(/<w:pgMar\b[^>]*\/>/g, (tag) => tag
    .replace(/w:top="(-?\d+)"/, (m, v) => `w:top="${clamp(+v, 20, 25)}"`)
    .replace(/w:bottom="(-?\d+)"/, (m, v) => `w:bottom="${clamp(+v, 20, 25)}"`)
    .replace(/w:left="(\d+)"/, (m, v) => `w:left="${clamp(+v, 30, 35)}"`)
    .replace(/w:right="(\d+)"/, (m, v) => `w:right="${clamp(+v, 15, 20)}"`));
  const tnr = (s) => s.replace(/<w:rFonts\b[^>]*\/>/g, (tag) => (/Symbol|Wingdings/i.test(tag) ? tag : '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>'));
  zip.file('word/document.xml', tnr(x));
  const st = await zip.file('word/styles.xml')?.async('string');
  if (st) zip.file('word/styles.xml', tnr(st));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}
