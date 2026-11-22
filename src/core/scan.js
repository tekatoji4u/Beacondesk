// Scan tài liệu bằng OpenCV.js: tìm 4 góc trang, nắn phối cảnh, làm đều ánh sáng,
// khử bóng, tăng tương phản cục bộ, khử nhiễu, làm nét, đen trắng thích ứng.
import { getAsset } from './assets.js';

let cvP;
/** Nạp OpenCV.js (~11 MB, tải một lần rồi lưu lại để dùng khi mất mạng). */
export function loadCv() {
  cvP ||= (async () => {
    if (!window.cv?.Mat) {
      const url = await getAsset('opencv');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = res;
        s.onerror = () => rej(new Error('Không tải được bộ xử lý ảnh (OpenCV). Hãy kiểm tra kết nối mạng rồi thử lại.'));
        document.head.append(s);
      });
    }
    const cv = window.cv;
    // Không dùng await trực tiếp: đối tượng Module của Emscripten có .then gây lặp vô hạn
    if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
    // bỏ .then để có thể trả cv qua Promise mà không bị coi là "thenable"
    cv.then = undefined;
    return cv;
  })().catch((e) => { cvP = null; throw e; });
  return cvP;
}

/** Giải phóng bộ nhớ của các Mat (OpenCV.js không tự dọn). */
function free(...ms) { for (const m of ms) m?.delete?.(); }

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function scaled(c, maxSide) {
  const S = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (S === 1) return { canvas: c, S };
  const t = document.createElement('canvas');
  t.width = Math.round(c.width * S); t.height = Math.round(c.height * S);
  const g = t.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, t.width, t.height);
  return { canvas: t, S };
}

/** Sắp 4 điểm theo thứ tự [trên trái, trên phải, dưới phải, dưới trái]. */
function order(pts) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  const s = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 tăng theo chiều kim đồng hồ (trục y hướng xuống): bắt đầu từ điểm có x+y nhỏ nhất
  let k = 0;
  s.forEach((p, i) => { if (p[0] + p[1] < s[k][0] + s[k][1]) k = i; });
  return [0, 1, 2, 3].map((i) => s[(k + i) % 4]);
}

function quadOk(q, W, H) {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    if (Math.abs(cos) > 0.62) return false; // góc trong khoảng ~52°–128°
  }
  let area = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; area += x1 * y2 - x2 * y1; }
  area = Math.abs(area) / 2;
  return area > W * H * 0.12 && area < W * H * 0.985 ? area : false;
}

/** Lấy các tứ giác lồi từ một ảnh nhị phân (cạnh hoặc vùng). */
function quadsFrom(cv, bin, W, H, out) {
  const contours = new cv.MatVector(), hier = new cv.Mat();
  cv.findContours(bin, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    if (cv.contourArea(c) < W * H * 0.08) { c.delete(); continue; }
    const hull = new cv.Mat();
    cv.convexHull(c, hull, false, true);
    const peri = cv.arcLength(hull, true);
    for (const eps of [0.015, 0.025, 0.04]) {
      const ap = new cv.Mat();
      cv.approxPolyDP(hull, ap, eps * peri, true);
      const pts = [...Array(ap.rows).keys()].map((k) => [ap.data32S[k * 2], ap.data32S[k * 2 + 1]]);
      ap.delete();
      // 5 đỉnh: một góc bị che (ngón tay, vật đè) hoặc lệch khỏi khung → kéo dài 4 cạnh dài nhất
      const q4 = pts.length === 4 ? pts : pts.length === 5 ? cornerFromFive(pts) : null;
      if (q4) {
        const q = order(q4);
        const area = quadOk(q, W, H);
        if (area) out.push({ q, area, fill: cv.contourArea(c) / area });
      }
    }
    free(hull, c);
  }
  free(contours, hier);
}

