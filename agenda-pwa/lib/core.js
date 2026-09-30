// Lógica do servidor, independente de Vercel/Redis (o banco e o envio de push são injetados).
import { nextReminder, nextOccurrence } from '../public/recur.js';

export const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[\w-]{1,64}$/;
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const SNOOZE_MS = 10 * 60000;
const TOMBSTONE_MS = 30 * 86400000;
const GIVE_UP_MS = 3 * 3600000;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const emptyDoc = () => ({ subs: [], tz: 'UTC', events: {}, pending: {}, sent: {} });

export async function loadDoc(db, uid) {
  const [raw] = await db.run([['GET', `user:${uid}`]]);
  return raw ? { ...emptyDoc(), ...JSON.parse(raw) } : emptyDoc();
}

const saveOp = (uid, doc) => ['SET', `user:${uid}`, JSON.stringify(doc)];

function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function sanitizeEvent(e) {
  if (!e || typeof e !== 'object' || !ID_RE.test(String(e.id))) return null;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(e.start)) return null;
  const lead = Number.isFinite(+e.lead) ? Math.min(Math.max(Math.round(+e.lead), 0), 10080) : 0;
  return {
    id: String(e.id),
    title: String(e.title ?? '').slice(0, 200),
    notes: String(e.notes ?? '').slice(0, 2000),
    start: e.start,
    repeat: REPEATS.includes(e.repeat) ? e.repeat : 'none',
    lead,
    done: !!e.done && (e.repeat ?? 'none') === 'none',
    deleted: !!e.deleted,
    updatedAt: Number.isFinite(+e.updatedAt) ? +e.updatedAt : 0,
  };
}

/** Recalcula o lembrete de um evento; devolve as operações de Redis correspondentes. */
function schedule(uid, doc, id, now) {
  const ev = doc.events[id];
  const member = `${uid}|${id}`;
  const r = ev && !ev.deleted && !ev.done ? nextReminder(ev, doc.tz, now, doc.sent[id] || 0) : null;
  if (!r) {
    delete doc.pending[id];
    return [['ZREM', 'due', member]];
  }
  const at = Math.max(r.fireAt, now);
  doc.pending[id] = { fireAt: r.fireAt, occAt: r.occAt, at };
  return [['ZADD', 'due', String(at), member]];
}

export async function handleSync(db, body, now) {
  const { uid } = body || {};
  if (!UID_RE.test(uid || '')) throw new HttpError(400, 'uid inválido');
  if (!Array.isArray(body.events) || body.events.length > 500) throw new HttpError(400, 'events inválido');

  const doc = await loadDoc(db, uid);
  let all = false;
  if (body.tz && validTz(body.tz) && body.tz !== doc.tz) { doc.tz = body.tz; all = true; }

  const changed = new Set();
  for (const raw of body.events) {
    const ev = sanitizeEvent(raw);
    if (!ev) continue;
    const cur = doc.events[ev.id];
    if (!cur || ev.updatedAt > cur.updatedAt) {
      doc.events[ev.id] = ev;
      delete doc.sent[ev.id]; // evento editado: os lembretes valem de novo
      changed.add(ev.id);
    }
  }
  for (const [id, ev] of Object.entries(doc.events)) {
    if (ev.deleted && now - ev.updatedAt > TOMBSTONE_MS) {
      delete doc.events[id]; delete doc.sent[id];
      changed.add(id);
    }
  }

  const sub = body.sub;
  if (sub && typeof sub.endpoint === 'string' && sub.keys?.p256dh && sub.keys?.auth) {
    doc.subs = [sub, ...doc.subs.filter((s) => s.endpoint !== sub.endpoint)].slice(0, 5);
  }

  const ops = [];
  for (const id of Object.keys(doc.events)) {
    if (all || changed.has(id) || !doc.pending[id]) ops.push(...schedule(uid, doc, id, now));
  }
  for (const id of changed) if (!doc.events[id]) ops.push(['ZREM', 'due', `${uid}|${id}`]);
  await db.run([saveOp(uid, doc), ...ops]);
  return { events: Object.values(doc.events), subscribed: doc.subs.length > 0 };
}

