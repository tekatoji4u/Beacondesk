// Khung kéo 4 góc trên ảnh (dùng chung cho Scan → PDF và Ghép 2 mặt thẻ).
import { h } from './ui.js';

/**
 * it: { c: canvas ảnh gốc, quad: [[x,y]×4], full }.
 * onMove: gọi khi đang kéo; onDone: gọi khi thả (nên cập nhật xem trước ở đây).
 * Trả về { el, sync } — gọi sync() sau khi tự đổi it.quad.
 */
export function quadEditor(it, { onMove, onDone, alt = 'Ảnh gốc' } = {}) {
  const W = it.c.width, H = it.c.height;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const r = Math.max(W, H) / 45;
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('class', 'quad');
  poly.setAttribute('stroke-width', String(r / 4));
  svg.append(poly);
  const dots = it.quad.map((p, k) => {
    const d = document.createElementNS(NS, 'circle');
    d.setAttribute('r', String(r));
    d.setAttribute('class', 'quad-dot');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', ['Góc trên trái', 'Góc trên phải', 'Góc dưới phải', 'Góc dưới trái'][k]);
    svg.append(d);
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const b = svg.getBoundingClientRect();
        it.quad[k] = [Math.max(0, Math.min(W, (ev.clientX - b.left) * W / b.width)), Math.max(0, Math.min(H, (ev.clientY - b.top) * H / b.height))];
        it.full = false;
        sync();
        onMove?.();
      };
      const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); onDone?.(); };
      d.addEventListener('pointermove', move);
      d.addEventListener('pointerup', up);
    });
    d.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? W / 20 : W / 100;
      const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
      if (!dx && !dy) return;
      e.preventDefault();
      it.quad[k] = [Math.max(0, Math.min(W, it.quad[k][0] + dx)), Math.max(0, Math.min(H, it.quad[k][1] + dy))];
      it.full = false;
      sync();
      onDone?.();
    });
    return d;
  });
  function sync() {
    poly.setAttribute('points', it.quad.map((p) => p.join(',')).join(' '));
    it.quad.forEach((p, k) => { dots[k].setAttribute('cx', p[0]); dots[k].setAttribute('cy', p[1]); });
  }
  sync();
  const img = h('img', { src: it.c.toDataURL('image/jpeg', 0.8), alt });
  return { el: h('div', { class: 'quad-stage' }, img, svg), sync };
}