/** Ghép các đường thẳng dài ngoài cùng ở 4 phía thành các tứ giác ứng viên. */
function houghQuads(cv, edges, W, H, out) {
  const lines = new cv.Mat();
  const minLen = Math.min(W, H) * 0.3;
  cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 60, minLen, Math.max(W, H) * 0.025);
  const hz = [], vt = [];
  for (let i = 0; i < lines.rows; i++) {
    const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
    const ang = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
    // mép giấy chụp nghiêng hiếm khi lệch quá 20°; đường chéo hơn thường là bóng đổ, nếp gấp
    if (ang < 20 || ang > 160) hz.push({ p: [x1, y1], q: [x2, y2], pos: (y1 + y2) / 2 });
    else if (ang > 70 && ang < 110) vt.push({ p: [x1, y1], q: [x2, y2], pos: (x1 + x2) / 2 });
  }
  lines.delete();
  // giấy tràn ra ngoài khung ảnh: lấy luôn mép ảnh làm cạnh (được chấm điểm riêng ở detectDocument).
  // Không làm vậy nếu gần mép đó có một đường thẳng dài (mép giấy thật, thường gặp khi nền trắng)
  const len = (l) => Math.hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]);
  const longNear = (arr, dim, span, near) => arr.some((l) => near(l.pos) &&
    arr.filter((m) => Math.abs(m.pos - l.pos) < dim * 0.015).reduce((s, m) => s + len(m), 0) > span * 0.5);
  const blocked = {
    top: longNear(hz, H, W, (y) => y < H * 0.25), bottom: longNear(hz, H, W, (y) => y > H * 0.75),
    left: longNear(vt, W, H, (x) => x < W * 0.25), right: longNear(vt, W, H, (x) => x > W * 0.75),
  };
  if (!blocked.top) hz.push({ p: [0, 0], q: [W, 0], pos: 0 });
  if (!blocked.bottom) hz.push({ p: [0, H - 1], q: [W, H - 1], pos: H - 1 });
  if (!blocked.left) vt.push({ p: [0, 0], q: [0, H], pos: 0 });
  if (!blocked.right) vt.push({ p: [W - 1, 0], q: [W - 1, H], pos: W - 1 });
  // mỗi phía: tối đa 3 đường ngoài cùng, cách nhau đủ xa
  const pick = (arr, from, asc, lim) => {
    const r = [];
    for (const l of arr.filter((l) => (asc ? l.pos < lim : l.pos > lim)).sort((a, b) => (asc ? a.pos - b.pos : b.pos - a.pos))) {
      if (r.every((x) => Math.abs(x.pos - l.pos) > from * 0.015)) r.push(l);
      if (r.length === 3) break;
    }
    return r;
  };
  const T = pick(hz, H, true, H * 0.45), B = pick(hz, H, false, H * 0.55), L = pick(vt, W, true, W * 0.45), R = pick(vt, W, false, W * 0.55);
  for (const t of T) for (const b of B) for (const l of L) for (const r of R) {
    const q = [cross(t, l), cross(t, r), cross(b, r), cross(b, l)];
    if (q.some((p) => !p || p[0] < -W * 0.02 || p[1] < -H * 0.02 || p[0] > W * 1.02 || p[1] > H * 1.02)) continue;
    const area = quadOk(q, W, H);
    if (area) out.push({ q, area, fill: 1 });
  }
  return blocked;
}
function cross(a, b) {
  const d1 = [a.q[0] - a.p[0], a.q[1] - a.p[1]], d2 = [b.q[0] - b.p[0], b.q[1] - b.p[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b.p[0] - a.p[0]) * d2[1] - (b.p[1] - a.p[1]) * d2[0]) / den;
  return [a.p[0] + d1[0] * t, a.p[1] + d1[1] * t];
}

/** Ngũ giác → tứ giác: bỏ cạnh ngắn nhất, giao hai cạnh kề nó để khôi phục góc bị che. */
function cornerFromFive(p) {
  const len = (i) => dist(p[i], p[(i + 1) % 5]);
  let k = 0;
  for (let i = 1; i < 5; i++) if (len(i) < len(k)) k = i;
  const a0 = p[(k + 4) % 5], a1 = p[k], b0 = p[(k + 2) % 5], b1 = p[(k + 1) % 5];
  const d1 = [a1[0] - a0[0], a1[1] - a0[1]], d2 = [b1[0] - b0[0], b1[1] - b0[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b0[0] - a0[0]) * d2[1] - (b0[1] - a0[1]) * d2[0]) / den;
  const x = [a0[0] + d1[0] * t, a0[1] + d1[1] * t];
  const q = [];
  for (let i = 0; i < 5; i++) {
    if (i === k) q.push(x);
    else if (i !== (k + 1) % 5) q.push(p[i]);
  }
  return q;
}

/**
 * Tìm tứ giác trang giấy. Trả về { quad: 4 điểm [tl, tr, br, bl] theo toạ độ ảnh gốc,
 * sure: 4 cạnh đều khớp đường biên } hoặc null nếu không tìm được.
 */
