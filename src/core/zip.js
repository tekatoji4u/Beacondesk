import JSZip from 'jszip';

/** Đóng gói nhiều kết quả thành một tệp ZIP (tự tránh trùng tên). */
export async function zipOutputs(outs, { onProgress } = {}) {
  const z = new JSZip();
  const used = new Set();
  for (const o of outs) {
    let n = o.name, i = 2;
    while (used.has(n.toLowerCase())) n = o.name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
    used.add(n.toLowerCase());
    z.file(n, o.blob);
  }
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress?.(m.percent));
}
