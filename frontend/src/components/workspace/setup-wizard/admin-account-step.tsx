"use client";

import { UserPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminAccount } from "@/core/setup/api";

export function AdminAccountStep({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await createAdminAccount({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // Set session cookie from the response
      if (result.session_token) {
        document.cookie = `better-auth.session_token=${result.session_token}; path=/; max-age=${7 * 24 * 3600}`;
      }
      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account",
      );
    } finally {
      setLoading(false);
    }
  }, [name, email, password, confirmPassword, onComplete]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <UserPlusIcon className="mx-auto size-12 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold">Create Admin Account</h2>
        <p className="text-muted-foreground mt-2">
          Set up the first administrator for your workspace
        </p>
      </div>
      <div className="mx-auto max-w-md space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="admin-name">
            Name
          </label>
          <Input
            id="admin-name"
            placeholder="Admin"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="admin-email">
            Email
          </label>
          <Input
            id="admin-email"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="admin-password">
            Password
          </label>
          <Input
            id="admin-password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="admin-confirm">
            Confirm Password
          </label>
          <Input
            id="admin-confirm"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button className="w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Creating..." : "Create Account"}
        </Button>
      </div>
    </div>
  );
}
