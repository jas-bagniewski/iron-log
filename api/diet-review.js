// 7-day diet review endpoint.
// POST /api/diet-review with { days: [{ date, meals }], targets, weight, mode }
// -> Claude Haiku returns structured analysis covering macro hits, food
// group balance, diversity, and concrete actions.
//
// Auth: x-sync-secret header.

const SYSTEM_PROMPT = `You are a nutrition coach reviewing 7 days of logged meals.

CRITICAL ARITHMETIC RULE: All numerical facts (daily totals, averages, percentages, deltas vs target) are PRE-COMPUTED and given to you. NEVER do your own arithmetic - never add up meal calories, never calculate percentages, never sum protein. Use ONLY the numbers in the "PRE-COMPUTED FACTS" section verbatim. If you need a number that isn't there, say "based on the totals above" and reference them rather than computing.

Your job is to read the QUALITATIVE content (meal names + items lists) and produce findings on:
1. FOOD GROUP BALANCE — vegetables, fruit, lean protein, whole grains, dairy, processed/treats, alcohol. Tally servings by reading meal names and items lists. Flag absences.
2. DIVERSITY — same meals repeating vs variety. Look at meal names.
3. TIMING — ONLY if pre-computed timing facts show a real issue: meals_after_10pm > 2 OR meals_before_6am > 0 OR earliest_hour > 11 (skipped breakfast). Do NOT count or interpret meal times yourself.

DO NOT:
- Flag day-to-day calorie variation (pace adjustment is by design).
- Flag "unlogged days" or "consecutive days missing" — the meal log only includes days the user actually tracked. Days outside that are not present in your context.
- Compute meal times, sum calories, or count anything. Use the pre-computed facts.
- Repeat macro totals or protein hit counts in findings (they're shown in the stats panel above the findings).

BREVITY RULES (strict):
- verdict: max 10 words
- each finding: max 15 words, one sentence, lead with the number
- each action: max 12 words, imperative ("Add X to Y"), no caveats
- output 3 findings MAX, 2 actions MAX
- no preamble, no encouragement, no "you should consider"

Be SPECIFIC with numbers from PRE-COMPUTED FACTS. "Veg in 1 of 14 meals" not "vegetable intake has been low". Calm trainer.

Status:
- "good": dialed, minor tweaks only
- "mixed": some targets hit, some missed
- "attention": important miss (protein under, no veg, wild swings)

Output VALID JSON ONLY, no markdown:
{
  "verdict": "short sentence",
  "status": "good" | "mixed" | "attention",
  "findings": [
    { "icon": "check" | "warn" | "info", "text": "tight observation with a number" }
  ],
  "actions": [
    "tight imperative with food/quantity"
  ]
}`;

