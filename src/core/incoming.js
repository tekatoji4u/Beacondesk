// Nhận tệp mở từ hệ điều hành ("Mở bằng BeaconDesk") hoặc chia sẻ từ ứng dụng khác.
import { handoff } from './handoff.js';
import { ext, toast } from './ui.js';

function routeFor(files) {
  const e = ext(files[0]?.name);
  if (e === 'pdf') return '#/pdf';
  if (e === 'docx' || e === 'txt') return '#/check';
  if (/^(png|jpe?g|webp|heic|heif)$/.test(e)) return '#/ocr';
  return '#/pdf';
}

export function deliver(files) {
  if (!files.length) return;
  handoff.put(files);
  const target = routeFor(files);
  toast(`Đã nhận ${files.length} tệp: ${files[0].name}${files.length > 1 ? '…' : ''}`);
  if (location.hash === target) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function listenIncoming() {
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      const files = await Promise.all(params.files.map((fh) => fh.getFile()));
      deliver(files);
    });
  }
  // Share Target: service worker đã cất tệp vào cache "bd-share".
  if (new URLSearchParams(location.search).has('shared') && 'caches' in self) {
    (async () => {
      const c = await caches.open('bd-share');
      const keys = await c.keys();
      const files = [];
      for (const k of keys) {
        const r = await c.match(k);
        const name = decodeURIComponent(r.headers.get('x-name') || 'tep');
        files.push(new File([await r.blob()], name, { type: r.headers.get('content-type') || '' }));
        await c.delete(k);
      }
      history.replaceState(null, '', location.pathname + location.hash);
      deliver(files);
    })().catch((e) => console.warn('share', e));
  }
}
