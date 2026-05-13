// Withings OAuth callback: exchange auth code for tokens, store in KV.
// Responds with a tiny HTML page (no JS) since the user lands here in Safari,
// not the PWA. Tells them to open Iron Log and tap Sync.

const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const TOKEN_KEY = 'iron-log:withings:tokens:v1';

function findUpstashEnv() {
  const env = process.env;
  const urlKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_URL$|UPSTASH_REDIS_REST_URL$/.test(k));
  const tokenKey = Object.keys(env).find((k) => /(^|_)KV_REST_API_TOKEN$|UPSTASH_REDIS_REST_TOKEN$/.test(k));
  return { url: urlKey ? env[urlKey] : null, token: tokenKey ? env[tokenKey] : null };
}

function page(title, body, ok = true) {
  const accent = ok ? '#F97316' : '#dc2626';
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Iron Log · Withings</title><style>html,body{background:#000;color:#fafafa;font-family:-apple-system,system-ui,sans-serif;margin:0;padding:0;height:100%}body{display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}.card{border:1px solid #262626;border-radius:16px;padding:2rem;max-width:420px;background:#0a0a0a}h1{font-size:1.1rem;letter-spacing:0.1em;text-transform:uppercase;color:${accent};margin:0 0 1rem}p{color:#a3a3a3;line-height:1.5;font-size:0.95rem;margin:0 0 1rem}</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
}

export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).end(page('Authorization denied', `<p>You declined access. Close this tab and try again from Iron Log if you want to retry.</p>`, false));
  }
  if (!code) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).end(page('Missing code', `<p>The Withings callback didn't include an authorization code. Try again from Iron Log.</p>`, false));
  }

  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).end(page('Misconfigured', `<p>WITHINGS_CLIENT_ID / WITHINGS_CLIENT_SECRET missing in Vercel env vars.</p>`, false));
  }

  const { url, token: kvToken } = findUpstashEnv();
  if (!url || !kvToken) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).end(page('Storage not configured', `<p>Cloud storage env vars missing.</p>`, false));
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const redirectUri = `${proto}://${host}/api/withings/callback`;

  const form = new URLSearchParams({
    action: 'requesttoken',
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
  });

  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const j = await r.json();
    if (j.status !== 0 || !j.body || !j.body.access_token) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(502).end(page('Token exchange failed', `<p>Withings replied: ${escapeHtml(JSON.stringify(j).slice(0, 300))}</p>`, false));
    }
    const tokens = {
      access_token: j.body.access_token,
      refresh_token: j.body.refresh_token,
      userid: j.body.userid,
      scope: j.body.scope,
      expires_at: Date.now() + (j.body.expires_in * 1000) - 60_000,
      connected_at: Date.now(),
    };
    const setR = await fetch(`${url}/set/${TOKEN_KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
      body: JSON.stringify(tokens),
    });
    if (!setR.ok) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(500).end(page('Could not save tokens', `<p>KV write failed (HTTP ${setR.status}).</p>`, false));
    }
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).end(page('Withings connected', `<p>Tokens saved. Close this tab, open the Iron Log app, and tap <strong>Sync Withings</strong> in Body Stats.</p>`));
  } catch (e) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).end(page('Error', `<p>${escapeHtml(String(e.message || e))}</p>`, false));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
