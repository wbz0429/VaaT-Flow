import type { DemoScenarioDefinition, DemoScenarioId, DemoTaskDefinition } from "./types";

const scenarioDefinitions: DemoScenarioDefinition[] = [
  {
    id: "ops",
    label: "运营助手",
    description: "围绕经营分析、区域诊断和汇报材料生成的演示场景。",
    icon: "megaphone",
    tools: ["销售分析", "区域诊断", "PPT 生成"],
    tasks: [
      {
        id: "ops-quarterly-ppt",
        scenarioId: "ops",
        title: "季度销售汇报",
        description: "从区域、渠道和重点客户三个维度生成 Q2 经营汇报和行动建议。",
        threadId: "demo-ops-quarterly-ppt",
        starterPrompt: "帮我做一份 Q2 季度销售汇报，重点讲增长亮点、风险区域和下季度动作。",
        tools: ["销售分析", "图表生成", "PPT 生成"],
        followups: [
          {
            id: "ops-quarterly-east",
            label: "追问华东区下滑原因",
            userMessage: "展开讲一下华东区为什么连续两周下滑，给我具体原因和建议。",
            aliases: ["华东", "下滑原因", "区域原因"],
          },
          {
            id: "ops-quarterly-actions",
            label: "输出三条下季度动作",
            userMessage: "把下季度最值得推进的三条动作列成执行清单。",
            aliases: ["动作", "执行清单", "下季度建议"],
          },
          {
            id: "ops-quarterly-export",
            label: "导出老板版摘要",
            userMessage: "给我一版老板 1 分钟可读的摘要，并标出要重点看的两页。",
            aliases: ["摘要", "老板版", "重点两页"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "帮我做一份 Q2 季度销售汇报，重点讲增长亮点、风险区域和下季度动作。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在汇总销售额、区域走势和客户结构...",
            toolCall: { name: "销售分析", status: "done" },
            delay: 800,
          },
          {
            role: "assistant",
            content: "正在生成图表和老板版 PPT 结构...",
            toolCall: { name: "PPT 生成", status: "done" },
            artifact: { type: "ppt", label: "Q2-经营汇报-老板版.pptx" },
            delay: 1200,
          },
        ],
      },
      {
        id: "ops-campaign-diagnosis",
        scenarioId: "ops",
        title: "活动复盘诊断",
        description: "复盘 618 活动投放 ROI，并指出预算浪费和可复制打法。",
        threadId: "demo-ops-campaign-diagnosis",
        starterPrompt: "帮我复盘一下 618 活动投放效果，特别是 ROI 最差和最好的是哪些渠道。",
        tools: ["投放复盘", "ROI 分析", "策略建议"],
        followups: [
          {
            id: "ops-campaign-budget",
            label: "解释预算浪费点",
            userMessage: "把预算浪费最明显的两个渠道拆开讲，说明为什么不值得继续投。",
            aliases: ["预算浪费", "不值得投", "最差渠道"],
          },
          {
            id: "ops-campaign-reuse",
            label: "总结可复制打法",
            userMessage: "把这次活动里最值得复制的打法总结成三条，适合给增长团队复用。",
            aliases: ["可复制", "打法", "复用"],
          },
          {
            id: "ops-campaign-report",
            label: "生成复盘纪要",
            userMessage: "生成一版适合发群的活动复盘纪要。",
            aliases: ["纪要", "发群", "复盘报告"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "帮我复盘一下 618 活动投放效果，特别是 ROI 最差和最好的是哪些渠道。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在拉取渠道消耗、线索成本和成交转化...",
            toolCall: { name: "投放复盘", status: "done" },
            delay: 700,
          },
          {
            role: "assistant",
            content: "我已经标出最优渠道、浪费预算点，并整理成复盘纪要。",
            toolCall: { name: "策略建议", status: "done" },
            artifact: { type: "report", label: "618-活动复盘.md" },
            delay: 1000,
          },
        ],
      },
    ],
  },
  {
    id: "dev",
    label: "开发助手",
    description: "围绕 PR 审查、线上问题排查和上线建议的演示场景。",
    icon: "code",
    tools: ["GitHub 集成", "日志分析", "风险评估"],
    tasks: [
      {
        id: "dev-pr-review",
        scenarioId: "dev",
        title: "PR 风险审查",
        description: "检查订单聚合接口相关 PR，定位性能和稳定性风险。",
        threadId: "demo-dev-pr-review",
        starterPrompt: "帮我看一下订单聚合接口的 PR，有没有性能和稳定性风险。",
        tools: ["GitHub 集成", "代码分析", "风险评估"],
        followups: [
          {
            id: "dev-pr-fix",
            label: "给出修复建议",
            userMessage: "把最关键的两个问题分别给出修复建议，最好带到函数级别。",
            aliases: ["修复建议", "函数级别", "怎么改"],
          },
          {
            id: "dev-pr-release",
            label: "评估是否可上线",
            userMessage: "如果今天必须上线，你会建议带着哪些限制条件发布？",
            aliases: ["上线", "限制条件", "发布建议"],
          },
          {
            id: "dev-pr-comment",
            label: "生成 PR 评论",
            userMessage: "把这些问题整理成可以直接贴到 PR 里的 review comment。",
            aliases: ["PR 评论", "review comment", "贴到 PR"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "帮我看一下订单聚合接口的 PR，有没有性能和稳定性风险。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在读取 PR diff、接口调用链和核心 SQL...",
            toolCall: { name: "GitHub 集成", status: "done" },
            delay: 700,
          },
          {
            role: "assistant",
            content: "发现了缓存穿透和 N+1 查询风险，已整理成 review 结果。",
            toolCall: { name: "风险评估", status: "done" },
            artifact: { type: "report", label: "PR-风险审查报告.md" },
            delay: 1100,
          },
        ],
      },
      {
        id: "dev-release-incident",
        scenarioId: "dev",
        title: "发布后报错定位",
        description: "基于发布记录、错误日志和接口耗时分析发布后异常。",
        threadId: "demo-dev-release-incident",
        starterPrompt: "刚发布后订单接口报错变多了，帮我判断是哪里出了问题。",
        tools: ["发布记录", "日志分析", "接口诊断"],
        followups: [
          {
            id: "dev-incident-root-cause",
            label: "追问根因",
            userMessage: "把你判断的根因展开讲一下，最好按时间线说明。",
            aliases: ["根因", "时间线", "为什么"],
          },
          {
            id: "dev-incident-rollback",
            label: "判断要不要回滚",
            userMessage: "如果是你来值班，你会建议立刻回滚还是先热修？",
            aliases: ["回滚", "热修", "值班"],
          },
          {
            id: "dev-incident-summary",
            label: "生成事故摘要",
            userMessage: "帮我写一版给群里同步的事故摘要。",
            aliases: ["事故摘要", "群里同步", "同步一下"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "刚发布后订单接口报错变多了，帮我判断是哪里出了问题。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在对比发布记录、5xx 日志和接口耗时变化...",
            toolCall: { name: "日志分析", status: "done" },
            delay: 700,
          },
          {
            role: "assistant",
            content: "我已经圈出疑似根因链路，并给出回滚/热修判断。",
            toolCall: { name: "接口诊断", status: "done" },
            artifact: { type: "report", label: "发布事故摘要.md" },
            delay: 1000,
          },
        ],
      },
    ],
  },
  {
    id: "mgmt",
    label: "管理驾驶舱",
    description: "围绕团队进度、延期风险和资源分配的演示场景。",
    icon: "chart",
    tools: ["Sprint 汇总", "风险识别", "资源建议"],
    tasks: [
      {
        id: "mgmt-weekly-dashboard",
        scenarioId: "mgmt",
        title: "周进度与风险看板",
        description: "汇总多个团队的 Sprint 进度、阻塞和交付风险。",
        threadId: "demo-mgmt-weekly-dashboard",
        starterPrompt: "给我看一下本周各团队的开发进度，有没有延期风险。",
        tools: ["Sprint 汇总", "风险识别", "周报生成"],
        followups: [
          {
            id: "mgmt-delay-why",
            label: "追问延期原因",
            userMessage: "后端组为什么会延期，把影响里程碑的原因讲清楚。",
            aliases: ["延期原因", "后端组", "里程碑"],
          },
          {
            id: "mgmt-resource-plan",
            label: "给出资源建议",
            userMessage: "如果要把风险降下来，你建议怎么调配人力和优先级？",
            aliases: ["资源建议", "调配人力", "优先级"],
          },
          {
            id: "mgmt-weekly-summary",
            label: "生成周会摘要",
            userMessage: "把这周最需要老板关注的 3 个点总结成周会摘要。",
            aliases: ["周会摘要", "老板关注", "3 个点"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "给我看一下本周各团队的开发进度，有没有延期风险。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在拉取前端、后端、测试三组的 Sprint 和 blocker...",
            toolCall: { name: "Sprint 汇总", status: "done" },
            delay: 700,
          },
          {
            role: "assistant",
            content: "我已经整理出风险团队、延期原因和资源建议。",
            toolCall: { name: "风险识别", status: "done" },
            artifact: { type: "chart", label: "周进度看板.html" },
            delay: 1000,
          },
        ],
      },
      {
        id: "mgmt-budget-health",
        scenarioId: "mgmt",
        title: "预算与资源健康度",
        description: "查看预算消耗、招聘缺口和重点项目的人力承压情况。",
        threadId: "demo-mgmt-budget-health",
        starterPrompt: "帮我看看预算和资源健康度，哪些团队有超支或者人手不足风险。",
        tools: ["预算分析", "资源盘点", "建议生成"],
        followups: [
          {
            id: "mgmt-budget-overrun",
            label: "解释超支风险",
            userMessage: "把最明显的超支风险拆开讲，说明是需求膨胀还是执行效率问题。",
            aliases: ["超支", "预算风险", "需求膨胀"],
          },
          {
            id: "mgmt-hiring-plan",
            label: "给出招聘建议",
            userMessage: "如果下个月只能补两个 HC，你建议优先补哪里？",
            aliases: ["招聘", "HC", "优先补哪里"],
          },
          {
            id: "mgmt-budget-brief",
            label: "输出管理简报",
            userMessage: "整理成一版管理层简报，突出钱花在哪里和风险在哪里。",
            aliases: ["管理层简报", "钱花在哪里", "风险在哪里"],
          },
        ],
        preview: [
          {
            role: "user",
            content: "帮我看看预算和资源健康度，哪些团队有超支或者人手不足风险。",
            delay: 500,
          },
          {
            role: "assistant",
            content: "正在汇总预算执行率、招聘缺口和项目资源承压...",
            toolCall: { name: "预算分析", status: "done" },
            delay: 700,
          },
          {
            role: "assistant",
            content: "我已经标出超支风险、缺口岗位和建议动作。",
            toolCall: { name: "建议生成", status: "done" },
            artifact: { type: "report", label: "预算健康简报.md" },
            delay: 1000,
          },
        ],
      },
    ],
  },
];

export const demoScenarios = scenarioDefinitions;

export const demoScenariosById = Object.fromEntries(
  demoScenarios.map((scenario) => [scenario.id, scenario]),
) as Record<DemoScenarioId, DemoScenarioDefinition>;

export const demoTasks = demoScenarios.flatMap((scenario) => scenario.tasks);

export const demoTasksById = Object.fromEntries(
  demoTasks.map((task) => [task.id, task]),
) as Record<string, DemoTaskDefinition>;

export const demoTasksByThreadId = Object.fromEntries(
  demoTasks.map((task) => [task.threadId, task]),
) as Record<string, DemoTaskDefinition>;

export function getScenarioPreview(scenarioId: DemoScenarioId) {
  return demoScenariosById[scenarioId].tasks[0]?.preview ?? [];
}

export function getDemoThreadUrl(threadId: string) {
  return `/workspace/chats/${threadId}?mock=true`;
}
