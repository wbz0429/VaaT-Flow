# Issue 3: i18n Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all UI text goes through the i18n system so the app displays consistently in the user's chosen language (en-US or zh-CN).

**Architecture:** Add new key groups to the `Translations` interface, add translations to both locale files, then sweep each page to replace hardcoded strings with `t.*` calls via the existing `useI18n()` hook.

**Tech Stack:** TypeScript, React, Next.js i18n system (`frontend/src/core/i18n/`)

**Testing SOP:** Local test (switch locale, verify all text) → pass → deploy to production → test again

---

### Task 1: Add Translation Keys to Types and Locale Files

**Files:**
- Modify: `frontend/src/core/i18n/locales/types.ts`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`

- [ ] **Step 1: Add `auth` key group to types.ts**

In `frontend/src/core/i18n/locales/types.ts`, add inside the `Translations` interface:

```typescript
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
```

- [ ] **Step 2: Add `landing` key group to types.ts**

```typescript
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
    sandboxFeatures: {
      isolated: string;
      safe: string;
      persistent: string;
      mountableFs: string;
      longRunning: string;
    };
    joinCommunity: string;
    communityDescription: string;
    contributeNow: string;
  };
```

- [ ] **Step 3: Add `knowledge` key group to types.ts**

```typescript
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
    doc: string;
    docs: string;
    searchPlaceholder: string;
    searching: string;
    searchButton: string;
    results: string;
    result: string;
    chunkNumber: string;
    relevance: string;
    noResults: string;
  };
```

- [ ] **Step 4: Add `admin` key group to types.ts**

```typescript
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
```

- [ ] **Step 5: Add `soul` key group to types.ts**

```typescript
  soul: {
    personality: string;
    personalityDescription: string;
    placeholder: string;
    changesTakeEffect: string;
  };
```

- [ ] **Step 6: Add `toasts` key group to types.ts**

```typescript
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
    sessionVerifyFailed: string;
  };
```

- [ ] **Step 7: Add English translations to en-US.ts**

In `frontend/src/core/i18n/locales/en-US.ts`, add the corresponding English values for all keys above. Example for `auth`:

```typescript
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
    localDevEmail: "Email: dev@allo.local",
    localDevPassword: "Password: Password123!",
    fillLocalDev: "Fill local dev account",
  },
```

Add all other groups (`landing`, `knowledge`, `admin`, `soul`, `toasts`) with appropriate English text matching the current hardcoded strings.

- [ ] **Step 8: Add Chinese translations to zh-CN.ts**

In `frontend/src/core/i18n/locales/zh-CN.ts`, add Chinese translations for all keys. Example for `auth`:

```typescript
  auth: {
    signIn: "\u767b\u5f55",
    signInDescription: "\u8f93\u5165\u90ae\u7bb1\u548c\u5bc6\u7801\u7ee7\u7eed",
    signingIn: "\u767b\u5f55\u4e2d\u2026",
    signInFailed: "\u767b\u5f55\u5931\u8d25",
    unexpectedError: "\u53d1\u751f\u610f\u5916\u9519\u8bef",
    email: "\u90ae\u7bb1",
    emailPlaceholder: "you@example.com",
    password: "\u5bc6\u7801",
    passwordPlaceholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    noAccount: "\u8fd8\u6ca1\u6709\u8d26\u53f7\uff1f",
    register: "\u6ce8\u518c",
    createAccount: "\u521b\u5efa\u8d26\u53f7",
    createAccountDescription: "\u8f93\u5165\u4fe1\u606f\u5f00\u59cb\u4f7f\u7528",
    creatingAccount: "\u521b\u5efa\u4e2d\u2026",
    name: "\u59d3\u540d",
    namePlaceholder: "\u4f60\u7684\u540d\u5b57",
    alreadyHaveAccount: "\u5df2\u6709\u8d26\u53f7\uff1f",
    localDevAccount: "\u672c\u5730\u5f00\u53d1\u8d26\u53f7",
    localDevEmail: "\u90ae\u7bb1: dev@allo.local",
    localDevPassword: "\u5bc6\u7801: Password123!",
    fillLocalDev: "\u586b\u5145\u672c\u5730\u5f00\u53d1\u8d26\u53f7",
  },
