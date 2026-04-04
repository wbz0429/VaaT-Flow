import {
  CompassIcon,
  GraduationCapIcon,
  ImageIcon,
  MicroscopeIcon,
  PenLineIcon,
  ShapesIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";

import type { Translations } from "./types";

export const enUS: Translations = {
  // Locale meta
  locale: {
    localName: "English",
  },

  // Common
  common: {
    home: "Home",
    settings: "Settings",
    delete: "Delete",
    rename: "Rename",
    share: "Share",
    openInNewWindow: "Open in new window",
    close: "Close",
    more: "More",
    search: "Search",
    download: "Download",
    thinking: "Thinking",
    artifacts: "Artifacts",
    public: "Public",
    custom: "Custom",
    notAvailableInDemoMode: "Not available in demo mode",
    loading: "Loading...",
    version: "Version",
    lastUpdated: "Last updated",
    code: "Code",
    preview: "Preview",
    cancel: "Cancel",
    save: "Save",
    install: "Install",
    create: "Create",
  },

  // Welcome
  welcome: {
    greeting: "Hello, again!",
    description:
      "Welcome to Allo, your AI office assistant. With built-in and custom skills, Allo helps you search on the web, analyze data, and generate artifacts like slides, web pages and do almost anything.",

    createYourOwnSkill: "Create Your Own Skill",
    createYourOwnSkillDescription:
      "Create your own skill to release the power of Allo. With customized skills,\nAllo can help you search on the web, analyze data, and generate\n artifacts like slides, web pages and do almost anything.",
  },

  // Clipboard
  clipboard: {
    copyToClipboard: "Copy to clipboard",
    copiedToClipboard: "Copied to clipboard",
    failedToCopyToClipboard: "Failed to copy to clipboard",
    linkCopied: "Link copied to clipboard",
  },

  // Input Box
  inputBox: {
    placeholder: "How can I assist you today?",
    createSkillPrompt:
      "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
    addAttachments: "Add attachments",
    mode: "Mode",
    flashMode: "Flash",
    flashModeDescription: "Fast and efficient, but may not be accurate",
    reasoningMode: "Reasoning",
    reasoningModeDescription:
      "Reasoning before action, balance between time and accuracy",
    proMode: "Pro",
    proModeDescription:
      "Reasoning, planning and executing, get more accurate results, may take more time",
    ultraMode: "Ultra",
    ultraModeDescription:
      "Pro mode with subagents to divide work; best for complex multi-step tasks",
    reasoningEffort: "Reasoning Effort",
    reasoningEffortMinimal: "Minimal",
    reasoningEffortMinimalDescription: "Retrieval + Direct Output",
    reasoningEffortLow: "Low",
    reasoningEffortLowDescription: "Simple Logic Check + Shallow Deduction",
    reasoningEffortMedium: "Medium",
    reasoningEffortMediumDescription:
      "Multi-layer Logic Analysis + Basic Verification",
    reasoningEffortHigh: "High",
    reasoningEffortHighDescription:
      "Full-dimensional Logic Deduction + Multi-path Verification + Backward Check",
    searchModels: "Search models...",
    surpriseMe: "Surprise",
    surpriseMePrompt: "Surprise me",
    followupLoading: "Generating follow-up questions...",
    followupConfirmTitle: "Send suggestion?",
    followupConfirmDescription:
      "You already have text in the input. Choose how to send it.",
    followupConfirmAppend: "Append & send",
    followupConfirmReplace: "Replace & send",
    suggestions: [
      {
        suggestion: "Write",
        prompt: "Write a blog post about the latest trends on [topic]",
        icon: PenLineIcon,
      },
      {
        suggestion: "Research",
        prompt:
          "Conduct a deep dive research on [topic], and summarize the findings.",
        icon: MicroscopeIcon,
      },
      {
        suggestion: "Collect",
        prompt: "Collect data from [source] and create a report.",
        icon: ShapesIcon,
      },
      {
        suggestion: "Learn",
        prompt: "Learn about [topic] and create a tutorial.",
        icon: GraduationCapIcon,
      },
    ],
    suggestionsCreate: [
      {
        suggestion: "Webpage",
        prompt: "Create a webpage about [topic]",
        icon: CompassIcon,
      },
      {
        suggestion: "Image",
        prompt: "Create an image about [topic]",
        icon: ImageIcon,
      },
      {
        suggestion: "Video",
        prompt: "Create a video about [topic]",
        icon: VideoIcon,
      },
      {
        type: "separator",
      },
      {
        suggestion: "Skill",
        prompt:
          "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
        icon: SparklesIcon,
      },
    ],
  },

  // Sidebar
  sidebar: {
    newChat: "New chat",
    chats: "Chats",
    recentChats: "Recent chats",
    demoChats: "Demo chats",
    agents: "Agents",
  },

  // Agents
  agents: {
    title: "Agents",
    description:
      "Create and manage custom agents with specialized prompts and capabilities.",
    newAgent: "New Agent",
    emptyTitle: "No custom agents yet",
    emptyDescription:
      "Create your first custom agent with a specialized system prompt.",
    chat: "Chat",
    delete: "Delete",
    deleteConfirm:
      "Are you sure you want to delete this agent? This action cannot be undone.",
    deleteSuccess: "Agent deleted",
    newChat: "New chat",
    createPageTitle: "Design your Agent",
    createPageSubtitle:
      "Describe the agent you want — I'll help you create it through conversation.",
    nameStepTitle: "Name your new Agent",
    nameStepHint:
      "Letters, digits, and hyphens only — stored lowercase (e.g. code-reviewer)",
    nameStepPlaceholder: "e.g. code-reviewer",
    nameStepContinue: "Continue",
    nameStepInvalidError:
      "Invalid name — use only letters, digits, and hyphens",
    nameStepAlreadyExistsError: "An agent with this name already exists",
    nameStepCheckError: "Could not verify name availability — please try again",
    nameStepBootstrapMessage:
      "The new custom agent name is {name}. Let's bootstrap it's **SOUL**.",
    agentCreated: "Agent created!",
    startChatting: "Start chatting",
    backToGallery: "Back to Gallery",
  },

  // Breadcrumb
  breadcrumb: {
    workspace: "Workspace",
    chats: "Chats",
  },

  // Workspace
  workspace: {
    officialWebsite: "Allo website",
    settingsAndMore: "Settings and more",
    contactUs: "Contact us",
    about: "About Allo",
  },

  // Conversation
  conversation: {
    noMessages: "No messages yet",
    startConversation: "Start a conversation to see messages here",
  },

  // Chats
  chats: {
    searchChats: "Search chats",
  },

  // Page titles (document title)
  pages: {
    appName: "Allo",
    chats: "Chats",
    newChat: "New chat",
    untitled: "Untitled",
  },

  // Tool calls
  toolCalls: {
    moreSteps: (count: number) => `${count} more step${count === 1 ? "" : "s"}`,
    lessSteps: "Less steps",
    executeCommand: "Execute command",
    presentFiles: "Present files",
    needYourHelp: "Need your help",
    useTool: (toolName: string) => `Use "${toolName}" tool`,
    searchFor: (query: string) => `Search for "${query}"`,
    searchForRelatedInfo: "Search for related information",
    searchForRelatedImages: "Search for related images",
    searchForRelatedImagesFor: (query: string) =>
      `Search for related images for "${query}"`,
    searchOnWebFor: (query: string) => `Search on the web for "${query}"`,
    viewWebPage: "View web page",
    listFolder: "List folder",
    readFile: "Read file",
    writeFile: "Write file",
    clickToViewContent: "Click to view file content",
    writeTodos: "Update to-do list",
    skillInstallTooltip: "Install skill and make it available to Allo",
  },

  // Subtasks
  uploads: {
    uploading: "Uploading...",
    uploadingFiles: "Uploading files, please wait...",
  },

  subtasks: {
    subtask: "Subtask",
    executing: (count: number) =>
      `Executing ${count === 1 ? "" : count + " "}subtask${count === 1 ? "" : "s in parallel"}`,
    in_progress: "Running subtask",
    completed: "Subtask completed",
    failed: "Subtask failed",
  },

  // Auth
  auth: {
    signIn: "Sign in",
    signInDescription: "Enter your email and password to continue",
    signingIn: "Signing in\u2026",
    signInFailed: "Sign in failed",
    unexpectedError: "An unexpected error occurred",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    noAccount: "Don\u2019t have an account?",
    register: "Register",
    createAccount: "Create an account",
    createAccountDescription: "Enter your details to get started",
    creatingAccount: "Creating account\u2026",
    name: "Name",
    namePlaceholder: "Your name",
    alreadyHaveAccount: "Already have an account?",
    localDevAccount: "Local dev account",
    localDevEmail: "dev@allo.local",
    localDevPassword: "Password123!",
    fillLocalDev: "Fill local dev account",
  },

  // Landing
  landing: {
    brandName: "Allo",
    brandSubtitle: "",
    tagline:
      "Your AI office assistant \u2014 research, code, analyze, create.\nFrom minutes to hours of work, Allo gets it done.",
    cta: "Get Started",
    withBrand: "with Allo",
    capabilities: [
      "Deep Research",
      "Collect Data",
      "Analyze Data",
      "Generate Webpages",
      "Vibe Coding",
      "Generate Slides",
      "Generate Images",
      "Generate Podcasts",
      "Generate Videos",
      "Organize Emails",
      "Do Anything",
      "Learn Anything",
    ],
    caseStudies: "Case Studies",
    caseStudiesSubtitle:
      "See how Allo\uFF08\u5143\u67A2\uFF09 is used in the wild",
    agentSkills: "Agent Skills",
    agentSkillsDescription:
      "Agent Skills are loaded progressively \u2014 only what\u2019s needed, when it\u2019s needed. Extend Allo with your own skill files, or use our built-in library.",
    agentRuntime: "Agent Runtime Environment",
    agentRuntimeDescription:
      'We give Allo a "computer", which can execute commands, manage files, and run long tasks \u2014 all in a secure Docker-based sandbox',
    secureRuntime: "Secure Runtime",
    aioSandbox: "AIO Sandbox",
    aioSandboxDescription:
      "We recommend using All-in-One Sandbox that combines Browser, Shell, File, MCP and VSCode Server in a single Docker container.",
    joinCommunity: "Join the Community",
    communityDescription:
      "Contribute brilliant ideas to shape the future of Allo\uFF08\u5143\u67A2\uFF09. Collaborate, innovate, and make impacts.",
    contributeNow: "Contribute Now",
  },

  // Knowledge
  knowledge: {
    title: "Knowledge Bases",
    createTitle: "Create Knowledge Base",
    createDescription:
      "A knowledge base stores documents for retrieval-augmented generation.",
    name: "Name",
    namePlaceholder: "e.g. Product Documentation",
    description: "Description",
    descriptionPlaceholder: "Optional description",
    noKbs: "No knowledge bases yet",
    createFirst: "Create your first",
    created: "Knowledge base created",
    deleted: "Knowledge base deleted",
    deleteFailed: "Failed to delete knowledge base",
    deleteConfirm: "Delete this knowledge base and all its documents?",
    notFound: "Knowledge base not found",
    backToList: "Back to knowledge bases",
    documents: "Documents",
    searchPlaceholder: "Search knowledge base...",
    searching: "Searching...",
    searchButton: "Search",
    results: "results",
    result: "result",
    noResults: "No results found",
  },

  // Admin
  admin: {
    dashboard: "Dashboard",
    organizations: "Organizations",
    usage: "Usage",
    platformAdmin: "Platform Admin",
    backToWorkspace: "Back to Workspace",
    checkingAccess: "Checking access...",
    totalTokens: "Total Tokens",
    totalApiCalls: "Total API Calls",
    tokensToday: "Tokens Today",
    apiCallsToday: "API Calls Today",
    usageRecords: "Usage Records",
    inputTokens: "Input Tokens",
    outputTokens: "Output Tokens",
    tokenUsageByOrg: "Token Usage by Organization",
    tokenUsageByOrgSubtitle: "Top 10 organizations by token consumption",
    apiCallsByOrg: "API Calls by Organization",
    apiCallsByOrgSubtitle: "Total API call volume",
    noUsageData: "No usage data yet",
    detailedBreakdown: "Detailed Breakdown",
    usagePerOrg: "Usage per organization",
    organization: "Organization",
    apiCalls: "API Calls",
    manageOrgs: "Manage all organizations on the platform",
    allOrganizations: "All Organizations",
  },

  // Soul
  soul: {
    personality: "Personality",
    personalityDescription:
      "Define your AI assistant's personality, tone, and behavior style. This is injected into every conversation.",
    placeholder:
      "e.g. You are a friendly and concise assistant who speaks in a casual tone...",
    changesTakeEffect: "Changes take effect on the next conversation.",
  },

  // Toasts
  toasts: {
    created: "Created",
    deleted: "Deleted",
    saved: "Saved",
    failed: "Failed",
    toolInstalled: "Tool installed successfully",
    toolInstallFailed: "Failed to install tool",
    toolUninstalled: "Tool uninstalled",
    toolUninstallFailed: "Failed to uninstall tool",
    skillInstalled: "Skill installed successfully",
    skillInstallFailed: "Failed to install skill",
    skillUninstalled: "Skill uninstalled",
    uploadFailed: "Upload failed",
    copyFailed: "Failed to copy to clipboard",
    modelConfigSaved: "Model configuration saved",
  },

  // Settings
  settings: {
    title: "Settings",
    description: "Adjust how Allo looks and behaves for you.",
    sections: {
      appearance: "Appearance",
      memory: "Memory",
      tools: "Tools",
      skills: "Skills",
      notification: "Notification",
      about: "About",
    },
    memory: {
      title: "Memory",
      description:
        "Allo automatically learns from your conversations in the background. These memories help Allo understand you better and deliver a more personalized experience.",
      empty: "No memory data to display.",
      rawJson: "Raw JSON",
      markdown: {
        overview: "Overview",
        userContext: "User context",
        work: "Work",
        personal: "Personal",
        topOfMind: "Top of mind",
        historyBackground: "History",
        recentMonths: "Recent months",
        earlierContext: "Earlier context",
        longTermBackground: "Long-term background",
        updatedAt: "Updated at",
        facts: "Facts",
        empty: "(empty)",
        table: {
          category: "Category",
          confidence: "Confidence",
          confidenceLevel: {
            veryHigh: "Very high",
            high: "High",
            normal: "Normal",
            unknown: "Unknown",
          },
          content: "Content",
          source: "Source",
          createdAt: "CreatedAt",
          view: "View",
        },
      },
    },
    appearance: {
      themeTitle: "Theme",
      themeDescription:
        "Choose how the interface follows your device or stays fixed.",
      system: "System",
      light: "Light",
      dark: "Dark",
      systemDescription: "Match the operating system preference automatically.",
      lightDescription: "Bright palette with higher contrast for daytime.",
      darkDescription: "Dim palette that reduces glare for focus.",
      languageTitle: "Language",
      languageDescription: "Switch between languages.",
    },
    tools: {
      title: "Tools",
      description: "Manage the configuration and enabled status of MCP tools.",
    },
    skills: {
      title: "Agent Skills",
      description:
        "Manage the configuration and enabled status of the agent skills.",
      createSkill: "Create skill",
      emptyTitle: "No agent skill yet",
      emptyDescription:
        "Put your agent skill folders under the `/skills/custom` folder under the root folder of Allo.",
      emptyButton: "Create Your First Skill",
    },
    notification: {
      title: "Notification",
      description:
        "Allo only sends a completion notification when the window is not active. This is especially useful for long-running tasks so you can switch to other work and get notified when done.",
      requestPermission: "Request notification permission",
      deniedHint:
        "Notification permission was denied. You can enable it in your browser's site settings to receive completion alerts.",
      testButton: "Send test notification",
      testTitle: "Allo",
      testBody: "This is a test notification.",
      notSupported: "Your browser does not support notifications.",
      disableNotification: "Disable notification",
    },
    acknowledge: {
      emptyTitle: "Acknowledgements",
      emptyDescription: "Credits and acknowledgements will show here.",
    },
  },
};
