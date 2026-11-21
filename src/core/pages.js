// Trình xem trang PDF dạng ảnh thu nhỏ.
//  - mode 'select'  : bấm để chọn / bỏ chọn trang
//  - mode 'organize': kéo thả để sắp xếp, xoay, xoá, nhân bản từng trang
// Dùng được bằng chuột, bút và ngón tay (giữ 0,35 giây để kéo trên màn hình cảm ứng).
import { h, pagesToText } from './ui.js';
import { icon } from './icons.js';
import { openPdfjs, renderPage } from './pdf.js';

export function pageGrid({ mode = 'select', multi = true, onChange } = {}) {
  let doc = null;
  let items = []; // {src: chỉ số trang gốc, rot: độ xoay thêm, del: bool, sel: bool, el}
  const grid = h('div', { class: 'pages', role: 'listbox', 'aria-multiselectable': String(multi) });
  const info = h('span', { class: 'small' });
  const tb = h('div', { class: 'pages-toolbar' });
  const el = h('div', { hidden: true }, tb, grid);
  let observer;

  const changed = () => {
    const n = items.filter((i) => !i.del).length;
    if (mode === 'select') {
      const s = items.filter((i) => i.sel).length;
      info.textContent = s ? `Đã chọn ${s}/${items.length} trang` : `${items.length} trang · bấm vào trang để chọn`;
    } else {
      info.textContent = `${n} trang${items.length !== n ? ` (bỏ ${items.length - n})` : ''} · kéo thả để đổi thứ tự`;
    }
    onChange?.();
  };

  function toolbar() {
    const b = (label, fn, ico) => h('button', { type: 'button', class: 'btn btn-sm', onclick: fn }, ico ? h('span', { html: icon(ico), style: 'display:contents' }) : null, label);
    if (mode === 'select') {
      tb.replaceChildren(
        b('Chọn tất cả', () => setSel(() => true)), b('Bỏ chọn', () => setSel(() => false)),
        b('Trang lẻ', () => setSel((i) => i % 2 === 0)), b('Trang chẵn', () => setSel((i) => i % 2 === 1)), info);
    } else {
      tb.replaceChildren(
        b('Xoay tất cả', () => { items.forEach((it) => { it.rot = (it.rot + 90) % 360; paintRot(it); }); changed(); }, 'rotate'),
        b('Đảo thứ tự', () => { items.reverse(); relayout(); changed(); }),
        b('Khôi phục', () => { items.sort((a, c) => a.src - c.src || a.dup - c.dup); items = items.filter((i) => !i.dup); items.forEach((i) => { i.rot = 0; i.del = false; paintRot(i); i.el.classList.remove('del'); }); relayout(); changed(); }),
        info);
    }
  }
  function setSel(fn) {
    items.forEach((it, i) => { it.sel = fn(i); it.el.classList.toggle('sel', it.sel); it.el.setAttribute('aria-selected', String(it.sel)); });
    changed();
  }
  function paintRot(it) {
    const c = it.el.querySelector('canvas');
    if (c) c.style.transform = `rotate(${it.rot}deg)`;
  }
  function relayout() {
    grid.replaceChildren(...items.map((it) => it.el));
    items.forEach((it, i) => { it.el.querySelector('.no').textContent = `${it.src + 1}${it.dup ? ' (bản sao)' : ''}${mode === 'organize' && i !== it.src ? ' → ' + (i + 1) : ''}`; });
  }

  function makeTile(it) {
    const pv = h('div', { class: 'pv' });
    const no = h('span', { class: 'no' }, String(it.src + 1));
    const tile = h('div', { class: 'page', role: 'option', 'aria-selected': 'false', tabindex: '0', 'aria-label': `Trang ${it.src + 1}` }, pv, no);
    it.el = tile;
    tile._it = it;
    if (mode === 'select') {
      const toggle = () => {
        if (!multi) items.forEach((o) => { if (o !== it) { o.sel = false; o.el.classList.remove('sel'); } });
        it.sel = !it.sel; tile.classList.toggle('sel', it.sel); tile.setAttribute('aria-selected', String(it.sel)); changed();
      };
      tile.addEventListener('click', toggle);
      tile.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    } else {
      const btn = (ico, label, fn) => h('button', { type: 'button', 'aria-label': label, title: label, html: icon(ico), onclick: (e) => { e.stopPropagation(); fn(); } });
      tile.append(h('div', { class: 'tools' },
        btn('rotateL', 'Xoay trái', () => { it.rot = (it.rot + 270) % 360; paintRot(it); changed(); }),
        btn('rotate', 'Xoay phải', () => { it.rot = (it.rot + 90) % 360; paintRot(it); changed(); }),
        btn('copy', 'Nhân bản trang', () => { const c = { ...it, dup: (it.dup || 0) + 1, el: null }; makeTile(c); items.splice(items.indexOf(it) + 1, 0, c); relayout(); c.rot = it.rot; paintClone(it, c); changed(); }),
        btn('trash', 'Xoá / giữ lại', () => { it.del = !it.del; tile.classList.toggle('del', it.del); changed(); })));
      tile.addEventListener('keydown', (e) => {
        const i = items.indexOf(it);
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && i > 0) { items.splice(i, 1); items.splice(i - 1, 0, it); relayout(); tile.focus(); changed(); e.preventDefault(); }
        if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && i < items.length - 1) { items.splice(i, 1); items.splice(i + 1, 0, it); relayout(); tile.focus(); changed(); e.preventDefault(); }
        if (e.key === 'Delete') { it.del = !it.del; tile.classList.toggle('del', it.del); changed(); }
      });
      enableDrag(tile);
    }
    observer?.observe(tile);
    return tile;
  }
  function paintClone(from, to) {
    const src = from.el.querySelector('canvas');
    if (!src) return;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    to.el.querySelector('.pv').replaceChildren(c);
    to.rendered = true;
    paintRot(to);
  }

  // ---- kéo thả bằng pointer events ----
  let drag = null;
  function enableDrag(tile) {
    tile.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const start = { x: e.clientX, y: e.clientY };
      const begin = () => {
        drag = { tile, id: e.pointerId };
        tile.classList.add('dragging');
        try { tile.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
        navigator.vibrate?.(15);
      };
      if (e.pointerType === 'touch') {
        const t = setTimeout(begin, 350);
        const cancel = (ev) => {
          if (ev.type === 'pointermove' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
          clearTimeout(t);
          tile.removeEventListener('pointermove', cancel);
          tile.removeEventListener('pointerup', cancel);
        };
        tile.addEventListener('pointermove', cancel);
        tile.addEventListener('pointerup', cancel);
      } else {
        const mv = (ev) => {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) { tile.removeEventListener('pointermove', mv); begin(); }
        };
        tile.addEventListener('pointermove', mv);
        tile.addEventListener('pointerup', () => tile.removeEventListener('pointermove', mv), { once: true });
      }
    });
    tile.addEventListener('pointermove', (e) => {
      if (!drag || drag.tile !== tile) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.page');
      grid.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
      if (over && over !== tile && grid.contains(over)) over.classList.add('drop-before');
      // tự cuộn khi kéo gần mép
      const r = grid.getBoundingClientRect();
      if (e.clientY < r.top + 40) grid.scrollTop -= 12; else if (e.clientY > r.bottom - 40) grid.scrollTop += 12;
    });
    const end = (e) => {
      if (!drag || drag.tile !== tile) return;
      const over = grid.querySelector('.drop-before');
      grid.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
      tile.classList.remove('dragging');
      drag = null;
      if (over && e.type === 'pointerup') {
        const it = tile._it, target = over._it;
        items.splice(items.indexOf(it), 1);
        items.splice(items.indexOf(target), 0, it);
        relayout();
        changed();
      }
    };
    tile.addEventListener('pointerup', end);
    tile.addEventListener('pointercancel', end);
  }
  // chặn cuộn trang khi đang kéo bằng ngón tay
  grid.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  async function renderTile(it) {
    if (it.rendered || !doc) return;
    it.rendered = true;
    try {
      const p = await doc.getPage(it.src + 1);
      const base = p.getViewport({ scale: 1 });
      const scale = 150 / Math.max(base.width, base.height);
      const c = await renderPage(p, scale * (window.devicePixelRatio > 1 ? 1.6 : 1));
      c.style.maxWidth = '100%';
      it.el.querySelector('.pv').replaceChildren(c);
      paintRot(it);
    } catch { it.rendered = false; }
  }

  return {
    el,
    async load(file) {
      el.hidden = false;
      grid.replaceChildren(h('p', { class: 'small', style: 'grid-column:1/-1' }, 'Đang tạo ảnh thu nhỏ…'));
      doc?.destroy?.();
      doc = await openPdfjs(file);
      items = [...Array(doc.numPages).keys()].map((src) => ({ src, rot: 0, del: false, sel: false, dup: 0 }));
      observer?.disconnect();
      observer = 'IntersectionObserver' in window
        ? new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) renderTile(en.target._it); }), { root: grid, rootMargin: '200px' })
        : null;
      toolbar();
      grid.replaceChildren(...items.map(makeTile));
      if (!observer) items.forEach(renderTile);
      changed();
      return doc.numPages;
    },
    clear() { el.hidden = true; doc?.destroy?.(); doc = null; items = []; grid.replaceChildren(); },
    get count() { return items.length; },
    /** Chỉ số các trang đang chọn (mode select), theo thứ tự trang. */
    selected() { return items.filter((i) => i.sel).map((i) => i.src); },
    selectedText() { return pagesToText(this.selected()); },
    setSelected(idx) { const s = new Set(idx); setSel((i) => s.has(i)); },
    /** Kết quả sắp xếp (mode organize): [{src, rot}] đã bỏ trang bị xoá. */
    plan() { return items.filter((i) => !i.del).map((i) => ({ src: i.src, rot: i.rot })); },
    get pdfjsDoc() { return doc; },
  };
}