```

Add all other groups with Chinese translations.

- [ ] **Step 9: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors (both locale files must satisfy the Translations interface)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/core/i18n/locales/types.ts \
       frontend/src/core/i18n/locales/en-US.ts \
       frontend/src/core/i18n/locales/zh-CN.ts
git commit -m "feat: add i18n keys for auth, landing, knowledge, admin, soul, toasts"
```

---

### Task 2: Update Auth Pages (Login + Register)

**Files:**
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Modify: `frontend/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Update login page**

In `frontend/src/app/(auth)/login/page.tsx`:

1. Add `"use client"` if not present (needed for `useI18n` hook)
2. Import and use the hook:
   ```typescript
   import { useI18n } from "@/core/i18n";
   // Inside component:
   const { t } = useI18n();
   ```
3. Replace all hardcoded strings:
   - Line 51: `"Sign in"` → `{t.auth.signIn}`
   - Line 53: `"Enter your email..."` → `{t.auth.signInDescription}`
   - Line 63: `"Local dev account"` → `{t.auth.localDevAccount}`
   - Line 64: `"Email: ..."` → `{t.auth.localDevEmail}`
   - Line 65: `"Password: ..."` → `{t.auth.localDevPassword}`
   - Line 76: `"Fill local dev account"` → `{t.auth.fillLocalDev}`
   - Line 82: `"Email"` → `{t.auth.email}`
   - Line 87: `"you@example.com"` → `{t.auth.emailPlaceholder}`
   - Line 96: `"Password"` → `{t.auth.password}`
   - Line 111: `"Signing in…"` / `"Sign in"` → `{isLoading ? t.auth.signingIn : t.auth.signIn}`
   - Line 114: `"Don't have an account?"` → `{t.auth.noAccount}`
   - Line 116: `"Register"` → `{t.auth.register}`

- [ ] **Step 2: Update register page**

In `frontend/src/app/(auth)/register/page.tsx`, same pattern:
   - Line 51: → `{t.auth.createAccount}`
   - Line 53: → `{t.auth.createAccountDescription}`
   - Line 63: → `{t.auth.name}`
   - Line 68: → `{t.auth.namePlaceholder}`
   - Line 77: → `{t.auth.email}`
   - Line 82: → `{t.auth.emailPlaceholder}`
   - Line 91: → `{t.auth.password}`
   - Line 107: → `{isLoading ? t.auth.creatingAccount : t.auth.createAccount}`
   - Line 110: → `{t.auth.alreadyHaveAccount}`
   - Line 112: → `{t.auth.signIn}`

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(auth\)/login/page.tsx frontend/src/app/\(auth\)/register/page.tsx
git commit -m "feat: i18n auth pages (login + register)"
```

---

### Task 3: Update Landing Page

**Files:**
- Modify: `frontend/src/components/landing/hero.tsx`
- Modify: `frontend/src/components/landing/sections/case-study-section.tsx`
- Modify: `frontend/src/components/landing/sections/skills-section.tsx`
- Modify: `frontend/src/components/landing/sections/sandbox-section.tsx`
- Modify: `frontend/src/components/landing/sections/community-section.tsx`

- [ ] **Step 1: Update hero.tsx**

In `frontend/src/components/landing/hero.tsx`:
1. Import `useI18n`
2. Replace:
   - Line 47 `"Allo"` → keep as-is (brand name)
   - Line 51 `"元枢"` → `{t.landing.brandSubtitle}`
   - Lines 63-76 WordRotate array → `{t.landing.capabilities}`
   - Line 78 `"with Allo"` → `{t.landing.withBrand}`
   - Lines 89-91 Chinese tagline → `{t.landing.tagline}`
   - Line 106 `"开始使用"` → `{t.landing.cta}`

- [ ] **Step 2: Update case-study-section.tsx**

Replace:
   - Line 51 `"Case Studies"` → `{t.landing.caseStudies}`
   - Line 52 subtitle → `{t.landing.caseStudiesSubtitle}`
   - Case study titles/descriptions: keep as-is (content, not UI chrome) OR add to translations if they should be localized

- [ ] **Step 3: Update skills-section.tsx**

Replace:
   - Line 12 `"Agent Skills"` → `{t.landing.agentSkills}`
   - Lines 15-19 description → `{t.landing.agentSkillsDescription}`

- [ ] **Step 4: Update sandbox-section.tsx**

