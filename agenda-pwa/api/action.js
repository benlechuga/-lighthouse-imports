import { handleAction } from '../lib/core.js';
import { redis, pusher, route } from '../lib/runtime.js';

export default route(['POST'], (req) => handleAction(redis(), pusher(), req.body, Date.now()));
