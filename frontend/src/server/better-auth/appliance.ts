import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import { cookies } from "next/headers";
import { Pool } from "pg";

import { getLocalDevSessionCookieName } from "./local-dev";
import type { Session } from "./types";

const SESSION_COOKIE_NAME = getLocalDevSessionCookieName();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type ApplianceUserRow = {
  id: string;
  email: string;
  name: string | null;
};

type ApplianceSessionRow = {
  token: string;
  userId: string;
  expiresAt: Date | string;
};

type ApplianceAccountRow = ApplianceUserRow & {
  password: string | null;
};

let pool: Pool | null = null;

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  pool ??= new Pool({ connectionString });
  return pool;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (actualHash.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedBuffer);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildSession(user: ApplianceUserRow, session: ApplianceSessionRow): Session {
  return {
    session: {
      token: session.token,
      userId: session.userId,
      expiresAt: toIsoString(session.expiresAt),
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? "",
    },
  };
}

export async function getApplianceSessionByToken(token: string | undefined): Promise<Session | null> {
  if (!token) {
    return null;
  }

  const db = getPool();
  if (!db) {
    return null;
  }

  const result = await db.query<ApplianceSessionRow & ApplianceUserRow>(
    `SELECT s.token, s."userId", s."expiresAt", u.id, u.email, u.name
     FROM session s
     JOIN "user" u ON u.id = s."userId"
     WHERE s.token = $1 AND s."expiresAt" > now()
     LIMIT 1`,
    [token],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return buildSession(row, row);
}

export async function getApplianceSessionFromCookies(): Promise<Session | null> {
  const cookieStore = await cookies();
  return getApplianceSessionByToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function signInWithApplianceAuth(input: {
  email: string;
  password: string;
}): Promise<{ data: Session | null; error: { message: string } | null }> {
  const db = getPool();
  if (!db) {
    return { data: null, error: { message: "Appliance database is not configured" } };
  }

  const email = normalizeEmail(input.email);
  if (!email || !input.password) {
    return { data: null, error: { message: "Invalid email or password" } };
  }

  const userResult = await db.query<ApplianceAccountRow>(
    `SELECT u.id, u.email, u.name, a.password
     FROM "user" u
     JOIN account a ON a."userId" = u.id
     WHERE lower(u.email) = $1 AND a."providerId" = 'credential'
     LIMIT 1`,
    [email],
  );

  const user = userResult.rows[0];
  if (!user?.password || !verifyPassword(input.password, user.password)) {
    return { data: null, error: { message: "Invalid email or password" } };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session: ApplianceSessionRow = {
    token: randomBytes(32).toString("hex"),
    userId: user.id,
    expiresAt,
  };

  await db.query(
    `INSERT INTO session (id, "userId", token, "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, '', '', now(), now())`,
    [randomUUID(), user.id, session.token, expiresAt],
  );

  return { data: buildSession(user, session), error: null };
}

export async function signOutApplianceSession(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }

  const db = getPool();
  if (!db) {
    return;
  }

  await db.query("DELETE FROM session WHERE token = $1", [token]);
}

export function getApplianceSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getApplianceSessionCookieMaxAgeSeconds(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}
