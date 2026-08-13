// Sign-in for the demo gate. Verifies the one configured account and sets the
// signed session cookie the middleware checks.

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authConfig,
  credentialsMatch,
  issueSession,
} from "@/lib/demoAuth";

/** Slows a password guesser down without being noticeable to a person. */
const FAILURE_DELAY_MS = 600;

export async function POST(req: Request) {
  const cfg = authConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Sign-in is not configured on this deployment." },
      { status: 503 },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // Falls through to the generic failure below.
  }

  if (!(await credentialsMatch(cfg, email, password))) {
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    // One message for both halves: never reveal which was wrong.
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await issueSession(cfg, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    // Vercel is always HTTPS; plain `next dev` on localhost is not, and a
    // Secure cookie would simply never be stored there.
    secure: !!process.env.VERCEL,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
