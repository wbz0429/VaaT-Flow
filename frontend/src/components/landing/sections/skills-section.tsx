"use client";

import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import ProgressiveSkillsAnimation from "../progressive-skills-animation";
import { Section } from "../section";

export function SkillsSection({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <Section
      className={cn("h-[calc(100vh-64px)] w-full bg-white/2", className)}
      title={t.landing.agentSkills}
      subtitle={
        <div>
          {t.landing.agentSkillsDescription}
        </div>
      }
    >
      <div className="relative overflow-hidden">
        <ProgressiveSkillsAnimation />
      </div>
    </Section>
  );
}
