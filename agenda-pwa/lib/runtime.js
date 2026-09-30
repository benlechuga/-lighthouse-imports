import webpush from 'web-push';
import { HttpError } from './core.js';

/** Cliente mínimo do Upstash Redis (REST). Aceita as variáveis da integração da Vercel (KV_*) ou da Upstash. */
export function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new HttpError(500, 'Redis não configurado (UPSTASH_REDIS_REST_URL / _TOKEN)');
  return {
    async run(cmds) {
      const r = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
      return (await r.json()).map((x) => {
        if (x.error) throw new Error(`Redis: ${x.error}`);
        return x.result;
      });
    },
  };
}

export function pusher() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new HttpError(500, 'Chaves VAPID não configuradas');
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return (sub, payload) => webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
}

/** Envolve um handler: só POST/GET permitidos, erros viram JSON. */
export function route(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'método não permitido');
      res.status(200).json(await fn(req));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e.message });
    }
  };
}
