// Soạn văn bản hành chính theo Nghị định 30/2020/NĐ-CP: 8 loại văn bản,
// xem trước trực tiếp, xuất Word đúng thể thức, nhớ thông tin cơ quan và người ký.
import { h, field, input, textarea, select, seg, checkbox, button, status, run } from '../core/ui.js';
import { kvGet, kvSet } from '../core/store.js';
import { showResult } from '../core/result.js';
import { P, R, RULE, TEXT_W, textWidthCm, toDocx, toHtml } from '../core/nd30.js';

const TYPES = {
  cv: { name: 'Công văn', code: '', kinhGui: 'req',
    fields: [{ k: 'noiDung', label: 'Nội dung công văn', rows: 9, ph: 'Mỗi dòng là một đoạn văn.' }],
    sample: { trichYeu: 'đề nghị phối hợp thực hiện nhiệm vụ', kinhGui: 'Phòng Kế hoạch – Tổng hợp', noiDung: 'Thực hiện chỉ đạo của lãnh đạo đơn vị, chúng tôi đề nghị Quý cơ quan phối hợp thực hiện các nội dung sau:\n1. Rà soát, tổng hợp số liệu đến hết tháng hiện tại.\n2. Gửi kết quả về đơn vị trước ngày 25 hằng tháng.\nRất mong nhận được sự phối hợp của Quý cơ quan./.' } },
  qd: { name: 'Quyết định', code: 'QĐ', title: 'QUYẾT ĐỊNH', tyLabel: 'Về việc',
    fields: [
      { k: 'thamQuyen', label: 'Thẩm quyền ban hành', single: true, ph: 'VD: GIÁM ĐỐC' },
      { k: 'canCu', label: 'Các căn cứ (mỗi dòng một căn cứ)', rows: 4, ph: 'Không cần gõ chữ "Căn cứ" ở đầu dòng. Dòng bắt đầu bằng "Xét" hoặc "Theo" được giữ nguyên.' },
      { k: 'dieu', label: 'Các điều (mỗi dòng một điều)', rows: 6, ph: 'Không cần gõ "Điều 1." — tự đánh số.' },
    ],
    sample: { trichYeu: 'ban hành quy chế phối hợp công tác', thamQuyen: 'GIÁM ĐỐC', canCu: 'Quy chế tổ chức và hoạt động của đơn vị;\nXét đề nghị của Trưởng phòng Tổng hợp', dieu: 'Ban hành kèm theo Quyết định này Quy chế phối hợp công tác.\nQuyết định này có hiệu lực kể từ ngày ký.\nTrưởng các phòng và cá nhân có liên quan chịu trách nhiệm thi hành Quyết định này.' } },
  ttr: { name: 'Tờ trình', code: 'TTr', title: 'TỜ TRÌNH', tyLabel: 'Về việc', kinhGui: 'req',
    fields: [{ k: 's1', label: 'I. Sự cần thiết', rows: 4 }, { k: 's2', label: 'II. Nội dung chính', rows: 5 }, { k: 's3', label: 'III. Kiến nghị, đề xuất', rows: 3 }],
    sample: { trichYeu: 'phê duyệt kế hoạch triển khai', kinhGui: 'Giám đốc', s1: 'Xuất phát từ yêu cầu thực tế của công tác chuyên môn, việc xây dựng kế hoạch là cần thiết.', s2: 'Kế hoạch gồm các nhóm nhiệm vụ chính, thời gian và đơn vị chịu trách nhiệm thực hiện.', s3: 'Kính trình Giám đốc xem xét, phê duyệt./.' } },
  bc: { name: 'Báo cáo', code: 'BC', title: 'BÁO CÁO', tyLabel: '', kinhGui: 'opt',
    fields: [{ k: 's1', label: 'I. Kết quả thực hiện', rows: 5 }, { k: 's2', label: 'II. Tồn tại, hạn chế và nguyên nhân', rows: 3 }, { k: 's3', label: 'III. Phương hướng, nhiệm vụ thời gian tới', rows: 3 }],
    sample: { trichYeu: 'Kết quả thực hiện nhiệm vụ quý III năm 2026', kinhGui: '', s1: 'Trong quý, đơn vị đã hoàn thành các chỉ tiêu được giao theo đúng tiến độ.', s2: 'Một số nhiệm vụ còn chậm do phối hợp giữa các bộ phận chưa chặt chẽ.', s3: 'Tiếp tục đôn đốc, bảo đảm hoàn thành kế hoạch năm.' } },
  kh: { name: 'Kế hoạch', code: 'KH', title: 'KẾ HOẠCH', tyLabel: '',
    fields: [{ k: 's1', label: 'I. Mục đích, yêu cầu', rows: 3 }, { k: 's2', label: 'II. Nội dung thực hiện', rows: 5 }, { k: 's3', label: 'III. Tổ chức thực hiện', rows: 3 }],
    sample: { trichYeu: 'Tổ chức hội nghị tổng kết năm 2026', s1: 'Đánh giá kết quả hoạt động trong năm; đề ra phương hướng năm tới.', s2: 'Thời gian, địa điểm, thành phần tham dự và chương trình hội nghị.', s3: 'Giao Văn phòng chủ trì, các phòng liên quan phối hợp thực hiện.' } },
  tb: { name: 'Thông báo', code: 'TB', title: 'THÔNG BÁO', tyLabel: '', kinhGui: 'opt',
    fields: [{ k: 'noiDung', label: 'Nội dung thông báo', rows: 8, ph: 'Mỗi dòng là một đoạn văn.' }],
    sample: { trichYeu: 'Lịch nghỉ Tết Dương lịch năm 2027', noiDung: 'Thực hiện quy định của Nhà nước, đơn vị thông báo lịch nghỉ như sau:\nThời gian nghỉ: từ ngày … đến hết ngày …\nCác bộ phận bố trí trực theo phân công./.' } },
  bb: { name: 'Biên bản', code: 'BB', title: 'BIÊN BẢN', tyLabel: '', special: 'bb',
    fields: [
      { k: 'thoiGian', label: 'Thời gian', single: true, ph: 'VD: 08 giờ 00, ngày 05 tháng 3 năm 2026' },
      { k: 'diaDiem', label: 'Địa điểm', single: true },
      { k: 'thanhPhan', label: 'Thành phần tham dự (mỗi dòng một người)', rows: 3 },
      { k: 'noiDung', label: 'Diễn biến, nội dung', rows: 5 },
      { k: 'ketLuan', label: 'Kết luận', rows: 3 },
      { k: 'ketThuc', label: 'Đoạn kết thúc biên bản', rows: 2, def: 'Biên bản kết thúc vào hồi … giờ … cùng ngày, đã được đọc lại cho mọi người cùng nghe và nhất trí ký tên./.' },
      { k: 'thuKy', label: 'Họ tên thư ký', single: true },
      { k: 'chuTri', label: 'Họ tên chủ trì', single: true },
    ],
    sample: { trichYeu: 'Họp giao ban tuần', thoiGian: '08 giờ 00, ngày 24 tháng 11 năm 2026', diaDiem: 'Phòng họp tầng 2', thanhPhan: 'Ông Nguyễn Văn A – Trưởng phòng, chủ trì\nBà Trần Thị B – Chuyên viên, thư ký', noiDung: 'Các bộ phận báo cáo kết quả công việc tuần qua và kế hoạch tuần tới.', ketLuan: 'Thống nhất triển khai các nhiệm vụ như đã báo cáo.', thuKy: 'Trần Thị B', chuTri: 'Nguyễn Văn A' } },
  gm: { name: 'Giấy mời', code: 'GM', title: 'GIẤY MỜI', tyLabel: '',
    fields: [
      { k: 'kinhMoi', label: 'Kính mời (mỗi dòng một đơn vị/cá nhân)', rows: 3 },
      { k: 'thoiGian', label: 'Thời gian', single: true },
      { k: 'diaDiem', label: 'Địa điểm', single: true },
      { k: 'ghiChu', label: 'Ghi chú thêm', rows: 2 },
    ],
    sample: { trichYeu: 'Dự hội nghị tổng kết công tác năm 2026', kinhMoi: 'Ông (Bà) Trưởng các phòng chuyên môn', thoiGian: '08 giờ 00, ngày 20 tháng 12 năm 2026', diaDiem: 'Hội trường tầng 3', ghiChu: 'Đề nghị Quý vị có mặt trước giờ khai mạc 15 phút./.' } },
};
const PROFILE_KEYS = ['capTren', 'coQuan', 'viettat', 'dvSoan', 'diaDanh', 'qh', 'thay', 'chucVu', 'hoTen', 'noiNhan', 'size'];
const SAMPLE_PROFILE = { capTren: 'ỦY BAN NHÂN DÂN TỈNH A', coQuan: 'SỞ B', viettat: 'SB', dvSoan: 'VP', diaDanh: 'Thành phố A', qh: 'KT.', thay: 'GIÁM ĐỐC', chucVu: 'PHÓ GIÁM ĐỐC', hoTen: 'Nguyễn Văn C', noiNhan: 'Như trên;\nGiám đốc (để b/c);\nLưu: VT, VP.' };

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const up = (s) => String(s || '').trim().toLocaleUpperCase('vi');

