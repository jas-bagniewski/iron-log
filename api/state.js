// Owner-only sync endpoint.
// GET  -> returns the stored state JSON ({state: null} if empty)
// POST -> writes the request body as the stored state
//
// Auth: x-sync-secret header (or ?secret= query) must equal env SYNC_SECRET.
// Storage: Vercel KV / Upstash Redis REST API (KV_REST_API_URL, KV_REST_API_TOKEN).

const KV_KEY = "iron-log:state:v1";

async function kvGet() {
  const r = await fetch(`${process.env.KV_REST_API_URL}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv get ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function kvSet(value) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/set/${KV_KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`kv set ${r.status}`);
}

export default async function handler(req, res) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: "SYNC_SECRET not configured" });
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: "KV not configured" });
  }

  const provided = req.headers["x-sync-secret"] || req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: "unauthorized" });

  try {
    if (req.method === "GET") {
      const state = await kvGet();
      return res.status(200).json({ state });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "bad body" });
      await kvSet(body);
      return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
