import { NextResponse, type NextRequest } from "next/server";

import {
  getLocalDevSessionByToken,
  getLocalDevSessionCookieName,
  signInWithLocalDevAuth,
  signOutLocalDevSession,
  signUpWithLocalDevAuth,
} from "@/server/better-auth/local-dev";

const ALLO_MODE = process.env.ALLO_MODE ?? "development";

function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function withSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set({
    name: getLocalDevSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: getLocalDevSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ all?: string[] }> }): Promise<NextResponse> {
  const params = await context.params;
  const route = params.all?.join("/") ?? "";

  if (route === "session") {
    // TODO(Task 4.2): In appliance mode, use Better Auth with Postgres adapter
    const session = await getLocalDevSessionByToken(
      request.cookies.get(getLocalDevSessionCookieName())?.value,
    );
    return jsonResponse({ data: session, error: null });
  }

  return jsonResponse({ data: null, error: { message: "Not found" } }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ all?: string[] }> }): Promise<NextResponse> {
  const params = await context.params;
  const route = params.all?.join("/") ?? "";

  if (route === "sign-up/email") {
    // TODO(Task 4.2): In appliance mode, use Better Auth with Postgres adapter
    if (ALLO_MODE === "appliance") {
      return jsonResponse({ data: null, error: { message: "Appliance auth not yet configured — see Task 4.2" } }, 501);
    }
    const body = (await request.json()) as { email?: string; password?: string; name?: string };
    const result = await signUpWithLocalDevAuth({
      email: body.email ?? "",
      password: body.password ?? "",
      name: body.name ?? "",
    });
    const response = jsonResponse(result, result.error ? 400 : 200);
    if (result.data?.session.token) {
      return withSessionCookie(response, result.data.session.token);
    }
    return response;
  }

  if (route === "sign-in/email") {
    // TODO(Task 4.2): In appliance mode, use Better Auth with Postgres adapter
    if (ALLO_MODE === "appliance") {
      return jsonResponse({ data: null, error: { message: "Appliance auth not yet configured — see Task 4.2" } }, 501);
    }
    const body = (await request.json()) as { email?: string; password?: string };
    const result = await signInWithLocalDevAuth({
      email: body.email ?? "",
      password: body.password ?? "",
    });
    const response = jsonResponse(result, result.error ? 401 : 200);
    if (result.data?.session.token) {
      return withSessionCookie(response, result.data.session.token);
    }
    return response;
  }

  if (route === "sign-out") {
    await signOutLocalDevSession(
      request.cookies.get(getLocalDevSessionCookieName())?.value,
    );
    return clearSessionCookie(jsonResponse({ data: null, error: null }));
  }

  return jsonResponse({ data: null, error: { message: "Not found" } }, 404);
}
