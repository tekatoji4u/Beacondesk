// Kiểm tra chính tả tiếng Việt theo cấu tạo âm tiết, lỗi trình bày (dấu câu, khoảng trắng,
// ngày tháng), một số từ hay viết sai và văn phong hành chính. Chạy hoàn toàn trên máy.

const HAS_VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/;
const TONE = { '̀': 'f', '́': 's', '̉': 'r', '̃': 'x', '̣': 'j' };
const ONSET = 'ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|b|c|d|đ|g|h|k|l|m|n|p|r|s|t|v|x';
const NUCLEUS = 'uyê|uyu|uya|uôi|ươi|ươu|iêu|yêu|oai|oao|oay|oeo|uây|oă|uâ|uê|uơ|uy|uô|ươ|iê|yê|ưa|ưu|ưi|ua|ui|ia|iu|oa|oe|oi|ôi|ơi|ai|ao|au|ay|âu|ây|eo|êu|oo|ya|a|ă|â|e|ê|i|y|o|ô|ơ|u|ư';
const SYL = new RegExp(`^(${ONSET})?(${NUCLEUS})(ng|nh|ch|c|k|m|n|p|t)?$`);
// Địa danh, tên riêng dân tộc thiểu số và từ cảm thán hợp lệ dù khác quy tắc
const EXCEPT = new Set(['krông', 'kbang', 'ksor', 'bkrông', 'mdrắk', 'đắk', 'đăk', 'lắk', 'lăk', 'ya', 'ea', 'êđê', 'mnông', 'ơi', 'ơ', 'pắc', 'bó']);

function splitTone(w) {
  let tone = '', pos = -1;
  [...w].forEach((ch, i) => { for (const c of ch.normalize('NFD')) if (TONE[c]) { tone = TONE[c]; pos = i; } });
  const base = w.normalize('NFD').replace(/[̣̀́̉̃]/g, '').normalize('NFC');
  return { tone, pos, base };
}

/** Trả về lý do nếu từ không phải âm tiết tiếng Việt hợp lệ, ngược lại null. */
export function syllableError(word) {
  const t = word.toLowerCase().normalize('NFC');
  if (!HAS_VN.test(t) || /[fjwz\d]/.test(t) || t.length > 8 || EXCEPT.has(t)) return null;
  const { tone, pos, base } = splitTone(t);
  const m = SYL.exec(base);
  if (!m) return 'cấu tạo âm tiết không hợp lệ';
  const [, on = '', nu, co = ''] = m;
  if (['c', 'ch', 'p', 't', 'k'].includes(co) && tone !== 's' && tone !== 'j') return 'âm tiết kết thúc bằng c, ch, p, t chỉ mang dấu sắc hoặc nặng';
  if (co === 'k' && nu !== 'ă') return 'cấu tạo âm tiết không hợp lệ';
  if (on === 'k' && !/^[iyeê]/.test(nu)) return '"k" chỉ đứng trước i, e, ê, y';
  if (on === 'c' && /^[iyeê]/.test(nu)) return '"c" không đứng trước i, e, ê, y (dùng "k")';
  if (on === 'gh' && !/^[ieê]/.test(nu)) return '"gh" chỉ đứng trước i, e, ê';
  if (on === 'g' && /^[eê]/.test(nu)) return '"g" không đứng trước e, ê (dùng "gh")';
  if (on === 'ngh' && !/^[ieê]/.test(nu)) return '"ngh" chỉ đứng trước i, e, ê';
  if (on === 'ng' && /^[ieê]/.test(nu)) return '"ng" không đứng trước i, e, ê (dùng "ngh")';
  if ((co === 'ch' || co === 'nh') && !/[aeêiy]$/.test(nu)) return 'vần không hợp lệ với âm cuối ch, nh';
  if (co === 'nh' && nu === 'e') return 'vần "enh" không tồn tại';
  if (co === 'ng' && ['ê', 'i', 'y', 'uy'].includes(nu)) return 'vần không hợp lệ với âm cuối ng';
  if ((nu === 'ă' || nu === 'â' || nu === 'oă') && !co) return 'nguyên âm ă, â cần có âm cuối';
  if ((nu === 'ê' && (co === 'c' || co === 'ng')) || (nu === 'ơ' && ['c', 'ng', 'ch', 'nh'].includes(co))) return 'vần không hợp lệ';
  if (co && (nu === 'oa' || nu === 'oe' || nu === 'oă') && tone && pos === on.length) return 'dấu thanh đặt sai chỗ (khi có âm cuối, dấu đặt ở nguyên âm thứ hai)';
  return null;
}

