const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'src', 'pages', 'DisparadorPage.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('drag') || line.toLowerCase().includes('drop') || line.toLowerCase().includes('datatransfer')) {
    console.log(`${index + 1}: ${line}`);
  }
});
