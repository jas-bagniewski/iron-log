// Withings sync: pulls the latest weight + body fat % using stored tokens.
// Refreshes the access token if expired. Returns { weight_lb, body_fat_pct,
// fat_mass_kg, lean_mass_kg, measured_at, last_sync_at, connected } so the
// client can update bodyStats directly.

const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const MEASURE_URL = 'https://wbsapi.withings.net/measure';
const TOKEN_KEY = 'iron-log:withings:tokens:v1';

function findUpstashEnv() {
  const env = process.env;
  const urlKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_URL$|UPSTASH_REDIS_REST_URL$/.test(k));
  const tokenKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_TOKEN$|UPSTASH_REDIS_REST_TOKEN$/.test(k));
  return { url: urlKey ? env[urlKey] : null, token: tokenKey ? env[tokenKey] : null };
}

async function loadTokens(url, kvToken) {
  const r = await fetch(`${url}/get/${TOKEN_KEY}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`KV read ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function saveTokens(url, kvToken, tokens) {
  const r = await fetch(`${url}/set/${TOKEN_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
    body: JSON.stringify(tokens),
  });
  if (!r.ok) throw new Error(`KV write ${r.status}`);
}

async function refreshTokens(url, kvToken, tokens) {
  const form = new URLSearchParams({
    action: 'requesttoken',
    client_id: process.env.WITHINGS_CLIENT_ID,
    client_secret: process.env.WITHINGS_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const j = await r.json();
  if (j.status !== 0 || !j.body || !j.body.access_token) {
    throw new Error(`Withings refresh failed: ${j.error || JSON.stringify(j).slice(0, 200)}`);
  }
  const next = {
    access_token: j.body.access_token,
    refresh_token: j.body.refresh_token,
    userid: j.body.userid,
    scope: j.body.scope,
    expires_at: Date.now() + (j.body.expires_in * 1000) - 60_000,
    connected_at: tokens.connected_at,
  };
  await saveTokens(url, kvToken, next);
  return next;
}

const pickMeasure = (group, type) => {
  const m = group.measures.find((x) => x.type === type);
  if (!m) return null;
  return m.value * Math.pow(10, m.unit);
};

export default async function handler(req, res) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  const provided = req.headers['x-sync-secret'] || req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.WITHINGS_CLIENT_ID || !process.env.WITHINGS_CLIENT_SECRET) {
    return res.status(500).json({ error: 'WITHINGS_CLIENT_ID/SECRET not configured' });
  }
  const { url, token: kvToken } = findUpstashEnv();
  if (!url || !kvToken) return res.status(500).json({ error: 'KV not configured' });

  let tokens;
  try {
    tokens = await loadTokens(url, kvToken);
  } catch (e) {
    return res.status(500).json({ error: 'KV read failed', detail: e.message });
  }
  if (!tokens || !tokens.access_token) {
    return res.status(409).json({ error: 'not_connected', message: 'Tap Connect Withings first.' });
  }

  if (Date.now() >= (tokens.expires_at || 0)) {
    try {
      tokens = await refreshTokens(url, kvToken, tokens);
    } catch (e) {
      return res.status(401).json({ error: 'refresh_failed', detail: e.message });
    }
  }

  // types: 1 weight, 6 fat ratio %, 5 fat-free mass, 8 fat mass
  const measureForm = new URLSearchParams({
    action: 'getmeas',
    meastypes: '1,6,5,8',
    category: '1',
    lastupdate: '0',
  });
  let measureRes;
  try {
    measureRes = await fetch(`${MEASURE_URL}?${measureForm.toString()}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch (e) {
    return res.status(502).json({ error: 'withings_unreachable', detail: e.message });
  }
  const j = await measureRes.json().catch(() => null);
  if (!j || j.status !== 0) {
    // Token may have been revoked. Try one refresh+retry.
    if (j && (j.status === 401 || j.status === 100 || j.status === 401)) {
      try {
        tokens = await refreshTokens(url, kvToken, tokens);
        const retry = await fetch(`${MEASURE_URL}?${measureForm.toString()}`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const j2 = await retry.json();
        if (j2.status === 0) return respondWithMeasures(res, tokens, j2);
      } catch (e) { /* fall through */ }
    }
    return res.status(502).json({ error: 'measure_failed', detail: j });
  }
  return respondWithMeasures(res, tokens, j);
}

function respondWithMeasures(res, tokens, j) {
  const groups = (j.body && j.body.measuregrps) || [];
  groups.sort((a, b) => b.date - a.date);

  let weight_kg = null, body_fat_pct = null, fat_mass_kg = null, lean_mass_kg = null, measured_at = null;
  for (const g of groups) {
    const w = pickMeasure(g, 1);
    if (w == null) continue;
    weight_kg = w;
    const bf = pickMeasure(g, 6);
    if (bf != null) body_fat_pct = bf;
    fat_mass_kg = pickMeasure(g, 8);
    lean_mass_kg = pickMeasure(g, 5);
    measured_at = g.date * 1000;
    break;
  }

  if (weight_kg == null) {
    return res.status(404).json({ error: 'no_measurements', connected: true });
  }

  const weight_lb = Math.round(weight_kg * 2.20462 * 10) / 10;
  const body_fat_pct_rounded = body_fat_pct != null ? Math.round(body_fat_pct * 10) / 10 : null;

  return res.status(200).json({
    connected: true,
    weight_lb,
    weight_kg: Math.round(weight_kg * 100) / 100,
    body_fat_pct: body_fat_pct_rounded,
    fat_mass_kg: fat_mass_kg != null ? Math.round(fat_mass_kg * 100) / 100 : null,
    lean_mass_kg: lean_mass_kg != null ? Math.round(lean_mass_kg * 100) / 100 : null,
    measured_at,
    last_sync_at: Date.now(),
  });
}
