import { route } from '../lib/runtime.js';

export default route(['GET'], async () => ({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null }));
