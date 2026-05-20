import fs from 'fs';
const content = fs.readFileSync('c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/api/src/modules/crm/dashboardService.ts', 'utf8');
const lines = content.split('\n');
const targetLine = lines[647]; // line 648
console.log(JSON.stringify(targetLine));
for(let i=0; i<targetLine.length; i++) {
    console.log(targetLine.charCodeAt(i));
}