function dateText(v) {
  const [y, m, d] = String(v || '').split('-').map(Number);
  // NĐ30: ngày dưới 10 và tháng 1, 2 có số 0 phía trước
  return y ? `ngày ${d < 10 ? '0' + d : d} tháng ${m < 3 ? '0' + m : m} năm ${y}` : 'ngày … tháng … năm …';
}
function numberText(type, v) {
  const so = String(v.so || '').trim();
  const n = /^\d$/.test(so) ? '0' + so : so || '   ';
  const vt = up(v.viettat) || '…';
  const kh = type === 'cv' ? vt + (v.dvSoan?.trim() ? '-' + up(v.dvSoan) : '') : `${TYPES[type].code}-${vt}`;
  return `Số: ${n}/${kh}`;
}

/** Dựng mô hình trình bày cho loại văn bản `type` từ giá trị biểu mẫu `v`. */
export function buildModel(type, v) {
  const T = TYPES[type];
  const sz = +v.size || 14;
  const L = 6.4, Rw = TEXT_W - L;
  // --- Phần đầu: tên cơ quan | Quốc hiệu, Tiêu ngữ ---
  const coQuan = up(v.coQuan) || 'TÊN CƠ QUAN, TỔ CHỨC';
  const left1 = [];
  if (v.capTren?.trim()) left1.push(P(up(v.capTren), { align: 'center', size: 13 }));
  left1.push(P(coQuan, { align: 'center', b: true, size: 13 }));
  const coW = Math.max(...coQuan.split('\n').map((s) => textWidthCm(s, 13, true)));
  left1.push(RULE(Math.max(1.4, Math.min(coW, L) * 0.4), L));
  const TN = 'Độc lập - Tự do - Hạnh phúc';
  const right1 = [
    P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { align: 'center', b: true, size: 12 }),
    P(TN, { align: 'center', b: true, size: 13 }),
    RULE(textWidthCm(TN, 13, true), Rw),
  ];
  const left2 = [P(numberText(type, v), { align: 'center', size: 13, before: 4 })];
  if (type === 'cv') left2.push(P('V/v ' + String(v.trichYeu || '…').trim().replace(/^(V\/v|Về việc)[:\s]*/i, ''), { align: 'center', size: 12, before: 4 }));
  const right2 = [P(`${v.diaDanh?.trim() || '…'}, ${dateText(v.ngay)}`, { align: 'center', i: true, size: sz, before: 4 })];
  const model = [{ table: true, widths: [L, Rw], rows: [[left1, right1], [left2, right2]] }];

  // --- Tên loại và trích yếu ---
  if (T.title) {
    model.push(P(T.title, { align: 'center', b: true, size: sz, before: 24, keepNext: true }));
    let ty = String(v.trichYeu || '').trim();
    if (T.tyLabel && ty && !/^(V\/v|Về việc)/i.test(ty)) ty = `${T.tyLabel} ${ty}`;
    if (ty) {
      model.push(P(ty, { align: 'center', b: true, size: sz, keepNext: true }));
      model.push(RULE(Math.max(2, Math.min(textWidthCm(ty, sz, true), TEXT_W) * 0.35), TEXT_W));
    }
  }
  // --- Kính gửi ---
  const kg = lines(v.kinhGui);
  if (T.kinhGui && kg.length) {
    const clean = (s) => s.replace(/^[-–]\s*/, '').replace(/[;.]+$/, '');
    if (kg.length === 1) model.push(P([R('Kính gửi: '), R(clean(kg[0]) + '.')], { align: 'center', size: sz, before: 12, after: 6 }));
    else {
      model.push(P('Kính gửi:', { align: 'left', left: 3.5, size: sz, before: 12, keepNext: true }));
      kg.forEach((k, i) => model.push(P(`- ${clean(k)}${i === kg.length - 1 ? '.' : ';'}`, { align: 'left', left: 4.5, size: sz, after: i === kg.length - 1 ? 6 : 0 })));
    }
  }
  const body = (text, o = {}) => lines(text).forEach((t) => model.push(P(t, { first: 1, before: 6, line: 1.15, size: sz, ...o })));
  const labelled = (label, value) => value?.trim() && model.push(P([R(label, { b: true }), R(value.trim())], { first: 1, before: 6, line: 1.15, size: sz }));
  const before0 = model.length;

  // --- Nội dung theo loại ---
  if (type === 'qd') {
    if (v.thamQuyen?.trim()) model.push(P(up(v.thamQuyen), { align: 'center', b: true, size: sz, before: 12, after: 6 }));
    const cc = lines(v.canCu);
    cc.forEach((c, i) => {
      let t = c.replace(/[;.,]+$/, '');
      if (!/^(Căn cứ|Xét|Theo)/i.test(t)) t = 'Căn cứ ' + t;
      model.push(P(t + (i === cc.length - 1 ? '.' : ';'), { first: 1, before: 3, line: 1.15, i: true, size: sz }));
    });
    model.push(P('QUYẾT ĐỊNH:', { align: 'center', b: true, size: sz, before: 12, after: 6, keepNext: true }));
    lines(v.dieu).forEach((d, i) => model.push(P([R(`Điều ${i + 1}. `, { b: true }), R(d.replace(/^Điều\s*\d+[.:]?\s*/i, ''))], { first: 1, before: 6, line: 1.15, size: sz })));
  } else if (['ttr', 'bc', 'kh'].includes(type)) {
    T.fields.forEach((f) => {
      if (!v[f.k]?.trim()) return;
      model.push(P(f.label, { first: 1, before: 6, b: true, size: sz, keepNext: true }));
      body(v[f.k]);
    });
  } else if (type === 'bb') {
    labelled('Thời gian: ', v.thoiGian);
    labelled('Địa điểm: ', v.diaDiem);
    const tp = lines(v.thanhPhan);
    if (tp.length) {
      model.push(P('Thành phần tham dự:', { first: 1, before: 6, b: true, size: sz, keepNext: true }));
      tp.forEach((t) => model.push(P('- ' + t.replace(/^[-–]\s*/, ''), { first: 1, line: 1.15, size: sz })));
    }
    if (v.noiDung?.trim()) { model.push(P('Nội dung:', { first: 1, before: 6, b: true, size: sz, keepNext: true })); body(v.noiDung); }
    if (v.ketLuan?.trim()) { model.push(P('Kết luận:', { first: 1, before: 6, b: true, size: sz, keepNext: true })); body(v.ketLuan); }
    body(v.ketThuc ?? T.fields.find((f) => f.k === 'ketThuc').def);
  } else if (type === 'gm') {
    const km = lines(v.kinhMoi);
    if (km.length === 1) model.push(P([R(`${titleCase(coQuan)} trân trọng kính mời: `), R(km[0].replace(/[;.]+$/, '') + '.', { b: true })], { first: 1, before: 12, line: 1.15, size: sz }));
    else if (km.length) {
      model.push(P(`${titleCase(coQuan)} trân trọng kính mời:`, { first: 1, before: 12, size: sz, keepNext: true }));
      km.forEach((k, i) => model.push(P(`- ${k.replace(/^[-–]\s*/, '').replace(/[;.]+$/, '')}${i === km.length - 1 ? '.' : ';'}`, { first: 1, line: 1.15, b: true, size: sz })));
    }
    if (v.trichYeu?.trim()) labelled('Tới dự: ', v.trichYeu.trim().replace(/^Dự\s+/i, (m) => m.toLowerCase()));
    labelled('Thời gian: ', v.thoiGian);
    labelled('Địa điểm: ', v.diaDiem);
    body(v.ghiChu);
  } else {
    body(v.noiDung);
  }
  if (model.length === before0) model.push(P('(Nội dung văn bản)', { first: 1, before: 6, i: true, size: sz }));

  // --- Chữ ký và nơi nhận ---
  if (type === 'bb') {
    const sig = (role, name) => [P(role, { align: 'center', b: true, size: sz, before: 12 }), P('(Ký, ghi rõ họ tên)', { align: 'center', i: true, size: 12, after: 48 }), P(name || '', { align: 'center', b: true, size: sz })];
    model.push({ table: true, widths: [TEXT_W / 2, TEXT_W / 2], rows: [[sig('THƯ KÝ', v.thuKy), sig('CHỦ TRÌ', v.chuTri)]] });
    return model;
  }
  const qh = v.qh || '';
  const sign = [];
  if (qh === 'Q.') sign.push(P(`Q. ${up(v.chucVu) || 'CHỨC VỤ'}`, { align: 'center', b: true, size: sz, before: 12 }));
  else {
    if (qh) sign.push(P(`${qh} ${up(v.thay) || '…'}`, { align: 'center', b: true, size: sz, before: 12 }));
    sign.push(P(up(v.chucVu) || 'CHỨC VỤ NGƯỜI KÝ', { align: 'center', b: true, size: sz, before: qh ? 0 : 12 }));
  }
  sign.push(P('', { after: 56, size: sz }));
  sign.push(P(String(v.hoTen || '').trim() || 'Họ và tên', { align: 'center', b: true, size: sz }));
  const nn = lines(v.noiNhan);
  if (!nn.some((x) => /^[-–\s]*Lưu/i.test(x))) nn.push(`Lưu: VT${v.dvSoan?.trim() ? ', ' + up(v.dvSoan) : ''}.`);
  const recv = [P([R('Nơi nhận:', { b: true, i: true, size: 12 })], { align: 'left', before: 12 }),
    ...nn.map((x, i) => P('- ' + x.replace(/^[-–]\s*/, '').replace(/[;.]+$/, '') + (i === nn.length - 1 ? '.' : ';'), { align: 'left', size: 11 }))];
  model.push({ table: true, widths: [7.6, TEXT_W - 7.6], rows: [[recv, sign]] });
  return model;
}
const titleCase = (s) => s.toLocaleLowerCase('vi').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('vi'));

