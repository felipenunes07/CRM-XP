const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'app.ts');
const content = fs.readFileSync(appPath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('/media') || line.includes('static') || line.includes('express.static') || line.includes('campaignMediaDir')) {
    console.log(`${index + 1}: ${line}`);
  }
});
