import { clerkClient } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const PILOT = {
  username: "LTRUSH",
  email: "ltrush@demo.hearthos.app",
} as const;

function matches(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const expectedPassword = process.env.PILOT_DEMO_PASSWORD || "";
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.PILOT_TENANT_PROVISIONING_ENABLED !== "true"
    || !expectedPassword
  ) {
    return unavailable();
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const usernameMatches = body.username?.trim().toUpperCase() === PILOT.username;
  const passwordMatches = typeof body.password === "string" && matches(body.password, expectedPassword);
  if (!usernameMatches || !passwordMatches) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const client = await clerkClient();
  const users = await client.users.getUserList({ emailAddress: [PILOT.email], limit: 2 });
  const user = users.data[0];
  if (!user) {
    return NextResponse.json({ error: "Demo account is not provisioned" }, { status: 503 });
  }

  await client.users.updateUser(user.id, {
    password: expectedPassword,
    signOutOfOtherSessions: true,
    createOrganizationEnabled: false,
    createOrganizationsLimit: 0,
  });
  await client.users.disableUserMFA(user.id);

  return NextResponse.json(
    { ready: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
