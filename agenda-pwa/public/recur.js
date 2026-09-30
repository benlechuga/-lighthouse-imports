// Cálculo de ocorrências e lembretes. Módulo puro (sem DOM), usado pelo app e pelo servidor.
// Um evento guarda o horário "de parede" local (start = "YYYY-MM-DDTHH:mm") e o fuso vem à parte,
// assim "todo dia às 9h" continua às 9h mesmo com horário de verão.

const DAY = 86400000;

function tzOffsetMs(utcMs, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converte data/hora local (mês 1-12) no fuso `tz` para milissegundos UTC. */
export function localToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = tzOffsetMs(guess, tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off) utc = guess - off2;
  return utc;
}

export function parseStart(start) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(start || '');
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

/** k-ésima ocorrência (k=0 é a original), em ms UTC. */
export function occurrence(ev, tz, k) {
  const s = parseStart(ev.start);
  if (!s) return NaN;
  switch (ev.repeat) {
    case 'daily':
    case 'weekly': {
      const t = new Date(Date.UTC(s.y, s.mo - 1, s.d + k * (ev.repeat === 'daily' ? 1 : 7)));
      return localToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), s.h, s.mi, tz);
    }
    case 'monthly': {
      const idx = s.mo - 1 + k;
      const y = s.y + Math.floor(idx / 12);
      const m = (((idx % 12) + 12) % 12) + 1;
      return localToUtc(y, m, Math.min(s.d, dim(y, m)), s.h, s.mi, tz);
    }
    case 'yearly': {
      const y = s.y + k;
      return localToUtc(y, s.mo, Math.min(s.d, dim(y, s.mo)), s.h, s.mi, tz);
    }
    default:
      return k === 0 ? localToUtc(s.y, s.mo, s.d, s.h, s.mi, tz) : NaN;
  }
}

function startIndex(ev, tz, nowMs) {
  const s = parseStart(ev.start);
  const base = Date.UTC(s.y, s.mo - 1, s.d, s.h, s.mi);
  const diff = nowMs - base;
  const per = { daily: DAY, weekly: 7 * DAY, monthly: 28 * DAY, yearly: 365 * DAY }[ev.repeat];
  return Math.max(0, Math.floor(diff / per) - 2);
}

/** Primeira ocorrência com início >= nowMs (para eventos sem repetição, a própria data). */
export function nextOccurrence(ev, tz, nowMs) {
  if (!ev.repeat || ev.repeat === 'none') return occurrence(ev, tz, 0);
  for (let k = startIndex(ev, tz, nowMs), n = 0; n < 5000; k++, n++) {
    const o = occurrence(ev, tz, k);
    if (o >= nowMs) return o;
  }
  return NaN;
}

/**
 * Próximo lembrete a disparar: ocorrência ainda não iniciada cujo horário de aviso
 * (início - antecedência) é posterior ao último lembrete já enviado (`sentMs`).
 * Se o aviso já passou mas o evento ainda não começou, dispara agora (ver `at` no chamador).
 */
export function nextReminder(ev, tz, nowMs, sentMs = 0) {
  const lead = (ev.lead || 0) * 60000;
  const once = !ev.repeat || ev.repeat === 'none';
  const first = once ? 0 : startIndex(ev, tz, nowMs);
  for (let k = first, n = 0; n < (once ? 1 : 5000); k++, n++) {
    const occAt = occurrence(ev, tz, k);
    if (!(occAt > nowMs)) continue;
    const fireAt = occAt - lead;
    if (fireAt > sentMs) return { fireAt, occAt };
  }
  return null;
}