export function detectDocument(cv, c) {
  const { canvas, S } = scaled(c, 900);
  const W = canvas.width, H = canvas.height;
  const src = cv.imread(canvas);
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat(), tmp = new cv.Mat();
  const k3 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  let found = [];
  let blocked = {};
  const raw = new cv.Mat(); // cạnh Canny gộp, chưa làm dày, cho Hough
  const support = new cv.Mat(); // bản đồ cạnh tổng hợp để kiểm tra 4 cạnh của từng ứng viên
  const paperMask = new cv.Mat(); // vùng sáng, ít màu (giấy)
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    // (1) Cạnh Canny với ngưỡng theo độ sáng trung vị
    const med = median(blur);
    for (const [lo, hi] of [[0.5 * med, 1.2 * med], [0.25 * med, 0.7 * med], [12, 36]]) {
      cv.Canny(blur, edges, Math.max(10, lo), Math.max(30, hi));
      if (raw.empty()) edges.copyTo(raw); else cv.bitwise_or(raw, edges, raw);
      cv.dilate(edges, tmp, k3, new cv.Point(-1, -1), 2);
      if (support.empty()) tmp.copyTo(support); else cv.bitwise_or(support, tmp, support);
      quadsFrom(cv, tmp, W, H, found);
    }
    // (1b) Đường thẳng dài (Hough): tìm được mép giấy cả khi viền đứt quãng, nền trắng,
    // hoặc giấy có hoa văn dày làm đường bao bị dính vào bên trong
    // làm dày 1 lần: cạnh mảnh hơi nghiêng bị chia phiếu giữa các ô (ρ, θ) nên Hough bỏ sót
    cv.dilate(raw, raw, k3);
    blocked = houghQuads(cv, raw, W, H, found);
    // (2) Cạnh màu: giấy trắng trên nền sáng thường chỉ khác nhau về sắc độ
    const hsv = new cv.Mat(), ch = new cv.MatVector();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    cv.split(hsv, ch);
    const sat = ch.get(1), val = ch.get(2);
    // (3) Vùng "giấy": sáng và ít màu → ngưỡng Otsu → đóng lỗ (chữ) → đường bao
    const paper = new cv.Mat();
    cv.subtract(val, sat, paper);
    cv.GaussianBlur(paper, paper, new cv.Size(7, 7), 0);
    cv.threshold(paper, tmp, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const k15 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
    cv.morphologyEx(tmp, tmp, cv.MORPH_CLOSE, k15);
    cv.morphologyEx(tmp, tmp, cv.MORPH_OPEN, k15);
    tmp.copyTo(paperMask);
    quadsFrom(cv, tmp, W, H, found);
    cv.GaussianBlur(sat, sat, new cv.Size(5, 5), 0);
    cv.Canny(sat, edges, 15, 45);
    cv.dilate(edges, tmp, k3, new cv.Point(-1, -1), 2);
    cv.bitwise_or(support, tmp, support);
    quadsFrom(cv, tmp, W, H, found);
    free(hsv, ch, sat, val, paper, k15);
    // Mỗi cạnh của trang thật phải nằm trên đường biên ảnh: đo tỉ lệ điểm trên cạnh trùng biên
    for (const f of found) {
      // cạnh nằm trên mép ảnh: không có đường biên để đo, thay bằng tỉ lệ giấy chạm mép ảnh
      f.border = 0;
      const sides = [0, 1, 2, 3].map((i) => {
        const a = f.q[i], b = f.q[(i + 1) % 4], e = onBorder(a, b, W, H);
        if (e) { f.border++; if (blocked[e.side]) f.blocked = true; }
        return e ? edgeSupport(paperMask, ...e) : edgeSupport(support, a, b);
      });
      f.min = Math.min(...sides);
      f.mean = sides.reduce((a, b) => a + b, 0) / 4;
      f.out = paperOutside(cv, paperMask, f.q);
      f.skew = skew(f.q);
    }
  } finally {
    free(src, gray, blur, edges, tmp, k3, raw, support, paperMask);
  }
  // bỏ khung tựa vào mép ảnh trong khi mép giấy thật ở phía đó đã thấy rõ
  if (found.some((f) => !f.blocked)) found = found.filter((f) => !f.blocked);
  if (!found.length) return null;
  // khung cắt ngang tờ giấy thì ngay bên ngoài khung vẫn còn giấy → trừ điểm mạnh
  // hai cạnh đối diện lệch nhau quá 10° → phối cảnh vô lý (thường do bắt nhầm bóng đổ) → trừ điểm
  const score = (f) => f.area * Math.min(1, f.fill + 0.15) * (0.25 + f.mean) * (f.min >= 0.45 ? 1 : 0.3) * Math.max(0.05, 1 - 2.5 * f.out) * Math.max(0.05, 1 - Math.max(0, f.skew - 10) / 12);
  for (const f of found) f.score = score(f);
  found.sort((a, b) => b.score - a.score);
  let best = found[0];
  // khung dùng mép ảnh chỉ thắng khi không có khung nào khớp đủ 4 đường biên thật:
  // nền trắng cũng "giống giấy" nên dễ bị nhận nhầm là giấy tràn ra ngoài
  if (best.border) {
    const real = found.find((f) => !f.border && f.min >= 0.45);
    if (real && real.score >= best.score * 0.4) best = real;
  }
  return { quad: best.q.map(([x, y]) => [x / S, y / S]), sure: best.min >= 0.45 };
}

