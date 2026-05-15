import fs from 'fs';
const path = 'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/api/src/modules/crm/dashboardService.ts';
let content = fs.readFileSync(path, 'utf8');

const search = "async function getPortfolioTrend(days: number = DASHBOARD_TREND_WINDOW_DAYS) {";
const endSearch = "if ((result.rowCount ?? 0) < validatedDays) {";

const startIndex = content.indexOf(search);
const endIndex = content.indexOf(endSearch, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const newFunction = `async function getPortfolioTrend(days: number = DASHBOARD_TREND_WINDOW_DAYS) {
  // Validate days parameter
  const validatedDays = normalizeDashboardTrendDays(days);

  let result = await pool.query(
    \`
      SELECT
        day::text AS date,
        total_customers,
        active_count,
        attention_count,
        inactive_count,
        new_count,
        daily_items_sold
      FROM dashboard_daily_metrics
      WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1)
      ORDER BY day
    \`,
    [validatedDays],
  );\n\n  `;
    
    content = content.slice(0, startIndex) + newFunction + content.slice(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Success");
} else {
    console.log("Not found", startIndex, endIndex);
}
