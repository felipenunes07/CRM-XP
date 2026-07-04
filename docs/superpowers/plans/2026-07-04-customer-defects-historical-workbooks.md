# Customer Defects Historical Workbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the customer return-rate snapshot to use the 2023-2024, 2025, and 2026 defect workbooks with layout-specific parsing and a return-rate numerator based only on negative defect movements.

**Architecture:** Keep one active consolidated snapshot, but discover multiple source workbooks from the current folder and `Antigos`. Parse each workbook through a layout-aware row adapter, aggregate negative `UND.` as returned pieces and positive `UND.` as replacement/exchange pieces, then cross the consolidated date range against CRM orders.

**Tech Stack:** Node.js, TypeScript, XLSX, Postgres migrations, Vitest, React.

---

### Task 1: Parser Coverage

**Files:**
- Modify: `apps/api/src/modules/crm/customerDefectService.test.ts`
- Modify: `apps/api/src/modules/crm/customerDefectService.ts`

- [x] Add failing tests for modern 2026 layout, 2025 layout where the SKU header is `DIF`, and 2023-2024 legacy layout without `OK`.
- [x] Verify the tests fail because positive `UND.` is currently counted as returned and legacy rows are not parsed.
- [x] Implement layout detection from array rows, not only header-name objects.
- [x] Verify parser tests pass.

### Task 2: Multi-Workbook Snapshot

**Files:**
- Modify: `apps/api/src/modules/crm/customerDefectService.ts`
- Modify: `apps/api/src/db/migrations.ts`
- Modify: `packages/shared/src/index.ts`

- [x] Add source-file metadata and `replacement_pieces` columns via append-only migration.
- [x] Discover workbooks matching `PLANILHA DEFEITOS` from the main folder and `Antigos`, both local and Dropbox.
- [x] Persist one consolidated snapshot with source-file metadata and per-customer replacement pieces.
- [x] Bump parser version to force refresh.

### Task 3: UI Clarity

**Files:**
- Modify: `apps/web/src/components/CustomerDefectsTable.tsx`
- Modify: `apps/web/src/pages/CustomersPage.tsx`

- [x] Show replacement pieces separately from returned pieces.
- [x] Show the snapshot as consolidated historical files instead of implying a single current file.
- [x] Keep the main rate sorted by returned pieces divided by purchased pieces.

### Task 4: Verification

**Files:**
- Test: `apps/api/src/modules/crm/customerDefectService.test.ts`
- Test: `apps/api/src/app.customerDefects.test.ts`
- Build: `apps/api`, `apps/web`

- [x] Run focused API tests.
- [x] Run API build.
- [x] Run Web build.
- [ ] Refresh/check production snapshot after database migration is applied.
