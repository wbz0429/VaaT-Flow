import type { LucideIcon } from "lucide-react";

export interface Translations {
  // Locale meta
  locale: {
    localName: string;
  };

  // Common
  common: {
    home: string;
    settings: string;
    delete: string;
    rename: string;
    share: string;
    openInNewWindow: string;
    close: string;
    more: string;
    search: string;
    download: string;
    thinking: string;
    artifacts: string;
    public: string;
    custom: string;
    notAvailableInDemoMode: string;
    loading: string;
    version: string;
    lastUpdated: string;
    code: string;
    preview: string;
    cancel: string;
    save: string;
    install: string;
    create: string;
  };

  // Welcome
  welcome: {
    greeting: string;
    description: string;
    createYourOwnSkill: string;
    createYourOwnSkillDescription: string;
  };

  // Clipboard
  clipboard: {
    copyToClipboard: string;
    copiedToClipboard: string;
    failedToCopyToClipboard: string;
    linkCopied: string;
  };

  // Input Box
  inputBox: {
    placeholder: string;
    createSkillPrompt: string;
    addAttachments: string;
    mode: string;
    flashMode: string;
    flashModeDescription: string;
    reasoningMode: string;
    reasoningModeDescription: string;
    proMode: string;
    proModeDescription: string;
    ultraMode: string;
    ultraModeDescription: string;
    reasoningEffort: string;
    reasoningEffortMinimal: string;
    reasoningEffortMinimalDescription: string;
    reasoningEffortLow: string;
    reasoningEffortLowDescription: string;
    reasoningEffortMedium: string;
    reasoningEffortMediumDescription: string;
    reasoningEffortHigh: string;
    reasoningEffortHighDescription: string;
    searchModels: string;
    surpriseMe: string;
    surpriseMePrompt: string;
    followupLoading: string;
    followupConfirmTitle: string;
    followupConfirmDescription: string;
    followupConfirmAppend: string;
    followupConfirmReplace: string;
    suggestions: {
      suggestion: string;
      prompt: string;
      icon: LucideIcon;
    }[];
    suggestionsCreate: (
      | {
          suggestion: string;
          prompt: string;
          icon: LucideIcon;
        }
      | {
          type: "separator";
        }
    )[];
  };

  // Sidebar
  sidebar: {
    recentChats: string;
    newChat: string;
    chats: string;
    demoChats: string;
    agents: string;
  };

  // Agents
  agents: {
    title: string;
    description: string;
    newAgent: string;
    emptyTitle: string;
    emptyDescription: string;
    chat: string;
    delete: string;
    deleteConfirm: string;
    deleteSuccess: string;
    newChat: string;
    createPageTitle: string;
    createPageSubtitle: string;
    nameStepTitle: string;
    nameStepHint: string;
    nameStepPlaceholder: string;
    nameStepContinue: string;
    nameStepInvalidError: string;
    nameStepAlreadyExistsError: string;
    nameStepCheckError: string;
    nameStepBootstrapMessage: string;
    agentCreated: string;
    startChatting: string;
    backToGallery: string;
  };

  // Breadcrumb
  breadcrumb: {
    workspace: string;
    chats: string;
  };

  // Workspace
  workspace: {
    officialWebsite: string;
    settingsAndMore: string;
    contactUs: string;
    about: string;
  };

  // Conversation
  conversation: {
    noMessages: string;
    startConversation: string;
  };

  // Chats
  chats: {
    searchChats: string;
  };

  // Page titles (document title)
  pages: {
    appName: string;
    chats: string;
    newChat: string;
    untitled: string;
  };

  // Tool calls
  toolCalls: {
    moreSteps: (count: number) => string;
    lessSteps: string;
    executeCommand: string;
    presentFiles: string;
    needYourHelp: string;
    useTool: (toolName: string) => string;
    searchForRelatedInfo: string;
    searchForRelatedImages: string;
    searchFor: (query: string) => string;
    searchForRelatedImagesFor: (query: string) => string;
    searchOnWebFor: (query: string) => string;
    viewWebPage: string;
    listFolder: string;
    readFile: string;
    writeFile: string;
    clickToViewContent: string;
    writeTodos: string;
    skillInstallTooltip: string;
  };

  // Uploads
  uploads: {
    uploading: string;
    uploadingFiles: string;
  };

  // Subtasks
  subtasks: {
    subtask: string;
    executing: (count: number) => string;
    in_progress: string;
    completed: string;
    failed: string;
  };

