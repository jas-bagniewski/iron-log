// PT read-only share endpoint.
// GET /api/share?t=<token> -> returns a filtered, read-only view of the state.
//
// The token is stored inside the synced state itself (state.shareToken). Rotating
// the token from the owner's Settings invalidates old share URLs immediately.

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

function publicView(s) {
  if (!s) return null;
  return {
    trainingMaxes: s.trainingMaxes,
    cycle: s.cycle,
    week: s.week,
    completedThisWeek: s.completedThisWeek,
    accessoryLog: s.accessoryLog,
    history: Array.isArray(s.history) ? s.history.slice(0, 50) : [],
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  const { url, token: kvToken } = findUpstashEnv();
  if (!url || !kvToken) return res.status(500).json({ error: "Upstash/KV env vars not found" });
  const token = req.query.t;
  if (!token || typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "missing token" });
  }
  try {
    const state = await kvGet(url, kvToken);
    if (!state || !state.shareToken || state.shareToken !== token) {
      return res.status(404).json({ error: "not found" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ state: publicView(state) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
