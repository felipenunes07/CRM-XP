const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'styles.css');
const content = fs.readFileSync(cssPath, 'utf8');

let braceCount = 0;
let lineNum = 1;
let inComment = false;
let inString = false;
let stringChar = '';

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const nextChar = content[i + 1];

  if (char === '\n') {
    lineNum++;
  }

  // Handle comments
  if (inComment) {
    if (char === '*' && nextChar === '/') {
      inComment = false;
      i++; // skip '/'
    }
    continue;
  }
  if (char === '/' && nextChar === '*') {
    inComment = true;
    i++; // skip '*'
    continue;
  }

  // Handle strings
  if (inString) {
    if (char === stringChar && content[i - 1] !== '\\') {
      inString = false;
    }
    continue;
  }
  if (char === '"' || char === "'") {
    inString = true;
    stringChar = char;
    continue;
  }

  if (char === '{') {
    braceCount++;
  } else if (char === '}') {
    braceCount--;
    if (braceCount < 0) {
      console.log(`Extra closing brace '}' at line ${lineNum}`);
      braceCount = 0; // reset
    }
  }
}

console.log(`Final brace count: ${braceCount}`);
if (braceCount > 0) {
  console.log(`Warning: There are ${braceCount} unclosed opening braces '{' in the file!`);
}
