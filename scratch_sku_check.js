// Test the fixDateMangledSku logic
function fixDateMangledSku(raw) {
  const dateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!dateMatch) return raw;

  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);

  const fullYear = year < 100 ? (year < 30 ? 2000 + year : 1900 + year) : year;
  const date = new Date(fullYear, month - 1, day + 1);
  const realMonth = date.getMonth() + 1;
  const realYear = date.getFullYear() % 100;

  return `${String(realYear).padStart(4, "0")}-${realMonth}`;
}

const tests = [
  { input: "12/31/81", expected: "0082-1" },
  { input: "1/31/38",  expected: "0038-2" },
  { input: "1/31/92",  expected: "0092-2" },
  { input: "1/31/93",  expected: "0093-2" },
  { input: "12/31/00", expected: "0001-1" },
  { input: "12/31/31", expected: "0032-1" },
  { input: "12/31/44", expected: "0045-1" },
  { input: "12/31/45", expected: "0046-1" },
  { input: "12/31/37", expected: "0038-1" },
  { input: "12/31/39", expected: "0040-1" },
  { input: "10/31/01", expected: "0001-11" },
  { input: "11/30/01", expected: "0001-12" },
  { input: "0082-1",   expected: "0082-1" },  // should pass through
  { input: "1338-1",   expected: "1338-1" },  // should pass through
];

console.log("Testing fixDateMangledSku:");
for (const t of tests) {
  const result = fixDateMangledSku(t.input);
  const pass = result === t.expected ? "✓" : "✗";
  console.log(`${pass} ${t.input} -> ${result} (expected: ${t.expected})`);
}
