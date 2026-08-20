// One-time stale-session fix (2026-08-20).
// GET /api/fix-session?t=<shareToken>
//
// The owner's phone holds a LOCAL in-progress Full Body session built from
// the old inflated TMs (bench 255 -> BBB 155). The client merge uses
// `cloud.activeSession ?? prev.activeSession`, so a non-null cloud session
// REPLACES the stale local one on the next pull. This writes a freshly-built
// Full Body session (from the corrected TMs in KV) into cloud state.
//
// Auth: share token, same primitive as /api/share. Idempotent: refuses to
// overwrite a cloud session that already has corrected weights. Remove after
// it has served its purpose.

const KV_KEY = "iron-log:state:v1";

const round5 = (n) => Math.round(n / 5) * 5;

const WEEK_SCHEMES = {
  1: { label: "5s WEEK", sets: [
    { pct: 0.65, reps: 5, isAmrap: false },
    { pct: 0.75, reps: 5, isAmrap: false },
    { pct: 0.85, reps: 5, isAmrap: true, minReps: 5 },
  ]},
  2: { label: "3s WEEK", sets: [
    { pct: 0.70, reps: 3, isAmrap: false },
    { pct: 0.80, reps: 3, isAmrap: false },
    { pct: 0.90, reps: 3, isAmrap: true, minReps: 3 },
  ]},
  3: { label: "PR WEEK", sets: [
    { pct: 0.75, reps: 5, isAmrap: false },
    { pct: 0.85, reps: 3, isAmrap: false },
    { pct: 0.95, reps: 1, isAmrap: true, minReps: 1 },
  ]},
  4: { label: "DELOAD", sets: [
    { pct: 0.40, reps: 5, isAmrap: false },
    { pct: 0.50, reps: 5, isAmrap: false },
    { pct: 0.60, reps: 5, isAmrap: false },
  ]},
};

// Mirror of index.html's Full Body template + the accessories it uses.
const FULLBODY = {
  id: "fullbody", name: "Full Body Day",
  mainLift: "press", mainName: "Military Press", isVolume: false,
  supplementary: { lift: "bench", name: "Bench Press (BBB)", pct: 0.60, deloadPct: 0.50, sets: 5, deloadSets: 3, reps: 10, deloadReps: 5 },
  accessories: ["goblet-squat", "lat-pulldown", "plank"],
};
const ACCESSORIES = {
  "goblet-squat": { name: "Goblet Squat", sets: 3, repsLow: 8,  repsHigh: 10, inc: 5, startWeight: 50 },
  "lat-pulldown": { name: "Lat Pulldown", sets: 3, repsLow: 8,  repsHigh: 10, inc: 5, startWeight: 120 },
  "plank":        { name: "Plank",        sets: 3, repsLow: 30, repsHigh: 60, inc: 0, startWeight: 0, isTimed: true },
};

function buildFullBodySession(state) {
  const week = state.week;
  const scheme = WEEK_SCHEMES[week];
  const pressTm = state.trainingMaxes.press;
  const benchTm = state.trainingMaxes.bench;
  const isDeload = week === 4;
  const sup = FULLBODY.supplementary;
  const supPct = isDeload ? sup.deloadPct : sup.pct;
  const supCount = isDeload ? sup.deloadSets : sup.sets;
  const supReps = isDeload ? sup.deloadReps : sup.reps;
  const supW = round5(benchTm * supPct);
  return {
    dayId: FULLBODY.id,
    name: FULLBODY.name,
    cycle: state.cycle,
    week,
    weekLabel: scheme.label,
    mainLift: FULLBODY.mainLift,
    mainName: FULLBODY.mainName,
    isVolume: false,
    mainSets: scheme.sets.map((s, i) => ({
      id: `main-${i}`, weight: round5(pressTm * s.pct), targetReps: s.reps,
      isAmrap: !!s.isAmrap, minReps: s.minReps, completed: false, actualReps: null,
    })),
    supplementary: {
      lift: sup.lift, name: sup.name,
      sets: Array.from({ length: supCount }, (_, i) => ({
        id: `sup-${i}`, weight: supW, targetReps: supReps, isAmrap: false, completed: false, actualReps: null,
      })),
    },
    accessories: FULLBODY.accessories.map((id) => {
      const def = ACCESSORIES[id];
      const log = (state.accessoryLog || {})[id] || { weight: def.startWeight, hitTopOnAllSets: false, bumpMult: 1 };
      const bumpMult = log.bumpMult || 1;
      const bumpAmount = log.hitTopOnAllSets ? def.inc * bumpMult : 0;
      const suggested = log.weight + bumpAmount;
      return {
        id, name: def.name, sets: def.sets, repsLow: def.repsLow, repsHigh: def.repsHigh, inc: def.inc,
        isTimed: def.isTimed, isBodyweight: def.isBodyweight,
        weight: suggested, lastWeight: log.weight,
        progressionHint: bumpAmount > 0 ? `+${bumpAmount} lb from last time` : null,
        setData: Array.from({ length: def.sets }, (_, i) => ({ id: `${id}-${i}`, reps: null, completed: false })),
      };
    }),
  };
}

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

    // Refuse if the cloud session already has corrected weights (idempotence).
    const existing = state.activeSession;
    const correctedBBB = round5(state.trainingMaxes.bench * 0.60);
    if (existing && existing.supplementary && existing.supplementary.sets &&
        existing.supplementary.sets[0] && existing.supplementary.sets[0].weight === correctedBBB) {
      return res.status(200).json({ applied: false, reason: "cloud session already corrected", activeSession: { day: existing.dayId, bbb: correctedBBB } });
    }

    const session = buildFullBodySession(state);
    await kvSet(url, kvToken, { ...state, activeSession: session });
    return res.status(200).json({
      applied: true,
      session: {
        day: session.dayId, week: session.week, weekLabel: session.weekLabel,
        main: session.mainSets.map((s) => `${s.weight}x${s.targetReps}`),
        bbb: `${session.supplementary.sets[0].weight}x${session.supplementary.sets[0].targetReps} x${session.supplementary.sets.length}`,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
