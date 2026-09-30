import { nextOccurrence } from './recur.js';

const $ = (s) => document.querySelector(s);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ls = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- estado ----------
let uid = ls.get('uid', null);
if (!uid) { uid = crypto.randomUUID(); ls.set('uid', uid); }
let events = ls.get('events', []);
let query = '';
let editingId = null;

// O Service Worker precisa do uid para os botões Concluir/Adiar da notificação.
caches.open('agenda-meta').then((c) => c.put('/__uid', new Response(uid))).catch(() => {});

const save = () => ls.set('events', events);
const live = () => events.filter((e) => !e.deleted);

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const when = (e) => nextOccurrence(e, TZ, Date.now() - 15 * 60000);
const fmt = (ms) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// ---------- render ----------
function render() {
  const now = Date.now();
  const q = query.trim().toLowerCase();
  const items = live()
    .filter((e) => !q || e.title.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q))
    .map((e) => ({ e, at: when(e) }))
    .sort((a, b) => a.at - b.at);

  const groups = [
    ['Atrasados', items.filter((x) => !x.e.done && x.at < now && !sameDay(x.at, now))],
    ['Hoje', items.filter((x) => !x.e.done && sameDay(x.at, now))],
    ['Próximos', items.filter((x) => !x.e.done && x.at >= now && !sameDay(x.at, now))],
    ['Concluídos', items.filter((x) => x.e.done).reverse()],
  ];
  const list = $('#list');
  list.replaceChildren();
  for (const [name, rows] of groups) {
    if (!rows.length) continue;
    const h = document.createElement('h2'); h.textContent = name;
    const g = document.createElement('div'); g.className = 'group';
    for (const { e, at } of rows) g.append(row(e, at, at < now && !e.done));
    list.append(h, g);
  }
  $('#empty').hidden = live().length > 0;
}

function row(e, at, late) {
  const el = document.createElement('div');
  el.className = 'item' + (e.done ? ' done' : '');
  const chk = document.createElement('button');
  chk.className = 'check'; chk.textContent = e.done ? '✓' : '';
  chk.disabled = e.repeat !== 'none';
  chk.title = chk.disabled ? 'Eventos repetidos não são concluídos' : 'Concluir';
  chk.onclick = (ev) => { ev.stopPropagation(); update(e.id, { done: !e.done }); };
  const b = document.createElement('div'); b.className = 'body';
  const t = document.createElement('div'); t.className = 't'; t.textContent = e.title;
  const m = document.createElement('div'); m.className = 'm' + (late ? ' late' : '');
  m.textContent = fmt(at) + (e.repeat !== 'none' ? ' ↻' : '') + (e.lead ? ' 🔔' : '');
  b.append(t, m);
  el.append(chk, b);
  el.onclick = () => openEditor(e.id);
  return el;
}

// ---------- CRUD ----------
function update(id, patch) {
  const e = events.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch, { updatedAt: Date.now() });
  commit();
}
function commit() { save(); render(); scheduleSync(); }

// ---------- editor ----------
const dlg = $('#dlg');
function openEditor(id) {
  editingId = id;
  const e = id && events.find((x) => x.id === id);
  $('#dlgTitle').textContent = e ? 'Editar' : 'Novo';
  $('#fTitle').value = e?.title ?? '';
  $('#fNotes').value = e?.notes ?? '';
  $('#fStart').value = e?.start ?? toLocalInput(new Date(Math.ceil((Date.now() + 3600000) / 900000) * 900000));
  $('#fRepeat').value = e?.repeat ?? 'none';
  $('#fLead').value = String(e?.lead ?? 10);
  $('#del').hidden = !e;
  dlg.showModal();
}
$('#add').onclick = () => openEditor(null);
$('#cancel').onclick = () => dlg.close();
$('#del').onclick = () => { if (editingId) update(editingId, { deleted: true }); dlg.close(); };
$('#form').onsubmit = (ev) => {
  ev.preventDefault();
  const data = {
    title: $('#fTitle').value.trim(), notes: $('#fNotes').value.trim(), start: $('#fStart').value,
    repeat: $('#fRepeat').value, lead: +$('#fLead').value,
  };
  if (!data.title || !data.start) return;
  if (data.repeat !== 'none') data.done = false;
  if (editingId) update(editingId, data);
  else { events.push({ id: crypto.randomUUID(), done: false, deleted: false, updatedAt: Date.now(), ...data }); commit(); }
  dlg.close();
};
$('#q').oninput = (e) => { query = e.target.value; render(); };

