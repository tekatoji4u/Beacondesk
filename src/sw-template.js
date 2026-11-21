/* BeaconDesk service worker — cho phép chạy khi mất mạng.
   Tệp này được scripts/gen-sw.mjs điền danh sách tệp khi build. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const LAZY = __LAZY__;
const APP_CACHE = 'bd-app-' + VERSION;
const OCR_CACHE = 'bd-ocr-v1'; // tách riêng: không phải tải lại OCR mỗi lần cập nhật giao diện

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('bd-app-') && k !== APP_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data?.type === 'cache-all') cacheAll(e.ports[0], e.data.core);
});

// core: tên tệp lõi OCR hợp với máy (simd / relaxedsimd / thường) — chỉ tải một bản (~4 MB)
async function cacheAll(port, core) {
  try {
    const list = LAZY.filter((u) => !/tesseract-core-/.test(u) || !core || u.endsWith('/' + core));
    const c = await caches.open(OCR_CACHE);
    let done = 0;
    for (const u of list) {
      const url = new URL(u, self.registration.scope).href;
      if (!(await c.match(url, { ignoreVary: true }))) {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error('Không tải được ' + u);
        await c.put(url, r);
      }
      port.postMessage({ type: 'progress', done: ++done, total: list.length });
    }
    // bảo đảm phần giao diện cũng đủ
    const app = await caches.open(APP_CACHE);
    await app.addAll(PRECACHE);
    port.postMessage({ type: 'done' });
  } catch (err) {
    port.postMessage({ type: 'error', message: err.message });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Nhận tệp chia sẻ từ ứng dụng khác (Web Share Target).
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const c = await caches.open('bd-share');
      for (const k of await c.keys()) await c.delete(k);
      let i = 0;
      for (const f of form.getAll('files')) {
        if (!(f instanceof File)) continue;
        await c.put(new Request(`./__shared/${i++}`), new Response(f, { headers: { 'content-type': f.type, 'x-name': encodeURIComponent(f.name) } }));
      }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Bản một tệp HTML (~13 MB) để tải về: không lưu vào bộ nhớ đệm.
  if (url.pathname.includes('/download/')) return;

  // Điều hướng trang: ưu tiên mạng (lấy bản mới), mất mạng thì dùng bản đã lưu.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        return r;
      } catch {
        return (await caches.match('./', { ignoreSearch: true, ignoreVary: true })) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Tệp OCR: lấy từ cache, chưa có thì tải và lưu lại.
  if (url.pathname.includes('/ocr/') || url.pathname.includes('heic2any')) {
    e.respondWith((async () => {
      const c = await caches.open(OCR_CACHE);
      const hit = await c.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    })());
    return;
  }

  // Còn lại: cache trước, mạng sau (tệp có mã băm nên an toàn).
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && r.type === 'basic') (await caches.open(APP_CACHE)).put(req, r.clone());
      return r;
    } catch {
      return Response.error();
    }
  })());
});
