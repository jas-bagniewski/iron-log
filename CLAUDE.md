# Iron Log — Claude Code Context

A personal strength training tracker app. Single-user, mobile-first, deployed to Vercel.

## Owner

Jas — 45, training out of a home gym with a Tonal, barbell, and dumbbells. Currently bench-pressing 225 lb, plateaued. Goal: 275 → 315 lb over 1-3 years using a 5/3/1-style program.

## Working agreement

- **The deployed app is `index.html`** (standalone React via CDN + Babel standalone). `vercel.json` skips the build, so Vercel just serves the static files. **Edit `index.html` for routine workout updates.** Mirror the same change to `lib/program.ts` so the (currently unbuilt) Next.js code stays consistent for a future revival.
- **Commit and push directly to `main` after every change.** No feature branches, no PRs. Single-user app, fast iteration. Vercel auto-deploys `main` on push.
- **The Claude Code sandbox git proxy returns 403 on pushes to `main`.** Use the GitHub MCP API instead (`mcp__github__create_or_update_file` with `branch: "main"`) to land the commit. After it lands, run `git fetch origin main && git reset --hard origin/main` locally so the working tree stays aligned with `origin/main`.

## Architecture

Static single-page app. `index.html` boots React 18 via UMD CDN, Tailwind via CDN, and an inline Babel-standalone `<script type="text/babel">` block holds the whole app. Two Vercel serverless functions under `/api/` provide cloud sync and PT sharing. State lives in `localStorage` and mirrors to Vercel KV when a sync secret is configured.

## Key files

- `index.html` — **the deployed app**. Program data (ACCESSORIES, DAY_TEMPLATES, WEEK_SCHEMES), all React components, and the cloudSync module are all here.
- `share.html` — read-only "Coach View" served at `/share/<token>` via a `vercel.json` rewrite. Fetches `/api/share?t=<token>`.
- `api/state.js` — owner sync endpoint. GET/POST guarded by `x-sync-secret` header against env `SYNC_SECRET`.
- `api/share.js` — PT read endpoint. Compares `?t=<token>` against `state.shareToken` stored in KV.
- `vercel.json` — skips build, rewrites `/share/:token` → `/share.html`.
- `lib/program.ts`, `app/*` — mirror of the program logic, kept in sync but **not built or deployed**.
- `public/manifest.json` — PWA manifest.

## Required Vercel env vars (for sync + share to work)

- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — auto-provisioned when you attach a Vercel KV (Upstash Redis) store to the project from the Vercel dashboard.
- `SYNC_SECRET` — random string. Owner pastes this into the app's Settings on each device to enable sync.
- The PT share token lives **inside the synced state** (`state.shareToken`), generated and rotated from Settings.

## Design language

- Pure black background (`#000`), orange accent (`#F97316` / `orange-500`).
- Anton (condensed display) for headings, Outfit for body, JetBrains Mono for numbers.
- Heavy use of uppercase tracking and neutral-800 borders. Minimalist, gym-equipment-inspired.

## Program logic (5/3/1)

- 4-week wave: 5s, 3s, PR (5/3/1+), Deload.
- Each main lift session has 3 sets; last set is AMRAP (As Many Reps As Possible) except in deload.
- Training maxes progress conditionally at the end of each 4-week cycle, judged per lift on the PR-week (week 3) AMRAP: hit the min reps → bump (+5 lb bench/press, +10 lb squat/deadlift); failed the single → reset TM to 90% of that cycle's best e1RM; skipped PR week → hold. Unconditional bumps (and the old mid-cycle "smart bump") were removed 2026-08-20 after they let bench/press TMs overrun the lifter.
- One-time TM recalibration shipped 2026-08-20 (`applyTMRecalibration` in index.html): bench 255→225, press 140→120, guarded by a synced `tmRecal20260820` flag + exact-value match.
- Accessories use double progression: hit top of rep range on ALL sets → next session shows "+X lb" hint.

## Days (program v4, 2026-11-20 — home gym rebuild)

Equipment: half rack with pull-up bar, 2 benches, 45 lb bar, 35 lb bar, 25 lb hex bar, curl bar, plenty of plates, DBs 5–75, Tonal, NordicTrack Ultra 1 reformer, Peloton Tread+. No leg press / leg curl machines. Avoid split squats (knee history).

