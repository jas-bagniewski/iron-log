// Owner-only sync endpoint.
// GET  -> returns the stored state JSON ({state: null} if empty)
// POST -> writes the request body as the stored state
//
// Auth: x-sync-secret header (or ?secret= query) must equal env SYNC_SECRET.
// Storage: Upstash Redis REST API. Accepts either the legacy Vercel KV names
// (KV_REST_API_URL/TOKEN) or the marketplace-Upstash names
// (UPSTASH_REDIS_REST_URL/TOKEN), or any prefixed variant Vercel injects
// (e.g. <STORE>_KV_REST_API_URL).

const KV_KEY = "iron-log:state:v1";

function findUpstashEnv() {
  const env = process.env;
  const urlKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_URL$|UPSTASH_REDIS_REST_URL$/.test(k));
  const tokenKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_TOKEN$|UPSTASH_REDIS_REST_TOKEN$/.test(k));
  return { url: urlKey ? env[urlKey] : null, token: tokenKey ? env[tokenKey] : null };
}

async function kvGet(url, token) {
  const r = await fetch(`${url}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv get ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function kvSet(url, token, value) {
  const r = await fetch(`${url}/set/${KV_KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`kv set ${r.status}`);
}

export default async function handler(req, res) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: "SYNC_SECRET not configured" });

  const { url, token } = findUpstashEnv();
  if (!url || !token) return res.status(500).json({ error: "Upstash/KV env vars not found" });

  const provided = req.headers["x-sync-secret"] || req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: "unauthorized" });

  try {
    if (req.method === "GET") {
      const state = await kvGet(url, token);
      return res.status(200).json({ state });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "bad body" });
      await kvSet(url, token, body);
      return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
