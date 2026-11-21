// Tóm tắt trích ý (không cần mạng): chấm điểm câu theo từ khoá hai âm tiết,
// vị trí và số liệu; rút gọn đoạn dài thành ý chính cho slide.

const STOP = new Set(('và của các những là có được cho với trong này đã sẽ để theo từ một không khi tại về như thì đó ra vào lại cũng nên nhưng hoặc bị do nếu mà vẫn đang rất nhiều phải trên dưới sau trước đến hơn '
  + 'việc người năm ngày tháng này kia ấy đây nào gì ai sự cái chiếc nhau cùng mọi mỗi từng đều chỉ còn vì nhằm bởi qua tới thì là rằng thế vậy hết lên xuống trong ngoài giữa bên cả các chúng tôi ta họ '
  + 'số lần đồng thời ngoài ra bên cạnh tuy nhiên do đó vì vậy cụ thể như sau gồm bao gồm đối với nhất').split(' '));
const CONNECT = /^(?:theo đó|bên cạnh đó|ngoài ra|đồng thời|tuy nhiên|do đó|vì vậy|vì thế|cụ thể|trong đó|nhìn chung|nhìn chung thì|như vậy|qua đó|mặt khác|hơn nữa|thêm vào đó|trước hết|sau đó|cuối cùng)\s*,?\s*/i;

const syll = (s) => s.toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu) || [];

export function sentences(text) {
  return String(text).replace(/\s+/g, ' ')
    .split(/(?<=[.!?…;])\s+(?=[\p{Lu}\d"“(-])/u)
    .map((s) => s.trim()).filter((s) => s.length > 2);
}

/** Từ khoá: cụm hai âm tiết có nghĩa, xếp theo tần suất (bỏ cụm chứa hư từ). */
export function keywords(text, n = 12) {
  const freq = new Map();
  const add = (k, w = 1) => freq.set(k, (freq.get(k) || 0) + w);
  for (const sent of sentences(text)) {
    const t = syll(sent);
    for (let i = 0; i < t.length - 1; i++) {
      if (STOP.has(t[i]) || STOP.has(t[i + 1]) || /^\d+$/.test(t[i]) || /^\d+$/.test(t[i + 1])) continue;
      add(t[i] + ' ' + t[i + 1]);
    }
  }
  return [...freq].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ k, c }));
}

function bigrams(s) {
  const t = syll(s), out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t[i] + ' ' + t[i + 1]);
  return out;
}
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };

/**
 * Chọn các câu quan trọng nhất (giữ thứ tự gốc).
 * @param paras mảng đoạn văn
 * @param ratio tỉ lệ số câu giữ lại (0–1), hoặc maxSentences
 */
export function summarize(paras, { ratio = 0.25, max = 12, min = 3 } = {}) {
  const all = [];
  paras.forEach((p, pi) => sentences(p).forEach((s, si) => all.push({ s, pi, si })));
  if (!all.length) return [];
  const kw = new Map(keywords(paras.join('\n'), 40).map(({ k, c }) => [k, c]));
  const n = Math.max(min, Math.min(max, Math.round(all.length * ratio)));
  for (const x of all) {
    const bg = bigrams(x.s);
    const len = syll(x.s).length;
    let sc = bg.reduce((a, b) => a + (kw.get(b) || 0), 0) / Math.sqrt(Math.max(6, len));
    if (x.si === 0) sc *= 1.25; // câu đầu đoạn thường nêu ý chính
    if (x.pi < 2) sc *= 1.15;
    if (/\d/.test(x.s)) sc *= 1.15; // có số liệu
    if (len < 6 || len > 70) sc *= 0.5;
    x.sc = sc;
    x.bg = bg;
  }
  const picked = [];
  for (const x of [...all].sort((a, b) => b.sc - a.sc)) {
    if (picked.length >= n) break;
    if (picked.some((p) => jaccard(p.bg, x.bg) > 0.55)) continue;
    picked.push(x);
  }
  return picked.sort((a, b) => a.pi - b.pi || a.si - b.si).map((x) => x.s);
}

/** Rút gọn một đoạn văn thành một ý ngắn (cho gạch đầu dòng). */
export function gist(paragraph, maxWords = 22) {
  const ss = sentences(paragraph);
  if (!ss.length) return '';
  let s = (ss.length > 1 ? summarize([paragraph], { max: 1, min: 1 })[0] : ss[0]) || ss[0];
  s = s.replace(CONNECT, '').replace(/[.;:]+$/, '');
  s = s.charAt(0).toLocaleUpperCase('vi') + s.slice(1);
  const words = s.split(/\s+/);
  if (words.length <= maxWords) return s;
  // cắt ở ranh giới mệnh đề gần nhất
  const cut = words.slice(0, maxWords).join(' ');
  const at = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf(' – '), cut.lastIndexOf(':'));
  return (at > cut.length * 0.5 ? cut.slice(0, at) : cut).replace(/[,;:–\s]+$/, '') + '…';
}
