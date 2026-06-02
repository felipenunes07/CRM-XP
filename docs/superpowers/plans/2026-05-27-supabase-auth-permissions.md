# Supabase Auth Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current private JWT login with Supabase Auth and add server-enforced roles, permissions, active/inactive status, protected routes, and an admin user management panel.

**Architecture:** Supabase Auth is the identity provider. The Express API validates Supabase access tokens, loads the matching CRM profile and effective permissions from Postgres, and enforces route-level permissions before executing sensitive operations. The React app uses Supabase sessions for login/logout and mirrors backend permissions only for navigation and UX.

**Tech Stack:** React 19, Vite, React Router 7, React Query, Supabase JS v2, Express 5, PostgreSQL, Vitest, Supertest.

---

### Task 1: Auth And Permission Contracts

**Files:**
- Modify: `apps/api/src/modules/platform/authService.ts`
- Modify: `apps/api/src/modules/platform/authMiddleware.ts`
- Modify: `apps/api/src/types/express.d.ts`
- Create: `apps/api/src/modules/platform/permissionService.ts`
- Test: `apps/api/src/modules/platform/permissionService.test.ts`

- [ ] Write tests proving role permissions are combined with user overrides, explicit user denies win, and inactive users are rejected.
- [ ] Implement shared role constants, permission constants, `loadAuthContext`, `getEffectivePermissions`, `hasPermission`, and `requirePermission`.
- [ ] Replace `JwtUser` with an app user context that includes `id`, `email`, `name`, `role`, `isActive`, and `permissions`.
- [ ] Run `npm run test -w @olist-crm/api -- src/modules/platform/permissionService.test.ts`.

### Task 2: Database Schema And Supabase Migration

**Files:**
- Modify: `apps/api/src/db/migrations.ts`
- Create: `supabase/migrations/202605270001_auth_roles_permissions.sql`

- [ ] Add `profiles`, `permissions`, `role_permissions`, and `user_permissions` to the primary Postgres migration list.
- [ ] Add SQL indexes, constraints, default permissions, and compatibility migration from existing `users`.
- [ ] Add Supabase-side schema and RLS policies for `profiles`, `permissions`, `role_permissions`, and `user_permissions`.
- [ ] Apply the Supabase migration to project `gxvxgpwdgkeskttasrfz`.
- [ ] Run Supabase security advisors after applying the migration.

### Task 3: Backend Auth Flow And Admin User API

**Files:**
- Modify: `apps/api/src/lib/env.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/platform/authService.ts`
- Create: `apps/api/src/modules/platform/supabaseAdmin.ts`
- Create: `apps/api/src/modules/platform/adminUserService.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/app.authPermissions.test.ts`

- [ ] Add server env vars for Supabase URL, anon key, service role key, and optional JWT secret.
- [ ] Use Supabase Admin API on the server to create users, update emails/passwords, invite/reset users, and deactivate profiles.
- [ ] Change `/api/auth/login` to use Supabase Auth compatibility response or deprecate it while preserving frontend build compatibility.
- [ ] Change `/api/auth/me` to return the active app profile and permissions.
- [ ] Add `/api/admin/users`, `POST /api/admin/users`, `PUT /api/admin/users/:id`, `PATCH /api/admin/users/:id/status`, `POST /api/admin/users/:id/reset-password`, and `GET /api/admin/permissions`.
- [ ] Guard every admin endpoint with `admin.users.manage`.
- [ ] Run `npm run test -w @olist-crm/api -- src/app.authPermissions.test.ts`.

### Task 4: Route Permissions

**Files:**
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/modules/platform/routePermissions.ts`

- [ ] Map existing routes to permission keys such as `dashboard.view`, `commercial.view`, `finance.view`, `messages.view`, `messages.manage`, `automations.manage`, `integrations.manage`, `settings.manage`, and `admin.users.manage`.
- [ ] Apply `requirePermission` to sensitive API routes.
- [ ] Keep public webhook routes unauthenticated.
- [ ] Run existing API tests and fix mocks that depend on the old `role`-only middleware.

### Task 5: Frontend Auth And Route Guards

**Files:**
- Modify: `apps/web/src/hooks/useAuth.tsx`
- Create: `apps/web/src/hooks/usePermissions.ts`
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Create: `apps/web/src/components/PermissionGate.tsx`
- Create: `apps/web/src/pages/AccessDeniedPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Test: `apps/web/src/hooks/usePermissions.test.ts`

- [ ] Replace local JWT restore with Supabase session restore and `onAuthStateChange`.
- [ ] Keep `token` exposed as the Supabase access token so existing API calls continue to work.
- [ ] Add `canAccess(permissionKey)` and `requirePermission(permissionKey)` helpers.
- [ ] Redirect unauthenticated users to `/login`.
- [ ] Redirect authenticated users without permission to `/acesso-negado`.
- [ ] Run `npm run test -w @olist-crm/web -- src/hooks/usePermissions.test.ts`.

### Task 6: Admin User Panel And Navigation

**Files:**
- Create: `apps/web/src/pages/AdminUsersPage.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.tsx`

- [ ] Add a clean admin workspace that lists users, role, status, permission summary, and creation date.
- [ ] Add create/edit forms for full name, email, role, status, and individual permission overrides.
- [ ] Add reset password action.
- [ ] Filter sidebar entries by permission key instead of `adminOnly`.
- [ ] Run `npm run build -w @olist-crm/web`.

### Task 7: Verification And Documentation

**Files:**
- Modify: `supabase/README.md`
- Modify: `.env.example`

- [ ] Document required Supabase environment variables and admin setup.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run Supabase security advisor and summarize remaining findings.
