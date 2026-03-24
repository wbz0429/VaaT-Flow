import type { Message } from "@langchain/langgraph-sdk";

import { getTaskFollowupSuggestions } from "@/core/demo/followups";
import { demoTasksById } from "@/core/demo/scenarios";
import type { DemoEngineResponse, DemoThreadRecord } from "@/core/demo/types";

import { matchDemoFollowup } from "./demo-intents";

function textMessage(id: string, text: string): Message {
  return {
    id,
    type: "ai",
    content: [{ type: "text", text }],
    additional_kwargs: {},
  };
}

function toolMessage(id: string, toolName: string, args: Record<string, unknown>, reasoning: string, result: string): Message[] {
  const toolCallId = `${id}-tool`;
  return [
    {
      id,
      type: "ai",
      content: [],
      additional_kwargs: { reasoning_content: reasoning },
      tool_calls: [
        {
          id: toolCallId,
          name: toolName,
          args,
          type: "tool_call",
        },
      ],
    },
    {
      id: `${id}-result`,
      type: "tool",
      name: toolName,
      tool_call_id: toolCallId,
      content: result,
      additional_kwargs: {},
    },
  ];
}

function toolMessageBatches(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  reasoning: string,
  result: string,
): Message[][] {
  const [toolCallMessage, toolResultMessage] = toolMessage(
    id,
    toolName,
    args,
    reasoning,
    result,
  );
  return [[toolCallMessage!], [toolResultMessage!]];
}

function artifactAnnouncement(id: string, text: string, artifactPath: string): Message {
  return {
    id,
    type: "ai",
    content: [{ type: "text", text }],
    additional_kwargs: {},
    tool_calls: [
      {
        id: `${id}-present`,
        name: "present_files",
        args: {
          filepaths: [artifactPath],
        },
        type: "tool_call",
      },
    ],
  };
}

function multiArtifactAnnouncement(id: string, text: string, artifactPaths: string[]): Message {
  return {
    id,
    type: "ai",
    content: [{ type: "text", text }],
    additional_kwargs: {},
    tool_calls: [
      {
        id: `${id}-present`,
        name: "present_files",
        args: {
          filepaths: artifactPaths,
        },
        type: "tool_call",
      },
    ],
  };
}

function buildOpsQuarterlyDeepDive(): DemoEngineResponse {
  const batches: Message[][] = [
    [
      {
        id: "ops-quarterly-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先把 Q2 的增长来源、风险区域和重点客户异动拆开看，再决定老板版汇报的主线是先讲增长还是先讲风险。",
        },
      },
    ],
    ...toolMessageBatches(
      "ops-quarterly-tool-1",
      "销售总览",
      { period: "Q2", dimensions: ["region", "channel", "customer_tier"] },
      "先拉总览，确认增长是不是健康增长，而不是某一个渠道或客户的偶发波动。",
      "Q2 营收 1.28 亿元，同比增长 18%。增量 57% 来自华南直播和重点客户复购；风险主要集中在华东收入确认波动和信息流投放效率下滑。",
    ),
    ...toolMessageBatches(
      "ops-quarterly-tool-2",
      "区域诊断",
      { region: "华东", compare: ["Q1", "最近两周"] },
      "我再看华东区是不是单纯需求回落，还是签收/投放/客单价同时出了问题。",
      "华东区最近两周收入确认偏弱，主要受星合连锁等 3 个大客户签收延迟影响，同时信息流渠道成本上涨 22%，成交转化掉到 7.8%。",
    ),
    ...toolMessageBatches(
      "ops-quarterly-tool-3",
      "客户异动分析",
      { topCustomers: 20, metrics: ["repurchase", "signoff_delay", "contract_risk"] },
      "再确认重点客户是不是存在结构性风险，避免汇报里只讲区域不讲客户。",
      "前 20 大客户整体复购健康，但有 4 家客户签收周期拉长，其中星合连锁一家的延迟就影响本周收入确认约 180 万。",
    ),
    [
      textMessage(
        "ops-quarterly-summary-1",
        "先给结论：Q2 不是增长乏力，而是 `增长亮点明确、风险也很集中`。亮点主要来自华南直播和高价值客户复购，风险主要来自华东收入确认波动和低质量投放拉低效率。",
      ),
      textMessage(
        "ops-quarterly-summary-2",
        "如果是老板视角，我建议这份汇报只抓 3 件事：\n1. `增长从哪里来`：华南直播和重点客户复购是主增量；\n2. `风险卡在哪里`：华东区大客户签收延迟 + 信息流低 ROI；\n3. `下季度怎么打`：止损华东、稳住大客户、复制华南打法。",
      ),
    ],
    [
      multiArtifactAnnouncement(
        "ops-quarterly-present-1",
        "我已经把老板版汇报、区域补充页和执行清单都准备好了，可以直接打开。",
        [
          "/mnt/user-data/outputs/ops/q2-exec-report.md",
          "/mnt/user-data/outputs/ops/q2-exec-report.html",
          "/mnt/user-data/outputs/ops/q2-east-region-brief.md",
          "/mnt/user-data/outputs/ops/q3-action-plan.md",
        ],
      ),
    ],
  ];

  return {
    messages: batches.flat(),
    streamBatches: batches,
    artifacts: [
      "/mnt/user-data/outputs/ops/q2-exec-report.md",
      "/mnt/user-data/outputs/ops/q2-exec-report.html",
      "/mnt/user-data/outputs/ops/q2-east-region-brief.md",
      "/mnt/user-data/outputs/ops/q3-action-plan.md",
    ],
    appendArtifacts: true,
    todos: [
      { content: "跟进星合连锁签收与回款节点", status: "in_progress" },
      { content: "下调华东低 ROI 信息流预算 20%", status: "pending" },
      { content: "复制华南直播打法到华北试点", status: "pending" },
      { content: "准备老板版 1 分钟口径", status: "completed" },
    ],
    suggestions: [
      "展开讲一下华东区为什么连续两周下滑，给我具体原因和建议。",
      "把下季度最值得推进的三条动作列成执行清单。",
      "给我一版老板 1 分钟可读的摘要，并标出要重点看的两页。",
      "把华东区建议改成可以直接发给区域负责人的执行清单。",
    ],
  };
}

