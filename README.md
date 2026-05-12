# Iron Log

Personal 4-day strength training tracker. Next.js + Tailwind. Deploys to Vercel.

## Stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- TypeScript
- lucide-react icons
- localStorage for persistence (single-device, no backend)

## Local development

```bash
npm install
npm run dev
```

Opens at http://localhost:3000

## How to edit the program

All exercise and program logic lives in **`lib/program.ts`**. The UI is in **`app/page.tsx`** and never needs to change for routine updates.

### Add an exercise
1. Open `lib/program.ts`
2. Add a new entry to the `ACCESSORIES` object:
   ```ts
   "my-new-exercise": { name: "My Exercise", sets: 3, repsLow: 8, repsHigh: 10, inc: 5, startWeight: 50 },
   ```
3. Add its id to the relevant day in `DAY_TEMPLATES.accessories`

### Change a day's exercises
1. Open `lib/program.ts`
2. Edit the `accessories` array of the relevant day in `DAY_TEMPLATES`

### Change progression rules (rep ranges, weight increments)
Edit `ACCESSORIES` entries — `repsLow`, `repsHigh`, `inc`.

### Change the 5/3/1 percentages or week structure
Edit `WEEK_SCHEMES` in `lib/program.ts`.

## Deployment

Deploys to Vercel automatically on push to `main` once you connect the repo:

```bash
git add .
git commit -m "your message"
git push
```

Vercel will redeploy in ~30 seconds. No `vercel deploy` command needed.

## Data storage

Workout data lives in `localStorage` under the key `iron-log:v2`. To wipe it, use the Reset button in Settings, or run in browser console:
```js
localStorage.removeItem("iron-log:v2")
```

Data is per-device. If you need cross-device sync, that would require a backend (Supabase or similar — not built in).