/** Cạnh a→b nằm sát một mép ảnh? Trả về đoạn lùi vào trong 3 điểm ảnh để đo, hoặc null. */
function onBorder(a, b, W, H) {
  const tx = W * 0.015, ty = H * 0.015, d = 3;
  const r = (side, p, q) => Object.assign([p, q], { side });
  if (a[1] < ty && b[1] < ty) return r('top', [a[0], d], [b[0], d]);
  if (a[1] > H - 1 - ty && b[1] > H - 1 - ty) return r('bottom', [a[0], H - 1 - d], [b[0], H - 1 - d]);
  if (a[0] < tx && b[0] < tx) return r('left', [d, a[1]], [d, b[1]]);
  if (a[0] > W - 1 - tx && b[0] > W - 1 - tx) return r('right', [W - 1 - d, a[1]], [W - 1 - d, b[1]]);
  return null;
}

/** Độ lệch góc (độ) lớn nhất giữa hai cặp cạnh đối diện. */
function skew(q) {
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const diff = (x, y) => { let d = Math.abs(x - y) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return (d * 180) / Math.PI; };
  return Math.max(diff(ang(q[0], q[1]), ang(q[3], q[2])), diff(ang(q[0], q[3]), ang(q[1], q[2])));
}

/** Tỉ lệ điểm "giấy" trong dải hẹp ngay bên ngoài tứ giác. */
function paperOutside(cv, mask, q) {
  const band = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1), inner = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
  const pts = cv.matFromArray(4, 1, cv.CV_32SC2, q.flat().map(Math.round));
  const vec = new cv.MatVector();
  vec.push_back(pts);
  const t = Math.max(4, Math.round(Math.min(mask.rows, mask.cols) * 0.05));
  cv.polylines(band, vec, true, new cv.Scalar(255), t);
  cv.fillPoly(inner, vec, new cv.Scalar(255));
  cv.subtract(band, inner, band);
  const n = cv.countNonZero(band);
  cv.bitwise_and(band, mask, band);
  const r = n ? cv.countNonZero(band) / n : 0;
  free(band, inner, pts, vec);
  return r;
}

/** Tỉ lệ điểm trên đoạn p→q (bỏ 8% hai đầu) rơi vào vùng biên. */
function edgeSupport(m, p, q) {
  const n = 60;
  let hit = 0, tot = 0;
  for (let i = 0; i <= n; i++) {
    const t = 0.08 + (0.84 * i) / n;
    const x = Math.round(p[0] + (q[0] - p[0]) * t), y = Math.round(p[1] + (q[1] - p[1]) * t);
    if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
    tot++;
    if (m.ucharPtr(y, x)[0]) hit++;
  }
  return tot ? hit / tot : 0;
}

function median(m) {
  const hist = new Uint32Array(256);
  const d = m.data;
  for (let i = 0; i < d.length; i += 7) hist[d[i]]++;
  const half = Math.ceil(d.length / 7) / 2;
  let s = 0;
  for (let i = 0; i < 256; i++) { s += hist[i]; if (s >= half) return i; }
  return 128;
}

/**
 * Nắn tứ giác `q` thành hình chữ nhật. Tỉ lệ lấy theo độ dài cạnh; nếu gần tỉ lệ A4
 * (sai lệch < 12%) thì làm tròn về đúng A4. Cạnh dài tối đa `maxSide` điểm ảnh.
 */