function buildDevPrDeepDive(): DemoEngineResponse {
  const batches: Message[][] = [
    [
      {
        id: "dev-pr-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先确认这是不是表面上的代码风格问题，还是会真正影响线上性能和稳定性。重点会看 diff、SQL 路径、缓存 key 和降级能力。",
        },
      },
    ],
    ...toolMessageBatches(
      "dev-pr-tool-1",
      "GitHub 集成",
      { pr: 142, repo: "org/order-service", files: true },
      "先拿到 PR 变更范围，避免只盯一个函数看不到整体影响。",
      "PR #142 共改动 3 个文件：新增订单聚合逻辑、缓存层封装和接口出参拼装。核心风险集中在明细查询和缓存复用策略。",
    ),
    ...toolMessageBatches(
      "dev-pr-tool-2",
      "调用链分析",
      { endpoint: "/api/orders/aggregate", compare: "before_vs_after" },
      "我再把接口调用链展开，看这次改动是不是把原来稳定的链路变成了高并发下容易放大的路径。",
      "新逻辑在高并发下会对每个订单逐条拉明细，等价于把单次查询成本放大成 N+1。低流量下不明显，但一旦批量订单请求上来，数据库压力会陡增。",
    ),
    ...toolMessageBatches(
      "dev-pr-tool-3",
      "缓存策略评估",
      { keys: ["orgId"], missing: ["dateRange", "filters"] },
      "最后看缓存 key 设计，因为这类问题最容易在 review 时被忽略，但上线后最难解释。",
      "当前缓存 key 只带 `orgId`，没有时间窗和筛选条件，存在跨查询误命中风险。轻则返回旧结果，重则导致业务侧误判数据。",
    ),
    [
      textMessage(
        "dev-pr-summary-1",
        "如果只讲老板或负责人最关心的结论：这个 PR 不是不能上，而是 `当前状态下上线风险偏高`。最大问题不是代码写法，而是它同时碰到了性能放大点和数据正确性风险点。",
      ),
      textMessage(
        "dev-pr-summary-2",
        "我会把风险分成两层：\n1. `性能层`：订单明细查询存在 N+1，流量上来后 P95 很容易拉高；\n2. `正确性层`：缓存 key 过粗，可能返回错误聚合结果。\n如果今天一定要上线，必须加灰度、监控和降级。",
      ),
    ],
    [
      multiArtifactAnnouncement(
        "dev-pr-present-1",
        "我已经整理出完整审查报告、可直接贴 PR 的评论，以及上线前 checklist。",
        [
          "/mnt/user-data/outputs/dev/pr-review-report.md",
          "/mnt/user-data/outputs/dev/pr-review-comments.md",
          "/mnt/user-data/outputs/dev/pr-release-checklist.md",
        ],
      ),
    ],
  ];

  return {
    messages: batches.flat(),
    streamBatches: batches,
    artifacts: [
      "/mnt/user-data/outputs/dev/pr-review-report.md",
      "/mnt/user-data/outputs/dev/pr-review-comments.md",
      "/mnt/user-data/outputs/dev/pr-release-checklist.md",
    ],
    appendArtifacts: true,
    todos: [
      { content: "把订单明细查询改成批量聚合", status: "in_progress" },
      { content: "补缓存 key 的时间窗和筛选维度", status: "pending" },
      { content: "上线前配置灰度和 P95 监控", status: "pending" },
    ],
    suggestions: [
      "把最关键的两个问题分别给出修复建议，最好带到函数级别。",
      "如果今天必须上线，你会建议带着哪些限制条件发布？",
      "把这些问题整理成可以直接贴到 PR 里的 review comment。",
      "给我一版上线前自测和回滚 checklist。",
    ],
  };
}

