"use client";

import { BarChart3, Code2, Megaphone, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { demoScenarios, getDemoThreadUrl } from "@/core/demo/scenarios";

import DemoChat, { scenarios } from "../landing/demo-chat";

type ScenarioKey = "ops" | "dev" | "mgmt";

const iconMap = {
  ops: <Megaphone className="size-4" />,
  dev: <Code2 className="size-4" />,
  mgmt: <BarChart3 className="size-4" />,
} satisfies Record<ScenarioKey, React.ReactNode>;

const presets = demoScenarios.map((scenario) => ({
  key: scenario.id,
  label: scenario.label,
  description: scenario.description,
  task: scenario.tasks[0]!,
  icon: iconMap[scenario.id],
}));

export function ScenarioPresets() {
  const router = useRouter();
  const [activeScenario, setActiveScenario] = useState<ScenarioKey | null>(
    null,
  );

  const handleStart = useCallback(() => {
    if (!activeScenario) return;
    const preset = presets.find((item) => item.key === activeScenario);
    if (!preset) return;
    // Close dialog first, then navigate after it unmounts
    setActiveScenario(null);
    setTimeout(() => {
      router.push(getDemoThreadUrl(preset.task.threadId));
    }, 0);
  }, [activeScenario, router]);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>场景预设</SidebarGroupLabel>
        <SidebarMenu>
          {presets.map((p) => (
            <SidebarMenuItem key={p.key}>
              <SidebarMenuButton onClick={() => setActiveScenario(p.key)}>
                <span className="text-muted-foreground">{p.icon}</span>
                <span className="text-muted-foreground">{p.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <Dialog
        open={activeScenario !== null}
        onOpenChange={(open) => {
          if (!open) setActiveScenario(null);
        }}
      >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {activeScenario &&
                  presets.find((p) => p.key === activeScenario)?.label}
              </DialogTitle>
              <p className="text-muted-foreground text-sm">
                {activeScenario &&
                  presets.find((p) => p.key === activeScenario)?.task.description}
              </p>
            </DialogHeader>
            {activeScenario && (
              <div className="space-y-3">
                <DemoChat
                  key={activeScenario}
                  scenario={scenarios[activeScenario]!}
                />
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="text-sm font-medium">可继续追问</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {presets
                      .find((p) => p.key === activeScenario)
                      ?.task.followups.map((followup) => (
                        <span
                          key={followup.id}
                          className="inline-flex rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {followup.label}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            )}
          <DialogFooter>
            <Button onClick={handleStart}>
              <PlayIcon className="mr-1.5 size-4" />
              开始对话
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
