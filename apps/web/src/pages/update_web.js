import fs from 'fs';
const path = 'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/pages/DashboardPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const search = "type TrendPeriod = '90d' | '6m' | '1y' | 'max';";
const replacement = "type TrendPeriod = '90d' | '6m' | '1y' | '2y' | 'max';";

const optionsSearch = "const periodOptions: PeriodOption[] = [\n  { value: '90d', label: '90 dias', days: 90 },\n  { value: '6m', label: '6 meses', days: 180 },\n  { value: '1y', label: '1 ano', days: 365 },\n  { value: 'max', label: 'Período Máximo', days: 730 },\n];";

const optionsReplacement = "const periodOptions: PeriodOption[] = [\n  { value: '90d', label: '90 dias', days: 90 },\n  { value: '6m', label: '6 meses', days: 180 },\n  { value: '1y', label: '1 ano', days: 365 },\n  { value: '2y', label: '2 anos', days: 730 },\n  { value: 'max', label: 'Todo o Período', days: 900 },\n];";

content = content.replace(search, replacement);
// Try to be more flexible with newlines for the second replacement
content = content.replace(/const periodOptions: PeriodOption\[\] = \[\s+\{ value: '90d', label: '90 dias', days: 90 \},\s+\{ value: '6m', label: '6 meses', days: 180 \},\s+\{ value: '1y', label: '1 ano', days: 365 \},\s+\{ value: 'max', label: 'Período Máximo', days: 730 \},\s+\];/, optionsReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
