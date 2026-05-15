# Message Intelligence Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade message intelligence so common business messages stop becoming negative feedback and the page prioritizes useful operational decisions.

**Architecture:** Keep the existing events service and React page, but add a richer classifier result with reason, confidence, category, and action metadata. Use that metadata in metrics, list rows, and legacy reclassification.

**Tech Stack:** TypeScript, Vitest, Express service functions, React, TanStack Query, Recharts.

---

### Task 1: Backend Classification

**Files:**
- Test: `apps/api/src/modules/events/eventsClassification.test.ts`
- Modify: `apps/api/src/modules/events/eventsService.ts`
- Modify: `apps/api/src/db/migrations.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing classifier tests**

Cover screenshot examples:
`Frete pra 35630306` => `SALES_OPPORTUNITY`, not negative.
`chegou reposicao desses modelos iPhone` => `SALES_OPPORTUNITY`.
`Tem simm`, `A caixa vem 300`, `Consigo fazer por 42.00`, `Rs` => `NEUTRAL`.
`Valor por atacado` must not match casual token `ta`.
`O produto veio com problema e quero cancelar` => `COMPLAINT`.

- [ ] **Step 2: Verify red**

Run: `npm run test -w @olist-crm/api -- src/modules/events/eventsClassification.test.ts`
Expected: FAIL on current substring classifier.

- [ ] **Step 3: Implement classifier**

Add `classifyMessageContent(content, risk)` with normalized tokens, phrase matching, reason, confidence, category, and action flags. Keep `detectEventType` as a wrapper.

- [ ] **Step 4: Verify green**

Run the same API test command.
Expected: PASS.

### Task 2: Event Creation And Metrics

**Files:**
- Modify: `apps/api/src/modules/events/eventsService.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Store classification metadata**

Add `classificationReason`, `classificationConfidence`, `classificationCategory`, `actionRequired`, `evidence`, and `originalEventType` to event metadata.

- [ ] **Step 2: Skip noise only**

Skip `GREETING` and `NEUTRAL`; keep actionable `QUESTION` and `SALES_OPPORTUNITY`.

- [ ] **Step 3: Add metrics**

Add `actionRequiredEvents`, `informationalEvents`, `filteredNoiseCount`, and `questionCount`.

- [ ] **Step 4: Verify**

Run API tests.

### Task 3: Legacy Reclassification Script

**Files:**
- Create: `apps/api/src/scripts/reclassifyMessageEvents.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Implement script**

Scan recent unresolved events, classify content again, update type/label/severity/metadata, and resolve legacy noise with a clear note.

- [ ] **Step 2: Add npm script**

Add `events:reclassify` to `apps/api/package.json`.

- [ ] **Step 3: Verify dry run**

Run: `npm run events:reclassify -w @olist-crm/api -- --dry-run --limit=20`
Expected: exits cleanly and prints summary.

### Task 4: Frontend Intelligence Page

**Files:**
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/components/events/EventsSummaryPanel.tsx`
- Modify: `apps/web/src/components/events/EventsListView.tsx`
- Modify: `apps/web/src/components/events/EventsFilters.tsx`
- Modify: `apps/web/src/components/events/SentimentTrendChart.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace generic summary**

Show action-required count, critical alerts, unanswered opportunities, actionable questions, filtered noise, and sentiment.

- [ ] **Step 2: Add row intelligence**

Show category, reason, confidence, severity, and informational vs pending status.

- [ ] **Step 3: Add useful filters**

Include actionable defaults and type options for opportunities/questions.

- [ ] **Step 4: Verify build**

Run: `npm run build -w @olist-crm/web`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run full focused tests**

Run: `npm run test -w @olist-crm/api -- src/modules/events/eventsClassification.test.ts`

- [ ] **Step 2: Run builds**

Run: `npm run build -w @olist-crm/shared`
Run: `npm run build -w @olist-crm/api`
Run: `npm run build -w @olist-crm/web`

- [ ] **Step 3: Review diff**

Run: `git diff --stat` and `git diff --check`.
