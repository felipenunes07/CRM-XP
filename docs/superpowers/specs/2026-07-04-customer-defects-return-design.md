# Customer Defects Return Snapshot Design

## Goal

Add a new Clientes subtab named "Defeitos & Retorno" that shows, per customer, how much they bought and how much returned as defects in the same period. The main ranking sorts by return rate so operators can find customers returning too many pieces relative to purchase volume.

## Source

The defect source is the daily workbook `坏品表 PLANILHA DEFEITOS 2026.xlsx` in `C:\Users\Felipe\Dropbox\DEFEITOS - XP` locally, or the equivalent Dropbox folder in production. The parser reads the `DEFEITOS` sheet only.

Rows count as defect returns when:

- `CL` is present.
- `OK` or `STAUS` is `OK`.
- `DATA` is a valid date.
- `UND.` is non-zero.

The current workbook has blank rows outside the valid customer region. Those rows are ignored.

## Period

The snapshot period is the real min/max date in the valid `DEFEITOS` rows. In the inspected file this is `2025-11-10` through `2026-07-04`. CRM purchases are calculated over exactly the same date range.

## Metrics

For each customer code:

- `purchasedPieces`: sum of `order_items.quantity` for orders in the snapshot period.
- `revenue`: sum of `orders.total_amount` for orders in the snapshot period.
- `orderCount`: distinct orders in the snapshot period.
- `returnedPieces`: absolute sum of `DEFEITOS.UND.`.
- `returnedAmount`: absolute sum of `DEFEITOS.Total`.
- `returnRate`: `returnedPieces / purchasedPieces`; `null` when purchased pieces are zero.
- `defectSkuCount`: distinct SKUs returned.
- `firstDefectDate` and `lastDefectDate`.
- `matched`: whether `CL` matches a CRM customer.

The main UI sorts by highest `returnRate`, then `returnedPieces`, then `revenue`. A low-volume filter hides customers below a minimum purchased-piece threshold so one-off customers do not dominate the ranking.

## Architecture

Follow the existing customer credit snapshot pattern:

- API service imports the workbook, aggregates defect rows, resolves CRM customer matches, computes sales metrics for the same period, and persists one active snapshot.
- Database tables store snapshot metadata and per-customer rows.
- API exposes overview and refresh endpoints.
- Worker refreshes once per day, with env-controlled hour and interval fallback.
- Frontend adds a Clientes subtab with KPIs, snapshot freshness, filters, and the ranking table.

## Error Handling

If Dropbox/local workbook lookup fails and an active snapshot exists, the API serves the active snapshot. If no snapshot exists, it returns an actionable API error naming the expected workbook/folder. Parsing errors include available sheet names when `DEFEITOS` is missing.

## Testing

Unit tests cover workbook parsing and rate calculation. API route tests cover overview and manual refresh. Frontend helper/component tests cover sorting, low-volume filtering, and formatting of `null` return rates.

## Approval

Approved direction from the user:

- Use the real defect sheet period, not only calendar 2026.
- Use snapshot storage, refreshed daily.
- Rank by return rate while showing revenue, purchased pieces, returned pieces, and returned value.
