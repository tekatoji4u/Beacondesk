// Tìm 4 góc trang giấy trong ảnh chụp và nắn phối cảnh về hình chữ nhật.

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

/** Ma trận đồng nhất 3×3 biến điểm (u,v) của hình chữ nhật đích sang điểm (x,y) trong ảnh nguồn. */
function homography(dst, src) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i], [x, y] = src[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); B.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); B.push(y);
  }
  // khử Gauss
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let k = i; k < 8; k++) A[r][k] -= f * A[i][k];
      B[r] -= f * B[i];
    }
  }
  return B.map((b, i) => b / A[i][i]).concat(1);
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Nắn tứ giác `q` của canvas `c` thành hình chữ nhật tỉ lệ A4 (tự chọn dọc/ngang). */
export function warpToA4(c, q, longSide = 2339) {
  const wTop = dist(q[0], q[1]), wBot = dist(q[3], q[2]), hL = dist(q[0], q[3]), hR = dist(q[1], q[2]);
  const land = (wTop + wBot) > (hL + hR) * 1.05;
  const W = land ? longSide : Math.round(longSide / Math.SQRT2), H = land ? Math.round(longSide / Math.SQRT2) : longSide;
  const m = homography([[0, 0], [W, 0], [W, H], [0, H]], q);
  const sd = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const o = document.createElement('canvas');
  o.width = W; o.height = H;
  const og = o.getContext('2d');
  const id = og.createImageData(W, H);
  const od = id.data, sw = c.width, sh = c.height;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = m[6] * u + m[7] * v + 1;
      const x = (m[0] * u + m[1] * v + m[2]) / z, y = (m[3] * u + m[4] * v + m[5]) / z;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const o4 = (v * W + u) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { od[o4] = od[o4 + 1] = od[o4 + 2] = od[o4 + 3] = 255; continue; }
      const fx = x - x0, fy = y - y0, i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let k = 0; k < 3; k++) {
        od[o4 + k] = (sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx) * (1 - fy) + (sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx) * fy;
      }
      od[o4 + 3] = 255;
    }
  }
  og.putImageData(id, 0, 0);
  return o;
}
