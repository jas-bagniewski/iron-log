// 7-day diet review endpoint.
// POST /api/diet-review with { days: [{ date, meals }], targets, weight, mode }
// -> Claude Haiku returns structured analysis covering macro hits, food
// group balance, diversity, and concrete actions.
//
// Auth: x-sync-secret header.

const SYSTEM_PROMPT = `You are a nutrition coach reviewing 7 days of logged meals.

CRITICAL ARITHMETIC RULE: All numerical facts (daily totals, averages, percentages, deltas vs target) are PRE-COMPUTED and given to you. NEVER do your own arithmetic - never add up meal calories, never calculate percentages, never sum protein. Use ONLY the numbers in the "PRE-COMPUTED FACTS" section verbatim. If you need a number that isn't there, say "based on the totals above" and reference them rather than computing.

Your job is to read the QUALITATIVE content (meal names, items lists, timestamps) and produce findings on:
1. FOOD GROUP BALANCE — vegetables, fruit, lean protein, whole grains, dairy, processed/treats, alcohol. Tally servings by reading meal names and items lists. Flag absences.
2. DIVERSITY — same meals repeating vs variety. Look at meal names.
3. TIMING — late-night eating after 10pm, skipped breakfast (no meal before 10am), >5h gaps between meals.

Do NOT flag day-to-day calorie variation or "wild swings". The app's pace-adjustment system intentionally varies each day's calorie target to balance the trailing 7-day total — a 500-cal swing across days is BY DESIGN. Macro totals and protein hit counts are surfaced separately in the deterministic stats panel; don't repeat them. Focus your narrative on food groups, diversity, timing, and protein quality.

Timestamps are in the user's LOCAL time, formatted "h:MM AM/PM".

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
function computeStats(days, targets) {
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
  return {
    days_logged: logged.length,
    total_days_requested: perDay.length,
    avg_kcal: avgKcal,
    avg_protein: avgProtein,
    avg_carbs: avgCarbs,
    avg_fat: avgFat,
    protein_hit_days: proteinHits,
    kcal_range: { min: kcalMin, max: kcalMax, swing: kcalMax - kcalMin },
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

  const stats = computeStats(days, targets);

  const userMsg = `==================
PRE-COMPUTED FACTS (use verbatim; do not recompute)
==================
Daily targets: ${targets.kcal} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat
Body weight: ${weight || '?'} lb
Goal mode: ${mode}

Days logged: ${stats.days_logged} of ${stats.total_days_requested}
Avg per day (across logged days only):
  - ${stats.avg_kcal} kcal
  - ${stats.avg_protein}g protein
  - ${stats.avg_carbs}g carbs
  - ${stats.avg_fat}g fat
Days hit protein target (>=95% of ${targets.protein}g): ${stats.protein_hit_days} of ${stats.days_logged}
Calorie swing across days: ${stats.kcal_range.min} - ${stats.kcal_range.max} (${stats.kcal_range.swing} range)

Per-day totals:
${stats.per_day.map(d => `  ${d.date}: ${d.kcal} kcal (${d.kcal_vs_target_pct >= 0 ? '+' : ''}${d.kcal_vs_target_pct}% vs target), ${d.protein}g P${d.protein_hit ? ' ✓' : ' (missed)'}, ${d.carbs}g C, ${d.fat}g F, ${d.mealCount} meals`).join('\n')}

==================
RAW MEAL LOG (use for qualitative analysis only — food groups, timing, diversity)
==================
${days.map(d => {
  const meals = (d.meals || []).map(m => {
    const t = fmtTime(m.loggedAt);
    return `  - ${m.name}${m.source ? ' [' + m.source + ']' : ''}${t ? ' @ ' + t : ''}${m.items && m.items.length > 0 ? ' — items: ' + m.items.map(i => i.food).join(', ') : ''}`;
  }).join('\n') || '  (no meals logged)';
  return `${d.date}:\n${meals}`;
}).join('\n\n')}

==================

Analyze the qualitative patterns (food groups, diversity, timing). Use ONLY the pre-computed numbers above when citing macros, percentages, totals, or averages. Return JSON per the schema.`;

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
