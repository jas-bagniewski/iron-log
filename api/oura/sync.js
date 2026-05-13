// Oura sync: fetch the last 7 days of activity, sleep, and readiness using a
// Personal Access Token (env OURA_PAT). Returns aggregated metrics plus a
// compact per-day series for sparklines.
//
// Auth: x-sync-secret header (same as other endpoints).

const BASE = 'https://api.ouraring.com/v2/usercollection';

const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

async function fetchOura(path, pat, params) {
  const u = new URL(`${BASE}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${pat}` } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${path}: HTTP ${r.status} ${text.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.data || [];
}

const avg = (nums) => {
  const xs = nums.filter((n) => typeof n === 'number' && !isNaN(n));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};

export default async function handler(req, res) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  const provided = req.headers['x-sync-secret'] || req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: 'unauthorized' });

  const pat = process.env.OURA_PAT;
  if (!pat) return res.status(500).json({ error: 'OURA_PAT not configured' });

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 8); // include 8 days for safety
  const endDate = isoDate(today);
  const startDate = isoDate(start);

  let activity, sleep, readiness;
  try {
    [activity, sleep, readiness] = await Promise.all([
      fetchOura('/daily_activity',  pat, { start_date: startDate, end_date: endDate }),
      fetchOura('/daily_sleep',     pat, { start_date: startDate, end_date: endDate }),
      fetchOura('/daily_readiness', pat, { start_date: startDate, end_date: endDate }),
    ]);
  } catch (e) {
    return res.status(502).json({ error: 'oura_fetch_failed', detail: String(e.message || e) });
  }

  // Index by day for joining.
  const indexByDay = (rows) => {
    const m = new Map();
    for (const r of rows || []) {
      if (r && r.day) m.set(r.day, r);
    }
    return m;
  };
  const A = indexByDay(activity);
  const S = indexByDay(sleep);
  const R = indexByDay(readiness);

  // Build the per-day series for the most recent 7 days ending YESTERDAY
  // (today's data is still partial). Plus today's readiness separately.
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = isoDate(d);
    const a = A.get(key);
    const s = S.get(key);
    const r = R.get(key);
    days.push({
      date: key,
      active_cal: a ? a.active_calories : null,
      total_cal: a ? a.total_calories : null,
      steps: a ? a.steps : null,
      sleep_score: s ? s.score : null,
      readiness_score: r ? r.score : null,
    });
  }

  const todayKey = isoDate(today);
  const yesterdayKey = isoDate(new Date(today.getTime() - 86_400_000));

  const todayReadiness = R.get(todayKey);
  const yesterdayActivity = A.get(yesterdayKey);
  const yesterdaySleep = S.get(yesterdayKey);

  // Sleep "score" applies to the night before that date; Oura keys daily_sleep
  // by wake day. We use yesterday's daily_sleep record as "last night".

  const active_burn_7d_avg = Math.round(avg(days.map((d) => d.active_cal)) || 0);
  const total_burn_7d_avg = Math.round(avg(days.map((d) => d.total_cal)) || 0);

  return res.status(200).json({
    connected: true,
    last_sync_at: Date.now(),
    active_burn_7d_avg,
    total_burn_7d_avg,
    active_burn_yesterday: yesterdayActivity ? Math.round(yesterdayActivity.active_calories || 0) : null,
    total_burn_yesterday: yesterdayActivity ? Math.round(yesterdayActivity.total_calories || 0) : null,
    sleep_score_yesterday: yesterdaySleep ? yesterdaySleep.score : null,
    readiness_score_today: todayReadiness ? todayReadiness.score : null,
    days,
  });
}