// ---------- Giao diện ----------
export function render() {
  let type = 'cv';
  let v = { ngay: new Date().toISOString().slice(0, 10), size: '14' };
  const st = status();
  const paper = h('div', { class: 'paper' });
  const frame = h('div', { class: 'paper-frame' }, paper);
  const typeArea = h('div');
  const ctrls = {};

  const bind = (k, el) => {
    ctrls[k] = el;
    el.value = v[k] ?? '';
    el.addEventListener('input', () => { v[k] = el.value; changed(); });
    return el;
  };
  const inp = (k, ph) => bind(k, input({ placeholder: ph || '' }));
  const area = (k, rows, ph) => bind(k, textarea({ rows, placeholder: ph || '' }));

  const typeSel = seg(Object.entries(TYPES).map(([value, t]) => ({ value, label: t.name })), type, (t) => { type = t; paintType(); changed(); });
  const qhSel = bind('qh', select([{ value: '', label: 'Ký trực tiếp' }, { value: 'TM.', label: 'TM. (thay mặt tập thể)' }, { value: 'KT.', label: 'KT. (ký thay người đứng đầu)' }, { value: 'TL.', label: 'TL. (thừa lệnh)' }, { value: 'TUQ.', label: 'TUQ. (thừa uỷ quyền)' }, { value: 'Q.', label: 'Q. (quyền)' }], ''));
  const sizeSel = bind('size', select([{ value: '13', label: 'Cỡ chữ 13' }, { value: '14', label: 'Cỡ chữ 14' }], '14'));
  const ngay = bind('ngay', h('input', { type: 'date' }));
  const remember = checkbox('Nhớ thông tin cơ quan và người ký cho lần sau (chỉ lưu trên thiết bị này)', true);
  const thayField = field('Thay mặt / ký thay cho', inp('thay', 'VD: GIÁM ĐỐC hoặc BAN GIÁM ĐỐC'));
  const signArea = h('div');

  function paintType() {
    const T = TYPES[type];
    const kids = [field(type === 'gm' ? 'Nội dung mời *' : type === 'cv' ? 'Trích yếu (V/v …) *' : T.tyLabel ? 'Về việc *' : 'Tên / trích yếu văn bản *', inp('trichYeu', T.sample.trichYeu))];
    if (T.kinhGui) kids.push(field(`Kính gửi${T.kinhGui === 'opt' ? ' (không bắt buộc)' : ''}`, area('kinhGui', 2, 'Mỗi dòng một nơi nhận'), 'Nhiều dòng sẽ trình bày dạng gạch đầu dòng.'));
    for (const f of T.fields) {
      if (f.def && v[f.k] == null) v[f.k] = f.def;
      kids.push(field(f.label, f.single ? inp(f.k, f.ph) : area(f.k, f.rows || 3, f.ph)));
    }
    typeArea.replaceChildren(...kids);
    signArea.hidden = type === 'bb';
  }
  const showThay = () => { thayField.hidden = !qhSel.value || qhSel.value === 'Q.'; };
  qhSel.addEventListener('change', showThay);

  let tm;
  function changed() {
    paper.innerHTML = toHtml(buildModel(type, v), { size: +v.size || 14 });
    clearTimeout(tm);
    tm = setTimeout(() => kvSet('compose-draft', { type, v }), 600);
  }
  const fit = () => { const w = frame.clientWidth; if (w) paper.style.zoom = String(Math.min(1, (w - 4) / 794)); }; // 21 cm ≈ 794 px
  new ResizeObserver(fit).observe(frame);

  const fillSample = () => {
    const T = TYPES[type];
    const prof = Object.fromEntries(PROFILE_KEYS.map((k) => [k, v[k]]));
    const hasProfile = !!v.coQuan?.trim();
    v = { ...v, ...(hasProfile ? {} : SAMPLE_PROFILE), ...T.sample, ...(hasProfile ? prof : {}) };
    sync();
  };
  const clearContent = () => {
    const keep = Object.fromEntries([...PROFILE_KEYS, 'ngay'].map((k) => [k, v[k]]));
    v = keep;
    sync();
  };
  function sync() {
    paintType();
    for (const [k, el] of Object.entries(ctrls)) el.value = v[k] ?? '';
    showThay();
    changed();
  }

  const go = button('Xuất Word', { kind: 'btn-primary', iconName: 'word' });
  go.addEventListener('click', () => run(go, st, async () => {
    if (!v.trichYeu?.trim()) throw new Error('Hãy nhập trích yếu / nội dung chính của văn bản.');
    if (!v.coQuan?.trim()) throw new Error('Hãy nhập tên cơ quan, tổ chức ban hành.');
    const blob = await toDocx(buildModel(type, v), { size: +v.size || 14, title: `${TYPES[type].name} ${v.trichYeu}` });
    if (remember.get()) await kvSet('compose-profile', Object.fromEntries(PROFILE_KEYS.map((k) => [k, v[k] ?? ''])));
    const name = `${TYPES[type].name} - ${v.trichYeu.trim().slice(0, 60)}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.docx';
    await showResult(st, [{ blob, name }], { tool: 'Soạn văn bản' });
  }));

  signArea.append(h('section', { class: 'card' },
    h('h2', null, 'Người ký và nơi nhận'),
    h('div', { class: 'grid2' }, field('Thẩm quyền ký', qhSel), thayField),
    h('div', { class: 'grid2' },
      field('Chức vụ người ký', inp('chucVu', 'VD: PHÓ GIÁM ĐỐC')),
      field('Họ và tên người ký', inp('hoTen', 'VD: Nguyễn Văn C'))),
    field('Nơi nhận (mỗi dòng một nơi)', area('noiNhan', 4, 'Như trên;\nLưu: VT, VP.'), 'Tự thêm "Lưu: VT" nếu chưa có.')));
  const formEl = h('div', null,
    h('section', { class: 'card' },
      h('h2', null, 'Loại văn bản'),
      h('div', { class: 'seg-wrap' }, typeSel.el),
      h('div', { class: 'row mt' },
        button('Điền mẫu', { iconName: 'wand', onClick: fillSample }),
        button('Xoá nội dung', { kind: 'btn-ghost', iconName: 'trash', onClick: clearContent }))),
    h('section', { class: 'card' },
      h('h2', null, 'Cơ quan ban hành'),
      field('Cơ quan, tổ chức chủ quản (nếu có)', inp('capTren', 'VD: ỦY BAN NHÂN DÂN TỈNH A')),
      field('Tên cơ quan, tổ chức ban hành *', inp('coQuan', 'VD: SỞ B')),
      h('div', { class: 'grid2' },
        field('Viết tắt tên cơ quan *', inp('viettat', 'VD: SB')),
        field('Đơn vị soạn thảo (viết tắt)', inp('dvSoan', 'VD: VP'))),
      h('div', { class: 'grid3' },
        field('Số', inp('so', 'VD: 12')),
        field('Địa danh', inp('diaDanh', 'VD: Hà Nội')),
        field('Ngày ban hành', ngay))),
    h('section', { class: 'card' }, h('h2', null, 'Nội dung'), typeArea),
    signArea,
    h('section', { class: 'card' },
      field('Cỡ chữ nội dung', sizeSel),
      remember.el,
      h('div', { class: 'row mt' }, go),
      st.el));

  const root = h('div', { class: 'compose' }, formEl,
    h('section', { class: 'card compose-preview' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { style: 'margin:0' }, 'Xem trước'), h('span', { class: 'tag' }, 'A4 · lề 20-20-30-15 mm')), frame));

  // nạp hồ sơ đã lưu và bản nháp
  (async () => {
    const prof = await kvGet('compose-profile');
    const draft = await kvGet('compose-draft');
    if (draft?.type && TYPES[draft.type]) { type = draft.type; typeSel.set(type); v = { ...v, ...draft.v }; }
    if (prof) v = { ...v, ...Object.fromEntries(Object.entries(prof).filter(([, x]) => x !== '')) };
    sync();
    requestAnimationFrame(fit);
  })();
  paintType();
  showThay();
  changed();
  return root;
}
