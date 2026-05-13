# Iron Log — Setup

This document walks you (or Claude Code) through setting up a fresh fork of Iron Log end-to-end.

If you're using Claude Code: open a session inside your fork's directory and paste this entire file as your first message. Claude will follow the steps, ask you for the values it needs, and edit the right files. You'll need a browser open to handle the third-party signups.

---

## Step 0 — Personalize the fork

Before doing anything else, swap out the previous owner's defaults so your app starts with your own baseline.

### 0a. Edit `CLAUDE.md`
Replace the **Owner** section with your own profile (age, current lifts, equipment, goal). Claude reads this for context on every future change you ask for.

### 0b. Edit `index.html` defaults (search for `defaultBodyStats`)
Set your starting values:
```js
const defaultBodyStats = {
  weight: 180,            // your current weight in lb
  bodyFatPct: 20,         // your current BF % (Withings will overwrite once connected)
  goalBodyFatPct: 15,     // your target BF %
  height: 70,             // your height in inches
  age: 35,                // your age
  sex: 'male',            // 'male' | 'female'
  activityLevel: 'active',// sedentary | light | moderate | active | very_active
  lastUpdated: null,
};
```

And `defaultState.trainingMaxes` further down — set to ~85% of your real 1-rep maxes (or roughly 5RM):
```js
trainingMaxes: { bench: 135, squat: 185, deadlift: 225 },
```

### 0c. Edit `.github/workflows/deploy-as-owner.yml`
Replace the hardcoded email with your GitHub no-reply email:
```yaml
if: github.event.head_commit.author.email != '<YOUR_ID>+<YOUR_USERNAME>@users.noreply.github.com'
```
Find your no-reply email at https://github.com/settings/emails → "Keep my email addresses private" section.

Also update the `git config user.name` and `git config user.email` lines to match.

This workflow re-fires Vercel deploys for Claude-authored commits by inserting an empty commit as you, so the Hobby-tier author check passes.

### 0d. Commit
Commit those three edits with a message like `Personalize fork for <your name>` and push to `main`.

---

## Step 1 — Vercel project

1. Go to https://vercel.com/new
2. Import your fork. Accept the defaults (Vercel auto-detects no framework; the `vercel.json` tells it to skip the build).
3. Don't add env vars yet — the first deploy will fail loudly with "SYNC_SECRET not configured" or similar. That's fine, we'll fix it in the next steps.
4. Note your project's production URL (something like `<repo-name>-<random>.vercel.app`).

---

## Step 2 — Upstash KV (state storage)

1. In your Vercel project, **Storage** tab → **Create** → **Marketplace Database Providers** → **Upstash**.
2. Pick **Redis**. Free plan. Connect to your iron-log project.
3. Vercel auto-injects env vars (names will vary, e.g. `KV_REST_API_URL` / `KV_REST_API_TOKEN`, or prefixed with the store name). The code looks for any of these patterns; no manual env-var copying needed.

---

## Step 3 — Sync secret

This is the password your app uses to talk to its own cloud state. Don't share it — anyone with it can read/write your data.

1. Vercel → Settings → **Environments → Production** → Add variable:
   - Key: `SYNC_SECRET`
   - Value: a long random string (20+ chars). Save it somewhere — you'll paste it on each device.
   - Apply to: Production + Preview
2. Save.

---

## Step 4 — Anthropic API (meal photo / text AI)

Used by `/api/meal` to estimate macros from photos or descriptions like "4 boiled eggs". Costs about $0.001 per call.

1. Create an Anthropic account at https://console.anthropic.com/
2. Add a payment method (minimum $5 credit usually).
3. **Settings → API Keys → Create Key**. Copy it (starts with `sk-ant-…`) — only shown once.
4. In Vercel, add env var:
   - Key: `ANTHROPIC_API_KEY`
   - Value: the key
   - Apply to: Production + Preview
5. Save.

---

## Step 5 — Withings (weight + body fat)

