// index.js
const express = require('express');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('Missing GITHUB_WEBHOOK_SECRET env var — refusing to start.');
  process.exit(1);
}

// repoUrl (normalized) -> Set of live sockets registered for that repo
const registry = new Map();

function normalizeRepoUrl(url) {
  return url.trim().replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}

function verifySignature(req) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false; // length mismatch etc.
  }
}

app.get('/health', (req, res) => res.status(200).send('ok'));

app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) return res.status(401).send('bad signature');

  const event = req.headers['x-github-event'];
  if (event !== 'push') return res.status(202).send('ignored');

  const repoUrl = normalizeRepoUrl(req.body.repository.html_url);
  const sockets = registry.get(repoUrl);

  if (sockets && sockets.size > 0) {
    const payload = JSON.stringify({ type: 'push', data: req.body });
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  res.status(200).send('ok');
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Relay listening on ${port}`));

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let registeredRepo = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'register' && typeof msg.repoUrl === 'string') {
      registeredRepo = normalizeRepoUrl(msg.repoUrl);
      if (!registry.has(registeredRepo)) registry.set(registeredRepo, new Set());
      registry.get(registeredRepo).add(ws);
    }
  });

  ws.on('close', () => {
    if (registeredRepo) registry.get(registeredRepo)?.delete(ws);
  });
});