/** "old" = hoà, thuỷ; "new" = hòa, thủy; null = không liên quan. */
function toneStyle(w) {
  let t = w.toLowerCase().normalize('NFC');
  if (/^qu/.test(t)) t = t.slice(2);
  if (/(?:oà|oá|oả|oã|oạ|oè|oé|oẻ|oẽ|oẹ|uỳ|uý|uỷ|uỹ|uỵ)$/.test(t)) return 'old';
  if (/(?:òa|óa|ỏa|õa|ọa|òe|óe|ỏe|õe|ọe|ùy|úy|ủy|ũy|ụy)$/.test(t)) return 'new';
  return null;
}

const WRONG = [
  [/sát nhập/gi, 'sáp nhập'], [/xác nhập/gi, 'sáp nhập'], [/trao dồi/gi, 'trau dồi'], [/chỉnh chu/gi, 'chỉn chu'],
  [/dấu diếm/gi, 'giấu giếm'], [/giành riêng/gi, 'dành riêng'], [/giành cho/gi, 'dành cho'], [/lãng tránh/gi, 'lảng tránh'],
  [/sơ xuất/gi, 'sơ suất'], [/xuất ăn/gi, 'suất ăn'], [/nghành/gi, 'ngành'], [/rút kinh ngiệm/gi, 'rút kinh nghiệm'],
  [/kế họach/gi, 'kế hoạch'], [/họat/gi, 'hoạt'], [/tòan/gi, 'toàn'], [/lọai/gi, 'loại'], [/ngòai/gi, 'ngoài'], [/khỏang/gi, 'khoảng'],
  [/quyết đinh/gi, 'quyết định'], [/thực hiên/gi, 'thực hiện'], [/chuẩn bi(?![\p{L}])/giu, 'chuẩn bị'],
  [/bàng quang với/gi, 'bàng quan với'], [/tham quan học tập kinh nghiệm/gi, 'tham quan, học tập kinh nghiệm'],
  [/yếu điểm/gi, 'điểm yếu (nếu ý là nhược điểm)'], [/tham khảo ý kiến đóng góp/gi, 'lấy ý kiến góp ý'],
  [/(?<![\p{L}])xử dụng/giu, 'sử dụng'], [/(?<![\p{L}])sử lý/giu, 'xử lý'], [/(?<![\p{L}])chia xẻ/giu, 'chia sẻ'],
  [/(?<![\p{L}])giải quyết dứt điểm triệt để/giu, 'giải quyết dứt điểm'], [/(?<![\p{L}])xuất xắc/giu, 'xuất sắc'],
];
const STYLE = [
  [/mặc dù[^.;:\n]{3,120}\bnhưng\b/gi, 'Thừa cặp quan hệ từ "mặc dù … nhưng": chỉ nên dùng một trong hai.'],
  [/nhằm mục đích/gi, '"nhằm mục đích" thừa từ: dùng "nhằm" hoặc "với mục đích".'],
  [/quí(?![\p{L}])/giu, 'Nên viết "quý" (quý cơ quan, quý vị).'],
  [/(?<![\p{L}])vv(?![\p{L}])/giu, 'Nên viết "v.v." (viết tắt của "vân vân").'],
  [/(?<![\p{L}])(?:các|những) [\p{L}]+ (?:các|những)(?![\p{L}])/giu, 'Có thể thừa từ chỉ số nhiều "các/những".'],
];
const REPEAT_OK = new Set(['dần', 'ngày', 'năm', 'nhà', 'người', 'từng', 'đều', 'mãi', 'xa', 'tốt', 'rất', 'càng', 'cứ', 'lúc', 'hàng', 'mỗi', 'tháng', 'bước', 'ngay', 'vẫn', 'nhau', 'con', 'đi', 'lần', 'khoảng', 'nhiều', 'thấp', 'cao', 'lớn', 'nhỏ', 'sáng', 'đêm', 'tuần', 'giờ', 'phút', 'nơi', 'chỗ', 'bên', 'cùng', 'đang', 'đã', 'sẽ', 'xanh', 'đỏ', 'chầm', 'thường']);

