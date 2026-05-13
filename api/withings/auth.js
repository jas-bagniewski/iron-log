// Withings OAuth: kick off the authorize flow.
// Requires ?secret=<sync-secret> to prevent random visitors from triggering.

const AUTH_URL = 'https://account.withings.com/oauth2_user/authorize2';

export default function handler(req, res) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  const provided = req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: 'unauthorized' });

  const clientId = process.env.WITHINGS_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'WITHINGS_CLIENT_ID not configured' });

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const redirectUri = `${proto}://${host}/api/withings/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'user.metrics',
    redirect_uri: redirectUri,
    state: `il-${Date.now()}`,
  });

  res.writeHead(302, { Location: `${AUTH_URL}?${params.toString()}` });
  res.end();
}
