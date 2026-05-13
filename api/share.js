// PT read-only share endpoint.
// GET /api/share?t=<token> -> returns a filtered, read-only view of the state,
// including pre-built previews of upcoming sessions so the PT can see exactly
// what weights/reps are planned.
//
// The token is stored inside the synced state itself (state.shareToken). Rotating
// the token from the owner's Settings invalidates old share URLs immediately.
//
// Program definitions below are a mirror of index.html. Keep in sync if the
// owner customizes their split, accessories, or week schemes.

const KV_KEY = "iron-log:state:v1";

const WEEK_SCHEMES = {
  1: { label: '5s WEEK', sets: [
    { pct: 0.65, reps: 5, isAmrap: false },
    { pct: 0.75, reps: 5, isAmrap: false },
    { pct: 0.85, reps: 5, isAmrap: true, minReps: 5 },
  ]},
  2: { label: '3s WEEK', sets: [
    { pct: 0.70, reps: 3, isAmrap: false },
    { pct: 0.80, reps: 3, isAmrap: false },
    { pct: 0.90, reps: 3, isAmrap: true, minReps: 3 },
  ]},
  3: { label: 'PR WEEK', sets: [
    { pct: 0.75, reps: 5, isAmrap: false },
    { pct: 0.85, reps: 3, isAmrap: false },
    { pct: 0.95, reps: 1, isAmrap: true, minReps: 1 },
  ]},
  4: { label: 'DELOAD', sets: [
    { pct: 0.40, reps: 5, isAmrap: false },
    { pct: 0.50, reps: 5, isAmrap: false },
    { pct: 0.60, reps: 5, isAmrap: false },
  ]},
};

const ACCESSORIES = {
  'incline-db':       { name: 'Incline Dumbbell Press', sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 50 },
  'close-grip':       { name: 'Close-Grip Bench Press', sets: 3, repsLow: 6,  repsHigh: 8,  inc: 5,  startWeight: 135 },
  'tricep-ext-tonal': { name: 'Tricep Extension (Tonal)', sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 50 },
  'decline-fly-tonal':{ name: 'Decline Chest Fly (Tonal)', sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 40 },
  'goblet-squat':     { name: 'Goblet Squat',           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 50 },
  'lat-pulldown':     { name: 'Lat Pulldown',           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 120 },
  'db-ohp':           { name: 'Dumbbell Overhead Press',sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 35 },
  'plank':            { name: 'Plank',                  sets: 3, repsLow: 30, repsHigh: 60, inc: 0,  startWeight: 0, isTimed: true },
  'romanian-dl':      { name: 'Romanian Deadlift',      sets: 3, repsLow: 8,  repsHigh: 10, inc: 10, startWeight: 135 },
  'leg-press':        { name: 'Leg Press',              sets: 3, repsLow: 10, repsHigh: 12, inc: 10, startWeight: 200 },
  'leg-curls':        { name: 'Lying Leg Curls',        sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 80 },
  'calf-raises':      { name: 'Standing Calf Raises',   sets: 3, repsLow: 12, repsHigh: 15, inc: 10, startWeight: 100 },
  'leg-raises':       { name: 'Hanging Leg Raises',     sets: 3, repsLow: 10, repsHigh: 15, inc: 0,  startWeight: 0, isBodyweight: true },
  'pull-ups':         { name: 'Pull-Ups',               sets: 3, repsLow: 5,  repsHigh: 10, inc: 0,  startWeight: 0, isBodyweight: true },
  'barbell-rows':     { name: 'Barbell Rows',           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 135 },
  'lat-pulldown-back':{ name: 'Lat Pulldown',           sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 120 },
  'face-pulls':       { name: 'Face Pulls',             sets: 3, repsLow: 12, repsHigh: 15, inc: 5,  startWeight: 40 },
  'bicep-curls':      { name: 'Dumbbell Bicep Curls',   sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 25 },
};

