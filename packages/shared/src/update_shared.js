import fs from 'fs';
const path = 'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/packages/shared/src/index.ts';
let content = fs.readFileSync(path, 'utf8');

const search = "inactiveCount: number;";
const replacement = "inactiveCount: number;\n  newCount: number;";

content = content.replace(search, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
