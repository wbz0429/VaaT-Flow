import { type NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/workspace", "/admin"];
const ALLO_MODE = process.env.ALLO_MODE ?? "development";
const INTERNAL_GATEWAY_URL = process.env.INTERNAL_GATEWAY_URL ?? "http://gateway:8001";

async function isSetupCompleted(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get("allo_setup_done")?.value;
  if (cookie === "1") {
    return true;
  }

  try {
    const statusUrl =
      ALLO_MODE === "appliance"
        ? new URL("/api/setup/status", INTERNAL_GATEWAY_URL)
        : new URL("/api/setup/status", request.url);
    const res = await fetch(statusUrl.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // In appliance mode, fail closed so first-run setup is not skipped.
      return ALLO_MODE === "appliance" ? false : true;
    }
    const data = (await res.json()) as { setup_completed?: boolean };
    return data.setup_completed === true;
  } catch {
    // In appliance mode, fail closed so first-run setup is not skipped.
    return ALLO_MODE === "appliance" ? false : true;
  }
}

function withSetupDoneCookie(response: NextResponse): NextResponse {
  response.cookies.set("allo_setup_done", "1", {
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isSetupRoute =
    pathname === "/setup" || pathname.startsWith("/setup/");

  const isProtected = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // Handle /setup route — redirect away if setup is already done
  if (isSetupRoute) {
    const completed = await isSetupCompleted(request);
    if (completed) {
      const workspaceUrl = new URL("/workspace", request.url);
      return withSetupDoneCookie(NextResponse.redirect(workspaceUrl));
    }
    return NextResponse.next();
  }

  if (!isProtected) {
    return NextResponse.next();
  }

  // Protected routes: check setup status first
  const setupCompleted = await isSetupCompleted(request);
  if (!setupCompleted) {
    const setupUrl = new URL("/setup", request.url);
    return NextResponse.redirect(setupUrl);
  }

  // In appliance mode we intentionally run as a single local admin context.
  if (ALLO_MODE === "appliance") {
    return withSetupDoneCookie(NextResponse.next());
  }

  // Setup is done — cache it and check session auth
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withSetupDoneCookie(NextResponse.redirect(loginUrl));
  }

  return withSetupDoneCookie(NextResponse.next());
}

export const config = {
  matcher: ["/workspace/:path*", "/admin/:path*", "/setup/:path*"],
};