function buildDevIncidentDeepDive(): DemoEngineResponse {
  const batches: Message[][] = [
    [
      {
        id: "dev-incident-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先把发布时间线、错误率、慢查询和缓存命中率串起来，先判断这是代码 bug、配置问题，还是流量放大后触发的链路拥塞。",
        },
      },
    ],
    ...toolMessageBatches(
      "dev-incident-tool-1",
      "发布记录",
      { service: "order-aggregate", release: "2026-03-24-1405" },
      "先卡住发布时间点，避免把旧问题误算到这次发布头上。",
      "14:05 发布了新的订单聚合逻辑和缓存封装，没有数据库结构变更，也没有网关配置改动。",
    ),
    ...toolMessageBatches(
      "dev-incident-tool-2",
      "日志分析",
      { service: "order-aggregate", window: "post-release-30m" },
      "再看错误率是不是和新链路强相关。",
      "14:11 开始出现 `cache_key mismatch`、慢查询增长和连接池告警，14:16 错误率升到 4.8%，异常集中在新聚合分支。",
    ),
    ...toolMessageBatches(
      "dev-incident-tool-3",
      "接口诊断",
      { endpoint: "/api/orders/aggregate", metrics: ["p95", "db_pool", "cache_hit"] },
      "最后判断是继续热修，还是应该直接回滚。",
      "P95 从 420ms 拉到 1.4s，缓存命中率掉到 31%，数据库连接池接近打满。继续放量风险很高，更适合优先回滚。",
    ),
    [
      textMessage(
        "dev-incident-summary-1",
        "我的判断很明确：这不是单点偶发告警，而是 `新聚合逻辑导致缓存失效后，数据库压力被放大` 的典型发布事故。当前最优策略不是继续观察，而是优先回滚或立即切降级。",
      ),
      textMessage(
        "dev-incident-summary-2",
        "如果你是值班负责人，我会给两层建议：\n1. `止血动作`：优先回滚，至少先切掉新聚合分支；\n2. `复盘动作`：补缓存 key 维度、回归压测、增加缓存命中率和 DB 连接池监控。",
      ),
    ],
    [
      multiArtifactAnnouncement(
        "dev-incident-present-1",
        "我已经把事故摘要和时间线复盘整理好了，可以直接同步。",
        [
          "/mnt/user-data/outputs/dev/release-incident-summary.md",
          "/mnt/user-data/outputs/dev/release-incident-timeline.md",
        ],
      ),
    ],
  ];

  return {
    messages: batches.flat(),
    streamBatches: batches,
    artifacts: [
      "/mnt/user-data/outputs/dev/release-incident-summary.md",
      "/mnt/user-data/outputs/dev/release-incident-timeline.md",
    ],
    appendArtifacts: true,
    todos: [
      { content: "确认是否立刻回滚新聚合逻辑", status: "in_progress" },
      { content: "补缓存命中率和 DB 连接池告警", status: "pending" },
      { content: "准备事故复盘时间线", status: "completed" },
    ],
    suggestions: [
      "把你判断的根因展开讲一下，最好按时间线说明。",
      "如果是你来值班，你会建议立刻回滚还是先热修？",
      "帮我写一版给群里同步的事故摘要。",
      "把时间线整理成事故复盘版本。",
    ],
  };
}

