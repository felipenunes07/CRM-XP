import { ensureDefaultAdmin } from "./authService.js";

export async function bootstrapPlatform() {
  await ensureDefaultAdmin();
}
