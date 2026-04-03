import { bootstrapPlatform } from "../modules/platform/bootstrap.js";
import { pool, redis } from "../db/client.js";

bootstrapPlatform()
  .then(async () => {
    await redis.quit();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await redis.quit();
    await pool.end();
    process.exit(1);
  });
