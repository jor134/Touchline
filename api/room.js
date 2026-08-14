// Vercel serverless route for TOUCHLINE online rooms.
// Commit as: api/room.js   (pairs with Upstash KV / Vercel KV)
//
// Env vars required:  KV_REST_API_URL, KV_REST_API_TOKEN
//
// The game probes GET /api/room?key=tl_ping on boot. If this route answers,
// it switches from one-phone mode to online rooms automatically.

const BASE  = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const TTL   = 3600;                       // rooms expire after an hour
const SAFE  = /^[A-Za-z0-9_]{1,64}$/;     // keys: letters, digits, underscore only

async function kv(path, body) {
  const r = await fetch(`${BASE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!BASE || !TOKEN) {
    return res.status(503).json({ error: 'KV is not configured on this deployment.' });
  }

  try {
    if (req.method === 'GET') {
      const key = String(req.query.key || '');
      if (!SAFE.test(key)) return res.status(400).json({ error: 'Bad key.' });
      if (key === 'tl_ping') return res.status(200).json({ ok: true });
      const out = await kv(`get/${key}`);
      return res.status(200).json({ key, value: out.result ?? null });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!SAFE.test(String(key || ''))) return res.status(400).json({ error: 'Bad key.' });
      if (typeof value !== 'string' || value.length > 200000) {
        return res.status(400).json({ error: 'Bad value.' });
      }
      await kv(`set/${key}?EX=${TTL}`, [value]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  } catch (e) {
    return res.status(502).json({ error: 'Storage is unreachable.' });
  }
}
