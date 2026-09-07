/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; FILES: R2Bucket; ADMIN_TOKEN: string; TEAM_TOKEN: string; } }
