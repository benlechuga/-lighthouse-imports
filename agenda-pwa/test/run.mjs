import assert from 'node:assert/strict';
import { localToUtc, occurrence, nextReminder } from '../public/recur.js';
import { handleSync, handleAction, runCron } from '../lib/core.js';

// Redis falso em memória (só os comandos usados).
function fakeDb() {
  const kv = new Map(), z = new Map();
  return {
    kv, z,
    async run(cmds) {
      return cmds.map(([c, ...a]) => {
        switch (c) {
          case 'GET': return kv.get(a[0]) ?? null;
          case 'SET': kv.set(a[0], a[1]); return 'OK';
          case 'ZADD': z.set(a[2], +a[1]); return 1;
          case 'ZREM': return z.delete(a[1]) ? 1 : 0;
          case 'ZRANGEBYSCORE': return [...z].filter(([, s]) => s <= +a[2]).map(([m]) => m);
          default: throw new Error('cmd ' + c);
        }
      });
    },
  };
}
const uid = '11111111-2222-3333-4444-555555555555';
const min = 60000;
const sub = { endpoint: 'https://push.example/1', keys: { p256dh: 'x', auth: 'y' } };
const pushes = [];
const push = async (s, p) => { pushes.push(p); };
const ev = (o) => ({ id: 'e1', title: 'Dentista', notes: '', start: '2030-06-01T15:00', repeat: 'none', lead: 10, done: false, deleted: false, updatedAt: 1, ...o });

// --- fuso e horário de verão ---
assert.equal(localToUtc(2030, 6, 1, 15, 0, 'America/Sao_Paulo'), Date.UTC(2030, 5, 1, 18, 0));
const ny = { start: '2030-03-01T09:00', repeat: 'daily' };
const before = occurrence(ny, 'America/New_York', 0);                 // 09:00 EST = 14:00Z
const after = occurrence(ny, 'America/New_York', 20);                  // 21/03 já em EDT = 13:00Z
assert.equal(before, Date.UTC(2030, 2, 1, 14, 0));
assert.equal(after, Date.UTC(2030, 2, 21, 13, 0));
assert.equal(occurrence({ start: '2030-01-31T08:00', repeat: 'monthly' }, 'UTC', 1), Date.UTC(2030, 1, 28, 8, 0)); // fev clampa
assert.equal(nextReminder(ev({}), 'UTC', Date.UTC(2031, 0, 1)), null);

// --- fluxo completo: sync -> cron -> não repete ---
{
  const db = fakeDb();
  const start = Date.UTC(2030, 5, 1, 18, 0); // 15:00 em São Paulo
  await handleSync(db, { uid, tz: 'America/Sao_Paulo', sub, events: [ev({})] }, start - 60 * min);
  assert.equal(db.z.get(`${uid}|e1`), start - 10 * min);
  let r = await runCron(db, push, start - 11 * min);
  assert.equal(r.sent, 0);
  r = await runCron(db, push, start - 10 * min);
  assert.equal(r.sent, 1);
  assert.equal(pushes.at(-1).title, 'Dentista');
  assert.match(pushes.at(-1).body, /15:00/);
  r = await runCron(db, push, start + min);
  assert.equal(r.sent, 0);
  assert.equal(db.z.size, 0, 'evento único não reagenda');
}

// --- evento com aviso já vencido dispara imediatamente ---
{
  const db = fakeDb(); pushes.length = 0;
  const start = Date.UTC(2030, 5, 1, 18, 0);
  await handleSync(db, { uid, tz: 'UTC', sub, events: [ev({ start: '2030-06-01T18:00' })] }, start - 3 * min);
  assert.equal(db.z.get(`${uid}|e1`), start - 3 * min);
  assert.equal((await runCron(db, push, start - 3 * min)).sent, 1);
}

// --- repetição diária reagenda para o dia seguinte ---
{
  const db = fakeDb(); pushes.length = 0;
  const d0 = Date.UTC(2030, 5, 1, 12, 0);
  await handleSync(db, { uid, tz: 'UTC', sub, events: [ev({ start: '2030-06-01T12:00', repeat: 'daily', lead: 0 })] }, d0 - min);
  await runCron(db, push, d0);
  assert.equal(pushes.length, 1);
  assert.equal(db.z.get(`${uid}|e1`), d0 + 86400000);
}

// --- adiar (snooze), concluir e edição ---
{
  const db = fakeDb(); pushes.length = 0;
  const t = Date.UTC(2030, 5, 1, 12, 0);
  await handleSync(db, { uid, tz: 'UTC', sub, events: [ev({ start: '2030-06-01T12:00', lead: 0 })] }, t - min);
  await runCron(db, push, t);
  await handleAction(db, push, { uid, eventId: 'e1', action: 'snooze' }, t + 1000);
  assert.equal((await runCron(db, push, t + 5 * min)).sent, 0);
  assert.equal((await runCron(db, push, t + 11 * min)).sent, 1);
  await handleAction(db, push, { uid, eventId: 'e1', action: 'snooze' }, t + 12 * min);
  await handleAction(db, push, { uid, eventId: 'e1', action: 'done' }, t + 13 * min);
  assert.equal((await runCron(db, push, t + 30 * min)).sent, 0);
  const s = await handleSync(db, { uid, tz: 'UTC', events: [] }, t + 31 * min);
  assert.equal(s.events[0].done, true);
  // cliente com versão mais antiga não sobrescreve
  const s2 = await handleSync(db, { uid, tz: 'UTC', events: [ev({ start: '2030-06-01T12:00', updatedAt: 0 })] }, t + 32 * min);
  assert.equal(s2.events[0].done, true);
}

// --- assinatura morta (410) é removida ---
{
  const db = fakeDb();
  const t = Date.UTC(2030, 5, 1, 12, 0);
  await handleSync(db, { uid, tz: 'UTC', sub, events: [ev({ start: '2030-06-01T12:00', lead: 0 })] }, t - min);
  await runCron(db, async () => { throw { statusCode: 410 }; }, t);
  assert.equal(JSON.parse(db.kv.get(`user:${uid}`)).subs.length, 0);
}

// --- validação ---
await assert.rejects(handleSync(fakeDb(), { uid: 'x', events: [] }, 0), /uid/);
console.log('ok — todos os testes passaram');
