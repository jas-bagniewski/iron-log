# Iron Log
Personal 4-day strength training tracker. Deploys to Vercel.

## Stack

- Static `index.html` with React 18 + Babel-standalone + Tailwind, all via CDN
- Two Vercel serverless functions under `/api/` for cloud sync + coach share
- Vercel KV (Upstash Redis) for cross-device state
- `localStorage` as the offline cache on each device

`vercel.json` skips a framework build — Vercel just serves the repo root as static files, with `/api/*` picked up automatically as serverless functions.

> The `app/` and `lib/` Next.js code is **not built or deployed**. It's kept as a mirror of the program logic in `index.html` for a future revival. Keep both in sync when editing program data.

## How to edit the program

Program data — accessories, day templates, week schemes, default training maxes — lives in **`index.html`** (the deployed app) and is mirrored in **`lib/program.ts`**. When you change one, change the other.

### Add an exercise
1. Open `index.html`, find `const ACCESSORIES = {`, add an entry.
2. Add its id to the relevant day in `DAY_TEMPLATES`.
3. Mirror both changes in `lib/program.ts`.

### Change a rep range, set count, or weight increment
Edit the entry in `ACCESSORIES` (both files).

### Change the 5/3/1 percentages
Edit `WEEK_SCHEMES` (both files).

## Cloud sync + coach share

Two Vercel serverless functions:

- `api/state.js` — owner read/write, guarded by `x-sync-secret` header against env `SYNC_SECRET`.
- `api/share.js` — PT read-only, compares `?t=<token>` against `state.shareToken` stored in KV.

### One-time setup in the Vercel dashboard

1. **Project → Storage → Create → KV** (Upstash Redis). Attach it. Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Project → Settings → Environment Variables**: add `SYNC_SECRET` = a strong random string.

### On each owner device

Open Settings → **Cloud Sync** → paste `SYNC_SECRET` → Save. The page pulls cloud state; subsequent edits debounce-push (~1.5 s after the last change). Status badge (top right of Home) shows `Synced`, `Syncing…`, `Local only`, `Sync error`, or `Bad secret`.

### Sharing with a coach / PT

Open Settings → **Coach Share Link** → Generate. Copy the URL (`https://<domain>/share/<token>`) and send it. It renders a read-only summary: training maxes, current cycle/week, current accessory weights, recent sessions. Rotate or Revoke from the same screen — old links die immediately.

## Local development

You can preview the static page directly:

```bash
python3 -m http.server 3000
# or
npx serve .
```

Cloud-sync API routes won't work locally unless you run via `vercel dev` with the env vars set. For UI-only work, the localStorage path is enough.

## Deployment

Deploys to Vercel automatically on push to `main`. Vercel redeploys in ~30 seconds.

## Data storage

Workout data lives in `localStorage` under `iron-log:v2`, and (when sync is enabled) in Vercel KV under `iron-log:state:v1`.

To wipe local data:
```js
localStorage.removeItem("iron-log:v2")
localStorage.removeItem("iron-log:syncSecret")
```

To wipe cloud data: in Vercel dashboard → KV → delete the key, or use Settings → Reset All Progress (which then syncs the empty state up).
