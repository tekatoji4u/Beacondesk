// Đăng ký service worker (chạy offline), nút "Cài ứng dụng", báo có bản mới.
import { toast } from './ui.js';

let deferred = null;
let userAskedUpdate = false;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupPwa(installBtn) {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  addEventListener('appinstalled', () => { installBtn.hidden = true; deferred = null; toast('Đã cài BeaconDesk lên thiết bị.'); });
  installBtn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      installBtn.hidden = true;
    } else {
      location.hash = '#/settings';
    }
  });
  // iPhone/iPad không có sự kiện cài đặt: hiện nút dẫn tới hướng dẫn.
  if (isIOS() && !isStandalone()) installBtn.hidden = false;

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const onWaiting = (w) => {
      toast('Có phiên bản BeaconDesk mới.', '', { label: 'Cập nhật', fn: () => { userAskedUpdate = true; w.postMessage('skip-waiting'); } });
    };
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) onWaiting(w);
      });
    });
    // kiểm tra bản mới mỗi khi quay lại ứng dụng
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('SW', e));
  // Chỉ tải lại khi người dùng bấm "Cập nhật" — không làm mất công việc đang dở.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAskedUpdate && !reloaded) { reloaded = true; location.reload(); } });
}

/** Tải trước toàn bộ gói (gồm OCR) để dùng hoàn toàn khi mất mạng. */
export async function cacheEverything(onProgress) {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg?.active) throw new Error('Trình duyệt chưa sẵn sàng chế độ ngoại tuyến. Hãy tải lại trang rồi thử lại.');
  return new Promise((resolve, reject) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress?.(d.done, d.total);
      else if (d.type === 'done') resolve(d);
      else if (d.type === 'error') reject(new Error(d.message));
    };
    reg.active.postMessage({ type: 'cache-all' }, [ch.port2]);
  });
}

export async function offlineStatus() {
  if (!('caches' in self)) return { ready: false, ocr: false };
  const keys = await caches.keys();
  let ocr = false, core = false;
  for (const k of keys) {
    const c = await caches.open(k);
    if (await c.match(new URL('ocr/vie.traineddata.gz', location.href).href)) ocr = true;
    if ((await c.keys()).length > 5) core = true;
  }
  return { ready: core, ocr };
}
