// ============================================================
// PROGRAM CONFIGURATION
// Edit accessories, day templates, and progression here.
// ============================================================

export const round5 = (n: number) => Math.round(n / 5) * 5;

// ---- 5/3/1 Week Schemes (main lifts) ----
export const WEEK_SCHEMES: Record<number, { label: string; sets: { pct: number; reps: number; isAmrap: boolean; minReps?: number }[] }> = {
  1: {
    label: "5s WEEK",
    sets: [
      { pct: 0.65, reps: 5, isAmrap: false },
      { pct: 0.75, reps: 5, isAmrap: false },
      { pct: 0.85, reps: 5, isAmrap: true, minReps: 5 },
    ],
  },
  2: {
    label: "3s WEEK",
    sets: [
      { pct: 0.70, reps: 3, isAmrap: false },
      { pct: 0.80, reps: 3, isAmrap: false },
      { pct: 0.90, reps: 3, isAmrap: true, minReps: 3 },
    ],
  },
  3: {
    label: "PR WEEK",
    sets: [
      { pct: 0.75, reps: 5, isAmrap: false },
      { pct: 0.85, reps: 3, isAmrap: false },
      { pct: 0.95, reps: 1, isAmrap: true, minReps: 1 },
    ],
  },
  4: {
    label: "DELOAD",
    sets: [
      { pct: 0.40, reps: 5, isAmrap: false },
      { pct: 0.50, reps: 5, isAmrap: false },
      { pct: 0.60, reps: 5, isAmrap: false },
    ],
  },
};

// ---- Accessory exercise library ----
// To add/remove exercises, edit this dict and the DAY_TEMPLATES below.
export type AccessoryDef = {
  name: string;
  sets: number;
  repsLow: number;
  repsHigh: number;
  inc: number;
  startWeight: number;
  isTimed?: boolean;
  isBodyweight?: boolean;
  equipment?: string; // optional note: "tonal", "barbell", "dumbbell"
};

export const ACCESSORIES: Record<string, AccessoryDef> = {
  // CHEST DAY
  "incline-db":         { name: "Incline Dumbbell Press",    sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 50,  equipment: "dumbbell" },
  "close-grip":         { name: "Close-Grip Bench Press",    sets: 3, repsLow: 6,  repsHigh: 8,  inc: 5,  startWeight: 135, equipment: "barbell" },
  "tricep-ext-tonal":   { name: "Tricep Extension (Tonal)",  sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 50,  equipment: "tonal" },
  "decline-fly-tonal":  { name: "Decline Chest Fly (Tonal)", sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 40,  equipment: "tonal" },
  // FULL BODY DAY
  "goblet-squat":     { name: "Goblet Squat",           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 50 },
  "lat-pulldown":     { name: "Lat Pulldown",           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 120 },
  "military-press":   { name: "Military Press",         sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 95 },
  "plank":            { name: "Plank",                  sets: 3, repsLow: 30, repsHigh: 60, inc: 0,  startWeight: 0, isTimed: true },
  // LEG DAY
  "romanian-dl":      { name: "Romanian Deadlift",      sets: 3, repsLow: 8,  repsHigh: 10, inc: 10, startWeight: 135 },
  "leg-press":        { name: "Leg Press",              sets: 3, repsLow: 10, repsHigh: 12, inc: 10, startWeight: 200 },
  "leg-curls":        { name: "Lying Leg Curls",        sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 80 },
  "calf-raises":      { name: "Standing Calf Raises",   sets: 3, repsLow: 12, repsHigh: 15, inc: 10, startWeight: 100 },
  "leg-raises":       { name: "Hanging Leg Raises",     sets: 3, repsLow: 10, repsHigh: 15, inc: 0,  startWeight: 0, isBodyweight: true },
  // BACK DAY
  "pull-ups":         { name: "Pull-Ups",               sets: 3, repsLow: 5,  repsHigh: 10, inc: 0,  startWeight: 0, isBodyweight: true },
  "barbell-rows":     { name: "Barbell Rows",           sets: 3, repsLow: 8,  repsHigh: 10, inc: 5,  startWeight: 135 },
  "lat-pulldown-back":{ name: "Lat Pulldown",           sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 120 },
  "face-pulls":       { name: "Face Pulls",             sets: 3, repsLow: 12, repsHigh: 15, inc: 5,  startWeight: 40 },
  "bicep-curls":      { name: "Dumbbell Bicep Curls",   sets: 3, repsLow: 10, repsHigh: 12, inc: 5,  startWeight: 25 },
};

