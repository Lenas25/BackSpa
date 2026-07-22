# Deploy Runbook — Course/Section Split Migration

Status: **validated locally against a Docker Postgres instance** (both the
fresh-DB path and the legacy-populated-DB path — see "Local Validation"
below). It has NOT been executed against any remote or hosted database as
part of this change — see `sdd/secciones/apply-progress` for the local
validation evidence.

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

## Environment Variables

- `DB_HOST`, `DB_PORT` (defaults to `5432` if unset — Postgres, not MySQL),
  `DB_USER`, `DB_PASSWORD`, `DB_NAME`: standard Postgres connection.
- `DB_SSL`: optional. Set to `true` only for managed providers that require
  SSL (e.g. hosted Postgres with `rejectUnauthorized: false`). Leave unset
  (or any value other than `true`) for local Postgres, which has no SSL.

## Local Validation (Docker Postgres)

This procedure was used to validate both migrations end-to-end against a
real Postgres instance before this runbook's remote rollout. Reuse it for
any future migration changes.

1. **Start a dedicated container** (isolated from any other local Postgres
   stack — do not reuse ports/containers used by other projects):
   ```bash
   docker run -d --name alejandracademia-db \
     -e POSTGRES_USER=academia \
     -e POSTGRES_PASSWORD=academia_local \
     -e POSTGRES_DB=academia \
     -p 5433:5432 \
     postgres:16-alpine
   ```
   Wait for readiness: `docker exec alejandracademia-db pg_isready -U academia`.
2. **Configure `.env`** (gitignored — never commit):
   ```
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=academia
   DB_PASSWORD=academia_local
   DB_NAME=academia
   ```
   No `DB_SSL` — local Postgres has no SSL.
3. **Fresh-path test**: `npm run migration:run` on the empty `academia` DB.
   Confirms both migrations run in order and produce the full final schema
   (`user`, `course`, `section`, `enrollment`, `activity`, `grade`,
   `notification`, `section.id_course` FK, `section.installmentsCount`
   column). Re-run `npm run migration:run` — must report
   `No migrations are pending` (idempotent no-op).
4. **Legacy-path test**: create a second database
   (`docker exec alejandracademia-db psql -U academia -d academia -c "CREATE DATABASE academia_legacy;"`),
   hand-create the pre-split schema (monolithic `course` table with
   `initialDate`/`endDate`/`duration`/`isActive`/`id_tutor`, plus
   `user`/`enrollment`/`activity`/`grade`/`notification`), seed a few sample
   courses with a tutor, enrollments, activities, and grades. Point `.env`
   at `academia_legacy` and run `npm run migration:run`. Assert: one parent
   `course` row per legacy course, `section` holds the old rows with
   `id_course` backfilled correctly, and row counts on
   `user`/`enrollment`/`activity`/`grade`/`notification` are unchanged
   pre/post. Re-run — must be an idempotent no-op.
5. **Revert test**: `npm run migration:revert` on the legacy DB reverts
   `CourseSectionSplit` and must restore the exact pre-split shape (single
   `course` table with all original columns and data, no `section` table),
   with zero row loss. Re-run `npm run migration:run` afterward to restore
   the split state.
6. **Tear down** when done: `docker rm -f alejandracademia-db` (only removes
   this project's own container).

Local validation surfaced and fixed a critical bug:
`InitialSchema1700000000000` used to create an empty `section` table
whenever one was missing, with no check for a pre-existing legacy `course`
table. Against a legacy-populated database this silently short-circuited
every guard in `CourseSectionSplit`, leaving `section` empty and `course`
un-split with no error raised. Fixed by having `InitialSchema` detect
"`course` exists, `section` does not" as a legacy layout and no-op entirely
(both `up()` and `down()`), deferring the real transformation to
`CourseSectionSplit`.

## Rollback

- Preferred: `npm run migration:revert` (reverses `CourseSectionSplit`
  exactly — see the migration's `down()`).
- Fallback: restore `backup-pre-secciones.dump` and redeploy the previous
  backend/frontend tags.

## Open Question

Deploy window (who runs this runbook and when) needs client coordination —
not blocking for this change; tracked as an open question in
`sdd/secciones/design`.
