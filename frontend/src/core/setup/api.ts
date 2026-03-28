const BASE = "/api/setup";

export interface SetupStatus {
  setup_completed: boolean;
}

export interface AdminAccountRequest {
  email: string;
  password: string;
  name: string;
}

export interface AdminAccountResponse {
  success: boolean;
  user_id: string;
  org_id: string;
  session_token: string;
}

export interface ModelProviderConfig {
  provider: string;
  protocol?: "openai" | "anthropic";
  display_name?: string;
  api_key: string;
  base_url?: string;
  models: Array<{
    name: string;
    display_name: string;
    supports_thinking?: boolean;
    supports_reasoning_effort?: boolean;
    supports_vision?: boolean;
  }>;
}

export interface SetupModelsRequest {
  providers: ModelProviderConfig[];
}

export interface SetupModelsResponse {
  success: boolean;
  model_count: number;
}

export interface SearchProvidersRequest {
  tavily_api_key?: string;
  jina_api_key?: string;
}

export async function submitSearchConfig(
  data: SearchProvidersRequest,
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Failed to save search provider config" }));
    throw new Error(err.detail ?? "Failed to save search provider config");
  }
  return res.json() as Promise<{ success: boolean }>;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error("Failed to fetch setup status");
  return res.json() as Promise<SetupStatus>;
}

export async function createAdminAccount(
  data: AdminAccountRequest,
): Promise<AdminAccountResponse> {
  const res = await fetch(`${BASE}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Failed to create admin account" }));
    throw new Error(err.detail ?? "Failed to create admin account");
  }
  return res.json() as Promise<AdminAccountResponse>;
}

export async function submitModelConfig(
  data: SetupModelsRequest,
): Promise<SetupModelsResponse> {
  const res = await fetch(`${BASE}/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Failed to save model config" }));
    throw new Error(err.detail ?? "Failed to save model config");
  }
  return res.json() as Promise<SetupModelsResponse>;
}

export async function completeSetup(): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/complete`, { method: "POST" });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Failed to complete setup" }));
    throw new Error(err.detail ?? "Failed to complete setup");
  }
  return res.json() as Promise<{ success: boolean }>;
}