/** Lỗi trình bày có thể tự sửa: [regex, mức, thông báo, (m) => [vị trí, độ dài], hàm sửa]. */
const LAYOUT = [
  // bỏ qua "Số:    /QĐ-…" (chừa trống số văn bản)
  [/(\S) {2,}(?=[^\s/])/g, 'warn', 'Thừa khoảng trắng', (m) => [m.index + 1, m[0].length - 1], (s) => s.replace(/(\S) {2,}(?=[^\s/])/g, '$1 ')],
  [/(\S) +([,;.!?:])(?![\d.])/g, 'warn', 'Thừa dấu cách trước dấu câu', (m) => [m.index + 1, m[0].length - 1], (s) => s.replace(/(\S) +([,;.!?:])(?![\d.])/g, '$1$2')],
  [/([\p{L}\p{N}])([,;!?])(?=\p{L})/gu, 'warn', 'Thiếu dấu cách sau dấu câu', (m) => [m.index, 2], (s) => s.replace(/([\p{L}\p{N}])([,;!?])(?=\p{L})/gu, '$1$2 ')],
  [/(\p{Ll}{2,})\.(?=\p{Lu})/gu, 'warn', 'Thiếu dấu cách sau dấu chấm', (m) => [m.index, m[0].length + 1], (s) => s.replace(/(\p{Ll}{2,})\.(?=\p{Lu})/gu, '$1. ')],
  [/(?<![\p{L}.\/@])(\p{Ll}{2,})\.(?!(?:vn|com|net|org|gov|edu|html?|pdf|docx?|xlsx?|pptx?|jpe?g|png)(?![\p{L}]))(\p{Ll}{2,})/gu, 'warn', 'Thiếu dấu cách sau dấu chấm', (m) => [m.index, m[0].length], null],
  [/([,;:!?])\1+/g, 'warn', 'Dấu câu bị lặp', (m) => [m.index, m[0].length], (s) => s.replace(/([,;:!?])\1+/g, '$1')],
  [/(?:^|[^.])(\.\.)(?!\.)/g, 'warn', 'Dấu chấm bị lặp (dấu ba chấm là "...")', (m) => [m.index + m[0].length - 2, 2], null],
  [/\( +(?=\S)|(?<=\S) +\)/g, 'info', 'Thừa dấu cách trong ngoặc', (m) => [m.index, m[0].length + 1], (s) => s.replace(/\( +(?=\S)/g, '(').replace(/(?<=\S) +\)/g, ')')],
  [/ngày\s+(\d)\s+tháng/g, 'warn', 'Ngày nhỏ hơn 10 phải có số 0 phía trước (ví dụ: ngày 05)', (m) => [m.index, m[0].length], (s) => s.replace(/ngày\s+(\d)\s+tháng/g, 'ngày 0$1 tháng')],
  [/tháng\s+([12])\s+năm/g, 'warn', 'Tháng 1, 2 phải có số 0 phía trước (ví dụ: tháng 02)', (m) => [m.index, m[0].length], (s) => s.replace(/tháng\s+([12])\s+năm/g, 'tháng 0$1 năm')],
];

/**
 * Kiểm tra danh sách đoạn văn.
 * @returns [{sev:'err'|'warn'|'info', cat, msg, ctx:{text,i,len}|null, para}]
 */