  // Auth
  auth: {
    signIn: string;
    signInDescription: string;
    signingIn: string;
    signInFailed: string;
    unexpectedError: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    noAccount: string;
    register: string;
    createAccount: string;
    createAccountDescription: string;
    creatingAccount: string;
    name: string;
    namePlaceholder: string;
    alreadyHaveAccount: string;
    localDevAccount: string;
    localDevEmail: string;
    localDevPassword: string;
    fillLocalDev: string;
  };

  // Landing
  landing: {
    brandName: string;
    brandSubtitle: string;
    tagline: string;
    cta: string;
    withBrand: string;
    capabilities: string[];
    caseStudies: string;
    caseStudiesSubtitle: string;
    agentSkills: string;
    agentSkillsDescription: string;
    agentRuntime: string;
    agentRuntimeDescription: string;
    secureRuntime: string;
    aioSandbox: string;
    aioSandboxDescription: string;
    joinCommunity: string;
    communityDescription: string;
    contributeNow: string;
  };

  // Knowledge
  knowledge: {
    title: string;
    createTitle: string;
    createDescription: string;
    name: string;
    namePlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    noKbs: string;
    createFirst: string;
    created: string;
    deleted: string;
    deleteFailed: string;
    deleteConfirm: string;
    notFound: string;
    backToList: string;
    documents: string;
    searchPlaceholder: string;
    searching: string;
    searchButton: string;
    results: string;
    result: string;
    noResults: string;
    threadKb: string;
    threadKbDescription: string;
    boundKbs: string;
    availableKbs: string;
    bind: string;
    unbind: string;
    noAvailableKbs: string;
    noBoundKbs: string;
    bindSuccess: string;
    unbindSuccess: string;
    bindFailed: string;
    unbindFailed: string;
    mentionKb: string;
  };

  // Admin
  admin: {
    dashboard: string;
    organizations: string;
    usage: string;
    platformAdmin: string;
    backToWorkspace: string;
    checkingAccess: string;
    totalTokens: string;
    totalApiCalls: string;
    tokensToday: string;
    apiCallsToday: string;
    usageRecords: string;
    inputTokens: string;
    outputTokens: string;
    tokenUsageByOrg: string;
    tokenUsageByOrgSubtitle: string;
    apiCallsByOrg: string;
    apiCallsByOrgSubtitle: string;
    noUsageData: string;
    detailedBreakdown: string;
    usagePerOrg: string;
    organization: string;
    apiCalls: string;
    manageOrgs: string;
    allOrganizations: string;
  };

  // Soul
  soul: {
    personality: string;
    personalityDescription: string;
    placeholder: string;
    changesTakeEffect: string;
  };

  // Toasts
  toasts: {
    created: string;
    deleted: string;
    saved: string;
    failed: string;
    toolInstalled: string;
    toolInstallFailed: string;
    toolUninstalled: string;
    toolUninstallFailed: string;
    skillInstalled: string;
    skillInstallFailed: string;
    skillUninstalled: string;
    uploadFailed: string;
    copyFailed: string;
    modelConfigSaved: string;
  };

  // Settings
  settings: {
    title: string;
    description: string;
    sections: {
      appearance: string;
      memory: string;
      tools: string;
      skills: string;
      notification: string;
      about: string;
    };
    memory: {
      title: string;
      description: string;
      empty: string;
      rawJson: string;
      markdown: {
        overview: string;
        userContext: string;
        work: string;
        personal: string;
        topOfMind: string;
        historyBackground: string;
        recentMonths: string;
        earlierContext: string;
        longTermBackground: string;
        updatedAt: string;
        facts: string;
        empty: string;
        table: {
          category: string;
          confidence: string;
          confidenceLevel: {
            veryHigh: string;
            high: string;
            normal: string;
            unknown: string;
          };
          content: string;
          source: string;
          createdAt: string;
          view: string;
        };
      };
    };
    appearance: {
      themeTitle: string;
      themeDescription: string;
      system: string;
      light: string;
      dark: string;
      systemDescription: string;
      lightDescription: string;
      darkDescription: string;
      languageTitle: string;
      languageDescription: string;
    };
    tools: {
      title: string;
      description: string;
    };
    skills: {
      title: string;
      description: string;
      createSkill: string;
      emptyTitle: string;
      emptyDescription: string;
      emptyButton: string;
    };
    notification: {
      title: string;
      description: string;
      requestPermission: string;
      deniedHint: string;
      testButton: string;
      testTitle: string;
      testBody: string;
      notSupported: string;
      disableNotification: string;
    };
    acknowledge: {
      emptyTitle: string;
      emptyDescription: string;
    };
  };
}
