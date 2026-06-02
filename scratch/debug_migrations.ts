import { migrations } from "../apps/api/src/db/migrations.ts";
console.log("Migrations array length:", migrations.length);
migrations.forEach((m, idx) => {
  const clean = m.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("--"))[0] || "";
  console.log(`Index ${idx}: ${clean.substring(0, 80)}`);
});
