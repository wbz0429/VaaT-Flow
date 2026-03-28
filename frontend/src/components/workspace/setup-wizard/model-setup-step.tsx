"use client";

import { CheckCircle2Icon, CpuIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitModelConfig, type ModelProviderConfig } from "@/core/setup/api";
import { cn } from "@/lib/utils";

type ProviderId =
  | "platform_default_openai"
  | "platform_default_anthropic"
  | "openai_official"
  | "anthropic_official"
  | "openai_compatible"
  | "anthropic_compatible";

const PROVIDERS = [
  {
    id: "platform_default_openai",
    provider: "platform_default",
    protocol: "openai",
    name: "Platform Default GPT",
    description: "Use the built-in platform default GPT model service with no customer key.",
    requiresApiKey: false,
    requiresBaseUrl: false,
    models: [
      {
        name: "gpt-5.4",
        display_name: "GPT-5.4",
        supports_thinking: true,
        supports_reasoning_effort: true,
        supports_vision: true,
      },
    ],
  },
  {
    id: "platform_default_anthropic",
    provider: "platform_default",
    protocol: "anthropic",
    name: "Platform Default Claude",
    description: "Use the built-in platform default Claude model service with no customer key.",
    requiresApiKey: false,
    requiresBaseUrl: false,
    models: [
      {
        name: "claude-sonnet-platform",
        display_name: "Claude Sonnet (Platform)",
        supports_thinking: true,
        supports_reasoning_effort: true,
      },
    ],
  },
  {
    id: "openai_official",
    provider: "openai_official",
    protocol: "openai",
    name: "OpenAI Official",
    description: "Use your own OpenAI official API key.",
    requiresApiKey: true,
    requiresBaseUrl: false,
    models: [
      {
        name: "gpt-4o",
        display_name: "GPT-4o",
        supports_thinking: true,
        supports_reasoning_effort: true,
        supports_vision: true,
      },
      {
        name: "gpt-4o-mini",
        display_name: "GPT-4o Mini",
        supports_thinking: false,
        supports_vision: true,
      },
    ],
  },
  {
    id: "anthropic_official",
    provider: "anthropic_official",
    protocol: "anthropic",
    name: "Anthropic Official",
    description: "Use your own Anthropic official API key.",
    requiresApiKey: true,
    requiresBaseUrl: false,
    models: [
      {
        name: "claude-sonnet-4-20250514",
        display_name: "Claude Sonnet 4",
        supports_thinking: true,
        supports_reasoning_effort: true,
      },
      {
        name: "claude-3-5-haiku-20241022",
        display_name: "Claude 3.5 Haiku",
        supports_thinking: false,
      },
    ],
  },
  {
    id: "openai_compatible",
    provider: "openai_compatible",
    protocol: "openai",
    name: "Custom OpenAI-Compatible",
    description: "Use a custom OpenAI-compatible model gateway.",
    requiresApiKey: true,
    requiresBaseUrl: true,
    models: [
      {
        name: "custom-openai-model",
        display_name: "Custom OpenAI-Compatible Model",
        supports_thinking: true,
      },
    ],
  },
  {
    id: "anthropic_compatible",
    provider: "anthropic_compatible",
    protocol: "anthropic",
    name: "Custom Anthropic-Compatible",
    description: "Use a custom Anthropic-compatible model gateway.",
    requiresApiKey: true,
    requiresBaseUrl: true,
    models: [
      {
        name: "custom-anthropic-model",
        display_name: "Custom Anthropic-Compatible Model",
        supports_thinking: true,
      },
    ],
  },
] as const;

interface ProviderState {
  selected: boolean;
  apiKey: string;
  baseUrl: string;
}

export function ModelSetupStep({ onComplete }: { onComplete: () => void }) {
  const [providers, setProviders] = useState<Record<ProviderId, ProviderState>>(
    Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider.id,
        { selected: provider.id === "platform_default_openai", apiKey: "", baseUrl: "" },
      ]),
    ) as Record<ProviderId, ProviderState>,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedProviders = useMemo(
    () => PROVIDERS.filter((provider) => providers[provider.id]?.selected),
    [providers],
  );

  const toggleProvider = useCallback((id: ProviderId) => {
    setProviders((prev) => ({
      ...prev,
      [id]: { ...prev[id], selected: !prev[id].selected },
    }));
  }, []);

  const setProviderField = useCallback(
    (id: ProviderId, field: "apiKey" | "baseUrl", value: string) => {
      setProviders((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: value },
      }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setError("");

    if (selectedProviders.length === 0) {
      setError("Please select at least one model provider.");
      return;
    }

    for (const provider of selectedProviders) {
      const state = providers[provider.id];
      if (provider.requiresApiKey && !state.apiKey.trim()) {
        setError(`${provider.name} requires an API key.`);
        return;
      }
      if (provider.requiresBaseUrl && !state.baseUrl.trim()) {
        setError(`${provider.name} requires a base URL.`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload: ModelProviderConfig[] = selectedProviders.map((provider) => ({
        provider: provider.provider,
        protocol: provider.protocol,
        display_name: provider.name,
        api_key: providers[provider.id].apiKey,
        base_url: providers[provider.id].baseUrl || undefined,
        models: provider.models.map((model) => ({ ...model })),
      }));
      await submitModelConfig({ providers: payload });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save model configuration.");
    } finally {
      setLoading(false);
    }
  }, [onComplete, providers, selectedProviders]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CpuIcon className="mx-auto size-12 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold">Choose Your Model Providers</h2>
        <p className="text-muted-foreground mt-2">
          Platform defaults are available immediately. You can also add your own OpenAI or Anthropic providers now.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-4">
        {PROVIDERS.map((provider) => {
          const state = providers[provider.id];
          return (
            <div
              key={provider.id}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                state.selected && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  className="flex items-start gap-3 text-left"
                  onClick={() => toggleProvider(provider.id)}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-5 items-center justify-center rounded border",
                      state.selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground",
                    )}
                  >
                    {state.selected && <CheckCircle2Icon className="size-3" />}
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium">{provider.name}</div>
                    <p className="text-muted-foreground text-sm">{provider.description}</p>
                    <div className="text-muted-foreground text-xs">
                      Models: {provider.models.map((model) => model.display_name).join(", ")}
                    </div>
                  </div>
                </button>
              </div>

              {state.selected && (
                <div className="mt-4 space-y-3">
                  {provider.requiresApiKey && (
                    <Input
                      type="password"
                      placeholder={`${provider.name} API Key`}
                      value={state.apiKey}
                      onChange={(event) => setProviderField(provider.id, "apiKey", event.target.value)}
                    />
                  )}
                  {provider.requiresBaseUrl && (
                    <Input
                      type="url"
                      placeholder={`${provider.name} Base URL`}
                      value={state.baseUrl}
                      onChange={(event) => setProviderField(provider.id, "baseUrl", event.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-destructive text-center text-sm">{error}</p>}

      <div className="text-center">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Providers & Continue"}
        </Button>
      </div>
    </div>
  );
}