Replace:
   - Line 15 `"Agent Runtime Environment"` → `{t.landing.agentRuntime}`
   - Lines 18-20 description → `{t.landing.agentRuntimeDescription}`
   - Line 75 `"Secure Runtime"` → `{t.landing.secureRuntime}`
   - Line 83 `"AIO Sandbox"` → `{t.landing.aioSandbox}`
   - Lines 90-100 description → `{t.landing.aioSandboxDescription}`
   - Feature tags → `{t.landing.sandboxFeatures.*}`

- [ ] **Step 5: Update community-section.tsx**

Replace:
   - Lines 15-17 `"Join the Community"` → `{t.landing.joinCommunity}`
   - Line 19 description → `{t.landing.communityDescription}`
   - Line 25 `"Contribute Now"` → `{t.landing.contributeNow}`

- [ ] **Step 6: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/landing/
git commit -m "feat: i18n landing page (hero, case studies, skills, sandbox, community)"
```

---

### Task 4: Update Knowledge Base Pages

**Files:**
- Modify: `frontend/src/app/workspace/knowledge/page.tsx`
- Modify: `frontend/src/app/workspace/knowledge/[id]/page.tsx`
- Modify: `frontend/src/components/workspace/knowledge/search-panel.tsx`

- [ ] **Step 1: Update knowledge base list page**

In `frontend/src/app/workspace/knowledge/page.tsx`, import `useI18n` and replace all hardcoded strings with `t.knowledge.*` keys.

- [ ] **Step 2: Update knowledge base detail page**

In `frontend/src/app/workspace/knowledge/[id]/page.tsx`, same treatment.

- [ ] **Step 3: Update search panel**

In `frontend/src/components/workspace/knowledge/search-panel.tsx`, replace search-related strings.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/workspace/knowledge/ frontend/src/components/workspace/knowledge/
git commit -m "feat: i18n knowledge base pages"
```

---

### Task 5: Update Admin Pages

**Files:**
- Modify: `frontend/src/app/admin/layout.tsx`
- Modify: `frontend/src/app/admin/page.tsx`
- Modify: `frontend/src/app/admin/organizations/page.tsx`
- Modify: `frontend/src/app/admin/usage/page.tsx`

- [ ] **Step 1: Update admin layout**

Replace nav labels and status text with `t.admin.*` keys.

- [ ] **Step 2: Update admin dashboard page**

Replace all stat labels, chart titles, descriptions.

- [ ] **Step 3: Update organizations page**

Replace headings, descriptions, table headers.

- [ ] **Step 4: Update usage page**

Replace all chart titles, labels, table headers, empty states.

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/
git commit -m "feat: i18n admin pages (dashboard, organizations, usage)"
```

---

### Task 6: Update Settings and Toast Messages

**Files:**
- Modify: `frontend/src/components/workspace/settings/soul-settings-page.tsx`
- Modify: Various files with toast messages

- [ ] **Step 1: Update soul settings page**

Replace personality label, description, placeholder, save button text with `t.soul.*` keys.

- [ ] **Step 2: Audit and update toast messages**

Search for `toast.success`, `toast.error`, `toast(` across the frontend and replace hardcoded strings with `t.toasts.*` keys. Key files:
- `frontend/src/app/workspace/knowledge/page.tsx` — "Knowledge base created"
- `frontend/src/app/workspace/knowledge/[id]/page.tsx` — "Knowledge base deleted"
- Marketplace page — "Tool installed successfully", "Tool uninstalled", etc.
- Skills settings — "Skill installed successfully", etc.

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workspace/settings/ frontend/src/app/workspace/
git commit -m "feat: i18n settings page and toast messages"
```

---

### Task 7: Local Verification & Deploy

- [ ] **Step 1: Run full frontend checks**

```bash
cd frontend && pnpm lint && pnpm typecheck
```
Expected: No errors

- [ ] **Step 2: Manual test — English locale**

1. Set browser language to English
2. Visit every page: landing, login, register, workspace, knowledge, admin, settings
3. Verify NO Chinese text appears (except brand name "元枢" if locale-specific)
4. Verify all buttons, labels, headings, toasts are in English

- [ ] **Step 3: Manual test — Chinese locale**

1. Set browser language to Chinese
2. Visit every page
3. Verify NO English text appears (except brand name "Allo")
4. Verify all buttons, labels, headings, toasts are in Chinese

- [ ] **Step 4: Push and deploy**

```bash
git push origin feature/dev_0404
```

- [ ] **Step 5: Production test**

Repeat Steps 2-3 on production, testing both locales.
