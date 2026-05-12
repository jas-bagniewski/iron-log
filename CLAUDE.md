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
- Training maxes auto-bump after a full 4-week cycle: +5 lb bench, +10 lb squat/deadlift.
- Accessories use double progression: hit top of rep range on ALL sets → next session shows "+X lb" hint.

## Days

- **Chest Day** — Bench (main) + incline DB press, close-grip bench, Tonal tricep extension, Tonal decline fly
- **Full Body Day** — Bench (volume 5×5 at 60%) + goblet squat, lat pulldown, DB OHP, plank
- **Leg Day** — Squat (main) + RDL, leg press, leg curls, calf raises, hanging leg raises
- **Back Day** — Deadlift (main, hex bar) + pull-ups, barbell rows, lat pulldown, face pulls, DB curls

## Data shape

See `AppState` type in `lib/program.ts`. Workouts in `history`, weekly progress in `completedThisWeek`, accessory weight memory in `accessoryLog`, PT share token in `shareToken`.

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
