const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetweenOld(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

function daysBetweenNew(a, b) {
  const utcDateA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcDateB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.max(0, Math.floor((utcDateA - utcDateB) / DAY_MS));
}

const a = new Date('2026-04-15T15:30:00Z');
const b = new Date('2026-03-15T00:00:00Z');

console.log("OLD:", daysBetweenOld(a, b));
console.log("NEW:", daysBetweenNew(a, b));
