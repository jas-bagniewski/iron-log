// Meal photo analysis endpoint.
// POST /api/meal with { imageBase64, mediaType } -> Claude Haiku vision returns
// estimated macros as JSON { name, items: [...], total: {kcal, protein_g, carbs_g, fat_g} }.
//
// Auth: same x-sync-secret header as /api/state (kept lightweight; this endpoint
// costs API credits so we don't want it open).

const SYSTEM_PROMPT = `You estimate meal macros from either a photo or a text description.

Process:
1. Identify each food item.
2. Estimate portion size from visual cues (plate size, hand for scale, common servings) or from the words in the description (e.g. "4 boiled eggs" = 4 eggs).
3. Compute calories, protein, carbs, fat for each item using standard food databases.
4. Provide a total.

EXPLICIT NUMBERS: If the user's description includes a calorie count (e.g. "830 cal", "830 calories", "830kcal") or macro values (e.g. "46g protein"), use those numbers verbatim — the user is telling you the answer (they read it off a menu or label). Distribute kcal across items to roughly match, but the totals must equal what the user stated.

PORTION CONFIDENCE: Rate how confident your portion estimate is:
- "high" — clear scale reference in the photo (a hand, utensil near plate edge, recognizable branded container) OR portion is genuinely unambiguous (a labeled drink, an explicit count like "4 eggs", a single packaged sandwich)
- "medium" — standard restaurant or home serving where typical conventions apply (a normal dinner plate of pasta, a chain restaurant bowl)
- "low" — bowl/plate of unknown size with no scale reference, top-down shot with no depth cues, volume genuinely ambiguous (a "plate of rice" could be 1 cup or 3 cups)

If confidence is "low" or "medium", set portion_note to a SHORT specific suggestion (≤12 words) for what would sharpen the estimate. Examples:
- "Add a hand or fork next to the plate for scale"
- "A side-angle photo would help estimate depth"
- "Confirm whether this is a regular or large size"
- "Mention the restaurant — known menu items have published macros"
If confidence is "high", set portion_note to null.

Be conservative when ambiguous: pick the middle of the likely portion range. If the input is unintelligible or not food, set name to "Unclear" and total macros to 0. For text inputs that name a food but don't specify portion, assume one typical serving and rate confidence as "medium" or "low".

Reply with VALID JSON ONLY. No markdown, no commentary, no code blocks.

Schema:
{
  "name": "brief meal description (e.g. 'Chicken bowl with rice and veggies')",
  "items": [
    { "food": "string", "portion": "string (e.g. '6 oz', '1 cup', '4 large')", "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number }
  ],
  "total": { "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "portion_confidence": "high" | "medium" | "low",
  "portion_note": "short suggestion or null"
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
  const { imageBase64, mediaType, description } = body || {};
  if (!imageBase64 && !description) return res.status(400).json({ error: 'imageBase64 or description required' });
  if (imageBase64 && imageBase64.length > 7_000_000) return res.status(413).json({ error: 'image too large' });
  if (description && typeof description === 'string' && description.length > 2000) return res.status(413).json({ error: 'description too long' });

  const userContent = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Estimate the macros for this meal.' },
      ]
    : [
        { type: 'text', text: `Estimate macros for: ${description.trim()}` },
      ];

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
        messages: [{ role: 'user', content: userContent }],
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
