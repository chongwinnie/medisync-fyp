# Supabase Database Setup

This project now includes:

- `migrations/20260627130000_initial_schema.sql`
- `migrations/20260627131000_auth_sync_helper.sql`
- `seed.sql`

## Notes

- Auth is modeled for **Auth0 + Supabase**:
  - `users.auth0_sub` links Auth0 identity to app users.
  - Password hashes are **not** stored in Supabase.
- **RLS is intentionally not enabled** yet (requested).

## Apply migration

If Supabase CLI is already linked to your project:

```bash
npx supabase db push
npx supabase db reset --linked --seed
```

If only seeding an already-migrated linked database:

```bash
npx supabase db query < supabase/seed.sql
```

If you prefer SQL editor in Supabase Dashboard:

1. Open SQL Editor.
2. Paste content from `migrations/20260627130000_initial_schema.sql`.
3. Run the query.

## What is included

- Core identity and staff tables (`users`, `staff`)
- Patient and clinical module tables
- Diagnostics, appointments, inventory/resources, staff-management tables
- Chat, notifications, AI logs, audit logs
- Enums, constraints, foreign keys, indexes
- `updated_at` triggers and inventory stock-update trigger
- Auth-sync helper functions:
  - `get_user_id_by_auth0_sub(text) -> uuid`
  - `sync_auth0_user(auth0_sub, email, email_verified, last_login, default_role) -> users`
