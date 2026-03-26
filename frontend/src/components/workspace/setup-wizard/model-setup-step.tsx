"use client";

import { CheckCircle2Icon, CpuIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitModelConfig, type ModelProviderConfig } from "@/core/setup/api";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { name: "gpt-4o", display_name: "GPT-4o" },
      { name: "gpt-4o-mini", display_name: "GPT-4o Mini" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { name: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" },
      { name: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" },
    ],
  },
  {
    id: "google",
    name: "Google",
    models: [
      { name: "gemini-2.0-flash", display_name: "Gemini 2.0 Flash" },
      {
        name: "gemini-2.5-pro-preview-06-05",
        display_name: "Gemini 2.5 Pro",
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    models: [
      { name: "deepseek-chat", display_name: "DeepSeek Chat" },
      { name: "deepseek-reasoner", display_name: "DeepSeek Reasoner" },
    ],
  },
] as const;

interface ProviderState {
  selected: boolean;
  apiKey: string;
  testStatus: "idle" | "testing" | "ok" | "error";
  testMessage?: string;
}

export function ModelSetupStep({ onComplete }: { onComplete: () => void }) {
  const [providers, setProviders] = useState<Record<string, ProviderState>>(
    Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        { selected: false, apiKey: "", testStatus: "idle" as const },
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleProvider = useCallback((id: string) => {
    setProviders((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, selected: !prev[id]!.selected },
    }));
  }, []);

  const setApiKey = useCallback((id: string, key: string) => {
    setProviders((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, apiKey: key, testStatus: "idle" },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setError("");
    const selectedProviders = PROVIDERS.filter(
      (p) => providers[p.id]?.selected && providers[p.id]?.apiKey,
    );
    if (selectedProviders.length === 0) {
      setError("Please configure at least one model provider");
      return;
    }

    setLoading(true);
    try {
      const configs: ModelProviderConfig[] = selectedProviders.map((p) => ({
        provider: p.id,
        api_key: providers[p.id]!.apiKey,
        models: [...p.models],
      }));
      await submitModelConfig({ providers: configs });
      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save model config",
      );
    } finally {
      setLoading(false);
    }
  }, [providers, onComplete]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CpuIcon className="mx-auto size-12 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold">Configure Models</h2>
        <p className="text-muted-foreground mt-2">
          Add at least one AI model provider to get started
        </p>
      </div>
      <div className="mx-auto max-w-2xl space-y-4">
        {PROVIDERS.map((provider) => {
          const state = providers[provider.id]!;
          return (
            <div
              key={provider.id}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                state.selected && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-3 text-left"
                  onClick={() => toggleProvider(provider.id)}
                >
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded border",
                      state.selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground",
                    )}
                  >
                    {state.selected && <CheckCircle2Icon className="size-3" />}
                  </div>
                  <span className="font-medium">{provider.name}</span>
                </button>
                <span className="text-muted-foreground text-sm">
                  {provider.models.length} models
                </span>
              </div>
              {state.selected && (
                <div className="mt-3 space-y-2">
                  <Input
                    type="password"
                    placeholder="API Key"
                    value={state.apiKey}
                    onChange={(e) => setApiKey(provider.id, e.target.value)}
                  />
                  <div className="text-muted-foreground text-xs">
                    Models:{" "}
                    {provider.models.map((m) => m.display_name).join(", ")}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="text-destructive text-center text-sm">{error}</p>
      )}
      <div className="text-center">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save & Continue"}
        </Button>
      </div>
    </div>
  );
}