function buildMgmtWeeklyDeepDive(): DemoEngineResponse {
  const batches: Message[][] = [
    [
      {
        id: "mgmt-weekly-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先按团队完成度、blocker 和里程碑依赖来拆，不只是看谁慢，而是看谁会把风险传导给别人。",
        },
      },
    ],
    ...toolMessageBatches(
      "mgmt-weekly-tool-1",
      "Sprint 汇总",
      { week: "2026-W13", teams: ["frontend", "backend", "qa"] },
      "先拿到多团队进度盘子，避免只盯后端延误却看不到整体联动。",
      "前端 83% 正常推进，后端 57% 有延期风险，测试组当前并不是资源不足，而是在等待后端链路稳定。",
    ),
    ...toolMessageBatches(
      "mgmt-weekly-tool-2",
      "风险识别",
      { focus: ["milestone", "blockers", "scope_change"] },
      "再判断哪些风险只是团队内部消化，哪些已经影响下周试点里程碑。",
      "后端认证模块返工和报表接口需求膨胀已经影响到下周一试点里程碑，这是当前最核心的跨团队风险。",
    ),
    ...toolMessageBatches(
      "mgmt-weekly-tool-3",
      "资源建议",
      { options: ["freeze_scope", "borrow_engineer", "shift_testing_left"] },
      "最后把建议压成老板可拍板的动作，而不是空泛地说要协调资源。",
      "建议本周冻结后端非核心报表需求，从平台组借 1 人支援认证链路，并让测试提前介入主链路冒烟，避免继续被动等待。",
    ),
    [
      textMessage(
        "mgmt-weekly-summary-1",
        "老板视角的一句话结论：本周不是全面失速，而是 `后端组的局部延期正在开始拖累整体节奏`。如果现在不收敛范围，风险会从单点问题扩散成整个试点延期。",
      ),
      textMessage(
        "mgmt-weekly-summary-2",
        "我建议你只盯 3 件事：\n1. 后端组本周是否冻结非核心需求；\n2. 是否临时借人支援认证链路；\n3. 测试是否提前切入关键路径。\n这三件事决定了风险会收敛，还是继续向试点日期扩散。",
      ),
    ],
    [
      multiArtifactAnnouncement(
        "mgmt-weekly-present-1",
        "我已经把周进度看板、延期风险说明和老板周会摘要都整理好了。",
        [
          "/mnt/user-data/outputs/mgmt/weekly-dashboard.html",
          "/mnt/user-data/outputs/mgmt/backend-delay-brief.md",
          "/mnt/user-data/outputs/mgmt/weekly-exec-summary.md",
        ],
      ),
    ],
  ];

  return {
    messages: batches.flat(),
    streamBatches: batches,
    artifacts: [
      "/mnt/user-data/outputs/mgmt/weekly-dashboard.html",
      "/mnt/user-data/outputs/mgmt/backend-delay-brief.md",
      "/mnt/user-data/outputs/mgmt/weekly-exec-summary.md",
    ],
    appendArtifacts: true,
    todos: [
      { content: "冻结后端非核心报表需求", status: "in_progress" },
      { content: "从平台组借 1 人支援认证链路", status: "pending" },
      { content: "测试提前介入主链路冒烟", status: "pending" },
    ],
    suggestions: [
      "后端组为什么会延期，把影响里程碑的原因讲清楚。",
      "如果要把风险降下来，你建议怎么调配人力和优先级？",
      "把这周最需要老板关注的 3 个点总结成周会摘要。",
      "给我一版老板能快速决策的建议。",
    ],
  };
}

