// AI coach endpoint.
// POST /api/coach with { context, history, message, mode }
// mode = 'chat' | 'summary'
// chat: returns { reply: "..." } - free-form coaching response
// summary: returns { summary: { training, diet, recovery, watch } }
//
// Auth: x-sync-secret header.

const CHAT_SYSTEM_PROMPT = `You are Jas's personal training and nutrition coach inside the Iron Log app. You see:
- Training maxes, recent sessions, percentile rank
- Body composition: weight, BF%, smoothed trend, goal
- Diet: today's intake + 7-day avg vs goal
- Recovery: Oura sleep + readiness

Personality:
- Calm trainer voice. No hype, no preachy positivity, no emojis.
- Direct. Lead with the answer in the first sentence.
- Specific numbers from the digest. Never invent numbers.
- Concise. Short paragraphs, bullets when useful, max 250 words unless complex.
- Honest about uncertainty.

Knowledge:
- Jas follows 5/3/1 (4-week wave: W1=5s, W2=3s, W3=5/3/1+ PR week, W4=deload). TM ≈ 90% of true 1RM. AMRAP set drives progression. Smart-bump fires if AMRAP exceeds target+3 reps.
- Epley formula: 1RM = weight × (1 + reps/30). Overestimates above ~8 reps.
- He's cutting (goal -300 cal/d, target 15% BF). Bench is strongest, deadlift improving fast.
- Withings impedance BF% is noisy ±2-3% day to day; we smooth it via 28-day regression.
- Strength standards: Beginner / Novice / Intermediate / Advanced / Elite at 5/25/50/75/95th percentiles, adjusted for age (45) and bodyweight.

If asked about training, diet, recovery, body comp, percentiles, projection, or "what should I do" — answer with his actual data.
If asked off-topic, briefly redirect.
Don't recommend programs other than 5/3/1 unless asked. Don't make medical claims.`;

const SUMMARY_SYSTEM_PROMPT = `You generate Jas's daily coaching digest. Your job is to SYNTHESIZE — connect signals across training, diet, recovery, body comp, and tell him how he's doing + what to adjust.

DO NOT restate dashboard numbers (he can see those in the app). Your value is the analysis a coach provides — finding the patterns, connecting the dots, telling him the thing he doesn't see by reading each card individually.

EXAMPLE OF BAD (just restates dashboard, useless):
{
  "verdict": "Cut running hot; bench hit 2 reps at 220 on PR week",
  "synthesis": "Today: 1585 kcal in, 1857 burned. 7-day avg deficit -520 vs goal -300. Sleep 83, readiness 84.",
  "adjust": "Watch deficit",
  "watch": "Hit protein at 213g"
}

EXAMPLE OF GOOD (synthesizes, diagnoses, advises):
{
  "verdict": "Cut is 70% steeper than target — likely why bench has flatlined for 2 cycles.",
  "synthesis": "Bench e1RM 235 today is identical to 2 weeks ago. With 7-day avg -520 cal/d (you're cutting at -300 goal), recovery + protein synthesis are running on fumes for heavy work. Sleep 83 + readiness 84 are fine, so fatigue isn't the limiter — energy is. Body trend confirms: weight dropping 1.2 lb/wk, faster than the 0.5-0.75 sweet spot for a 45-yo on a strength program.",
  "adjust": "Pull deficit back to -300 cal/d for the next 7 days. That means eating +220 more daily (~2,100 kcal). Keep protein at 213g floor — that's the strength-protection lever.",
  "watch": "Next chest day AMRAP — if bench feels lighter subjectively at the same %TM, diet was the limiter."
}

Output STRICT JSON, no markdown, no code fences:
{
  "verdict": "DIAGNOSIS in one sentence — how he's actually doing, with the WHY (max 22 words)",
  "synthesis": "2-4 sentences connecting signals across training/diet/recovery/body. Reference specific numbers but EXPLAIN their meaning (max 90 words)",
  "adjust": "ONE specific actionable change with numbers (max 40 words). If nothing needs adjusting, say so + ONE thing to keep doing.",
  "watch": "ONE thing to monitor in the next 1-3 days, or null if nothing notable (max 20 words)"
}

Voice:
- Calm experienced trainer. Lead with the diagnosis.
- Reason like a physiologist: 5/3/1 mechanics, energy balance, recovery, protein synthesis, age (he's 45)
- No emojis, no preachy positivity, no "great job"
- If something is going well, say what AND why it matters going forward

Knowledge:
- 5/3/1 program. Cut mode: goal -300 cal/d, target 15% BF.
- Bench is slowest lift to gain on (~5 lb/cycle). Lower body gains faster.
- Withings BF% noisy; smoothed trend matters more than single reading.
- Smart bump fires only at AMRAP target+3 reps.
- e1RM (Epley) overestimates beyond ~6 reps; heavy-low-rep AMRAPs are more honest.
- 45-yo recovery is slower than 25-yo. Aggressive cuts + heavy lifting = muscle loss risk.
- Don't recommend programs other than 5/3/1. Don't make medical claims.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  const provided = req.headers['x-sync-secret'];
  if (provided !== expected) return res.status(401).json({ error: 'unauthorized' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { context, history = [], message, mode = 'chat' } = body || {};
  if (!context) return res.status(400).json({ error: 'context required' });
  if (mode === 'chat' && !message) return res.status(400).json({ error: 'message required for chat mode' });

  const systemPrompt = mode === 'summary' ? SUMMARY_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;
  const contextText = `JAS'S CURRENT DATA:\n${JSON.stringify(context, null, 2)}\n\nCurrent date: ${new Date().toISOString()}`;

  const messages = [];

  if (mode === 'chat') {
    // First user turn gets the context. Subsequent turns just continue the chat.
    if (history.length === 0) {
      messages.push({ role: 'user', content: `${contextText}\n\n---\n\nUser: ${message}` });
    } else {
      // Prepend context as a virtual first assistant turn so the chat history reads naturally.
      const trimmed = history.slice(-20); // last 20 messages
      messages.push({ role: 'user', content: contextText });
      messages.push({ role: 'assistant', content: 'Understood. Ready to help.' });
      trimmed.forEach((m) => messages.push({ role: m.role, content: m.content }));
      messages.push({ role: 'user', content: message });
    }
  } else {
    // Summary mode
    messages.push({ role: 'user', content: `${contextText}\n\n---\n\nGenerate today's status digest as JSON per the schema.` });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: mode === 'summary' ? 512 : 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(502).json({ error: 'anthropic error', detail: errText.slice(0, 500) });
    }
    const j = await r.json();
    const text = (j.content && j.content[0] && j.content[0].text) || '';

    if (mode === 'summary') {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
      let parsed;
      try { parsed = JSON.parse(cleaned); }
      catch { return res.status(502).json({ error: 'could not parse summary', raw: text.slice(0, 500) }); }
      return res.status(200).json({ summary: parsed });
    }

    return res.status(200).json({ reply: text.trim() });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
