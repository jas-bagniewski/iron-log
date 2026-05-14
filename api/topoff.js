// End-of-day "top off my macros" endpoint.
// POST /api/topoff with { remaining: {kcal, protein, carbs, fat}, preferences, priority }
// -> Claude Haiku returns 3-5 snack suggestions tuned to close the macro gap.
//
// Auth: same x-sync-secret header as the other endpoints.

const SYSTEM_PROMPT = `You suggest specific snacks to close end-of-day macro gaps.

You are given:
- The user's remaining macros for the day: kcal, protein_g, carbs_g, fat_g
- The user's preferences: a free-text description of foods they like and foods to avoid
- A priority: usually "protein_first" (close the protein gap first; carbs/fat are flex)

Suggest 3-5 specific snack options. Each option:
1. PRIORITIZES closing the protein gap (most important — non-negotiable for muscle retention in a cut)
2. Uses foods the user likes
3. Is a realistic single-portion snack (not a full meal)
4. Comes in under or close to the remaining calorie budget when possible
5. Has macros that move the user toward their targets, not away

Prefer high-protein, lower-carb options when priority is "protein_first" since carbs are flex space in a cut.

If the user's preferences list anything they explicitly avoid, never suggest those.

Output VALID JSON ONLY, no markdown, no commentary:
{
  "suggestions": [
    { "name": "string (short)", "portion": "string (specific portion size)", "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "why": "string (one short line)" }
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

  const userMsg = `My remaining macros for today:
- ${Math.round(remaining.protein || 0)}g protein
- ${Math.round(remaining.carbs || 0)}g carbs
- ${Math.round(remaining.fat || 0)}g fat
- ${Math.round(remaining.kcal || 0)} kcal budget

Priority: ${priority}.

My food preferences: ${preferences ? preferences.trim() : 'no specific preferences listed'}

Suggest 3-5 snacks.`;

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
