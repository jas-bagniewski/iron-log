// End-of-day "top off my macros" endpoint.
// POST /api/topoff with { remaining: {kcal, protein, carbs, fat}, preferences, priority }
// -> Claude Haiku returns 3-5 snack suggestions tuned to close the macro gap.
//
// Auth: same x-sync-secret header as the other endpoints.

const SYSTEM_PROMPT = `You suggest end-of-day snacks to hit a protein gap. Each suggestion is a SINGLE food item, portion-sized so it lands close to the user's remaining protein target.

You are given:
- remaining_protein_g (the gap to close)
- remaining_carbs_g, remaining_fat_g, remaining_kcal (for context only — do NOT try to balance these)
- preferences: free-text describing which specific foods the user keeps at home

RULES:
1. ONE food per suggestion. Never combine items ("yogurt + berries", "shake + popcorn", etc.).
2. Pick from the user's preferences list. Don't invent foods they didn't mention.
3. Size the portion so its protein content is within ±3g of remaining_protein_g. If a food's max realistic single-portion can't hit the gap, scale to its biggest reasonable portion and say so.
4. Pick foods with the BEST protein-per-calorie ratio first. The user is in a cut — minimise unnecessary carbs/fat. Prefer lean protein sources (cottage cheese, Greek yogurt, jerky, protein shake) over calorie-dense foods (nuts, chocolate) unless the user specifically lacks lean options.
5. Provide 4–5 alternatives so the user can pick. Order from leanest (best protein/cal) to most calorie-dense.

For each suggestion, the macros must reflect the SPECIFIC PORTION you list, not a generic per-serving entry. If you say "1.8 oz beef jerky", compute the macros for 1.8 oz (not the standard 1 oz serving).

Output VALID JSON ONLY, no markdown, no commentary:
{
  "suggestions": [
    { "name": "Food name only (e.g. 'Beef jerky', not 'Beef jerky with crackers')", "portion": "specific scaled portion (e.g. '1.8 oz', '1.5 cups', '2 sticks')", "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "why": "one short line, e.g. 'Hits 27g protein, only 130 cal'" }
  ]
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
  const remaining = body && body.remaining;
  if (!remaining || typeof remaining !== 'object') return res.status(400).json({ error: 'remaining macros required' });

  const preferences = (body && body.preferences) || '';
  const priority = (body && body.priority) || 'protein_first';

  const userMsg = `Remaining today:
- protein gap: ${Math.round(remaining.protein || 0)}g (THIS is what I want to hit)
- carbs remaining: ${Math.round(remaining.carbs || 0)}g (ignore, flex space)
- fat remaining: ${Math.round(remaining.fat || 0)}g (ignore)
- cal budget remaining: ${Math.round(remaining.kcal || 0)} (ignore)

My snack preferences:
${preferences ? preferences.trim() : '(none provided — use common high-protein grab-and-go options)'}

Give me 4-5 single-item options sized to hit the protein gap. No combinations. Order leanest first.`;

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
        max_tokens: 1024,
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