Skip if you don't have a Withings scale.

1. Go to https://developer.withings.com → **Public API integration** → sign in (use your normal Withings account) → **Developer Dashboard**.
2. Create an Organization (any name).
3. **Create Application** → pick **Public API integration**, accept terms.
4. Fill in:
   - Target environment: **Development**
   - Application name: `Iron Log`
   - Description: anything
   - Registered URL / Callback: `https://<your-vercel-domain>/api/withings/callback`
   - Logo: skip
5. Copy the **Client ID** and **Customer Secret** (the secret is only shown once).
6. In Vercel, add two env vars:
   - `WITHINGS_CLIENT_ID` = the client id
   - `WITHINGS_CLIENT_SECRET` = the customer secret
7. Save.

---

## Step 6 — Oura (sleep, readiness, real TDEE)

Skip if you don't have an Oura ring. Uses a Personal Access Token — no OAuth needed.

1. Go to https://cloud.ouraring.com/personal-access-tokens → sign in.
2. **Create New Personal Access Token** → name it `Iron Log` → **Create**.
3. Copy the token immediately — only shown once.
4. In Vercel, add env var:
   - Key: `OURA_PAT`
   - Value: the token
5. Save.

---

## Step 7 — Deploy

1. Vercel → **Deployments** → top deployment → **⋯** → **Redeploy** (this picks up all the env vars you just set).
2. Wait ~30 seconds. Should turn green.
3. Open the production URL on your phone in Safari/Chrome.

---

## Step 8 — Configure the app on your phone

1. **Add to Home Screen** from the browser share menu — installs the PWA.
2. Open the app. Tap the **gear icon** (Settings).
3. **Cloud Sync** — paste your `SYNC_SECRET`, Save. Badge should turn green.
4. **Body Stats** — confirm/adjust your weight, BF %, goal BF %, activity level. Tap **Save weigh-in**.
5. **Withings** (if set up) — tap **Connect**, log in to Withings, approve. Close the success tab, return to the app, tap **Sync now**. Your weight + BF % fill in from your latest weigh-in.
6. **Oura** (if set up) — tap **Sync Oura now**. Sleep, readiness, and 7-day burn flow into your dashboard and macro targets.
7. **Coach Share Link** (optional) — tap **Generate share link**, copy, send to your PT.

---

## Step 9 — Customize the program (optional)

If 4-day 5/3/1 isn't your thing, tell Claude what you want. Examples:

- *"Convert me to a 5-day PPL hypertrophy program with 4 sets of 8–12 reps, no AMRAP sets."*
- *"Add a dedicated arms day, drop full body."*
- *"Use kilos throughout the app."*
- *"My deficit is too aggressive — make cut mode -200 cal instead of -300."*
- *"Swap close-grip bench for skull crushers on chest day."*

Claude will edit `DAY_TEMPLATES`, `ACCESSORIES`, `WEEK_SCHEMES`, and/or `computeMacroTargets` in `index.html` and mirror to `lib/program.ts`.

---

## Done

You now have:
- An always-on personal training + nutrition tracker on your phone home screen
- Auto-syncing body composition (Withings) and recovery/burn (Oura)
- Macros that recalibrate to what you actually burned and ate
- A read-only link your trainer can open in any browser
- Full control of the code and zero ongoing fees beyond ~$1–5/month for the meal AI

If anything's broken, the most common culprits in order:
1. **Sync error** → wrong `SYNC_SECRET` on the device, or Upstash isn't connected to the Vercel project
2. **Deploy blocked** → commit was authored by Claude's bot and you haven't fixed the `OWNER_EMAIL` in the workflow yet (Step 0c)
3. **Photo meal returns 500** → `ANTHROPIC_API_KEY` missing or out of credits
4. **Withings "not connected"** → you tapped Sync before tapping Connect, or Withings revoked your token (just Connect again)

Open an issue on the upstream repo if you find a real bug.
