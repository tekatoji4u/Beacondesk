// Chuyển tệp giữa các công cụ (và nhận tệp chia sẻ / mở từ ứng dụng khác).
let pending = [];
export const handoff = {
  put(files) { pending = [...files]; },
  take() { const f = pending; pending = []; return f; },
  has() { return pending.length > 0; },
};

/** Đưa tệp đang chờ vào vùng chọn tệp đầu tiên đang hiển thị trong `root`. */
export function feedVisible(root) {
  if (!handoff.has() || !root) return;
  const drop = [...root.querySelectorAll('.drop')].find((d) => d.offsetParent !== null && d._give);
  if (drop) drop._give(handoff.take());
}