function buildMgmtBudgetDeepDive(): DemoEngineResponse {
  const batches: Message[][] = [
    [
      {
        id: "mgmt-budget-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先把预算超支、人力缺口和项目承压拆开看，避免把所有问题都归成‘资源不足’。",
        },
      },
    ],
    ...toolMessageBatches(
      "mgmt-budget-tool-1",
      "预算分析",
      { quarter: "Q2", dimensions: ["team", "project", "vendor"] },
      "先确认超支是不是局部异常，还是已经开始影响多个项目。",
      "数据平台预算执行率已达 84%，商业化增长实验支出快于收入验证，两个方向都在挤压下季度预算空间。",
    ),
    ...toolMessageBatches(
      "mgmt-budget-tool-2",
      "资源盘点",
      { focus: ["hc_gap", "outsourcing", "critical_projects"] },
      "再看钱的问题和人的问题是不是同一根因。",
      "后端基础架构存在关键 HC 缺口，数据平台靠外包硬撑，商业化团队则是试验范围失控而不是纯粹缺人。",
    ),
    ...toolMessageBatches(
      "mgmt-budget-tool-3",
      "建议生成",
      { priorities: ["reduce_scope", "hire_backend", "hire_data"] },
      "最后把它压成老板能拍板的资源建议，而不是泛泛地说要控预算。",
      "建议优先收缩增长实验范围，同时把下月仅有的 2 个 HC 优先给后端基础架构和数据分析工程师。",
    ),
    [
      textMessage(
        "mgmt-budget-summary-1",
        "一句话结论：当前最危险的不是‘钱不够’，而是 `钱花得太散 + 关键岗位没补上`。如果不收缩探索范围，下季度预算和交付都会一起变差。",
      ),
      textMessage(
        "mgmt-budget-summary-2",
        "如果我是管理层，我会优先拍板两件事：\n1. 收缩商业化高消耗低验证的增长实验；\n2. 把新增 HC 优先投给后端基础架构和数据分析，而不是继续平均分配。",
      ),
    ],
    [
      multiArtifactAnnouncement(
        "mgmt-budget-present-1",
        "预算健康简报、HC 优先级建议和管理摘要都准备好了。",
        [
          "/mnt/user-data/outputs/mgmt/budget-health-brief.md",
          "/mnt/user-data/outputs/mgmt/hiring-priority-brief.md",
          "/mnt/user-data/outputs/mgmt/management-budget-summary.md",
        ],
      ),
    ],
  ];

  return {
    messages: batches.flat(),
    streamBatches: batches,
    artifacts: [
      "/mnt/user-data/outputs/mgmt/budget-health-brief.md",
      "/mnt/user-data/outputs/mgmt/hiring-priority-brief.md",
      "/mnt/user-data/outputs/mgmt/management-budget-summary.md",
    ],
    appendArtifacts: true,
    todos: [
      { content: "确认下月 2 个 HC 的分配优先级", status: "in_progress" },
      { content: "收缩增长实验预算和范围", status: "pending" },
      { content: "准备管理层预算摘要", status: "completed" },
    ],
    suggestions: [
      "把最明显的超支风险拆开讲，说明是需求膨胀还是执行效率问题。",
      "如果下个月只能补两个 HC，你建议优先补哪里？",
      "整理成一版管理层简报，突出钱花在哪里和风险在哪里。",
      "再补一句不补这些岗位的代价。",
    ],
  };
}

type FollowupFactory = (thread: DemoThreadRecord) => DemoEngineResponse;