// ---- Day templates ----
export type DayTemplate = {
  id: string;
  name: string;
  mainLift: "bench" | "squat" | "deadlift";
  mainName: string;
  isVolume: boolean;
  accessories: string[];
};

export const DAY_TEMPLATES: Record<string, DayTemplate> = {
  chest:    { id: "chest",    name: "Chest Day",     mainLift: "bench",    mainName: "Bench Press",          isVolume: false, accessories: ["incline-db", "close-grip", "tricep-ext-tonal", "decline-fly-tonal"] },
  fullbody: { id: "fullbody", name: "Full Body Day", mainLift: "bench",    mainName: "Bench Press (Volume)", isVolume: true,  accessories: ["goblet-squat", "lat-pulldown", "military-press", "plank"] },
  legs:     { id: "legs",     name: "Leg Day",       mainLift: "squat",    mainName: "Back Squat",           isVolume: false, accessories: ["romanian-dl", "leg-press", "leg-curls", "calf-raises", "leg-raises"] },
  back:     { id: "back",     name: "Back Day",      mainLift: "deadlift", mainName: "Deadlift",             isVolume: false, accessories: ["pull-ups", "barbell-rows", "lat-pulldown-back", "face-pulls", "bicep-curls"] },
};

export const DAY_ORDER = ["chest", "fullbody", "legs", "back"] as const;

// ============================================================
// STATE TYPES
// ============================================================
export type MainSet = {
  id: string;
  weight: number;
  targetReps: number;
  isAmrap: boolean;
  minReps?: number;
  completed: boolean;
  actualReps: number | null;
};

export type AccessorySetData = {
  id: string;
  reps: number | null;
  completed: boolean;
};

export type Accessory = {
  id: string;
  name: string;
  sets: number;
  repsLow: number;
  repsHigh: number;
  inc: number;
  isTimed?: boolean;
  isBodyweight?: boolean;
  weight: number;
  lastWeight: number;
  progressionHint: string | null;
  setData: AccessorySetData[];
};

export type Session = {
  dayId: string;
  name: string;
  cycle: number;
  week: number;
  weekLabel: string;
  mainLift: string;
  mainName: string;
  isVolume: boolean;
  mainSets: MainSet[];
  accessories: Accessory[];
  completedAt?: string;
};

export type AccessoryLog = Record<string, { weight: number; hitTopOnAllSets: boolean; lastReps?: number[] }>;

export type AppState = {
  trainingMaxes: { bench: number; squat: number; deadlift: number };
  cycle: number;
  week: number;
  completedThisWeek: Record<string, boolean>;
  accessoryLog: AccessoryLog;
  history: Session[];
  activeSession: Session | null;
  shareToken?: string | null;
};

export const defaultState: AppState = {
  // Calibrated 2026-05: bench 1RM 225, squat 155x5 (~181 e1RM), DL 165x10 hex (~220 e1RM).
  trainingMaxes: { bench: 200, squat: 165, deadlift: 200 },
  cycle: 1,
  week: 1,
  completedThisWeek: { chest: false, fullbody: false, legs: false, back: false },
  accessoryLog: {},
  history: [],
  activeSession: null,
};

