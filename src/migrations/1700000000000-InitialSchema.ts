import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema migration. Creates every table this application needs
 * (`user`, `course`, `section`, `enrollment`, `activity`, `grade`,
 * `notification`) directly in their FINAL, post-`CourseSectionSplit` shape,
 * plus every FK between them.
 *
 * Why this exists: before this migration, the only way any of these tables
 * ever got created was via TypeORM's `synchronize: true` auto-sync. Once
 * `synchronize` was permanently flipped to `false` (see
 * `CourseSectionSplit1737504000000` / `app.module.ts`), a genuinely empty
 * database (fresh dev machine, CI, disaster recovery from empty) had no
 * migration path at all: `CourseSectionSplit`'s `up()` assumes a pre-existing
 * legacy `course` table to rename and a `section` table to backfill from,
 * neither of which exists on an empty DB.
 *
 * This migration runs FIRST (its timestamp sorts before
 * `CourseSectionSplit1737504000000`) and creates the schema in its final
 * shape directly — there is no legacy data to transform on an empty DB, so
 * there is no reason to simulate the legacy hop. `CourseSectionSplit`'s own
 * per-step guards (`hasTable`/`hasColumn` checks) then correctly no-op every
 * step when it runs afterward, because the final shape it would have
 * produced already exists.
 *
 * Guarded: every step checks the current schema state before acting, so this
 * migration is a safe no-op against a database that was bootstrapped via the
 * old `synchronize: true` path (all tables already exist) or a database where
 * it already ran once before.
 *
 * The `image` domain (Cloudinary-backed uploads) is intentionally excluded:
 * `src/images/entities/image.entity.ts` is a stub class with no `@Entity()`
 * decorator and is not part of `app.module.ts`'s registered TypeORM
 * `entities` array — there is no `image` table in this system, images are
 * managed entirely through the Cloudinary API, never persisted to Postgres.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUserRoleEnum = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'user_role_enum'`,
    );
    if (hasUserRoleEnum.length === 0) {
      await queryRunner.query(
        `CREATE TYPE "user_role_enum" AS ENUM ('alumno', 'admin', 'tutor')`,
      );
    }

    if (!(await queryRunner.hasTable('user'))) {
      await queryRunner.query(`
        CREATE TABLE "user" (
          "id" character varying(36) NOT NULL,
          "name" character varying(100) NOT NULL,
          "lastName" character varying(100) NOT NULL,
          "username" character varying(60) NOT NULL,
          "password" character varying NOT NULL,
          "role" "user_role_enum" NOT NULL DEFAULT 'alumno',
          "phone" character varying(20),
          "email" character varying(60) NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_user_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_user_username" UNIQUE ("username"),
          CONSTRAINT "UQ_user_email" UNIQUE ("email")
        )
      `);
    }

    if (!(await queryRunner.hasTable('course'))) {
      await queryRunner.query(`
        CREATE TABLE "course" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(100) NOT NULL,
          "description" text,
          "imageUrl" character varying(255) NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
    }

    if (!(await queryRunner.hasTable('section'))) {
      await queryRunner.query(`
        CREATE TABLE "section" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(100) NOT NULL,
          "initialDate" date NOT NULL,
          "endDate" date NOT NULL,
          "duration" integer NOT NULL,
          "installmentsCount" integer,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "id_course" integer NOT NULL,
          "id_tutor" character varying(36),
          CONSTRAINT "FK_section_course" FOREIGN KEY ("id_course")
            REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_section_tutor" FOREIGN KEY ("id_tutor")
            REFERENCES "user"("id")
        )
      `);
    }

    if (!(await queryRunner.hasTable('enrollment'))) {
      await queryRunner.query(`
        CREATE TABLE "enrollment" (
          "id" SERIAL PRIMARY KEY,
          "final_grade" decimal(4,2) NOT NULL DEFAULT 0,
          "enrollment_date" date NOT NULL DEFAULT CURRENT_DATE,
          "active" boolean DEFAULT true,
          "id_user" character varying(36),
          "id_course" integer,
          CONSTRAINT "FK_enrollment_user" FOREIGN KEY ("id_user")
            REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_enrollment_section" FOREIGN KEY ("id_course")
            REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
    }

    if (!(await queryRunner.hasTable('activity'))) {
      await queryRunner.query(`
        CREATE TABLE "activity" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(100) NOT NULL,
          "percentage" decimal(4,2),
          "id_course" integer,
          CONSTRAINT "FK_activity_section" FOREIGN KEY ("id_course")
            REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
    }

    if (!(await queryRunner.hasTable('grade'))) {
      await queryRunner.query(`
        CREATE TABLE "grade" (
          "id_enrollment" integer NOT NULL,
          "id_activity" integer NOT NULL,
          "grade" decimal(4,2) NOT NULL DEFAULT 0,
          CONSTRAINT "PK_grade" PRIMARY KEY ("id_enrollment", "id_activity"),
          CONSTRAINT "FK_grade_enrollment" FOREIGN KEY ("id_enrollment")
            REFERENCES "enrollment"("id") ON DELETE CASCADE,
          CONSTRAINT "FK_grade_activity" FOREIGN KEY ("id_activity")
            REFERENCES "activity"("id") ON DELETE CASCADE
        )
      `);
    }

    if (!(await queryRunner.hasTable('notification'))) {
      await queryRunner.query(`
        CREATE TABLE "notification" (
          "id" SERIAL PRIMARY KEY,
          "description" character varying(100) NOT NULL,
          "id_enrollment" integer,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "FK_notification_enrollment" FOREIGN KEY ("id_enrollment")
            REFERENCES "enrollment"("id")
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse dependency order: children before parents.
    if (await queryRunner.hasTable('notification')) {
      await queryRunner.query('DROP TABLE "notification"');
    }
    if (await queryRunner.hasTable('grade')) {
      await queryRunner.query('DROP TABLE "grade"');
    }
    if (await queryRunner.hasTable('activity')) {
      await queryRunner.query('DROP TABLE "activity"');
    }
    if (await queryRunner.hasTable('enrollment')) {
      await queryRunner.query('DROP TABLE "enrollment"');
    }
    if (await queryRunner.hasTable('section')) {
      await queryRunner.query('DROP TABLE "section"');
    }
    if (await queryRunner.hasTable('course')) {
      await queryRunner.query('DROP TABLE "course"');
    }
    if (await queryRunner.hasTable('user')) {
      await queryRunner.query('DROP TABLE "user"');
    }

    const hasUserRoleEnum = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'user_role_enum'`,
    );
    if (hasUserRoleEnum.length > 0) {
      await queryRunner.query('DROP TYPE "user_role_enum"');
    }
  }
}
