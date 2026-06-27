const fs = require('fs');
const path = require('path');

const mdPath = 'C:\\Users\\Felipe\\.gemini\\antigravity-ide\\brain\\165a63c4-a6bf-490c-a38e-aa8c96f65a2d\\.system_generated\\steps\\256\\content.md';
const content = fs.readFileSync(mdPath, 'utf8');

const regex = /"\/naughtyduk\/liquidGL\/[a-zA-Z0-9_\-\/.]+"/g;
const matches = content.match(regex);
if (matches) {
  const uniqueMatches = [...new Set(matches)];
  console.log("Matches found:", uniqueMatches);
} else {
  console.log("No matches found");
}
