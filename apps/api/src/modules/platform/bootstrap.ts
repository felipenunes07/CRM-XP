import { runMigrations } from "../../db/migrate.js";
import { ensureDefaultAdmin } from "./authService.js";

export async function bootstrapPlatform() {
  await runMigrations();
  await ensureDefaultAdmin();
}
