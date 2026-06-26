const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'styles.css');
const content = fs.readFileSync(cssPath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('--line:') || line.includes('--text:')) {
    console.log(`${index + 1}: ${line}`);
  }
});
