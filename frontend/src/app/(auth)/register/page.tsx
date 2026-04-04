"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { register } from "@/core/auth/api";
import { useI18n } from "@/core/i18n/hooks";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await register(email, password, name);

      if (result.error) {
        setError(result.error.message ?? t.auth.signInFailed);
        return;
      }

      router.push("/workspace");
    } catch {
      setError(t.auth.unexpectedError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t.auth.createAccount}</CardTitle>
        <CardDescription>
          {t.auth.createAccountDescription}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              {t.auth.name}
            </label>
            <Input
              id="name"
              type="text"
              placeholder={t.auth.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              {t.auth.email}
            </label>
            <Input
              id="email"
              type="email"
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t.auth.password}
            </label>
            <Input
              id="password"
              type="password"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.creatingAccount : t.auth.createAccount}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t.auth.alreadyHaveAccount}{" "}
            <Link href="/login" className="text-primary underline underline-offset-2 hover:no-underline">
              {t.auth.signIn}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
