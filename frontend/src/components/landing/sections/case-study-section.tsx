import Link from "next/link";

import { Card } from "@/components/ui/card";
import { demoTasks } from "@/core/demo/scenarios";
import type { DemoTaskDefinition } from "@/core/demo/types";
import { cn } from "@/lib/utils";

import { Section } from "../section";

export function CaseStudySection({ className }: { className?: string }) {
  const caseStudies = demoTasks.map((task: DemoTaskDefinition) => ({
    threadId: task.threadId,
    title: task.title,
    description: task.description,
  }));
  return (
    <Section
      className={className}
      title="Case Studies"
      subtitle="See how DeerFlow is used in the wild"
    >
      <div className="container-md mt-8 grid grid-cols-1 gap-4 px-20 md:grid-cols-2 lg:grid-cols-3">
        {caseStudies.map((caseStudy) => (
          <Link
            key={caseStudy.title}
            href={`/workspace/chats/${caseStudy.threadId}?mock=true`}
            target="_blank"
          >
            <Card className="group/card relative h-64 overflow-hidden">
              <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-300 group-hover/card:scale-110 group-hover/card:brightness-90"
                style={{
                  backgroundImage: "linear-gradient(135deg, rgba(8, 47, 73, 0.92), rgba(22, 101, 52, 0.85))",
                }}
              ></div>
              <div
                className={cn(
                  "flex h-full w-full translate-y-[calc(100%-60px)] flex-col items-center",
                  "transition-all duration-300",
                  "group-hover/card:translate-y-[calc(100%-128px)]",
                )}
              >
                <div
                  className="flex w-full flex-col p-4"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 100%)",
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <h3 className="flex h-14 items-center text-xl font-bold text-shadow-black">
                      {caseStudy.title}
                    </h3>
                    <p className="box-shadow-black overflow-hidden text-sm text-white/85 text-shadow-black">
                      {caseStudy.description}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Section>
  );
}
