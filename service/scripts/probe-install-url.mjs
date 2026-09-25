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

const base = env.API_BASE_URL.replace(/\/+$/, '');
const signIn = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.SHOPIFY_VERIFY_USER_EMAIL, password: env.SHOPIFY_VERIFY_USER_PASSWORD }),
});
const session = await signIn.json();
if (!session.access_token) throw new Error(`sign-in failed: ${session.msg ?? session.error_description}`);

const response = await fetch(`${base}/v1/auth/shopify/install`, {
  method: 'POST',
  headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ shop: process.argv[2], returnUrl: env.SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL }),
});
const payload = await response.json();
console.log('status:', response.status);
console.log('raw response keys:', Object.keys(payload).join(', '));
const url = new URL(payload.authorizationUrl);
console.log('\nFULL URL:');
console.log(payload.authorizationUrl);
console.log('\nquery parameters returned by the LIVE service:');
for (const [key, value] of url.searchParams) {
  console.log(`  ${key} = ${value.length > 60 ? `${value.slice(0, 60)}...` : value}`);
}
console.log('\ncode_challenge present:', url.searchParams.has('code_challenge'));
