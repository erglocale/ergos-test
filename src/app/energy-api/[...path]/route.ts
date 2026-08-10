// Server-side proxy to the energy-brain FastAPI. A route handler (not a
// rewrite) because FastAPI 307-redirects collection paths to their
// trailing-slash form; following that redirect here keeps the browser
// same-origin and CORS-free. The real API URL stays in .env.local.
//
// If the target API requires authentication (the production deployment does),
// set ENERGY_API_USER / ENERGY_API_PASSWORD in .env.local — server-only vars,
// never sent to the browser. This proxy logs in, caches the bearer token and
// re-authenticates on expiry, so the sandbox itself stays login-free.
import { type NextRequest, NextResponse } from "next/server";

function apiBase(): string | undefined {
  // ENERGY_API (server-only) wins so production credentials/URLs need not be
  // exposed as NEXT_PUBLIC_*; the public var stays valid for local dev.
  return process.env.ENERGY_API ?? process.env.NEXT_PUBLIC_ENERGY_API;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Seconds-since-epoch expiry from a JWT, or null when unreadable. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8"),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getToken(base: string): Promise<string | null> {
  const username = process.env.ENERGY_API_USER;
  const password = process.env.ENERGY_API_PASSWORD;
  if (!username || !password) return null; // unauthenticated API (local dev)

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${base}/api/v1/login/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("login response had no access_token");

  cachedToken = {
    value: data.access_token,
    // Fall back to an hour when the token carries no readable expiry.
    expiresAt: jwtExpiry(data.access_token) ?? Date.now() + 3_600_000,
  };
  return cachedToken.value;
}

async function proxy(req: NextRequest, path: string[]) {
  const base = apiBase();
  if (!base) {
    return NextResponse.json({ error: "energy API not configured" }, { status: 502 });
  }
  const url = `${base}/${path.join("/")}${req.nextUrl.search}`;
  const payload =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const send = async (token: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, {
      method: req.method,
      headers,
      body: payload,
      redirect: "follow",
      cache: "no-store",
    });
  };

  try {
    let token = await getToken(base);
    let res = await send(token);

    // Token rejected (expired/revoked) — drop it and log in once more.
    if ((res.status === 401 || res.status === 403) && token) {
      cachedToken = null;
      token = await getToken(base);
      res = await send(token);
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "energy API unreachable" },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