// Server-side stats: pre-computed so the AI doesn't have to (and can't) get
// the arithmetic wrong. Returned to the client as authoritative.
function computeStats(days, targets, tz) {
  const localHour = (iso) => {
    if (!iso) return null;
    try {
      const h = new Date(iso).toLocaleString('en-US', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false });
      const n = parseInt(h, 10);
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  };
  const perDay = (days || []).map((d) => {
    const meals = d.meals || [];
    const totals = meals.reduce((acc, m) => ({
      kcal: acc.kcal + (m.kcal || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return {
      date: d.date,
      mealCount: meals.length,
      kcal: Math.round(totals.kcal),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
      kcal_vs_target_pct: targets && targets.kcal ? Math.round(((totals.kcal - targets.kcal) / targets.kcal) * 100) : 0,
      protein_hit: targets && targets.protein ? totals.protein >= targets.protein * 0.95 : false,
    };
  });
  const logged = perDay.filter((d) => d.mealCount > 0);
  const sum = (key) => logged.reduce((s, d) => s + (d[key] || 0), 0);
  const avgKcal = logged.length ? Math.round(sum('kcal') / logged.length) : 0;
  const avgProtein = logged.length ? Math.round(sum('protein') / logged.length) : 0;
  const avgCarbs = logged.length ? Math.round(sum('carbs') / logged.length) : 0;
  const avgFat = logged.length ? Math.round(sum('fat') / logged.length) : 0;
  const proteinHits = logged.filter((d) => d.protein_hit).length;
  const kcalMin = logged.length ? Math.min(...logged.map((d) => d.kcal)) : 0;
  const kcalMax = logged.length ? Math.max(...logged.map((d) => d.kcal)) : 0;

  // Timing facts: count meals by local hour-of-day across all logged meals.
  // Pre-computed so the AI doesn't have to parse timestamps (which it does
  // unreliably with many meals).
  const allMealsWithTime = logged.flatMap(d => (days.find(x => x.date === d.date)?.meals || []).map(m => ({
    ...m,
    hour: localHour(m.loggedAt),
  }))).filter(m => m.hour != null);
  const earliest = allMealsWithTime.length ? Math.min(...allMealsWithTime.map(m => m.hour)) : null;
  const latest = allMealsWithTime.length ? Math.max(...allMealsWithTime.map(m => m.hour)) : null;
  const before6am = allMealsWithTime.filter(m => m.hour < 6).length;
  const after10pm = allMealsWithTime.filter(m => m.hour >= 22).length;

  return {
    days_logged: logged.length,
    total_days_requested: perDay.length,
    avg_kcal: avgKcal,
    avg_protein: avgProtein,
    avg_carbs: avgCarbs,
    avg_fat: avgFat,
    protein_hit_days: proteinHits,
    kcal_range: { min: kcalMin, max: kcalMax, swing: kcalMax - kcalMin },
    timing: {
      earliest_hour: earliest,
      latest_hour: latest,
      meals_before_6am: before6am,
      meals_after_10pm: after10pm,
      total_meals_with_time: allMealsWithTime.length,
    },
    per_day: perDay,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  const provided = req.headers['x-sync-secret'];
  if (provided !== expected) return res.status(401).json({ error: 'unauthorized' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const days = body && body.days;
  const targets = body && body.targets;
  const weight = body && body.weight;
  const mode = (body && body.mode) || 'cut';
  const tz = (body && body.tz) || 'UTC';
  if (!Array.isArray(days) || !targets) return res.status(400).json({ error: 'days and targets required' });

  const fmtTime = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return ''; }
  };

  const stats = computeStats(days, targets, tz);

  // Only send days that actually have meals logged. Unlogged days are simply
  // days the user wasn't using the app yet - not a dietary issue.
  const loggedDays = days.filter(d => (d.meals || []).length > 0);

  const t = stats.timing;
  const fmtHour = (h) => h == null ? '?' : (h % 12 === 0 ? '12' : h % 12) + (h < 12 ? ' AM' : ' PM');

  const userMsg = `==================
PRE-COMPUTED FACTS (use verbatim; do not recompute)
==================
Daily targets: ${targets.kcal} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat
Body weight: ${weight || '?'} lb
Goal mode: ${mode}
User local timezone: ${tz}

Days logged: ${stats.days_logged}
Avg per day:
  - ${stats.avg_kcal} kcal
  - ${stats.avg_protein}g protein
  - ${stats.avg_carbs}g carbs
  - ${stats.avg_fat}g fat
Days hit protein target (>=95% of ${targets.protein}g): ${stats.protein_hit_days} of ${stats.days_logged}

Per-logged-day totals:
${stats.per_day.filter(d => d.mealCount > 0).map(d => `  ${d.date}: ${d.kcal} kcal, ${d.protein}g P${d.protein_hit ? ' ✓' : ' (missed)'}, ${d.carbs}g C, ${d.fat}g F, ${d.mealCount} meals`).join('\n')}

TIMING FACTS (local time, pre-computed - DO NOT compute time yourself):
  - Total meals with timestamps: ${t.total_meals_with_time}
  - Earliest meal hour: ${fmtHour(t.earliest_hour)}
  - Latest meal hour: ${fmtHour(t.latest_hour)}
  - Meals before 6 AM: ${t.meals_before_6am}
  - Meals after 10 PM: ${t.meals_after_10pm}

==================
RAW MEAL LOG (for QUALITATIVE analysis only — food groups, diversity. Do NOT count, sum, or interpret times.)
==================
${loggedDays.map(d => {
  const meals = (d.meals || []).map(m => {
    return `  - ${m.name}${m.items && m.items.length > 0 ? ' — items: ' + m.items.map(i => i.food).join(', ') : ''}`;
  }).join('\n');
  return `${d.date}:\n${meals}`;
}).join('\n\n')}

==================

Use ONLY the pre-computed numbers above for any quantitative claim (macros, percentages, totals, meal counts, timing). The raw meal log is for reading meal NAMES and ITEMS to assess food groups and diversity. Return JSON per the schema.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1536,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(502).json({ error: 'anthropic error', detail: errText.slice(0, 500) });
    }
    const j = await r.json();
    const text = (j.content && j.content[0] && j.content[0].text) || '';
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return res.status(502).json({ error: 'could not parse response', raw: text.slice(0, 500) }); }
    // Replace any AI-supplied stats with the server-computed authoritative ones.
    // AI is unreliable at summing many numbers; we did the math, so use ours.
    parsed.stats = {
      days_logged: stats.days_logged,
      avg_kcal: stats.avg_kcal,
      avg_protein: stats.avg_protein,
      protein_hit_days: stats.protein_hit_days,
    };
    parsed.per_day = stats.per_day;
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
