// Lưu trữ cục bộ trên thiết bị (IndexedDB) — không gửi đi đâu.
// Dùng cho: hồ sơ cơ quan / người ký, chữ ký đã vẽ, lịch sử tệp gần đây, cài đặt AI.
const DB = 'beacondesk';
const VER = 1;
let dbp;

function db() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('recent')) d.createObjectStore('recent', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function kvGet(key, def = null) {
  try {
    const v = await tx('kv', 'readonly', (s) => req2p(s.get(key)));
    return v === undefined ? def : v;
  } catch { return def; }
}
export async function kvSet(key, value) {
  try { await tx('kv', 'readwrite', (s) => s.put(value, key)); } catch (e) { console.warn('kvSet', e); }
}
export async function kvDel(key) {
  try { await tx('kv', 'readwrite', (s) => s.delete(key)); } catch { /* bỏ qua */ }
}

const RECENT_MAX = 12;
const RECENT_MAX_BYTES = 60 * 1024 * 1024;

/** Lưu tệp kết quả gần đây (tối đa 12 tệp / 60 MB). */
export async function addRecent(outs, tool) {
  try {
    if (!(await kvGet('keepRecent', true))) return;
    for (const o of outs) {
      if (o.blob.size > 40 * 1024 * 1024) continue;
      await tx('recent', 'readwrite', (s) => s.add({ name: o.name, blob: o.blob, size: o.blob.size, type: o.blob.type, tool, at: Date.now() }));
    }
    const all = await listRecent();
    let total = 0;
    const drop = [];
    all.forEach((r, i) => { total += r.size; if (i >= RECENT_MAX || total > RECENT_MAX_BYTES) drop.push(r.id); });
    if (drop.length) await tx('recent', 'readwrite', (s) => drop.forEach((id) => s.delete(id)));
  } catch (e) { console.warn('recent', e); }
}
export async function listRecent() {
  try {
    const all = await tx('recent', 'readonly', (s) => req2p(s.getAll()));
    return (all || []).sort((a, b) => b.at - a.at);
  } catch { return []; }
}
export async function clearRecent() {
  try { await tx('recent', 'readwrite', (s) => s.clear()); } catch { /* bỏ qua */ }
}

// Cài đặt nhẹ trong localStorage (chỉ là tuỳ chọn giao diện).
export function pref(key, def) {
  try { const v = localStorage.getItem('bd-' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
export function setPref(key, v) {
  try { localStorage.setItem('bd-' + key, JSON.stringify(v)); } catch { /* bỏ qua */ }
}
