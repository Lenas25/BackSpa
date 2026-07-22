# Deploy Runbook — Course/Section Split Migration

Status: **documented, execution deferred pending user approval**. This
runbook describes how to roll out the `CourseSectionSplit` migration
(`src/migrations/1737504000000-CourseSectionSplit.ts`) against a real
(staging/production) database. It has NOT been executed against any remote
or hosted database as part of this change — see `sdd/secciones/apply-progress`
for why.

## Fresh / Empty Database Bootstrap

Use this path for a brand-new environment with no existing tables (new dev
machine, CI, disaster recovery from empty) — NOT the path below for an
existing populated database.

1. Create the `.env` (or equivalent) with `DB_HOST`, `DB_PORT`, `DB_USER`,
   `DB_PASSWORD`, `DB_NAME` pointing at the empty target database.
2. Run all migrations in order:
   ```bash
   npm run migration:run
   ```
   `InitialSchema1700000000000` runs first and creates every table
   (`user`, `course`, `section`, `enrollment`, `activity`, `grade`,
   `notification`) plus their FKs directly in final shape.
   `CourseSectionSplit1737504000000` then runs and no-ops every step, since
   the schema it would have produced already exists (its guards detect this
   and skip each DDL statement — see the migration's own comments).
3. Boot the app — `synchronize: false`, no auto-sync will run.
4. Smoke test: confirm the app starts and `GET /course` returns `200` with
   an empty array (no seed data yet).

No `image` table is created or expected: `src/images/entities/image.entity.ts`
is a stub with no `@Entity()` decorator and is not part of the TypeORM
`entities` array in `app.module.ts` — images are managed entirely through the
Cloudinary API, never persisted to Postgres.

## Existing Populated Database Rollout

Use this path when the target database already has data (staging,
production, or any dev DB previously bootstrapped via `synchronize: true`).

### Preconditions

- A recent `pg_dump` backup exists and has been verified restorable.
- `synchronize` is `false` in the target environment (already the default
  after this change — see `src/app.module.ts`).
- `.env` (or equivalent secret store) has `DB_HOST`, `DB_PORT`, `DB_USER`,
  `DB_PASSWORD`, `DB_NAME` pointing at the target database.

### Steps

1. **Backup**
   ```bash
   pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f backup-pre-secciones.dump
   ```
2. **Stop the currently running backend** (its `synchronize` would fight the
   migration if it were still `true`; also avoids in-flight writes during
   the schema change).
3. **Deploy the new backend build** (this change — `synchronize: false`,
   migration files included).
4. **Run the migration**
   ```bash
   npm run migration:run
   ```
5. **Boot the app** and smoke test — row counts must match pre/post:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM section)    AS section_count,
     (SELECT COUNT(*) FROM course)     AS course_count,
     (SELECT COUNT(*) FROM enrollment) AS enrollment_count,
     (SELECT COUNT(*) FROM activity)   AS activity_count,
     (SELECT COUNT(*) FROM grade)      AS grade_count;
   ```
   Expected: `course_count == section_count` (pre-migration course count),
   and `enrollment_count` / `activity_count` / `grade_count` unchanged from
   the pre-migration baseline captured before step 1.
6. **Deploy the frontend** (only once the backend contract for `/course` and
   `/section` is confirmed stable — out of scope for this PR).

## Rollback

- Preferred: `npm run migration:revert` (reverses `CourseSectionSplit`
  exactly — see the migration's `down()`).
- Fallback: restore `backup-pre-secciones.dump` and redeploy the previous
  backend/frontend tags.

## Open Question

Deploy window (who runs this runbook and when) needs client coordination —
not blocking for this change; tracked as an open question in
`sdd/secciones/design`.
