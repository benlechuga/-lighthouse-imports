import { handleSync } from '../lib/core.js';
import { redis, route } from '../lib/runtime.js';

export default route(['POST'], (req) => handleSync(redis(), req.body, Date.now()));
