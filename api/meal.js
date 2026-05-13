// Meal photo analysis endpoint.
// POST /api/meal with { imageBase64, mediaType } -> Claude Haiku vision returns
// estimated macros as JSON { name, items: [...], total: {kcal, protein_g, carbs_g, fat_g} }.
//
// Auth: same x-sync-secret header as /api/state (kept lightweight; this endpoint
// costs API credits so we don't want it open).

const SYSTEM_PROMPT = `You estimate macros for meals shown in photos.

For each photo:
1. Identify each food item visible.
2. Estimate portion size from visual cues (plate size, hand for scale if visible, common serving sizes).
3. Compute calories, protein, carbs, fat for each item using standard food databases.
4. Provide a total.

Be conservative when ambiguous: pick the middle of the likely portion range. If the image is unclear or not food, set name to "Unclear image" and total macros to 0.

Reply with VALID JSON ONLY. No markdown, no commentary, no code blocks.

Schema:
{
  "name": "brief meal description (e.g. 'Chicken bowl with rice and veggies')",
  "items": [
    { "food": "string", "portion": "string (e.g. '6 oz', '1 cup')", "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number }
  ],
  "total": { "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number }
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
  const { imageBase64, mediaType } = body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  if (imageBase64.length > 7_000_000) return res.status(413).json({ error: 'image too large' });

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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Estimate the macros for this meal.' },
          ],
        }],
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
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'could not parse vision response', raw: text.slice(0, 500) });
    }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
