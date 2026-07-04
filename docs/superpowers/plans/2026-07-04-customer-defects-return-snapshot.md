# Customer Defects Return Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the daily Defeitos & Retorno snapshot and expose it as a Clientes subtab.

**Architecture:** Add a focused API service for defect workbook parsing, snapshot persistence, and customer return metrics. Reuse the existing customer credit snapshot conventions: active snapshot table, manual refresh route, worker refresh, shared response types, React Query frontend tab.

**Tech Stack:** TypeScript, Express, PostgreSQL, XLSX, Vitest, React, TanStack Query.

---

## File Structure

- Create `apps/api/src/modules/crm/customerDefectService.ts`: workbook discovery, parser, aggregation, snapshot persistence, overview response.
- Create `apps/api/src/app.customerDefects.test.ts`: route tests for overview and refresh.
- Create `apps/api/src/modules/crm/customerDefectService.test.ts`: parser and ranking tests.
- Create `apps/web/src/components/CustomerDefectsTable.tsx`: defects ranking table.
- Modify `apps/api/src/app.ts`: expose `/api/customer-defects/overview` and `/api/customer-defects/refresh`.
- Modify `apps/api/src/db/migrations.ts`: create snapshot metadata and rows tables.
- Modify `apps/api/src/lib/env.ts`: add workbook path, prefix, worker enabled flag, and daily hour.
- Modify `apps/api/src/worker.ts`: schedule daily defect snapshot refresh.
- Modify `packages/shared/src/index.ts`: add response and row types.
- Modify `apps/web/src/lib/api.ts`: add client calls.
- Modify `apps/web/src/pages/customersPage.helpers.ts`: add `defectsReturn` view state and filters.
- Modify `apps/web/src/pages/CustomersPage.tsx`: add the new tab, KPIs, refresh action, filters, and table.
- Modify `apps/web/src/styles.css`: small table and KPI styles following existing Clientes patterns.

## Task 1: Service Parser And Ranking

**Files:**
- Create: `apps/api/src/modules/crm/customerDefectService.ts`
- Test: `apps/api/src/modules/crm/customerDefectService.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create tests that generate a temporary workbook with a `DEFEITOS` sheet and assert:

```ts
expect(parsed.period).toEqual({ startDate: "2025-11-10", endDate: "2026-07-04" });
expect(parsed.rowsByCode.get("CL542")?.returnedPieces).toBe(3);
expect(parsed.rowsByCode.get("CL542")?.returnedAmount).toBe(153);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -w @olist-crm/api -- src/modules/crm/customerDefectService.test.ts`

Expected: fail because the service file does not exist.

- [ ] **Step 3: Implement parser and aggregation**

Implement `parseCustomerDefectWorkbook(filePath, sourcePath, candidate)` using `XLSX.readFile`, `sheet_to_json`, and `safeNumber`. Normalize customer codes to uppercase, use `Math.abs(UND.)`, `Math.abs(Total)`, and ignore rows without `CL`, valid date, valid status, or non-zero pieces.

- [ ] **Step 4: Add ranking test**

Assert `sortCustomerDefectRows` orders by highest `returnRate`, then returned pieces, then revenue.

- [ ] **Step 5: Run focused service test and verify GREEN**

Run: `npm run test -w @olist-crm/api -- src/modules/crm/customerDefectService.test.ts`

Expected: all tests in that file pass.

## Task 2: Database Snapshot And API

**Files:**
- Modify: `apps/api/src/db/migrations.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/app.customerDefects.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing API route tests**

Mock `getCustomerDefectOverview` and `refreshCustomerDefectOverview`, then assert:

```ts
const response = await request(createApp()).get("/api/customer-defects/overview");
expect(response.status).toBe(200);
expect(response.body.summary.totalReturnedPieces).toBe(12);
```

Also assert POST `/api/customer-defects/refresh` calls refresh service.

- [ ] **Step 2: Run route test and verify RED**

Run: `npm run test -w @olist-crm/api -- src/app.customerDefects.test.ts`

Expected: fail with missing route/service.

- [ ] **Step 3: Add shared types**

Add `CustomerDefectSnapshotMeta`, `CustomerDefectRow`, `CustomerDefectOverviewSummary`, and `CustomerDefectOverviewResponse`.

- [ ] **Step 4: Add migrations**

Create `customer_defect_snapshots` and `customer_defect_snapshot_rows`, with indexes for active snapshot, customer id/code, return rate, and returned pieces.

- [ ] **Step 5: Implement API persistence and route**

Add active snapshot lookup, source file registration, match resolution, purchase aggregation query, row persistence, overview loading, manual refresh, and route handlers.

- [ ] **Step 6: Run focused route tests and service tests**

Run: `npm run test -w @olist-crm/api -- src/app.customerDefects.test.ts src/modules/crm/customerDefectService.test.ts`

Expected: both test files pass.

## Task 3: Worker Daily Refresh

**Files:**
- Modify: `apps/api/src/lib/env.ts`
- Modify: `apps/api/src/worker.ts`

- [ ] **Step 1: Add env defaults**

Add `WORKER_DEFECT_SYNC_ENABLED`, `WORKER_DEFECT_SYNC_HOUR`, `DROPBOX_CUSTOMER_DEFECT_PATH`, `CUSTOMER_DEFECT_WORKBOOK_DIR`, and `CUSTOMER_DEFECT_WORKBOOK_PREFIX`.

- [ ] **Step 2: Wire worker**

Use `setInterval` with a daily interval and an hourly guard so the refresh runs once per local day after the configured hour. Call `refreshCustomerDefectOverview()`.

- [ ] **Step 3: Run API build**

Run: `npm run build -w @olist-crm/api`

Expected: TypeScript build passes.

## Task 4: Frontend Tab

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/pages/customersPage.helpers.ts`
- Modify: `apps/web/src/pages/CustomersPage.tsx`
- Create: `apps/web/src/components/CustomerDefectsTable.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing helper/component test if existing harness supports it**

Add a small test around filtering/sorting helpers if extracted. If component testing is not already practical for this page, rely on TypeScript build and API tests.

- [ ] **Step 2: Add API client call**

Add `customerDefectOverview(token)` and `refreshCustomerDefectOverview(token)`.

- [ ] **Step 3: Add view state**

Add `defectsReturn` to `CustomersPageView`, filters for search/min purchased pieces, and reducer actions.

- [ ] **Step 4: Build the subtab UI**

Add the tab label `Defeitos & Retorno`, KPI strip, snapshot bar, low-volume filter, search, refresh button for admin/manager, and table.

- [ ] **Step 5: Run web build**

Run: `npm run build -w @olist-crm/web`

Expected: TypeScript and Vite build pass.

## Task 5: Full Verification

**Files:**
- All touched files

- [ ] **Step 1: Run targeted API tests**

Run: `npm run test -w @olist-crm/api -- src/app.customerDefects.test.ts src/modules/crm/customerDefectService.test.ts`

Expected: tests pass.

- [ ] **Step 2: Run web build**

Run: `npm run build -w @olist-crm/web`

Expected: build passes.

- [ ] **Step 3: Review diff**

Run: `git -C "C:\Users\Felipe\Desktop\CRM XP\CRM-XP" diff --stat`

Expected: only planned feature files plus docs are changed, aside from pre-existing unrelated local files.