export function buildPayload(ev, tz, pending) {
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    .format(new Date(pending.occAt));
  const mins = Math.round((pending.occAt - Date.now()) / 60000);
  const when = mins > 1 ? `Começa às ${time} (em ${mins} min)` : `Agora · ${time}`;
  return {
    title: ev.title || 'Compromisso',
    body: ev.notes ? `${when}\n${ev.notes}` : when,
    tag: ev.id,
    eventId: ev.id,
  };
}

async function sendAll(doc, payload, push) {
  let ok = 0, transient = false;
  const dead = new Set();
  for (const sub of doc.subs) {
    try { await push(sub, payload); ok++; }
    catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(sub.endpoint);
      else transient = true;
    }
  }
  if (dead.size) doc.subs = doc.subs.filter((s) => !dead.has(s.endpoint));
  return { ok, transient };
}

export async function runCron(db, push, now) {
  const [due] = await db.run([['ZRANGEBYSCORE', 'due', '-inf', String(now), 'LIMIT', '0', '200']]);
  const byUid = new Map();
  for (const m of due || []) {
    const [uid, id] = m.split('|');
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(id);
  }
  let sent = 0;
  for (const [uid, ids] of byUid) {
    const doc = await loadDoc(db, uid);
    const ops = [];
    for (const id of ids) {
      const p = doc.pending[id];
      const ev = doc.events[id];
      if (!p || !ev || ev.deleted || ev.done) { delete doc.pending[id]; ops.push(['ZREM', 'due', `${uid}|${id}`]); continue; }
      if (p.at > now) { ops.push(['ZADD', 'due', String(p.at), `${uid}|${id}`]); continue; }
      const r = await sendAll(doc, buildPayload(ev, doc.tz, p), push);
      if (r.ok === 0 && r.transient && now - p.at < GIVE_UP_MS) continue; // tenta de novo no próximo minuto
      if (r.ok) sent++;
      doc.sent[id] = Math.max(doc.sent[id] || 0, p.fireAt);
      ops.push(...schedule(uid, doc, id, now));
    }
    await db.run([saveOp(uid, doc), ...ops]);
  }
  return { due: due?.length || 0, sent };
}

export async function handleAction(db, push, body, now) {
  const { uid, eventId, action } = body || {};
  if (!UID_RE.test(uid || '')) throw new HttpError(400, 'uid inválido');
  const doc = await loadDoc(db, uid);

  if (action === 'test') {
    if (!doc.subs.length) throw new HttpError(409, 'Nenhum dispositivo registrado para notificações');
    const r = await sendAll(doc, { title: 'Agenda', body: 'Notificações funcionando ✔ (aparecem também no Apple Watch)', tag: 'test' }, push);
    await db.run([saveOp(uid, doc)]);
    if (!r.ok) throw new HttpError(502, 'Falha ao enviar a notificação de teste');
    return { ok: true };
  }

  const ev = doc.events[eventId];
  if (!ev || ev.deleted) throw new HttpError(404, 'Evento não encontrado');
  const member = `${uid}|${eventId}`;

  if (action === 'done') {
    if (ev.repeat !== 'none') return { ok: true, ignored: true };
    ev.done = true; ev.updatedAt = now;
    await db.run([saveOp(uid, doc), ...schedule(uid, doc, eventId, now)]);
    return { ok: true };
  }
  if (action === 'snooze') {
    const p = doc.pending[eventId];
    doc.pending[eventId] = {
      fireAt: p?.fireAt ?? (doc.sent[eventId] || now),
      occAt: p?.occAt ?? nextOccurrence(ev, doc.tz, now),
      at: now + SNOOZE_MS,
      snooze: true,
    };
    await db.run([saveOp(uid, doc), ['ZADD', 'due', String(now + SNOOZE_MS), member]]);
    return { ok: true, at: now + SNOOZE_MS };
  }
  throw new HttpError(400, 'ação inválida');
}