const handlers: Record<string, FollowupFactory> = {
  "ops-quarterly-east": () => ({
    messages: [
      {
        id: "ops-east-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先确认华东的问题主要来自客户签收、渠道效率还是需求下滑，再决定建议应该偏止损还是偏拉增长。",
        },
      },
      ...toolMessage(
        "ops-east-1",
        "区域诊断",
        { region: "华东", metric: "gmv" },
        "我先把华东区近两周的成交、客单价、重点客户异动和渠道结构拆开看。",
        "华东区主要受两件事影响：1) 核心 KA 客户星合连锁延迟签收，拉低本周确认收入约 180 万；2) 信息流渠道成本上涨 22%，但线索质量下降，导致成交转化掉到 7.8%。",
      ),
      textMessage(
        "ops-east-2",
        "华东区连续下滑的核心原因不是单一需求走弱，而是 `大客户回款延迟 + 低质量投放拉高成本` 叠加。建议本周优先做两件事：\n1. 由大客户经理盯紧星合连锁签收节点，确保下周回补收入；\n2. 暂停低 ROI 的信息流扩量，把预算转回企业微信私域和老客户复购活动。",
      ),
      artifactAnnouncement(
        "ops-east-3",
        "我把华东区问题和建议单独整理成了一页区域简报。",
        "/mnt/user-data/outputs/ops/q2-east-region-brief.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/ops/q2-east-region-brief.md"],
    suggestions: [
      "把华东区建议改成可以直接发给区域负责人的执行清单。",
      "再给我一页只讲华东区问题的老板汇报页。",
    ],
  }),
  "ops-quarterly-actions": () => ({
    messages: [
      {
        id: "ops-actions-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "这里不能只给口号，我会把动作按优先级、负责人和时间节点收敛成可执行清单。",
        },
      },
      textMessage(
        "ops-actions-1",
        "下季度最值得推进的三条动作：\n1. `重点区域止损`：华东信息流预算下调 20%，转向高复购客户和私域唤醒；\n2. `大客户保增长`：对前 20 客户建立签收/回款预警，避免收入确认波动；\n3. `渠道提效`：把华南的直播转化打法复制到华北试点，两周看 CAC 和签单率。",
      ),
      artifactAnnouncement(
        "ops-actions-2",
        "我把这三条动作拆成了可执行版本，方便直接发给团队。",
        "/mnt/user-data/outputs/ops/q3-action-plan.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/ops/q3-action-plan.md"],
    suggestions: [
      "给每条动作补负责人和时间节点。",
      "把这三条动作压缩成老板会上的 30 秒版本。",
    ],
  }),
  "ops-quarterly-export": () => ({
    messages: [
      textMessage(
        "ops-export-1",
        "老板 1 分钟摘要：Q2 总体收入同比增长 18%，主要增量来自华南直播和重点客户复购；最大的风险在华东收入确认波动和低质量投放效率下滑。建议老板重点看第 4 页 `区域走势` 和第 8 页 `下季度动作`。",
      ),
    ],
    suggestions: [
      "把这段再压缩成 3 句话。",
      "给我一版更强势一点的汇报口径。",
    ],
  }),
  "ops-campaign-budget": () => ({
    messages: [
      ...toolMessage(
        "ops-budget-1",
        "ROI 分析",
        { campaign: "618", dimension: "channel" },
        "我把 618 预算消耗最高但回款最差的渠道拆出来看。",
        "两处预算浪费最明显：1) 短视频信息流消耗 92 万，ROI 仅 0.7，主要问题是素材点击高但表单质量差；2) 联合投放联盟渠道消耗 38 万，线索量看起来高，但有效商机率只有 11%。",
      ),
      textMessage(
        "ops-budget-2",
        "这两个渠道都不值得继续扩量。前者是流量质量问题，后者是渠道筛选机制太松。建议短期内分别做 `素材停投+落地页改版` 和 `收紧投放准入+只保留头部联盟伙伴`。",
      ),
    ],
    suggestions: [
      "按负责人拆一下这两个渠道后续怎么处理。",
      "给我一版可以发给增长团队的动作列表。",
    ],
  }),
  "ops-campaign-reuse": () => ({
    messages: [
      textMessage(
        "ops-reuse-1",
        "这次活动最值得复制的三条打法：\n1. 直播间导流到企业微信的链路，首咨到成交转化率最高；\n2. 老客户专属券包对高客单客户效果明显，复购率提升 14%；\n3. 区域化素材策略有效，华南/华北分别用不同利益点时点击率差异达到 1.8 倍。",
      ),
    ],
    suggestions: [
      "把这三条整理成复盘会 PPT 页。",
      "给增长团队列一个复制动作优先级。",
    ],
  }),
  "ops-campaign-report": () => ({
    messages: [
      artifactAnnouncement(
        "ops-report-1",
        "我已经整理成一版适合发群的复盘纪要，你可以直接转发。",
        "/mnt/user-data/outputs/ops/618-retro-summary.md",
      ),
    ],
    suggestions: [
      "把语气改得更口语一点。",
      "再补一句下次活动的优先动作。",
    ],
  }),
  "dev-pr-fix": () => ({
    messages: [
      {
        id: "dev-fix-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我把建议压到函数级别，这样工程负责人可以直接拿去安排修改。",
        },
      },
      textMessage(
        "dev-fix-1",
        "两个最关键的问题和修复建议：\n1. `订单明细循环查询`：把逐单查明细改成批量聚合查询，避免高并发下 N+1；\n2. `缓存 key 过粗`：现在只按 `orgId` 缓存，建议补上时间窗和筛选条件，避免错误复用旧结果。",
      ),
      artifactAnnouncement(
        "dev-fix-2",
        "我顺手补了一版上线前 checklist，方便你直接落地。",
        "/mnt/user-data/outputs/dev/pr-release-checklist.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/dev/pr-release-checklist.md"],
    suggestions: [
      "按函数级别给我更具体一点。",
      "补一个上线前自测清单。",
    ],
  }),
  "dev-pr-release": () => ({
    messages: [
      textMessage(
        "dev-release-1",
        "如果今天必须上线，我会建议带 3 个限制条件：\n1. 灰度到 10% 流量；\n2. 打开接口超时和缓存命中率监控；\n3. 把订单详情聚合走降级开关，一旦 P95 超过 800ms 立即回退旧逻辑。",
      ),
    ],
    suggestions: [
      "给我一版值班同学能直接执行的 checklist。",
      "如果不能灰度，你会怎么判断是否延期发布？",
    ],
  }),
  "dev-pr-comment": () => ({
    messages: [
      artifactAnnouncement(
        "dev-comment-1",
        "我已经整理成可直接贴到 PR 的 review comment。",
        "/mnt/user-data/outputs/dev/pr-review-comments.md",
      ),
    ],
    suggestions: [
      "把语气改成更强硬一点。",
      "再补一句为什么这是 blocker。",
    ],
  }),
  "dev-incident-root-cause": () => ({
    messages: [
      {
        id: "dev-root-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "这里我按时间线展开，这样值班同步和事故复盘都能直接复用。",
        },
      },
      ...toolMessage(
        "dev-root-1",
        "日志分析",
        { service: "order-aggregate", window: "post-release-30m" },
        "我先把发布时间点前后的 5xx、慢查询和新旧代码路径做时间线对比。",
        "14:05 发布后开始出现 `cache_key mismatch` 和 DB 连接池耗尽，14:11 P95 从 420ms 升到 1.4s，14:16 错误率突破 4.8%。异常集中在新的订单聚合分支。",
      ),
      textMessage(
        "dev-root-2",
        "我判断根因是新聚合逻辑导致缓存失效后，大量请求直接打到数据库，触发慢查询和连接池拥塞，最终放大成 5xx 波动。",
      ),
      artifactAnnouncement(
        "dev-root-3",
        "我把事故时间线整理成复盘页了。",
        "/mnt/user-data/outputs/dev/release-incident-timeline.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/dev/release-incident-timeline.md"],
    suggestions: [
      "把时间线整理成事故复盘版本。",
      "再给我一个立即止血方案。",
    ],
  }),
  "dev-incident-rollback": () => ({
    messages: [
      textMessage(
        "dev-rollback-1",
        "如果我来值班，我会建议 `优先回滚`。因为现在故障和新逻辑强相关，而且影响的是订单核心路径。只有在确认可以 10 分钟内通过降级开关完全切回旧缓存策略时，才考虑先热修。",
      ),
    ],
    suggestions: [
      "给我一版值班群里能直接发的建议。",
      "再补一句为什么不建议硬扛。",
    ],
  }),
  "dev-incident-summary": () => ({
    messages: [
      artifactAnnouncement(
        "dev-summary-1",
        "事故摘要已经整理好了，可以直接同步到群里。",
        "/mnt/user-data/outputs/dev/release-incident-summary.md",
      ),
    ],
    suggestions: [
      "再补一个后续行动列表。",
      "把语气改成更正式一点。",
    ],
  }),
  "mgmt-delay-why": () => ({
    messages: [
      {
        id: "mgmt-delay-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "我先把延期拆成需求问题、执行问题和依赖问题，不然建议会很空。",
        },
      },
      ...toolMessage(
        "mgmt-delay-1",
        "风险识别",
        { team: "backend", sprint: "S24" },
        "我把后端组本周 blocker、需求变更和里程碑依赖关系串起来看。",
        "后端组延期主要因为认证模块二次返工和报表接口需求膨胀：原计划 5 个接口，实际新增到 9 个，且测试环境数据不稳定，导致联调滞后 2 天。",
      ),
      textMessage(
        "mgmt-delay-2",
        "它影响的不是单个任务，而是下周一的外部试点里程碑。如果不处理，前端和测试会继续被动等待，延期风险会扩散到整个发布节奏。",
      ),
      artifactAnnouncement(
        "mgmt-delay-3",
        "我把后端延期原因和影响范围整理成了一页风险说明。",
        "/mnt/user-data/outputs/mgmt/backend-delay-brief.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/mgmt/backend-delay-brief.md"],
    suggestions: [
      "给我一版老板能快速决策的建议。",
      "拆一下哪些是需求问题，哪些是执行问题。",
    ],
  }),
  "mgmt-resource-plan": () => ({
    messages: [
      textMessage(
        "mgmt-resource-1",
        "如果要把风险降下来，我建议这样调：\n1. 后端组本周冻结非核心报表需求，只保认证和试点主链路；\n2. 从平台组借 1 名熟悉权限体系的工程师支援 3 天；\n3. 测试组提前介入冒烟清单，避免再等全部联调完才开始验证。",
      ),
    ],
    suggestions: [
      "给我一版更偏管理口径的说法。",
      "再补一个如果不加人会怎样。",
    ],
  }),
  "mgmt-weekly-summary": () => ({
    messages: [
      textMessage(
        "mgmt-summary-1",
        "本周老板最需要关注的 3 个点：\n1. 后端组认证与报表链路延期，已经影响试点里程碑；\n2. 前端组整体进度健康，但依赖后端接口稳定性；\n3. 测试组当前不是资源不足，而是被上游交付节奏卡住。",
      ),
    ],
    suggestions: [
      "给我压缩成周会上 30 秒版本。",
      "再补一句建议老板拍板什么。",
    ],
  }),
  "mgmt-budget-overrun": () => ({
    messages: [
      {
        id: "mgmt-overrun-think-1",
        type: "ai",
        content: [],
        additional_kwargs: {
          reasoning_content:
            "这里我要先区分超支到底是需求膨胀、效率问题还是策略问题，不然结论没法拿去管理。",
        },
      },
      textMessage(
        "mgmt-overrun-1",
        "最明显的超支风险有两块：\n1. 数据平台项目因为需求滚动增加了 2 名外包支持，预算执行率已经到 84%；\n2. 商业化团队的增长实验过多，预算消耗快于收入验证，属于典型的探索范围失控。",
      ),
      artifactAnnouncement(
        "mgmt-overrun-2",
        "我把 HC 优先级和管理层预算摘要也整理好了。",
        "/mnt/user-data/outputs/mgmt/hiring-priority-brief.md",
      ),
    ],
    appendArtifacts: true,
    artifacts: ["/mnt/user-data/outputs/mgmt/hiring-priority-brief.md"],
    suggestions: [
      "把这两类问题拆成可执行动作。",
      "再给我一版适合管理层的表达。",
    ],
  }),
  "mgmt-hiring-plan": () => ({
    messages: [
      textMessage(
        "mgmt-hiring-1",
        "如果下个月只能补两个 HC，我建议优先补：\n1. 后端基础架构工程师，缓解认证/权限和高并发接口瓶颈；\n2. 资深数据分析工程师，支撑经营分析和预算闭环，不然管理层会持续缺乏高质量数据视图。",
      ),
    ],
    suggestions: [
      "再补一句不补的代价。",
      "给我一版更适合 HRBP 讨论的说法。",
    ],
  }),
  "mgmt-budget-brief": () => ({
    messages: [
      artifactAnnouncement(
        "mgmt-brief-1",
        "管理层简报已经整理好了，重点标了预算去向和主要风险。",
        "/mnt/user-data/outputs/mgmt/budget-health-brief.md",
      ),
    ],
    suggestions: [
      "再补一句下月重点动作。",
      "把这版改成更适合邮件发送。",
    ],
  }),
};

