# Iron Log

A personal strength training tracker with diet logging, body composition tracking, and adaptive macros. Mobile-first PWA, deploys to your own Vercel in ~15 minutes.

**Built for people who:**
- Want a simple 5/3/1-style strength program with progress tracking
- Want to log meals (photo or text → AI estimates macros) and track cut/maintain/bulk
- Already use a Withings smart scale and/or an Oura ring and want the data fed back into their macro targets
- Don't want to pay a SaaS subscription — own your code, own your data

## What you get

- **Iron Log tab**: 4-day strength program (chest / full body / legs / back), 5/3/1 cycle with auto-bumping training maxes, AMRAP sets, accessory progression, history with session detail, per-exercise progress charts.
- **Diet tab**: daily macro targets, meal logging via photo (Claude Haiku vision) or text ("4 boiled eggs"), pace calibration loop comparing last-7-days intake vs Oura burn.
- **Home dashboard**: today's diet remaining, training maxes with e1RM, Oura recovery card (sleep + readiness + active burn), body composition trend.
- **Coach Share Link**: read-only public URL for your PT to follow your training.
- **Cross-device sync**: any number of phones/tablets/laptops via Vercel KV; each device just needs your sync secret.

## Cost to run

| Service | Tier | Monthly cost |
|---|---|---|
| Vercel | Hobby | $0 |
| Upstash KV | Free (10k cmds/day) | $0 |
| Withings dev app | Free | $0 |
| Oura Personal Access Token | Free | $0 |
| Anthropic API (meal AI) | Pay-as-you-go | ~$1–5 |

Total: **~$1–5/mo**, billed to your own card. No shared infra, no auth, no SaaS.

## Setup

Two paths:

### Path A — let Claude Code do most of it (recommended)
1. Fork this repo (top-right **Fork** on GitHub)
2. Install [Claude Code](https://claude.ai/code) and `cd` into your fork
3. Tell Claude: **`Follow SETUP.md to wire up my fork`**
4. Answer the questions it asks (Anthropic key, Withings dev app, Oura token, your body stats)

Claude will create the Vercel project, attach Upstash KV, set the env vars, register the providers, and deploy. End-to-end about 15 minutes.

### Path B — manual setup
Read [`SETUP.md`](./SETUP.md) top to bottom. Same steps, you do them.

## Customization

After setup, ask Claude Code (in your fork) things like:
- *"Change me from a 4-day strength split to a 5-day PPL hypertrophy program"*
- *"My goal is to bulk, not cut — adjust the macro formula"*
- *"Swap dumbbell bench for floor press on chest day"*
- *"Use kilos instead of pounds"*

Edits land via PR, the workflow re-attributes the commit so your Vercel Hobby deploy accepts it, and you're live in 30 seconds. The full app architecture is documented in [`CLAUDE.md`](./CLAUDE.md) so Claude knows where to make changes.

## Architecture (one paragraph)

`index.html` is the entire deployed app: React 18 + Tailwind + Babel-standalone via CDN, one big inline `<script type="text/babel">`. State persists to `localStorage` and mirrors to Vercel KV via `/api/state` (gated by your `SYNC_SECRET`). Coach share renders `share.html` via a `vercel.json` rewrite (`/share/:token` → `share.html`, fetched from `/api/share?t=…`). Meal vision goes through `/api/meal` (Claude Haiku via Anthropic API). Withings flow uses OAuth2 (`/api/withings/{auth,callback,sync}`), Oura uses a Personal Access Token (`/api/oura/sync`). The `app/` and `lib/` Next.js directories are an unused mirror kept for a possible future revival.

## License

MIT. Fork it, change it, ship it.
