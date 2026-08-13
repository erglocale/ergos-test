// Access gate for the deployed demo.
//
// demo.erglocale.com is a public URL with a guessable name, and the app behind
// it talks to real services (the /energy-api proxy signs in to production
// energy-brain with server-side credentials, /live-api reads the analytics
// suggestion schema). So the whole site sits behind one shared login.
//
// The session is a signed cookie, not a session store: there is one account,
// nothing to revoke individually, and middleware has to be able to verify it on
// the edge without a round trip. HMAC-SHA256 over Web Crypto, which is the only
// crypto available in the edge runtime — no Node `crypto` import here, it would
// break the middleware bundle.

export const SESSION_COOKIE = "ergos_demo_session";

/** A week: long enough that nobody re-types the password mid-demo. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface AuthConfig {
  email: string;
  password: string;
  secret: string;
}

/**
 * Credentials, or null when the gate has not been configured.
 *
 * Deployments MUST have them: `deployedWithoutAuth()` turns a missing
 * configuration into a locked door rather than an open one, so forgetting to
 * set the variables on Vercel can never publish the demo by accident. Local
 * `next dev` without them stays open, which is what you want on a laptop.
 */
export function authConfig(): AuthConfig | null {
  const email = process.env.DEMO_AUTH_EMAIL;
  const password = process.env.DEMO_AUTH_PASSWORD;
  const secret = process.env.DEMO_AUTH_SECRET;
  if (!email || !password || !secret) return null;
  return { email, password, secret };
}

/** True on a Vercel deployment that is missing its credentials. */
export function deployedWithoutAuth(): boolean {
  return !authConfig() && !!process.env.VERCEL;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(new Uint8Array(sig));
}

/**
 * Constant-time-ish comparison: both sides are hashed with a per-call random
 * key first, so the compare runs over digests of equal length and leaks nothing
 * about where the strings diverge.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const [ha, hb] = await Promise.all([hmac(nonce, a), hmac(nonce, b)]);
  return ha === hb;
}

/** A signed `<expiry>.<signature>` session value. */
export async function issueSession(cfg: AuthConfig, nowMs: number): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${cfg.email}|${exp}`;
  return `${exp}.${await hmac(cfg.secret, payload)}`;
}

export async function verifySession(
  cfg: AuthConfig,
  value: string | undefined,
  nowMs: number,
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return false;
  const expected = await hmac(cfg.secret, `${cfg.email}|${exp}`);
  return safeEqual(expected, value.slice(dot + 1));
}

/** Whether the submitted pair matches the single configured account. */
export async function credentialsMatch(
  cfg: AuthConfig,
  email: string,
  password: string,
): Promise<boolean> {
  // Both checks always run: returning early on a bad email would tell an
  // attacker which half was wrong.
  const [emailOk, passwordOk] = await Promise.all([
    safeEqual(cfg.email.trim().toLowerCase(), email.trim().toLowerCase()),
    safeEqual(cfg.password, password),
  ]);
  return emailOk && passwordOk;
}