function buildFallbackResponse(thread: DemoThreadRecord, userMessage: string): DemoEngineResponse {
  const taskId = thread.values.demo?.taskId;
  const task = taskId ? demoTasksById[taskId] : null;
  const followupExamples = getTaskFollowupSuggestions(taskId).slice(0, 3);

  return {
    messages: [
      textMessage(
        `fallback-${Date.now()}`,
        `我已经收到你的追问："${userMessage}"。当前这个 demo 版本更适合演示固定的高价值交互路径，我建议你继续追问这些方向：\n${followupExamples
          .map((item, index) => `${index + 1}. ${item}`)
          .join("\n")}${task ? `\n\n如果你愿意，我也可以继续围绕「${task.title}」补充说明。` : ""}`,
      ),
    ],
    suggestions: followupExamples,
  };
}

export function generateDemoResponse(thread: DemoThreadRecord, userMessage: string) {
  const taskId = thread.values.demo?.taskId;
  if (taskId === "ops-quarterly-ppt") {
    const normalized = userMessage.trim();
    const starter = demoTasksById[taskId]?.starterPrompt;
    if (starter && normalized === starter) {
      return buildOpsQuarterlyDeepDive();
    }
  }
  if (taskId === "dev-pr-review") {
    const normalized = userMessage.trim();
    const starter = demoTasksById[taskId]?.starterPrompt;
    if (starter && normalized === starter) {
      return buildDevPrDeepDive();
    }
  }
  if (taskId === "dev-release-incident") {
    const normalized = userMessage.trim();
    const starter = demoTasksById[taskId]?.starterPrompt;
    if (starter && normalized === starter) {
      return buildDevIncidentDeepDive();
    }
  }
  if (taskId === "mgmt-weekly-dashboard") {
    const normalized = userMessage.trim();
    const starter = demoTasksById[taskId]?.starterPrompt;
    if (starter && normalized === starter) {
      return buildMgmtWeeklyDeepDive();
    }
  }
  if (taskId === "mgmt-budget-health") {
    const normalized = userMessage.trim();
    const starter = demoTasksById[taskId]?.starterPrompt;
    if (starter && normalized === starter) {
      return buildMgmtBudgetDeepDive();
    }
  }
  const matchedFollowup = matchDemoFollowup(taskId, userMessage);

  if (matchedFollowup) {
    return handlers[matchedFollowup.id]?.(thread) ?? buildFallbackResponse(thread, userMessage);
  }

  return buildFallbackResponse(thread, userMessage);
}