export function checkText(paras) {
  const out = [];
  const add = (sev, cat, msg, text, i, len, para) => out.push({ sev, cat, msg, ctx: text != null ? { text, i, len } : null, para });
  let oldN = 0, newN = 0;
  const bad = new Map();
  paras.forEach((s, pi) => {
    if (!s) return;
    for (const [re, sev, msg, pos] of LAYOUT) {
      re.lastIndex = 0;
      for (const m of s.matchAll(re)) { const [i, len] = pos(m); add(sev, 'Trình bày', msg, s, i, len, pi + 1); }
    }
    for (const m of s.matchAll(/([\p{Ll}\p{N}]{3,})([.!?]) +(\p{Ll})/gu)) {
      if (/^(vv|tp|tt|ths|gs|pgs|ts|vd|tr|đ\/c)$/i.test(m[1]) || /\d$/.test(m[1])) continue;
      add('warn', 'Chính tả', 'Đầu câu chưa viết hoa', s, m.index + m[1].length + 1, m[0].length - m[1].length - 1, pi + 1);
    }
    const count = (c) => s.split(c).length - 1;
    if (count('(') !== count(')')) add('warn', 'Trình bày', 'Ngoặc đơn ( ) không cân xứng trong đoạn này', s, 0, Math.min(40, s.length), pi + 1);
    if (count('"') % 2) add('warn', 'Trình bày', 'Dấu ngoặc kép " " không cân xứng trong đoạn này', s, 0, Math.min(40, s.length), pi + 1);
    for (const m of s.matchAll(/(^|[^\p{L}])(\p{L}{2,})\s+\2(?![\p{L}])/giu)) {
      if (!REPEAT_OK.has(m[2].toLowerCase())) add('info', 'Chính tả', `Từ lặp liền nhau: "${m[2]}" (có thể do gõ nhầm)`, s, m.index + m[1].length, m[0].length - m[1].length, pi + 1);
    }
    for (const [re, fix] of WRONG) for (const m of s.matchAll(re)) add('warn', 'Chính tả', `Nên dùng: ${fix}`, s, m.index, m[0].length, pi + 1);
    for (const [re, msg] of STYLE) for (const m of s.matchAll(re)) add('info', 'Văn phong', msg, s, m.index, m[0].length, pi + 1);
    for (const m of s.matchAll(/\p{L}+/gu)) {
      const w = m[0];
      if (w.length >= 2 && w.length <= 5 && w === w.toLocaleUpperCase('vi') && !HAS_VN.test(w.toLowerCase().replace(/đ/g, ''))) continue; // chữ viết tắt: QĐ, UBND
      const ts = toneStyle(w);
      if (ts === 'old') oldN++; else if (ts === 'new') newN++;
      const why = syllableError(w);
      if (!why) continue;
      const k = w.toLowerCase();
      const b = bad.get(k) || { n: 0, first: { s, i: m.index, len: w.length, pi: pi + 1, why, w } };
      b.n++;
      bad.set(k, b);
    }
  });
  for (const [, b] of bad) add('warn', 'Chính tả', `Nghi sai chính tả: "${b.first.w}" (${b.first.why})${b.n > 1 ? ` · ${b.n} lần` : ''}`, b.first.s, b.first.i, b.first.len, b.first.pi);
  if (oldN && newN) add('info', 'Chính tả', `Chưa thống nhất cách đặt dấu thanh: ${newN} từ kiểu mới (hòa, thủy) và ${oldN} từ kiểu cũ (hoà, thuỷ). Nên dùng một kiểu.`, null);
  return out;
}

/** Tự sửa các lỗi trình bày chắc chắn (khoảng trắng, dấu câu, số 0 trong ngày tháng). */
export function autoFix(text) {
  let s = text;
  for (const [, , , , fix] of LAYOUT) if (fix) s = s.split('\n').map(fix).join('\n');
  return s;
}
