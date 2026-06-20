# Message Intelligence Batch AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/eventos` useful for managers with rule-first message intelligence, optional low-cost Gemini batch summaries, commercial-hours scheduling, and database retention controls for VPS storage.

**Architecture:** Keep real-time classification local and deterministic so every message can be processed without API cost. Add a separate hourly batch summarizer that only runs during configured business hours, anonymizes content, enforces daily request/token caps, and gracefully falls back to rule-based insights when no API key or budget is available.

**Tech Stack:** TypeScript, Vitest, Express service modules, PostgreSQL, React, TanStack Query, Recharts.

---

### Task 1: Fix Rule Classifier

**Files:**
- Test: `apps/api/src/modules/events/eventsClassification.test.ts`
- Modify: `apps/api/src/modules/events/eventsService.ts`

- [ ] Add tests proving commercial intent returns `SALES_OPPORTUNITY`, stock complaints map to operational themes, and praise remains informational.
- [ ] Run the focused classification test and confirm it fails for the current commercial-intent bug.
- [ ] Change `classifyMessageContent` so commercial intent creates actionable `SALES_OPPORTUNITY` events.
- [ ] Run the focused classification test and confirm it passes.

### Task 2: Batch AI Policy

**Files:**
- Test: `apps/api/src/modules/events/eventsBatchAi.test.ts`
- Create: `apps/api/src/modules/events/eventsBatchAi.ts`
- Modify: `apps/api/src/lib/env.ts`

- [ ] Add tests for business-hours gating, disabled-no-key behavior, daily request caps, token caps, and PII anonymization.
- [ ] Implement policy helpers without making network calls in tests.
- [ ] Add environment variables for provider, model, timezone, business hours, cadence, token cap, request cap, and enable flag.
- [ ] Verify tests pass.

### Task 3: Insight Aggregation

**Files:**
- Test: `apps/api/src/modules/events/eventsInsights.test.ts`
- Create: `apps/api/src/modules/events/eventsInsights.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/events/eventsService.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] Add tests for rule-based topic aggregation: stock shortage, screen/display defects, delivery delay, price objection, praise, and unresolved critical alerts.
- [ ] Implement aggregation from message events with examples, counts, severity, sentiment, source split, and manager-ready summary text.
- [ ] Add `GET /api/events/intelligence` endpoint with date range and group filters.
- [ ] Verify API type compatibility.

### Task 4: Frontend Command Center

**Files:**
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/components/events/EventsSummaryPanel.tsx`
- Modify: `apps/web/src/components/events/EventsListView.tsx`
- Modify: `apps/web/src/components/events/EventsFilters.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Default to all origins instead of private-only.
- [ ] Show executive overview, critical alerts, themes in alta, positive/negative signals, source split, and AI batch status.
- [ ] Keep event list actionable with reason/confidence and direct conversation access.
- [ ] Verify responsive layout.

### Task 5: VPS Retention

**Files:**
- Modify: `apps/api/src/lib/env.ts`
- Modify: `apps/api/src/modules/events/eventsService.ts`
- Modify: `apps/api/src/modules/platform/scheduledJobs.ts`

- [ ] Add retention settings for raw monitor messages and AI summaries.
- [ ] Ensure cleanup deletes old raw messages in batches and keeps durable insights/events longer.
- [ ] Verify cleanup helper compiles and remains bounded.

### Task 6: Verification

**Files:**
- All changed files.

- [ ] Run `npm run test -w @olist-crm/api -- src/modules/events/eventsClassification.test.ts src/modules/events/eventsBatchAi.test.ts src/modules/events/eventsInsights.test.ts`.
- [ ] Run `npm run build -w @olist-crm/shared`.
- [ ] Run `npm run build -w @olist-crm/api`.
- [ ] Run `npm run build -w @olist-crm/web`.
- [ ] Run `git diff --check`.
