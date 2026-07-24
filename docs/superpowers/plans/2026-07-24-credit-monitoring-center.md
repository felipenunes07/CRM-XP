# Centro de Monitoramento de Crédito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the customer credit & finance overview into a high-end, responsive "Centro de Monitoramento de Crédito dos Clientes", visually modeled after the WhatsApp Intelligence screen (`/eventos`) with radar feed tabs, glowing risk KPIs, and 1-click WhatsApp collection actions on cards.

**Architecture:** Redesign `CustomerCreditExecutiveSummary.tsx`, `customerCreditExecutive.css`, and `CustomerCreditCardList.tsx`. Enhance credit state filters with radar categories (Alertas Críticos, Cobrar Hoje, Vencidos, Vencendo em 7d, Crédito Livre). Add 1-click WhatsApp collection drawer trigger and financial extract trigger to each client card.

**Tech Stack:** React 18, TypeScript, Lucide React icons, Tailwind/CSS modules system, TanStack Query.

## Global Constraints
- Preserve existing data contracts from `@olist-crm/shared` (`CustomerCreditRow`, `CustomerCreditOverviewResponse`).
- Use Brazilian Real (`formatCurrency`) and Portuguese labels throughout.
- Match `/eventos` aesthetics: glowing tone borders, dark/light contrast cards, pulse badges, animated spinners, clear risk typography.

---

### Task 1: Redesign `customerCreditExecutive.css` for WhatsApp-Intelligence-Style Aesthetics

**Files:**
- Modify: `apps/web/src/components/customerCreditExecutive.css`

**Interfaces:**
- Produces CSS classes: `.credit-command-center-header`, `.credit-status-pulse`, `.credit-radar-tabs`, `.credit-kpi-card-glow`, `.customer-credit-monitoring-card`, `.credit-usage-progress-bar`.

- [ ] **Step 1: Inspect and write CSS rules for Command Header and KPI Glowing Cards**

Add CSS classes for command center header, live status pulses, radar feed tabs, and glowing tone indicators:

```css
.credit-command-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
  margin-bottom: 1.25rem;
}

.credit-status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
```

- [ ] **Step 2: Add CSS rules for Radar Feed Segment Tabs and Monitoring Cards**

Include styles for radar tabs with counters and credit cards with limit usage bars.

- [ ] **Step 3: Commit CSS changes**

```bash
git add apps/web/src/components/customerCreditExecutive.css
git commit -m "style(credit): add command center and radar feed styles"
```

---

### Task 2: Redesign `CustomerCreditExecutiveSummary.tsx` into Command Center Header & Radar Feed Tabs

**Files:**
- Modify: `apps/web/src/components/CustomerCreditExecutiveSummary.tsx`
- Test: `apps/web/src/pages/CustomerFinancialPage.test.tsx`

**Interfaces:**
- Consumes: `CustomerCreditRow`, `CustomerCreditSnapshotMeta`, `quickFilter`, `quickCounts`.
- Produces: Enhanced `CustomerCreditExecutiveSummary` with Radar Tabs and Command Header.

- [ ] **Step 1: Update component to render Command Header with live badges and Radar Tabs**

Implement the Command Header with live status, dynamic risk indicator, 4 glowing KPI cards, 3 automatic insight pills, and Radar tabs (`🚨 Alertas Críticos`, `⚡ Cobrar Hoje`, `⚠️ Vencidos`, `⏳ Vencendo em 7d`, `✅ Crédito Livre`, `🌐 Todos`).

- [ ] **Step 2: Run tests to verify `CustomerFinancialPage.test.tsx`**

Run: `npm run test -w @olist-crm/web -- CustomerFinancialPage.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add apps/web/src/components/CustomerCreditExecutiveSummary.tsx
git commit -m "feat(credit): transform executive summary into credit command center with radar tabs"
```

---

### Task 3: Redesign Customer Credit Cards (`CustomerCreditCardList.tsx`) & Add Quick Actions

**Files:**
- Modify: `apps/web/src/components/CustomerCreditCardList.tsx`
- Test: `apps/web/src/pages/CustomerFinancialPage.test.tsx`

**Interfaces:**
- Consumes: `CustomerCreditRow[]`, `onSelectCustomer`, `onCobrarWhatsapp`.
- Produces: Interactive Monitoring Cards with risk badges, credit usage bar, and 1-click WhatsApp collection & detail triggers.

- [ ] **Step 1: Update `CustomerCreditCardList.tsx` to render Monitoring Cards**

Add risk badges (`CRÍTICO`, `ALTO`, `MÉDIO`, `CONTROLADO`), credit limit progress bar with overflow indicator, smart risk pills, and action buttons (`Cobrar via WhatsApp`, `Ver Extrato`, `Ficha do Cliente`).

- [ ] **Step 2: Run web unit tests**

Run: `npm run test -w @olist-crm/web`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add apps/web/src/components/CustomerCreditCardList.tsx
git commit -m "feat(credit): redesign credit cards into monitoring cards with quick actions"
```

---

### Task 4: Visual Verification & Final Pass

**Files:**
- Check: `apps/web/src/pages/CustomerFinancialPage.tsx`
- Check: `apps/web/src/pages/CustomersPage.tsx`

- [ ] **Step 1: Execute all tests to verify clean build**

Run: `npm run test -w @olist-crm/web`
Expected: All tests passing.

- [ ] **Step 2: Commit final improvements**

```bash
git commit -am "feat(credit): finalize client credit monitoring center redesign"
```