export function warpDocument(cv, c, q, { maxSide = 2480, snapA4 = true, trim = 0.006 } = {}) {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), hh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const r = Math.max(w, hh) / Math.min(w, hh);
  if (snapA4 && Math.abs(r - Math.SQRT2) / Math.SQRT2 < 0.12) {
    if (w > hh) hh = w / Math.SQRT2; else w = hh / Math.SQRT2;
  }
  const s = Math.min(maxSide / Math.max(w, hh), 2);
  const W = Math.round(w * s), H = Math.round(hh * s);
  // cắt bớt một dải mỏng ở mép để bỏ phần mặt bàn còn sót
  const dx = W * trim, dy = H * trim;
  const src = cv.imread(c), dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [-dx, -dy, W + dx, -dy, W + dx, H + dy, -dx, H + dy]);
  const M = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(W, H), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    const o = document.createElement('canvas');
    cv.imshow(o, dst);
    return o;
  } finally {
    free(src, dst, from, to, M);
  }
}

/** Ảnh nền (ánh sáng) của từng kênh: xoá nét chữ bằng giãn nở rồi làm mượt, tính trên ảnh nhỏ. */
function background(cv, img) {
  const f = Math.min(1, 700 / Math.max(img.cols, img.rows));
  const small = new cv.Mat(), bg = new cv.Mat();
  cv.resize(img, small, new cv.Size(Math.round(img.cols * f), Math.round(img.rows * f)), 0, 0, cv.INTER_AREA);
  const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
  cv.dilate(small, small, k);
  cv.medianBlur(small, small, 21);
  cv.GaussianBlur(small, small, new cv.Size(0, 0), 6);
  cv.resize(small, bg, new cv.Size(img.cols, img.rows), 0, 0, cv.INTER_LINEAR);
  free(small, k);
  return bg;
}

/** Kéo mức đen/trắng: điểm sáng hơn `white` thành trắng tinh, tối hơn `black` thành đen. */
function levels(cv, m, black, white, gamma = 1) {
  const lut = new cv.Mat(1, 256, cv.CV_8UC1);
  for (let i = 0; i < 256; i++) lut.data[i] = Math.round(255 * Math.min(1, Math.max(0, (i - black) / (white - black))) ** gamma);
  cv.LUT(m, lut, m);
  lut.delete();
}

function unsharp(cv, m, amount, sigma) {
  const b = new cv.Mat();
  cv.GaussianBlur(m, b, new cv.Size(0, 0), sigma);
  cv.addWeighted(m, 1 + amount, b, -amount, 0, m);
  b.delete();
}

/**
 * Làm đẹp trang đã nắn.
 * mode: 'auto' (màu, nền trắng sạch, giữ dấu đỏ) | 'gray' | 'bw' | 'original'
 * Trả về { canvas, bw } — bw = true khi ảnh chỉ còn hai màu đen/trắng.
 */