Lift days are budgeted by SETS, not exercise count: ~20 working sets (`SET_BUDGET` 22) fits 60 min with accessories done in pairs (A1/A2). `daySetCount` / `estimateMinutes` show it on screen. Day ids kept from v3 so state/history keep working:
- **Bench Day** (`chest`, 20 sets) — Bench 5/3/1 + FSL 5×5 + incline DB press, Tonal single-arm row, Tonal triceps, Tonal face pulls
- **Squat Day** (`legs`, 20 sets) — Squat 5/3/1 + FSL 5×5 + barbell hip thrust, goblet squat (3s pause), single-leg DB calf raise, hanging leg raise
- **Deadlift Day** (`back`, 19 sets) — Hex bar 5/3/1 + FSL 3×5 + RDL, pull-ups ×4, Tonal Pallof press, DB curls
- **Press Day** (`fullbody`, 17 sets) — Press 5/3/1 + Bench BBB 5×10 + barbell rows, Tonal lat pulldown, Tonal lateral raise

FSL ("First Set Last") = sets at the week's first-set % of that lift's TM; skipped on deload.

**Weeks are checklists, not calendar weeks (2026-11-20).** A training week = 4 lifts + 3 runs (+1 optional) + 2 Pilates, in any order over however many days it takes. It rolls over when the 4th lift is finished (`rollTrainingWeek`) or when the owner taps "Skip to next week" in Plan (`skipToNextWeek`, logged in `state.skippedWeeks`; skipped PR-week lifts hold their TM). `state.weekStartedAt` marks the start; cardio entries are stamped `tw` with it. Never tie a session to a weekday or date — the owner travels and trains when they can.

Runs + Pilates (`CARDIO_SLOTS`, `WEEK_PLAN`, `prescribeCardio` in index.html), logged in `state.cardioLog`. `WEEK_PLAN` is only the SUGGESTED order (Day 1–6); Today shows the first suggested day with something left:
- Day 1 bench + easy 4 mi · Day 2 squat + Pilates (core, glutes, low back) · Day 3 quality run (tempo / intervals / progression / strides, rotates with the 5/3/1 week) · Day 4 deadlift + optional easy 3 mi · Day 5 press + Pilates (hamstrings, hips, flexibility) · Day 6 long run. Slot ids still say easy-mon etc. because logged entries reference them.
- Long run = previous training week's long run + 1 mi, capped at 13; ~75% on lifting deload week. At 13, the last 2 mi go to 8:30 pace.
- Goal: half marathon at 8:00/mi. Strength is the priority. Paces are shown with Tread mph.
- Logging is manual for now. Planned: Strava sync (Peloton → Strava, phone GPS outdoors). iFit/Ultra 1 has no public API.

## App structure (UI v4)

Tabs: **Today** (next sessions in the sequence + done today + week meters) · **Plan** (this week's checklist in suggested order; tap → bottom sheet; skip-week) · **Progress** (Strength / Running / Pilates / Body segments, each with an insight card) · **Fuel** (diet) · **Coach**.
- Three disciplines, one colour each, via `DISC`: Strength orange, Run sky, Pilates violet. Every training surface uses it so the blocks never blur together.
- Keep screens calm: one primary action per card, details behind a "Details" toggle or a sheet. Don't add data dumps to Today.
- Run/Pilates logging is one shared `CardioLogForm` sheet owned by `App`.
- Running insight: predicted half via Riegel (T2 = T1 × (13.1/D1)^1.06) from the best 3+ mi run in 8 weeks; pace trends use completed weeks only.

## Data shape

See `AppState` type in `lib/program.ts`. Workouts in `history`, weekly progress in `completedThisWeek`, runs + Pilates in `cardioLog`, accessory weight memory in `accessoryLog`, PT share token in `shareToken`.

## Deployment

Connected to Vercel via GitHub. Push to `main` → auto-deploy.

## Caching gotcha on the phone

iOS PWA caches the bundle aggressively. After a deploy, fully close and reopen the home-screen app to pick up the new build. If a session is already in progress when a program change ships, the in-progress session keeps the old shape — only new sessions are built from the updated `DAY_TEMPLATES`.

## Common tasks

- "Add an exercise" → edit `ACCESSORIES` and `DAY_TEMPLATES` in `index.html`, mirror to `lib/program.ts`
- "Change rep range for X" → edit `repsLow`/`repsHigh` on that entry in `ACCESSORIES`
- "Change progression speed" → edit `inc` on accessory entries, or the TM bump amounts in `finishSession`
- "Add a new day" → add to `DAY_TEMPLATES`, add to `DAY_ORDER` array, update `completedThisWeek` defaults
- "Recalibrate training maxes" → change them in Settings on the device; the cloud sync will propagate

## What to avoid

- Don't restructure into multiple page routes — single page works well for a fast PWA
- Don't add a login/auth system — the sync secret + share token model is intentional
- Don't switch storage backends without asking — Vercel KV is doing the job
