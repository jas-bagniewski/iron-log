// One-time TM recalibration endpoint (2026-08-20).
// GET /api/recalibrate?t=<shareToken> -> applies the same guarded migration
// as applyTMRecalibration in index.html, but server-side against KV, so the
// corrected TMs reach devices stuck on a cached old bundle.
//
// Auth: requires the current share token (proof of possession, same primitive
// as /api/share). Idempotent: guarded by the synced tmRecal20260820 flag AND
// an exact-value match (bench 255 / press 140), so it can never fire twice or
// clobber a manual edit. Safe to remove after it has run once.

const KV_KEY = "iron-log:state:v1";

function findUpstashEnv() {
  const env = process.env;
  const urlKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_URL$|UPSTASH_REDIS_REST_URL$/.test(k));
  const tokenKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_TOKEN$|UPSTASH_REDIS_REST_TOKEN$/.test(k));
  return { url: urlKey ? env[urlKey] : null, token: tokenKey ? env[tokenKey] : null };
}

async function kvGet(url, token) {
  const r = await fetch(`${url}/get/${KV_KEY}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  const { url, token: kvToken } = findUpstashEnv();
  if (!url || !kvToken) return res.status(500).json({ error: "Upstash/KV env vars not found" });
  const token = req.query.t;
  if (!token || typeof token !== "string" || token.length < 8) return res.status(400).json({ error: "missing token" });
  try {
    const state = await kvGet(url, kvToken);
    if (!state || !state.shareToken || state.shareToken !== token) return res.status(404).json({ error: "not found" });

    if (state.tmRecal20260820) {
      return res.status(200).json({ applied: false, reason: "already applied", trainingMaxes: state.trainingMaxes });
    }
    const tms = state.trainingMaxes;
    if (!tms || tms.bench !== 255 || tms.press !== 140) {
      const next = { ...state, tmRecal20260820: true };
      await kvSet(url, kvToken, next);
      return res.status(200).json({ applied: false, reason: "values changed manually; flag set", trainingMaxes: tms });
    }
    const nextTMs = { ...tms, bench: 225, press: 120 };
    const next = {
      ...state,
      trainingMaxes: nextTMs,
      trainingMaxesHistory: [
        { date: new Date().toISOString(), ...nextTMs, source: "recalibration" },
        ...(state.trainingMaxesHistory || []),
      ].slice(0, 500),
      tmRecal20260820: true,
    };
    await kvSet(url, kvToken, next);
    return res.status(200).json({ applied: true, from: tms, to: nextTMs });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
