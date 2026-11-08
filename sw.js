// Önce ağdan dener, olmazsa önbellekten açar: güncellemeler hemen gelir, internet yokken de açılır.
// Ayrıca yaklaşan tarihler için bildirim gösterir (bir gün önce ve o gün).
const CACHE = 'kisi-defteri-v3';
const DATA = 'kd-data';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const REM_URL = new URL('__kd/reminders', self.registration.scope).toString();
const SHOWN_URL = new URL('__kd/shown', self.registration.scope).toString();

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/__kd/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});

/* ---------- hatırlatmalar ---------- */
async function readJSON(url, fallback){
  try { const c = await caches.open(DATA); const r = await c.match(url); return r ? await r.json() : fallback; } catch(e){ return fallback; }
}
async function writeJSON(url, v){
  const c = await caches.open(DATA);
  await c.put(url, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } }));
}
function parse(s){ const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function nextOcc(s, yearly, today){
  const d = parse(s); if (!yearly) return d;
  let n = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (n < today) n = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return n;
}
async function checkReminders(){
  if (self.Notification && Notification.permission !== 'granted') return;
  const items = await readJSON(REM_URL, []);
  const shown = await readJSON(SHOWN_URL, {});
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const it of items){
    if (!it || !it.date) continue;
    const occ = nextOcc(it.date, it.yearly, today);
    const n = Math.round((occ - today) / 86400000);
    if (n !== 0 && n !== 1) continue;
    const key = `${it.key}@${occ.getFullYear()}-${occ.getMonth() + 1}-${occ.getDate()}#${n}`;
    if (shown[key]) continue;
    let body = it.text;
    if (it.birthday){
      const age = occ.getFullYear() - parse(it.date).getFullYear();
      body = `Doğum günü, ${age} yaşına giriyor`;
    }
    await self.registration.showNotification(`${n === 0 ? 'Bugün' : 'Yarın'}: ${it.name}`, {
      body, tag: key, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './' }
    });
    shown[key] = Date.now();
  }
  const cutoff = Date.now() - 90 * 86400000;
  for (const k of Object.keys(shown)) if (shown[k] < cutoff) delete shown[k];
  await writeJSON(SHOWN_URL, shown);
}
self.addEventListener('periodicsync', e => { if (e.tag === 'kd-reminders') e.waitUntil(checkReminders()); });
self.addEventListener('message', e => { if (e.data === 'check') e.waitUntil(checkReminders()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
