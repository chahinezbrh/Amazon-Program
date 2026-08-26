// src/backend/config.ts
//
// Fixed values for FuncManager's own relay infrastructure. Same for every
// user/repo — not a secret from the user's machine, just not something that
// varies per connection, so it doesn't belong in .funcmanager/config.json.

export const RELAY_WEBHOOK_URL = 'https://funcmanager-relay.up.railway.app/webhook';
export const RELAY_WS_URL = 'wss://funcmanager-relay.up.railway.app/ws';
export const RELAY_WEBHOOK_SECRET = 'a-long-random-string-shared-with-the-relay-server';