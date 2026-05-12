# Iron Log — Claude Code Context

A personal strength training tracker app. Single-user, mobile-first, deployed to Vercel.

## Owner

Jas — 45, training out of a home gym with a Tonal, barbell, and dumbbells. Currently bench-pressing 225 lb, plateaued. Goal: 275 → 315 lb over 1-3 years using a 5/3/1-style program.

## Architecture

Next.js 14 App Router. Single-page client app (no API routes, no backend). All workout data persists in `localStorage` on the user's phone.

## Key files

- `lib/program.ts` — **single source of truth for the program**. Exercise library, day templates, 5/3/1 percentages, progression rules, session-building functions. Edit this when modifying workouts.
- `app/page.tsx` — all UI. Four views: Home, Session, History, Settings. Driven by a single AppState object.
- `app/layout.tsx` — fonts (Anton display, Outfit body, JetBrains Mono numbers), PWA meta tags for iOS home screen install.
- `app/globals.css` — Tailwind base + iOS safe-area handling.
- `public/manifest.json` — PWA manifest, inline SVG icon.

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

- **Chest Day** — Bench (main) + Tonal accessories
- **Full Body Day** — Bench (volume 5×5 at 60%) + supporting lifts
- **Leg Day** — Squat (main) + accessories
- **Back Day** — Deadlift (main) + accessories

## Data shape

See `AppState` type in `lib/program.ts`. Workouts in `history`, weekly progress in `completedThisWeek`, accessory weight memory in `accessoryLog`.

## Deployment

Connected to Vercel via GitHub. Push to `main` → auto-deploy.

## Common tasks

- "Add an exercise" → edit `ACCESSORIES` and `DAY_TEMPLATES` in `lib/program.ts`
- "Change rep range for X" → edit `repsLow`/`repsHigh` on that entry in `ACCESSORIES`
- "Change progression speed" → edit `inc` on accessory entries, or the TM bump amounts in `finishSession`
- "Add a new day" → add to `DAY_TEMPLATES`, add to `DAY_ORDER` array, update `completedThisWeek` defaults

## What to avoid

- Don't add a backend without asking — `localStorage` is intentional for simplicity
- Don't restructure into multiple page routes — single page works well for a fast PWA
- Don't add authentication — single-user app