export function enhanceDocument(cv, c, mode = 'auto') {
  if (mode === 'original') return { canvas: c, bw: false };
  const rgba = cv.imread(c), out = new cv.Mat();
  const long = Math.max(c.width, c.height);
  try {
    if (mode === 'auto') {
      const rgb = new cv.Mat(), den = new cv.Mat();
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
      // khử nhiễu hạt nhưng giữ cạnh chữ
      cv.bilateralFilter(rgb, den, 5, 28, 5);
      // chia cho ảnh nền: hết bóng đổ, hết vùng tối/cháy sáng, nền về trắng
      const ch = new cv.MatVector();
      cv.split(den, ch);
      const norm = new cv.MatVector();
      for (let i = 0; i < 3; i++) {
        const x = ch.get(i), bg = background(cv, x), y = new cv.Mat();
        cv.divide(x, bg, y, 255);
        norm.push_back(y);
        free(x, bg, y);
      }
      cv.merge(norm, rgb);
      free(ch, norm);
      // nền giấy và hoa văn in chìm nhạt → trắng; chữ đậm hơn; vùng gần trắng bỏ ám màu,
      // màu đậm (dấu đỏ, chữ ký xanh) giữ nguyên
      const lab = new cv.Mat(), lch = new cv.MatVector();
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
      cv.split(lab, lch);
      const L = lch.get(0);
      paperLevels(cv, L);
      lch.set(0, L);
      cv.merge(lch, lab);
      const d = lab.data;
      for (let i = 0; i < d.length; i += 3) {
        const k = Math.min(1, Math.max(0, (250 - d[i]) / 70));
        d[i + 1] = 128 + (d[i + 1] - 128) * k;
        d[i + 2] = 128 + (d[i + 2] - 128) * k;
      }
      cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
      free(lab, lch, L);
      unsharp(cv, rgb, 0.8, long / 1400);
      cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
      free(rgb, den);
      return { canvas: show(cv, out), bw: false };
    }
    const gray = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const bg = background(cv, gray);
    cv.divide(gray, bg, gray, 255);
    bg.delete();
    if (mode === 'gray') {
      cv.bilateralFilter(gray, out, 5, 25, 5);
      paperLevels(cv, out);
      unsharp(cv, out, 0.8, long / 1400);
      gray.delete();
      return { canvas: show(cv, out), bw: false };
    }
    // Đen trắng: ngưỡng thích ứng theo vùng, rồi xoá hạt nhiễu lấm tấm và viền đen ở mép
    // làm trắng nền và hoa văn in chìm trước, rồi mới lấy ngưỡng thích ứng
    paperLevels(cv, gray);
    cv.medianBlur(gray, gray, 3);
    const block = 2 * Math.round(long / 90) + 1;
    cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 12);
    gray.delete();
    despeckle(cv, out);
    return { canvas: show(cv, out), bw: true };
  } finally {
    free(rgba, out);
  }
}

/**
 * Kéo mức theo nội dung: ngưỡng Otsu tách chữ khỏi nền; mọi thứ sáng hơn điểm trắng
 * (nền giấy, hoa văn in chìm nhạt, vân giấy) thành trắng tinh. Trả về điểm trắng đã dùng.
 */
function paperLevels(cv, L) {
  const t = new cv.Mat();
  const otsu = cv.threshold(L, t, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  t.delete();
  // điểm trắng = chân trái của đỉnh "giấy" trong biểu đồ sáng: giấy sạch (đỉnh hẹp) giữ được chữ nhạt,
  // giấy có hoa văn in chìm (đỉnh rộng) thì hoa văn bị đẩy về trắng
  const h = new Float64Array(256), d = L.data;
  for (let i = 0; i < d.length; i++) h[d[i]]++;
  const sm = (i) => (h[Math.max(0, i - 2)] + h[Math.max(0, i - 1)] + h[i] + h[Math.min(255, i + 1)] + h[Math.min(255, i + 2)]) / 5;
  let peak = otsu;
  for (let i = otsu; i < 256; i++) if (sm(i) > sm(peak)) peak = i;
  let foot = peak;
  while (foot > otsu && sm(foot - 1) >= sm(peak) * 0.1) foot--;
  const wp = Math.round(Math.min(peak - 6, Math.max(170, foot - 5)));
  levels(cv, L, 20, wp, 1.15);
  return wp;
}

function show(cv, m) {
  const o = document.createElement('canvas');
  cv.imshow(o, m);
  return o;
}

function despeckle(cv, bin) {
  const inv = new cv.Mat(), labels = new cv.Mat(), stats = new cv.Mat(), cent = new cv.Mat();
  cv.bitwise_not(bin, inv);
  const n = cv.connectedComponentsWithStats(inv, labels, stats, cent, 8, cv.CV_32S);
  const W = bin.cols, H = bin.rows;
  const minArea = Math.max(3, Math.round(W * H * 1.5e-6));
  const kill = new Uint8Array(n);
  for (let i = 1; i < n; i++) {
    const x = stats.intAt(i, cv.CC_STAT_LEFT), y = stats.intAt(i, cv.CC_STAT_TOP);
    const w = stats.intAt(i, cv.CC_STAT_WIDTH), h = stats.intAt(i, cv.CC_STAT_HEIGHT), a = stats.intAt(i, cv.CC_STAT_AREA);
    const edge = x === 0 || y === 0 || x + w >= W || y + h >= H;
    // hạt nhỏ, hoặc mảng tối dính mép (bóng, mặt bàn còn sót) dài quá 1/4 cạnh
    if (a < minArea || (edge && (w > W * 0.25 || h > H * 0.25))) kill[i] = 1;
  }
  const L = labels.data32S, d = bin.data;
  for (let p = 0; p < L.length; p++) if (kill[L[p]]) d[p] = 255;
  free(inv, labels, stats, cent);
}
