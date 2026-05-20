// Body scan endpoint.
// POST /api/body-scan with { photos: [{ data, angle }], scaleWeight, scaleBf, age, sex, mode }
// -> Claude Haiku vision returns visual BF% estimate, scale calibration note,
// muscle-development observations, optional suggestion.
//
// Auth: x-sync-secret header.

const SYSTEM_PROMPT = `You are a calm, honest body composition coach reviewing a user's progress photos.

CONTEXT: You will receive 1-3 photos of the same person (front, side, and/or back) plus their current scale-reported weight, body fat %, age, sex, and goal mode (cut/maintain/bulk).

YOUR JOB:
1. Estimate a visible body fat % RANGE from the photos. Use muscle definition, vascularity, abdominal/oblique visibility, lower-back fat fold, hip/waist ratio. Provide a 3-percentage-point range (e.g. "16-19%"). Be honest about uncertainty.
2. Compare the visual estimate to the scale's reported BF%. If the scale reading falls OUTSIDE your visual range by 2+ percentage points, write a brief calibration note: suggest standardized measurement (fasted, morning, post-bathroom, fully hydrated, clean dry feet on the impedance scale, consistent foot placement). Don't claim the scale is wrong — just suggest tighter protocol. If the scale falls inside or near your visual range, set the note to null.
3. Observations on muscle development. 2-3 short bullets, each ≤12 words. Reference visible groups (e.g. "Lats well developed, chest could use more thickness"). Useful for directing training emphasis. Stay observational — no judgment.
4. ONE actionable suggestion if there's an obvious gap (e.g. "Add face pulls — rear delts look underdeveloped"). Skip if nothing obvious. Max 15 words.

DO NOT:
- Comment on the person's appearance generally — only training-relevant observations
- Be preachy, moralistic, or motivational
- Recommend full training programs
- Make medical or health claims
- Mention things you can't see ("I can't tell from this angle..."). Just skip them.

Output VALID JSON ONLY, no markdown:
{
  "visual_bf_estimate": "X-Y%",
  "bf_calibration_note": "short suggestion or null",
  "observations": ["string", "string"],
  "suggestion": "string or null"
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
  const { photos, scaleWeight, scaleBf, age, sex, mode } = body || {};
  if (!Array.isArray(photos) || photos.length === 0) return res.status(400).json({ error: 'photos required' });
  if (photos.length > 3) return res.status(400).json({ error: 'max 3 photos per scan' });

  // Reject silly-sized payloads early.
  const totalBytes = photos.reduce((s, p) => s + (p.data ? p.data.length : 0), 0);
  if (totalBytes > 12_000_000) return res.status(413).json({ error: 'photos too large' });

  const userContent = [];
  photos.forEach((p) => {
    if (!p || !p.data) return;
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType || 'image/jpeg', data: p.data },
    });
    userContent.push({ type: 'text', text: `Angle: ${p.angle || 'unspecified'}` });
  });
  userContent.push({
    type: 'text',
    text: `STATS:\n- Scale weight: ${scaleWeight ?? '?'} lb\n- Scale body fat: ${scaleBf ?? '?'} %\n- Age: ${age ?? '?'} y\n- Sex: ${sex || 'male'}\n- Goal mode: ${mode || 'cut'}\n\nReturn JSON per the schema.`,
  });

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
    try { parsed = JSON.parse(cleaned); }
    catch { return res.status(502).json({ error: 'could not parse response', raw: text.slice(0, 500) }); }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
