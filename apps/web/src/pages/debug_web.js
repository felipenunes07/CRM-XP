import fs from 'fs';
const content = fs.readFileSync('c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/pages/DashboardPage.tsx', 'utf8');
const lines = content.split('\n');
const targetLine = lines[47]; // line 48
console.log(JSON.stringify(targetLine));
for(let i=0; i<targetLine.length; i++) {
    console.log(targetLine.charCodeAt(i));
}
