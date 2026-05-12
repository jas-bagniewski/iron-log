"use client";

import { useState, useEffect } from "react";
import {
  Dumbbell, Check, ChevronRight, ChevronLeft, History, Settings,
  Plus, Minus, Flame, ArrowUp, ArrowRight, RotateCcw, Award,
} from "lucide-react";
import {
  AppState, Session, Accessory, MainSet,
  WEEK_SCHEMES, DAY_TEMPLATES, DAY_ORDER, ACCESSORIES,
  defaultState, buildSession, finishSession, getBestE1RM, round5,
} from "@/lib/program";

const STORAGE_KEY = "iron-log:v2";

const loadState = (): AppState => {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {}
  return defaultState;
};

const saveState = (s: AppState) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { console.error(e); }
};

// ============================================================
// REP PROMPT MODAL
// ============================================================
function RepPrompt({
  open, title, subtitle, defaultValue, onCancel, onSubmit,
}: {
  open: boolean; title: string; subtitle: string; defaultValue: number | null;
  onCancel: () => void; onSubmit: (n: number) => void;
}) {
  const [val, setVal] = useState(defaultValue?.toString() ?? "");
  useEffect(() => { if (open) setVal(defaultValue?.toString() ?? ""); }, [open, defaultValue]);
  if (!open) return null;
  const submit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) onSubmit(n);
  };
  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-widest text-orange-400 font-semibold mb-2">{title}</div>
        <div className="text-sm text-neutral-400 mb-4">{subtitle}</div>
        <input type="number" autoFocus inputMode="numeric" value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full bg-neutral-900 border-2 border-neutral-800 focus:border-orange-500 rounded-lg px-4 py-4 text-4xl font-mono font-bold text-center text-neutral-50 outline-none"
          placeholder="0" />
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-lg border border-neutral-800 text-neutral-400 uppercase tracking-wider text-sm font-semibold hover:bg-neutral-900">Cancel</button>
          <button onClick={submit} className="flex-1 py-3 rounded-lg bg-orange-500 text-black uppercase tracking-wider text-sm font-bold hover:bg-orange-400">Log</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN SET ROW
