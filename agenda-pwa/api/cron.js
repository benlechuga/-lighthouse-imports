import { HttpError, runCron } from '../lib/core.js';
import { redis, pusher, route } from '../lib/runtime.js';

// Chamado a cada minuto por um agendador externo (cron-job.org). Protegido por CRON_SECRET.
export default route(['GET', 'POST'], async (req) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '') || req.query?.key;
  if (!secret || given !== secret) throw new HttpError(401, 'não autorizado');
  return runCron(redis(), pusher(), Date.now());
});
