const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'pages', 'TemplatesPage.tsx'); // Wait, the content is in the step folder!
const mdPath = 'C:\\Users\\Felipe\\.gemini\\antigravity-ide\\brain\\165a63c4-a6bf-490c-a38e-aa8c96f65a2d\\.system_generated\\steps\\256\\content.md';
const content = fs.readFileSync(mdPath, 'utf8');

const lines = content.split('\n');
let readmeStart = -1;
let readmeEnd = -1;
lines.forEach((line, index) => {
  if (line.includes('id="readme"')) {
    readmeStart = index;
  }
  if (readmeStart !== -1 && readmeEnd === -1 && line.includes('</article>')) {
    readmeEnd = index;
  }
});

console.log(`README starts at line ${readmeStart + 1} and ends at line ${readmeEnd + 1}`);

if (readmeStart !== -1) {
  const readmeLines = lines.slice(readmeStart, readmeEnd + 1);
  console.log(readmeLines.join('\n').replace(/<[^>]*>/g, '').slice(0, 3000)); // plain text snippet
}
