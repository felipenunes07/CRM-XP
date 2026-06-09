import { migrations } from "../apps/api/src/db/migrations.js";

console.log("Total migrations in migrations.ts:", migrations.length);
migrations.forEach((m, idx) => {
  const lines = m.trim().split("\n");
  console.log(`Migration ${idx + 1}: ${lines[0]} ${lines[1] ? '(...) ' + lines[1].substring(0, 40) : ''}`);
});