// ============================================================
// SESSION BUILDING
// ============================================================
export const buildMainSets = (tm: number, week: number, isVolume: boolean): MainSet[] => {
  if (isVolume) {
    const isDeload = week === 4;
    const pct = isDeload ? 0.50 : 0.60;
    const count = isDeload ? 3 : 5;
    const w = round5(tm * pct);
    return Array.from({ length: count }, (_, i) => ({
      id: `main-${i}`, weight: w, targetReps: 5, isAmrap: false, completed: false, actualReps: null,
    }));
  }
  return WEEK_SCHEMES[week].sets.map((s, i) => ({
    id: `main-${i}`,
    weight: round5(tm * s.pct),
    targetReps: s.reps,
    isAmrap: s.isAmrap,
    minReps: s.minReps,
    completed: false,
    actualReps: null,
  }));
};

export const buildAccessory = (id: string, log: AccessoryLog): Accessory => {
  const def = ACCESSORIES[id];
  const last = log[id] || { weight: def.startWeight, hitTopOnAllSets: false };
  const suggested = last.hitTopOnAllSets ? last.weight + def.inc : last.weight;
  return {
    id,
    name: def.name,
    sets: def.sets,
    repsLow: def.repsLow,
    repsHigh: def.repsHigh,
    inc: def.inc,
    isTimed: def.isTimed,
    isBodyweight: def.isBodyweight,
    weight: suggested,
    lastWeight: last.weight,
    progressionHint: last.hitTopOnAllSets ? `+${def.inc} lb from last time` : null,
    setData: Array.from({ length: def.sets }, (_, i) => ({ id: `${id}-${i}`, reps: null, completed: false })),
  };
};

export const buildSession = (dayId: string, state: AppState): Session => {
  const tpl = DAY_TEMPLATES[dayId];
  const tm = state.trainingMaxes[tpl.mainLift];
  return {
    dayId,
    name: tpl.name,
    cycle: state.cycle,
    week: state.week,
    weekLabel: WEEK_SCHEMES[state.week].label,
    mainLift: tpl.mainLift,
    mainName: tpl.mainName,
    isVolume: tpl.isVolume,
    mainSets: buildMainSets(tm, state.week, tpl.isVolume),
    accessories: tpl.accessories.map((id) => buildAccessory(id, state.accessoryLog)),
  };
};

// ============================================================
// PROGRESSION
// ============================================================
export const finishSession = (state: AppState, completed: Session): AppState => {
  const newLog: AccessoryLog = { ...state.accessoryLog };
  completed.accessories.forEach((acc) => {
    const def = ACCESSORIES[acc.id];
    const reps = acc.setData.map((s) => s.reps).filter((r): r is number => r != null);
    const hitTop = reps.length === acc.sets && reps.every((r) => r >= def.repsHigh);
    newLog[acc.id] = { weight: acc.weight, hitTopOnAllSets: hitTop, lastReps: reps };
  });

  const done = { ...state.completedThisWeek, [completed.dayId]: true };
  let { cycle, week, trainingMaxes } = state;
  let newDone = done;

  if (Object.values(done).every((v) => v)) {
    newDone = { chest: false, fullbody: false, legs: false, back: false };
    if (week === 4) {
      week = 1;
      cycle += 1;
      trainingMaxes = {
        bench: trainingMaxes.bench + 5,
        squat: trainingMaxes.squat + 10,
        deadlift: trainingMaxes.deadlift + 10,
      };
    } else {
      week += 1;
    }
  }

  const newHistory = [{ ...completed, completedAt: new Date().toISOString() }, ...(state.history || [])].slice(0, 200);

  return {
    ...state,
    cycle,
    week,
    trainingMaxes,
    accessoryLog: newLog,
    completedThisWeek: newDone,
    history: newHistory,
    activeSession: null,
  };
};

export const estimate1RM = (w: number | null | undefined, r: number | null | undefined) =>
  !w || !r ? null : Math.round(w * (1 + r / 30));

export const getBestE1RM = (history: Session[], lift: string): number | null => {
  if (!history) return null;
  let best = 0;
  history.forEach((s) => {
    if (s.mainLift !== lift || s.isVolume) return;
    s.mainSets?.forEach((set) => {
      if (set.isAmrap && set.actualReps && set.weight) {
        const e = estimate1RM(set.weight, set.actualReps);
        if (e && e > best) best = e;
      }
    });
  });
  return best || null;
};