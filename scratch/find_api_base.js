const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'api.ts');
const content = fs.readFileSync(apiPath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('BASE_URL')) {
    console.log(`${index + 1}: ${line}`);
  }
});
