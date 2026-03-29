"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { isTauriEnvironment } from "@/core/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Login page — dual mode:
 * - Web/Appliance: placeholder (auth handled by setup wizard)
 * - Desktop (Tauri): real login form that authenticates against cloud sync service
 */
export default function LoginPage() {
  const isDesktop = isTauriEnvironment();

  if (isDesktop) {
    return <DesktopLoginForm />;
  }

  return <WebLoginPlaceholder />;
}

// ---------------------------------------------------------------------------
// Desktop login form — calls Tauri invoke("login") → cloud sync service
// ---------------------------------------------------------------------------

function DesktopLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      // Dynamic import to avoid bundling Tauri API in web builds
      const { invoke } = await import("@tauri-apps/api/core");

      // 1. Login to cloud sync service
      const result = await invoke<{ token: string; user_id: string; name: string }>("login", {
        email,
        password,
      });

      // 2. Pull model configs from cloud → writes local config.yaml
      await invoke("pull_model_configs");

      // 3. Trigger first-time sync (pull all threads + memory from cloud)
      invoke("sync_pull_all").catch(() => {
        // Non-blocking — sync errors don't block login
      });

      // 4. Navigate to workspace
      router.push("/workspace");
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(typeof e === "string" ? e : (e as Error)?.message || "Login failed");
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login</CardTitle>
        <CardDescription>Sign in to start using VaaT-Flow</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {status === "error" && (
          <p className="text-xs text-destructive">{errorMsg || "Login failed"}</p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={handleLogin}
          disabled={status === "loading" || !email || !password}
        >
          {status === "loading" ? "Signing in..." : "Sign In"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Web placeholder — same as before
// ---------------------------------------------------------------------------

function WebLoginPlaceholder() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login Not Used</CardTitle>
        <CardDescription>
          Appliance mode does not use a separate login screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Use the setup wizard for first-time initialization.</p>
        <p>After setup is complete, open the workspace directly.</p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button asChild className="w-full">
          <Link href="/setup">Open Setup</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/workspace">Open Workspace</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
