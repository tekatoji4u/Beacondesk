// Tìm 4 góc trang giấy trong ảnh chụp (cách dự phòng khi OpenCV không tìm chắc được).

/** Tìm tứ giác trang giấy. Trả về 4 điểm [tl, tr, br, bl] theo toạ độ ảnh gốc. */
export function detectQuad(c) {
  const S = Math.min(1, 420 / Math.max(c.width, c.height));
  const w = Math.max(20, Math.round(c.width * S)), h = Math.max(20, Math.round(c.height * S));
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  const g = t.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(2px)';
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    // giấy: sáng và ít màu
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const v = Math.max(0, Math.min(255, (r * 0.3 + gg * 0.59 + b * 0.11) - (Math.max(r, gg, b) - Math.min(r, gg, b)) * 0.5));
    gray[j] = v; hist[v | 0]++;
  }
  // ngưỡng Otsu
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = gray.length - wB; if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  // vùng sáng liên thông lớn nhất
  const lab = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestN = 0;
  const stack = [];
  for (let s = 0, id = 0; s < gray.length; s++) {
    if (gray[s] <= thr || lab[s] !== -1) continue;
    let n = 0; stack.push(s); lab[s] = id;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && lab[q] === -1 && gray[q] > thr) { lab[q] = id; stack.push(q); }
      }
    }
    if (n > bestN) { bestN = n; bestId = id; }
    id++;
  }
  const full = [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]];
  if (bestN < w * h * 0.12 || bestN > w * h * 0.985) return inset(full, c, 0.02);
  // góc = điểm cực trị theo x+y và x−y
  let tl, tr, br, bl, a = Infinity, b2 = -Infinity, c1 = -Infinity, d1 = Infinity;
  for (let p = 0; p < lab.length; p++) {
    if (lab[p] !== bestId) continue;
    const x = p % w, y = (p / w) | 0;
    if (x + y < a) { a = x + y; tl = [x, y]; }
    if (x + y > b2) { b2 = x + y; br = [x, y]; }
    if (x - y > c1) { c1 = x - y; tr = [x, y]; }
    if (x - y < d1) { d1 = x - y; bl = [x, y]; }
  }
  // vùng tìm được phải gần giống một tứ giác lồi, nếu không thì để người dùng tự chỉnh
  const q = [tl, tr, br, bl];
  let area = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; area += x1 * y2 - x2 * y1; }
  area = Math.abs(area) / 2;
  if (area < w * h * 0.12 || bestN / area < 0.88) return inset(full, c, 0.02);
  return q.map(([x, y]) => [x / S, y / S]);
}
function inset(q, c, f) {
  const dx = c.width * f, dy = c.height * f;
  return [[q[0][0] + dx, q[0][1] + dy], [q[1][0] - dx, q[1][1] + dy], [q[2][0] - dx, q[2][1] - dy], [q[3][0] + dx, q[3][1] - dy]];
}
