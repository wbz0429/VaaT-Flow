import { NextResponse, type NextRequest } from "next/server";

import {
  getApplianceSessionByToken,
  getApplianceSessionCookieMaxAgeSeconds,
  getApplianceSessionCookieName,
  signOutApplianceSession,
} from "@/server/better-auth/appliance";
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
    name: ALLO_MODE === "appliance" ? getApplianceSessionCookieName() : getLocalDevSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(ALLO_MODE === "appliance" ? { maxAge: getApplianceSessionCookieMaxAgeSeconds() } : {}),
  });
  return response;
}

function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: ALLO_MODE === "appliance" ? getApplianceSessionCookieName() : getLocalDevSessionCookieName(),
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
    const session = ALLO_MODE === "appliance"
      ? await getApplianceSessionByToken(request.cookies.get(getApplianceSessionCookieName())?.value)
      : await getLocalDevSessionByToken(request.cookies.get(getLocalDevSessionCookieName())?.value);
    return jsonResponse({ data: session, error: null });
  }

  return jsonResponse({ data: null, error: { message: "Not found" } }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ all?: string[] }> }): Promise<NextResponse> {
  const params = await context.params;
  const route = params.all?.join("/") ?? "";

  if (route === "sign-up/email") {
    if (ALLO_MODE === "appliance") {
      return jsonResponse(
        {
          data: null,
          error: { message: "Sign-up is disabled in appliance mode. Complete setup for the first admin; later invites/signup are not supported yet." },
        },
        403,
      );
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
    if (ALLO_MODE === "appliance") {
      return jsonResponse(
        {
          data: null,
          error: { message: "Appliance mode does not use sign-in. Complete setup, then open /workspace directly." },
        },
        403,
      );
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
    if (ALLO_MODE === "appliance") {
      await signOutApplianceSession(
        request.cookies.get(getApplianceSessionCookieName())?.value,
      );
      return clearSessionCookie(
        jsonResponse({
          data: null,
          error: null,
        }),
      );
    }
    await signOutLocalDevSession(
      request.cookies.get(getLocalDevSessionCookieName())?.value,
    );
    return clearSessionCookie(jsonResponse({ data: null, error: null }));
  }

  return jsonResponse({ data: null, error: { message: "Not found" } }, 404);
}
