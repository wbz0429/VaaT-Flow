"use client";

import { GlobeIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitSearchConfig } from "@/core/setup/api";

export function SearchSetupStep({ onComplete }: { onComplete: () => void }) {
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [jinaApiKey, setJinaApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await submitSearchConfig({
        tavily_api_key: tavilyApiKey.trim() || undefined,
        jina_api_key: jinaApiKey.trim() || undefined,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save search settings.");
    } finally {
      setLoading(false);
    }
  }, [jinaApiKey, onComplete, tavilyApiKey]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <GlobeIcon className="mx-auto size-12 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold">Recommended Search Providers</h2>
        <p className="text-muted-foreground mt-2">
          Add Tavily and Jina now for better web search and web page fetch. You can also skip this step and configure them later.
        </p>
      </div>

      <div className="mx-auto max-w-xl space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="tavily-key">
            Tavily API Key (recommended)
          </label>
          <Input
            id="tavily-key"
            type="password"
            placeholder="tvly-..."
            value={tavilyApiKey}
            onChange={(event) => setTavilyApiKey(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="jina-key">
            Jina API Key (recommended)
          </label>
          <Input
            id="jina-key"
            type="password"
            placeholder="jina_..."
            value={jinaApiKey}
            onChange={(event) => setJinaApiKey(event.target.value)}
          />
        </div>

        <p className="text-muted-foreground text-sm">
          Leave both fields blank if you want to finish setup now and configure search providers later from Settings.
        </p>
      </div>

      {error && <p className="text-destructive text-center text-sm">{error}</p>}

      <div className="text-center">
        <Button onClick={handleContinue} disabled={loading}>
          {loading ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
