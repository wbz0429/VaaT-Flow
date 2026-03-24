"use client";

import { useState } from "react";

import DemoChat, { scenarios } from "@/components/landing/demo-chat";
import { Section } from "@/components/landing/section";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const tabs = [
  { value: "ops", label: "运营助手" },
  { value: "dev", label: "开发助手" },
  { value: "mgmt", label: "管理驾驶舱" },
] as const;

export function ShowcaseSection() {
  const [activeTab, setActiveTab] = useState<string>("ops");

  return (
    <Section title="看看元枢能做什么" subtitle="点击切换不同角色场景">
      <div className="mx-auto max-w-3xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mx-auto mb-6 flex w-fit">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <DemoChat scenario={scenarios[tab.value]!} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Section>
  );
}