const DAY_TEMPLATES = {
  chest:    { id: 'chest',    name: 'Chest Day',     mainLift: 'bench',    mainName: 'Bench Press',          isVolume: false, accessories: ['incline-db', 'close-grip', 'tricep-ext-tonal', 'decline-fly-tonal'] },
  fullbody: { id: 'fullbody', name: 'Full Body Day', mainLift: 'bench',    mainName: 'Bench Press (Volume)', isVolume: true,  accessories: ['goblet-squat', 'lat-pulldown', 'db-ohp', 'plank'] },
  legs:     { id: 'legs',     name: 'Leg Day',       mainLift: 'squat',    mainName: 'Back Squat',           isVolume: false, accessories: ['romanian-dl', 'leg-press', 'leg-curls', 'calf-raises', 'leg-raises'] },
  back:     { id: 'back',     name: 'Back Day',      mainLift: 'deadlift', mainName: 'Deadlift',             isVolume: false, accessories: ['pull-ups', 'barbell-rows', 'lat-pulldown-back', 'face-pulls', 'bicep-curls'] },
};
const DAY_ORDER = ['chest', 'fullbody', 'legs', 'back'];

const round5 = (n) => Math.round(n / 5) * 5;

function buildMainSets(tm, week, isVolume) {
  if (isVolume) {
    const isDeload = week === 4;
    const pct = isDeload ? 0.50 : 0.60;
    const count = isDeload ? 3 : 5;
    const w = round5(tm * pct);
    return Array.from({ length: count }, (_, i) => ({ weight: w, targetReps: 5, isAmrap: false }));
  }
  return WEEK_SCHEMES[week].sets.map((s) => ({
    weight: round5(tm * s.pct), targetReps: s.reps, isAmrap: !!s.isAmrap, minReps: s.minReps,
  }));
}

function buildSessionPreview(dayId, state) {
  const tpl = DAY_TEMPLATES[dayId];
  if (!tpl) return null;
  const tm = state.trainingMaxes && state.trainingMaxes[tpl.mainLift];
  if (tm == null) return null;
  const accessories = tpl.accessories.map((id) => {
    const def = ACCESSORIES[id];
    if (!def) return null;
    const log = (state.accessoryLog || {})[id] || { weight: def.startWeight, hitTopOnAllSets: false };
    const suggested = log.hitTopOnAllSets ? log.weight + def.inc : log.weight;
    return {
      id, name: def.name, sets: def.sets,
      repsLow: def.repsLow, repsHigh: def.repsHigh,
      isTimed: !!def.isTimed, isBodyweight: !!def.isBodyweight,
      weight: suggested,
      progressionHint: log.hitTopOnAllSets ? `+${def.inc} lb` : null,
      lastReps: log.lastReps || null,
    };
  }).filter(Boolean);
  return {
    dayId, name: tpl.name, mainLift: tpl.mainLift, mainName: tpl.mainName,
    isVolume: tpl.isVolume,
    weekLabel: WEEK_SCHEMES[state.week] ? WEEK_SCHEMES[state.week].label : '',
    mainSets: buildMainSets(tm, state.week, tpl.isVolume),
    accessories,
  };
}

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
  const completed = s.completedThisWeek || {};
  const upcoming = DAY_ORDER.filter((d) => !completed[d]).map((d) => buildSessionPreview(d, s)).filter(Boolean);
  const doneThisWeek = DAY_ORDER.filter((d) => completed[d]).map((d) => buildSessionPreview(d, s)).filter(Boolean);
  return {
    trainingMaxes: s.trainingMaxes,
    cycle: s.cycle,
    week: s.week,
    weekLabel: WEEK_SCHEMES[s.week] ? WEEK_SCHEMES[s.week].label : '',
    completedThisWeek: s.completedThisWeek,
    accessoryLog: s.accessoryLog,
    history: Array.isArray(s.history) ? s.history.slice(0, 50) : [],
    upcoming,
    doneThisWeek,
    bodyStats: s.bodyStats ? {
      weight: s.bodyStats.weight,
      bodyFatPct: s.bodyStats.bodyFatPct,
      goalBodyFatPct: s.bodyStats.goalBodyFatPct,
      lastUpdated: s.bodyStats.lastUpdated,
    } : null,
    bodyStatsHistory: Array.isArray(s.bodyStatsHistory) ? s.bodyStatsHistory.slice(0, 60) : [],
    oura: s.oura ? {
      sleep_score_yesterday: s.oura.sleep_score_yesterday,
      readiness_score_today: s.oura.readiness_score_today,
      active_burn_yesterday: s.oura.active_burn_yesterday,
      active_burn_7d_avg: s.oura.active_burn_7d_avg,
      total_burn_7d_avg: s.oura.total_burn_7d_avg,
      last_sync_at: s.oura.last_sync_at,
    } : null,
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