// ============================================================
function MainSetRow({ set, idx, onToggle, onAmrap }: {
  set: MainSet; idx: number; onToggle: () => void; onAmrap: (reps: number) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const handleClick = () => {
    if (set.isAmrap && !set.completed) setShowPrompt(true);
    else onToggle();
  };
  return (
    <>
      <div
        className={`flex items-center justify-between px-4 py-4 rounded-lg border transition-all cursor-pointer select-none ${
          set.completed ? "bg-orange-500/10 border-orange-500/40" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 active:scale-[0.99]"
        }`}
        onClick={handleClick}
      >
        <div className="flex items-center gap-4">
          <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-mono text-sm shrink-0 ${
            set.completed ? "bg-orange-500 border-orange-500 text-black" : "border-neutral-700 text-neutral-500"
          }`}>
            {set.completed ? <Check size={16} strokeWidth={3} /> : idx + 1}
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-neutral-50 leading-none">
              {set.weight}<span className="text-neutral-500 text-base font-normal ml-1">lb</span>
            </div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mt-1">
              {set.isAmrap
                ? set.completed ? `${set.actualReps} reps logged` : `${set.targetReps}+ reps · tap to log`
                : `${set.targetReps} reps`}
            </div>
          </div>
        </div>
        {set.isAmrap && !set.completed && (
          <div className="text-xs uppercase tracking-wider text-orange-400 font-semibold flex items-center gap-1">
            <Flame size={14} /> AMRAP
          </div>
        )}
      </div>
      <RepPrompt open={showPrompt} title="AMRAP Set"
        subtitle={`${set.weight} lb · target ${set.targetReps}+ reps`}
        defaultValue={set.targetReps}
        onCancel={() => setShowPrompt(false)}
        onSubmit={(n) => { onAmrap(n); setShowPrompt(false); }} />
    </>
  );
}

// ============================================================
// ACCESSORY CARD
// ============================================================
function AccessoryCard({ ex, onUpdate }: { ex: Accessory; onUpdate: (a: Accessory) => void }) {
  const [promptIdx, setPromptIdx] = useState<number | null>(null);

  const adjustWeight = (d: number) => {
    if (ex.isBodyweight) return;
    onUpdate({ ...ex, weight: Math.max(0, ex.weight + d) });
  };
  const logSet = (idx: number, reps: number) => {
    const setData = ex.setData.map((s, i) => i === idx ? { ...s, reps, completed: true } : s);
    onUpdate({ ...ex, setData });
    setPromptIdx(null);
  };
  const toggleSet = (idx: number) => {
    const set = ex.setData[idx];
    if (set.completed) {
      const setData = ex.setData.map((s, i) => i === idx ? { ...s, reps: null, completed: false } : s);
      onUpdate({ ...ex, setData });
    } else setPromptIdx(idx);
  };

  const repLabel = ex.isTimed ? `${ex.repsLow}-${ex.repsHigh} seconds` : `${ex.repsLow}-${ex.repsHigh} reps`;

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-neutral-50 tracking-tight">{ex.name}</div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 font-mono mt-0.5">
            {ex.sets} sets × {repLabel}
          </div>
        </div>
        {ex.progressionHint && (
          <div className="text-[10px] uppercase tracking-wider text-green-400 font-semibold flex items-center gap-1 bg-green-950/40 px-2 py-1 rounded shrink-0">
            <ArrowUp size={10} strokeWidth={3} /> {ex.progressionHint}
          </div>
        )}
      </div>

      {!ex.isBodyweight && !ex.isTimed && (
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => adjustWeight(-ex.inc)} className="w-10 h-12 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-800 active:scale-95">
            <Minus size={16} />
          </button>
          <div className="flex-1 h-12 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-center">
            <span className="font-mono text-2xl font-bold text-neutral-50">{ex.weight}</span>
            <span className="text-neutral-500 text-sm font-normal ml-1">lb</span>
          </div>
          <button onClick={() => adjustWeight(ex.inc)} className="w-10 h-12 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-800 active:scale-95">
            <Plus size={16} />
          </button>
        </div>
      )}
      {ex.isBodyweight && (
        <div className="mb-3 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-center text-xs uppercase tracking-wider text-neutral-400 font-mono">
          Bodyweight
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {ex.setData.map((set, i) => (
          <button key={set.id} onClick={() => toggleSet(i)}
            className={`py-3 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 active:scale-[0.97] ${
              set.completed ? "bg-orange-500/10 border-orange-500/40 text-orange-200" : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700"
            }`}>
            <div className="text-[10px] uppercase tracking-wider">Set {i + 1}</div>
            <div className="font-mono text-lg font-bold leading-none">{set.completed ? set.reps : "—"}</div>
            <div className="text-[10px] uppercase tracking-wider">{set.completed ? (ex.isTimed ? "sec" : "reps") : "tap"}</div>
          </button>
        ))}
      </div>

      <RepPrompt open={promptIdx !== null}
        title={ex.isTimed ? "Log Time" : "Log Reps"}
        subtitle={`${ex.name} · Set ${(promptIdx ?? 0) + 1} · target ${repLabel}`}
        defaultValue={ex.repsHigh}
        onCancel={() => setPromptIdx(null)}
        onSubmit={(n) => logSet(promptIdx!, n)} />
    </div>
  );
}

// ============================================================
// HOME VIEW
// ============================================================
function HomeView({ state, onStart, onHistory, onSettings }: {
  state: AppState; onStart: (id: string) => void; onHistory: () => void; onSettings: () => void;
}) {
  const total = state.history?.length || 0;
  const benchE = getBestE1RM(state.history, "bench");
  const squatE = getBestE1RM(state.history, "squat");
  const dlE = getBestE1RM(state.history, "deadlift");

  return (
    <div className="px-5 pb-24 pt-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={22} strokeWidth={2.5} className="text-black" />
          </div>
          <div>
            <div className="font-display text-2xl tracking-wider leading-none">IRON LOG</div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono mt-1">4-DAY STRENGTH</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onHistory} className="w-10 h-10 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:border-neutral-700">
            <History size={18} />
          </button>
          <button onClick={onSettings} className="w-10 h-10 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:border-neutral-700">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono">
          CYCLE {state.cycle} · WEEK {state.week} OF 4
        </div>
        <div className="flex-1 h-px bg-neutral-800" />
        <div className="text-xs uppercase tracking-[0.2em] font-mono text-orange-400">
          {WEEK_SCHEMES[state.week].label}
        </div>
      </div>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono mb-3">THIS WEEK</div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {DAY_ORDER.map((dayId) => {
          const tpl = DAY_TEMPLATES[dayId];
          const done = state.completedThisWeek[dayId];
          return (
            <button key={dayId} onClick={() => onStart(dayId)}
              className={`relative text-left p-4 rounded-xl border transition-all active:scale-[0.98] ${
                done ? "bg-neutral-950 border-green-900/40" : "bg-gradient-to-br from-neutral-950 to-neutral-900 border-neutral-800 hover:border-orange-500/50"
              }`}>
              {done && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <Check size={12} className="text-green-400" strokeWidth={3} />
                </div>
              )}
              <div className="font-display text-2xl tracking-wide leading-none mb-2 text-neutral-50">
                {tpl.name.split(" ")[0].toUpperCase()}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">{tpl.mainName}</div>
              {!done && (
                <div className="mt-3 text-xs uppercase tracking-wider text-orange-400 font-semibold flex items-center gap-1">
                  Start <ArrowRight size={12} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono mb-3">TRAINING MAXES</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Bench", val: state.trainingMaxes.bench, best: benchE },
          { label: "Squat", val: state.trainingMaxes.squat, best: squatE },
          { label: "Deadlift", val: state.trainingMaxes.deadlift, best: dlE },
        ].map((s) => (
          <div key={s.label} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{s.label}</div>
            <div className="font-mono text-xl font-bold text-neutral-50 leading-none">
              {s.val}<span className="text-neutral-500 text-xs ml-0.5 font-normal">lb</span>
            </div>
            {s.best && <div className="text-[10px] text-neutral-500 mt-1 font-mono">est 1RM: {s.best}</div>}
          </div>
        ))}
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
          <Award size={18} className="text-orange-400" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Sessions Logged</div>
          <div className="font-mono text-2xl font-bold text-neutral-50">{total}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SESSION VIEW
// ============================================================
function SessionView({ state, dayId, onComplete, onCancel, onUpdateState }: {
  state: AppState; dayId: string;
  onComplete: (s: Session) => void; onCancel: () => void; onUpdateState: (s: AppState) => void;
}) {
  const [session, setSession] = useState<Session>(() => {
    if (state.activeSession && state.activeSession.dayId === dayId) return state.activeSession;
    return buildSession(dayId, state);
  });

  useEffect(() => { onUpdateState({ ...state, activeSession: session }); }, [session]);

  const toggleMain = (id: string) =>
    setSession((p) => ({ ...p, mainSets: p.mainSets.map((s) => s.id === id ? { ...s, completed: !s.completed } : s) }));
  const logAmrap = (id: string, reps: number) =>
    setSession((p) => ({ ...p, mainSets: p.mainSets.map((s) => s.id === id ? { ...s, completed: true, actualReps: reps } : s) }));
  const updateAcc = (acc: Accessory) =>
    setSession((p) => ({ ...p, accessories: p.accessories.map((a) => a.id === acc.id ? acc : a) }));

  const mainTotal = session.mainSets.length;
  const mainDone = session.mainSets.filter((s) => s.completed).length;
  const accTotal = session.accessories.reduce((s, a) => s + a.setData.length, 0);
  const accDone = session.accessories.reduce((s, a) => s + a.setData.filter((x) => x.completed).length, 0);
  const totalDone = mainDone + accDone;
  const totalSets = mainTotal + accTotal;
  const progress = totalSets ? (totalDone / totalSets) * 100 : 0;
  const mainComplete = mainDone === mainTotal;

  return (
    <div className="px-5 pb-32 pt-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-neutral-400 hover:text-neutral-100 text-sm uppercase tracking-wider">
          <ChevronLeft size={18} /> Back
        </button>
        <div className="text-xs uppercase tracking-[0.2em] font-mono text-neutral-500">
          C{session.cycle} · W{session.week} · {session.weekLabel}
        </div>
      </div>

      <div className="font-display text-4xl tracking-wide text-neutral-50 mb-1">{session.name.toUpperCase()}</div>
      <div className="text-sm text-neutral-500 mb-6">
        {session.isVolume ? "Volume bench + supporting lifts" : "Main lift + accessories"}
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs font-mono text-neutral-500 mb-2">
          <span>{totalDone}/{totalSets} SETS</span><span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 mb-4">
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold mb-1">MAIN LIFT</div>
          <div className="text-xl font-bold text-neutral-50 tracking-tight">{session.mainName}</div>
          {session.isVolume && <div className="text-xs text-neutral-500 mt-1">Lighter weight, focus on speed and form</div>}
        </div>
        <div className="space-y-2">
          {session.mainSets.map((set, i) => (
            <MainSetRow key={set.id} set={set} idx={i}
              onToggle={() => toggleMain(set.id)}
              onAmrap={(reps) => logAmrap(set.id, reps)} />
          ))}
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono mb-3">ACCESSORIES</div>
      <div className="space-y-3">
        {session.accessories.map((acc) => (
          <AccessoryCard key={acc.id} ex={acc} onUpdate={updateAcc} />
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent"
           style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => onComplete(session)} disabled={!mainComplete}
            className={`w-full py-5 rounded-xl font-bold uppercase tracking-[0.15em] text-sm transition-all ${
              mainComplete ? "bg-orange-500 hover:bg-orange-400 text-black active:scale-[0.99]" : "bg-neutral-900 text-neutral-600 cursor-not-allowed"
            }`}>
            {totalDone === totalSets ? "Finish Workout" : mainComplete ? "Log Workout" : "Finish Main Lift First"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HISTORY VIEW
// ============================================================
function HistoryView({ state, onBack }: { state: AppState; onBack: () => void }) {
  const [filter, setFilter] = useState<string>("all");
  const history = state.history || [];
  const filtered = filter === "all" ? history : history.filter((s) => s.dayId === filter);

  return (
    <div className="px-5 pb-24 pt-6 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-neutral-400 hover:text-neutral-100 text-sm uppercase tracking-wider mb-6">
        <ChevronLeft size={18} /> Back
      </button>
      <div className="font-display text-3xl tracking-wide text-neutral-50 mb-6">HISTORY</div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", ...DAY_ORDER].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider font-mono border transition-all ${
              filter === f ? "bg-orange-500 text-black border-orange-500 font-bold" : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700"
            }`}>
            {f === "all" ? "All" : DAY_TEMPLATES[f].name.split(" ")[0]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-8 text-center">
          <div className="text-neutral-500 text-sm">No sessions yet.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s, i) => {
            const amrap = s.mainSets?.find((set) => set.isAmrap && set.actualReps);
            return (
              <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="font-semibold text-neutral-50">{s.name}</div>
                    <div className="text-xs text-neutral-500 font-mono">
                      C{s.cycle}·W{s.week} · {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                  {amrap && (
                    <div className="text-right">
                      <div className="font-mono text-orange-400 font-bold">{amrap.weight}×{amrap.actualReps}</div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{s.mainLift}</div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  {s.accessories?.length || 0} accessories · {s.mainSets?.filter((x) => x.completed).length || 0} main sets
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS VIEW
// ============================================================
function SettingsView({ state, onBack, onUpdateState }: {
  state: AppState; onBack: () => void; onUpdateState: (s: AppState) => void;
}) {
  const [showReset, setShowReset] = useState(false);
  const updateTM = (lift: "bench" | "squat" | "deadlift", v: number) => {
    const val = Math.max(45, round5(v));
    onUpdateState({ ...state, trainingMaxes: { ...state.trainingMaxes, [lift]: val } });
  };
  return (
    <div className="px-5 pb-24 pt-6 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-neutral-400 hover:text-neutral-100 text-sm uppercase tracking-wider mb-6">
        <ChevronLeft size={18} /> Back
      </button>
      <div className="font-display text-3xl tracking-wide text-neutral-50 mb-8">SETTINGS</div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono mb-3">TRAINING MAXES</div>
        <div className="text-sm text-neutral-400 mb-4">Roughly 90% of your true 1-rep max for each lift.</div>
        {([
          { id: "bench" as const, label: "Bench Press" },
          { id: "squat" as const, label: "Back Squat" },
          { id: "deadlift" as const, label: "Deadlift" },
        ]).map((l) => (
          <div key={l.id} className="mb-3 last:mb-0">
            <div className="text-xs text-neutral-400 mb-2">{l.label}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateTM(l.id, state.trainingMaxes[l.id] - 5)} className="w-12 h-12 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900">
                <Minus size={16} />
              </button>
              <div className="flex-1 h-12 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-center font-mono text-xl font-bold text-neutral-50">
                {state.trainingMaxes[l.id]} <span className="text-neutral-500 text-sm font-normal ml-1">lb</span>
              </div>
              <button onClick={() => updateTM(l.id, state.trainingMaxes[l.id] + 5)} className="w-12 h-12 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900">
                <Plus size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono mb-3">CURRENT POSITION</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Cycle</div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateState({ ...state, cycle: Math.max(1, state.cycle - 1) })} className="w-9 h-9 rounded border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900"><Minus size={14} /></button>
              <div className="flex-1 text-center font-mono text-xl font-bold text-neutral-50">{state.cycle}</div>
              <button onClick={() => onUpdateState({ ...state, cycle: state.cycle + 1 })} className="w-9 h-9 rounded border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900"><Plus size={14} /></button>
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Week</div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateState({ ...state, week: state.week === 1 ? 4 : state.week - 1 })} className="w-9 h-9 rounded border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900"><Minus size={14} /></button>
              <div className="flex-1 text-center font-mono text-xl font-bold text-neutral-50">{state.week}</div>
              <button onClick={() => onUpdateState({ ...state, week: state.week === 4 ? 1 : state.week + 1 })} className="w-9 h-9 rounded border border-neutral-800 flex items-center justify-center text-neutral-300 hover:bg-neutral-900"><Plus size={14} /></button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setShowReset(true)} className="w-full py-4 rounded-xl border border-red-900/40 text-red-400 uppercase tracking-wider text-sm font-semibold hover:bg-red-950/30 flex items-center justify-center gap-2">
        <RotateCcw size={16} /> Reset All Progress
      </button>

      {showReset && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setShowReset(false)}>
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold text-neutral-50 mb-2">Reset everything?</div>
            <div className="text-sm text-neutral-400 mb-6">Wipes all history. Can&apos;t be undone.</div>
            <div className="flex gap-2">
              <button onClick={() => setShowReset(false)} className="flex-1 py-3 rounded-lg border border-neutral-800 text-neutral-300 uppercase tracking-wider text-sm font-semibold hover:bg-neutral-900">Cancel</button>
              <button onClick={() => { onUpdateState({ ...defaultState }); setShowReset(false); }} className="flex-1 py-3 rounded-lg bg-red-900/60 text-red-100 uppercase tracking-wider text-sm font-bold hover:bg-red-900">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<"home" | "session" | "history" | "settings">("home");
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

  // Load on client after mount (avoids SSR issues with localStorage)
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    if (loaded.activeSession) setActiveDayId(loaded.activeSession.dayId);
  }, []);

  useEffect(() => { if (state) saveState(state); }, [state]);

  if (!state) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-neutral-500 text-sm uppercase tracking-widest font-mono">Loading…</div>
      </div>
    );
  }

  const handleStart = (dayId: string) => { setActiveDayId(dayId); setView("session"); };
  const handleComplete = (session: Session) => {
    setState(finishSession(state, session));
    setActiveDayId(null);
    setView("home");
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      {view === "home" && <HomeView state={state} onStart={handleStart} onHistory={() => setView("history")} onSettings={() => setView("settings")} />}
      {view === "session" && activeDayId && <SessionView state={state} dayId={activeDayId} onComplete={handleComplete} onCancel={() => setView("home")} onUpdateState={setState} />}
      {view === "history" && <HistoryView state={state} onBack={() => setView("home")} />}
      {view === "settings" && <SettingsView state={state} onBack={() => setView("home")} onUpdateState={setState} />}
    </div>
  );
}
