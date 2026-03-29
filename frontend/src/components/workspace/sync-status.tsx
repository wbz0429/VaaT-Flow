"use client";

import { useEffect, useState } from "react";

import { isTauriEnvironment } from "@/core/config";
import { cn } from "@/lib/utils";

type SyncStatusType = "synced" | "syncing" | "offline" | "error";

const statusConfig: Record<SyncStatusType, { label: string; color: string }> = {
  synced: { label: "已同步", color: "text-green-500" },
  syncing: { label: "同步中...", color: "text-blue-500" },
  offline: { label: "离线", color: "text-yellow-500" },
  error: { label: "同步失败", color: "text-red-500" },
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatusType>("offline");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    setVisible(true);

    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlistenFn = await listen<string>("sync-status", (event) => {
          setStatus(event.payload as SyncStatusType);
        });
        unlisten = unlistenFn;
      } catch {
        // Tauri API not available
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  if (!visible) return null;

  const { label, color } = statusConfig[status] ?? statusConfig.offline;

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 text-xs", color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </div>
  );
}