// ---------- sincronização ----------
let timer = null, inflight = false, again = false;
const dot = (cls) => { $('#sync').className = 'sync ' + cls; };
function scheduleSync() { clearTimeout(timer); timer = setTimeout(sync, 400); }

async function sync() {
  if (inflight) { again = true; return; }
  inflight = true; again = false;
  try {
    const sub = await currentSub();
    const r = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, tz: TZ, sub: sub ? sub.toJSON() : undefined, events }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    const data = await r.json();
    // mescla: vence a versão mais recente de cada evento (edições feitas durante o envio não se perdem)
    const map = new Map(data.events.map((e) => [e.id, e]));
    for (const e of events) { const s = map.get(e.id); if (!s || e.updatedAt > s.updatedAt) map.set(e.id, e); }
    events = [...map.values()];
    save(); render(); dot('ok'); serverSubscribed = data.subscribed; updateBanner();
  } catch (err) {
    console.warn('sync', err); dot('err');
  } finally {
    inflight = false;
    if (again) scheduleSync();
  }
}

// ---------- notificações push ----------
let serverSubscribed = false;
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSub() {
  if (!pushOk || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const b64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return updateBanner();
  const { vapidPublicKey } = await (await fetch('/api/config')).json();
  if (!vapidPublicKey) return alert('Servidor sem chave VAPID configurada.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidPublicKey) }));
  await sync();
  updateBanner(sub);
}

async function testPush() {
  const r = await fetch('/api/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, action: 'test' }),
  });
  if (!r.ok) alert((await r.json().catch(() => ({}))).error || 'Falha no teste');
}

async function updateBanner() {
  const b = $('#banner');
  b.className = 'banner'; b.replaceChildren();
  const say = (html, cls) => { b.hidden = false; if (cls) b.classList.add(cls); const p = document.createElement('div'); p.innerHTML = html; b.append(p); };
  const btn = (label, fn, pill) => { const x = document.createElement('button'); x.textContent = label; if (pill) x.className = 'pill'; x.onclick = fn; b.append(x); };

  if (isIOS && !isStandalone) {
    say('Para receber notificações (e no Apple Watch), instale o app: toque em <b>Compartilhar</b> ⎋ → <b>Adicionar à Tela de Início</b> e abra por lá.', 'warn');
  } else if (!pushOk) {
    say('Este navegador não suporta notificações push.', 'warn');
  } else if (Notification.permission === 'denied') {
    say('Notificações bloqueadas. Ative em Ajustes → Notificações → Agenda.', 'warn');
  } else if (Notification.permission !== 'granted') {
    say('Ative as notificações para receber lembretes no iPhone e no Apple Watch.');
    btn('Ativar notificações', enablePush, true);
  } else if (!(await currentSub()) || !serverSubscribed) {
    say('Finalizando ativação das notificações…');
    btn('Tentar de novo', enablePush, true);
  } else {
    b.hidden = true;
    return;
  }
  b.hidden = false;
}

// ---------- inicialização ----------
render();
updateBanner();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then(() => sync());
else sync();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sync(); } });
addEventListener('online', sync);
setInterval(render, 60000);
// Rodapé discreto para testar o envio
$('#sync').onclick = () => { if (confirm('Enviar notificação de teste?')) testPush(); };
