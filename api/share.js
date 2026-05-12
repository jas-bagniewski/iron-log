// PT read-only share endpoint.
// GET /api/share?t=<token> -> returns a filtered, read-only view of the state.
//
// The token is stored inside the synced state itself (state.shareToken). Rotating
// the token from the owner's Settings invalidates old share URLs immediately.

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
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: "KV not configured" });
  }
  const token = req.query.t;
  if (!token || typeof token !== "string" || token.length < 8) {
    return res.status(400).json({ error: "missing token" });
  }
  try {
    const state = await kvGet();
    if (!state || !state.shareToken || state.shareToken !== token) {
      return res.status(404).json({ error: "not found" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ state: publicView(state) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
