const fs = require('fs');
const path = require('path');

const mdPath = 'C:\\Users\\Felipe\\.gemini\\antigravity-ide\\brain\\165a63c4-a6bf-490c-a38e-aa8c96f65a2d\\.system_generated\\steps\\256\\content.md';
const content = fs.readFileSync(mdPath, 'utf8');

const lines = content.split('\n');
console.log("Total lines:", lines.length);

// Print lines containing liquidGL or glassmorphism
lines.forEach((line, index) => {
  if (line.includes('liquidGL') || line.includes('glassmorphism') || line.includes('Liquid Glass') || line.includes('naughtyduk')) {
    if (line.length < 200) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
