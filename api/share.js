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

const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const DEFAULT_BODY_STATS = {
  weight: 180, bodyFatPct: null, goalBodyFatPct: 15,
  height: 70, age: 35, sex: 'male', activityLevel: 'active',
};

const round5 = (n) => Math.round(n / 5) * 5;

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sumMeals = (meals) => {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  (meals || []).forEach((m) => {
    t.kcal += m.kcal || 0; t.protein += m.protein || 0;
    t.carbs += m.carbs || 0; t.fat += m.fat || 0;
  });
  return t;
};

// Mirrored from index.html. Keep in sync if formulas change.
function computeWeeklyPace(state, fallbackTdee) {
  const today = new Date();
  const ouraDays = (state.oura && state.oura.days) || [];
  const burnByDate = new Map();
  ouraDays.forEach((d) => { if (d && d.total_cal != null) burnByDate.set(d.date, d.total_cal); });
  let intakeSum = 0, burnSum = 0, days = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = isoDate(d);
    const meals = (state.mealsByDate && state.mealsByDate[k]) || [];
    const intake = meals.reduce((s, m) => s + (m.kcal || 0), 0);
    if (intake > 0) {
      const burn = burnByDate.has(k) ? burnByDate.get(k) : fallbackTdee;
      intakeSum += intake; burnSum += burn; days++;
    }
  }
  if (days < 3) return { hasEnoughData: false, daysCounted: days };
  return {
    hasEnoughData: true, daysCounted: days,
    avgIntake: Math.round(intakeSum / days),
    avgBurn: Math.round(burnSum / days),
    actualDailyDelta: Math.round((intakeSum - burnSum) / days),
  };
}

function computeMacroTargets(bs, oura, pace) {
  const stats = { ...DEFAULT_BODY_STATS, ...bs };
  const weightKg = stats.weight * 0.4536;
  const heightCm = stats.height * 2.54;
  let bmr;
  if (stats.bodyFatPct && stats.bodyFatPct > 3 && stats.bodyFatPct < 60) {
    const leanKg = weightKg * (1 - stats.bodyFatPct / 100);
    bmr = 370 + 21.6 * leanKg;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * stats.age + (stats.sex === 'female' ? -161 : 5);
  }
  const ouraTdee = oura && oura.total_burn_7d_avg && oura.last_sync_at
    && (Date.now() - oura.last_sync_at < 8 * 86_400_000)
    ? oura.total_burn_7d_avg : null;
  const tdee = ouraTdee != null ? ouraTdee : bmr * (ACTIVITY_MULTIPLIERS[stats.activityLevel] || 1.55);
  const bfDelta = (stats.bodyFatPct || 18) - (stats.goalBodyFatPct || 15);
  let baseKcal, proteinPerLb, mode;
  if (bfDelta > 1) { baseKcal = tdee - 300; proteinPerLb = 1.15; mode = 'cut'; }
  else if (bfDelta < -1) { baseKcal = tdee + 200; proteinPerLb = 1.0; mode = 'bulk'; }
  else { baseKcal = tdee; proteinPerLb = 1.05; mode = 'maintain'; }
  const protein = Math.round(stats.weight * proteinPerLb);
  const fat = Math.round(stats.weight * 0.4);
  let adjustment = 0;
  if (pace && pace.hasEnoughData) {
    const targetDailyDelta = baseKcal - tdee;
    const excess = pace.actualDailyDelta - targetDailyDelta;
    adjustment = Math.max(-400, Math.min(400, Math.round(-excess / 3)));
  }
  const kcal = Math.round(baseKcal + adjustment);
  const carbCal = Math.max(0, kcal - protein * 4 - fat * 9);
  const carbs = Math.round(carbCal / 4);
  return {
    kcal, baseKcal: Math.round(baseKcal), adjustment,
    protein, fat, carbs,
    maintenance: Math.round(tdee), bmr: Math.round(bmr), mode,
  };
}

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

  // Diet: today + last 14 days of meals, plus computed targets + pace.
  const today = new Date();
  const todayK = isoDate(today);
  const recentDays = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = isoDate(d);
    const meals = (s.mealsByDate && s.mealsByDate[k]) || [];
    const totals = sumMeals(meals);
    recentDays.push({
      date: k,
      mealCount: meals.length,
      totals,
      meals: meals.map((m) => ({
        id: m.id, name: m.name, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat,
        source: m.source, loggedAt: m.loggedAt,
      })),
    });
  }
  const placeholderTdee = computeMacroTargets(s.bodyStats, s.oura, null).maintenance;
  const pace = computeWeeklyPace(s, placeholderTdee);
  const targets = computeMacroTargets(s.bodyStats, s.oura, pace);
  const todaysMeals = recentDays[0] || { meals: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, mealCount: 0 };

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
    diet: {
      targets,
      pace,
      today: { date: todayK, meals: todaysMeals.meals, totals: todaysMeals.totals },
      recent: recentDays.slice(1, 8), // last 7 days excluding today
    },
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
