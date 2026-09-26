import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

// Loopback only, single purpose: hand the Flutter web client a real Supabase
// session so the authenticated UI can be exercised while the project's email
// provider is rate limited. It never prints the token and serves one route.
const server = createServer(async (request, response) => {
  if (request.url !== '/session') {
    response.writeHead(404).end();
    return;
  }
  const origin = request.headers.origin;
  try {
    const result = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.SHOPIFY_VERIFY_USER_EMAIL, password: env.SHOPIFY_VERIFY_USER_PASSWORD }),
    });
    const session = await result.json();
    if (!result.ok || !session.access_token) {
      response.writeHead(500, { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin } : {}) });
      response.end(JSON.stringify({ error: 'sign-in failed' }));
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      ...(origin ? { 'access-control-allow-origin': origin } : {}),
    });
    response.end(JSON.stringify(session));
  } catch {
    response.writeHead(500, { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin } : {}) });
    response.end(JSON.stringify({ error: 'sign-in failed' }));
  }
});

server.listen(4598, '127.0.0.1', () => console.log('session helper listening on 127.0.0.1:4598'));
