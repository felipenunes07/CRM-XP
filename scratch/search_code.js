const fs = require('fs');
const path = require('path');

const filePath = path.resolve('apps/web/src/pages/DisparadorPage.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Searching for "MiniChat" or "miniChat" or "Ver Chat" in ${filePath}...`);
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('minichat') || line.toLowerCase().includes('ver chat')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
