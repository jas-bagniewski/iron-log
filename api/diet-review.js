// 7-day diet review endpoint.
// POST /api/diet-review with { days: [{ date, meals }], targets, weight, mode }
// -> Claude Haiku returns structured analysis covering macro hits, food
// group balance, diversity, and concrete actions.
//
// Auth: x-sync-secret header.

const SYSTEM_PROMPT = `You are a nutrition coach reviewing 7 days of logged meals.

You will be given:
- 7 days of meals (name, macros, source, time)
- Daily macro targets (calories, protein, carbs, fat)
- Body weight in lb (for protein-per-lb assessment)
- Current goal mode (cut / maintain / bulk)

Analyze and return findings on:
1. PROTEIN: how many days hit the daily target (critical in cut). Total weekly average.
2. CALORIE PATTERN: consistency vs wild swings. Did they stay in deficit range (~-200 to -500/day for cut)?
3. FOOD GROUP BALANCE: tally servings of vegetables, fruit, lean protein, whole grains, dairy, processed/treats, alcohol. Flag absences.
4. DIVERSITY: are 3 meals making up >60% of intake? Affects micronutrients.
5. TIMING: late-night eating patterns, fasting gaps, skipped breakfasts (if timestamps suggest).

Be SPECIFIC with numbers. "Veg appeared in 1 of 14 meals" not "low veg". Don't be preachy or lecture. Pretend you're a calm trainer giving a status update.

Status levels:
- "good": diet is dialed, only minor optimisations to mention
- "mixed": hitting some targets, missing others, clear improvements possible
- "attention": at least one important miss (protein, no veg in 7 days, wild calorie swings)

Output VALID JSON ONLY, no markdown, no code fences:
{
  "verdict": "one short sentence summary",
  "status": "good" | "mixed" | "attention",
  "findings": [
    { "icon": "check" | "warn" | "info", "text": "specific observation with numbers" }
  ],
  "actions": [
    "specific concrete action with food/quantity, e.g. 'Add a fist of broccoli to dinners 4 days/wk'"
  ],
  "stats": {
    "days_logged": number,
    "avg_kcal": number,
    "avg_protein": number,
    "protein_hit_days": number
  }
}`;

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
  if (!Array.isArray(days) || !targets) return res.status(400).json({ error: 'days and targets required' });

  const userMsg = `7-day meal log (newest first):

${days.map(d => {
  const meals = (d.meals || []).map(m =>
    `  - ${m.name} (${m.kcal || 0} cal, P${m.protein || 0}g, C${m.carbs || 0}g, F${m.fat || 0}g)${m.source ? ' [' + m.source + ']' : ''}${m.loggedAt ? ' @ ' + new Date(m.loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}${m.items && m.items.length > 0 ? ' — items: ' + m.items.map(i => i.food).join(', ') : ''}`
  ).join('\n') || '  (no meals logged)';
  return `${d.date}:\n${meals}`;
}).join('\n\n')}

Daily targets: ${targets.kcal} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat
Body weight: ${weight || '?'} lb
Goal mode: ${mode}

Analyze the last 7 days. Return JSON per the schema.`;

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
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
