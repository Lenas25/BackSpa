import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splits the legacy `course` table (tutor, dates, activities, enrollments)
 * into:
 *  - `section`: the renamed legacy table, now scoped to a parent course and
 *    carrying an optional `installmentsCount` (schema/DTO field only, no
 *    payment logic).
 *  - `course`: a new, thin catalog table (name/description/imageUrl) that
 *    every legacy course row is wrapped into.
 *
 * Zero data loss: every existing course becomes exactly one parent Course
 * plus one Section; all FK-dependent rows (activity, enrollment, grade)
 * keep pointing at the same physical row id, now living in `section`.
 *
 * Guarded: every step checks the current schema state before acting, so the
 * migration is safe to run against a database that already has a `section`
 * table (e.g. a partially-applied or re-run attempt) and will no-op instead
 * of failing.
 */
export class CourseSectionSplit1737504000000 implements MigrationInterface {
  name = 'CourseSectionSplit1737504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSectionTable = await queryRunner.hasTable('section');
    const hasCourseTable = await queryRunner.hasTable('course');

    // Step 1: rename the legacy `course` table to `section`.
    // Guard: skip if already renamed (idempotent re-run) or if there is no
    // legacy `course` table to rename (fresh install scenario).
    if (!hasSectionTable && hasCourseTable) {
      await queryRunner.query('ALTER TABLE "course" RENAME TO "section"');
    }

    // Step 2: create the new parent `course` catalog table.
    // Guard: skip if it already exists (e.g. fresh install created it via
    // a prior full sync, or migration partially ran before).
    const courseTableExists = await queryRunner.hasTable('course');
    if (!courseTableExists) {
      await queryRunner.query(`
        CREATE TABLE "course" (
          "id" SERIAL PRIMARY KEY,
          "name" character varying(100) NOT NULL,
          "description" text,
          "imageUrl" character varying(255),
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "legacy_section_id" integer
        )
      `);
    }

    // Step 3: backfill one parent Course per legacy section row, keeping a
    // pointer (legacy_section_id) so step 4 can link them back.
    const hasLegacyColumn = await queryRunner.hasColumn(
      'course',
      'legacy_section_id',
    );
    if (hasLegacyColumn) {
      const [{ count }] = await queryRunner.query(
        'SELECT COUNT(*)::int AS count FROM "course"',
      );
      if (Number(count) === 0) {
        await queryRunner.query(`
          INSERT INTO "course" ("name", "description", "imageUrl", "legacy_section_id")
          SELECT "name", "description", "imageUrl", "id" FROM "section"
        `);
      }
    }

    // Step 4: link each section back to its new parent course.
    const hasIdCourseColumn = await queryRunner.hasColumn(
      'section',
      'id_course',
    );
    if (!hasIdCourseColumn) {
      await queryRunner.query(
        'ALTER TABLE "section" ADD COLUMN "id_course" integer',
      );
      await queryRunner.query(`
        UPDATE "section" s
        SET "id_course" = c."id"
        FROM "course" c
        WHERE c."legacy_section_id" = s."id"
      `);
      await queryRunner.query(
        'ALTER TABLE "section" ALTER COLUMN "id_course" SET NOT NULL',
      );
      await queryRunner.query(`
        ALTER TABLE "section"
        ADD CONSTRAINT "FK_section_course" FOREIGN KEY ("id_course")
        REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    }

    const stillHasLegacyColumn = await queryRunner.hasColumn(
      'course',
      'legacy_section_id',
    );
    if (stillHasLegacyColumn) {
      await queryRunner.query(
        'ALTER TABLE "course" DROP COLUMN "legacy_section_id"',
      );
    }

    // Step 5: section-only fields — add installmentsCount, drop the fields
    // that now live exclusively on the parent course.
    const hasInstallmentsColumn = await queryRunner.hasColumn(
      'section',
      'installmentsCount',
    );
    if (!hasInstallmentsColumn) {
      await queryRunner.query(
        'ALTER TABLE "section" ADD COLUMN "installmentsCount" integer',
      );
    }

    const hasDescriptionColumn = await queryRunner.hasColumn(
      'section',
      'description',
    );
    if (hasDescriptionColumn) {
      await queryRunner.query(
        'ALTER TABLE "section" DROP COLUMN "description"',
      );
    }

    const hasImageUrlColumn = await queryRunner.hasColumn(
      'section',
      'imageUrl',
    );
    if (hasImageUrlColumn) {
      await queryRunner.query('ALTER TABLE "section" DROP COLUMN "imageUrl"');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse step 5: restore section.description / section.imageUrl,
    // backfilled from the parent course, and drop installmentsCount.
    const hasDescriptionColumn = await queryRunner.hasColumn(
      'section',
      'description',
    );
    if (!hasDescriptionColumn) {
      await queryRunner.query('ALTER TABLE "section" ADD COLUMN "description" text');
    }

    const hasImageUrlColumn = await queryRunner.hasColumn(
      'section',
      'imageUrl',
    );
    if (!hasImageUrlColumn) {
      await queryRunner.query(
        'ALTER TABLE "section" ADD COLUMN "imageUrl" character varying(255)',
      );
    }

    await queryRunner.query(`
      UPDATE "section" s
      SET "description" = c."description", "imageUrl" = c."imageUrl"
      FROM "course" c
      WHERE c."id" = s."id_course"
    `);

    const hasInstallmentsColumn = await queryRunner.hasColumn(
      'section',
      'installmentsCount',
    );
    if (hasInstallmentsColumn) {
      await queryRunner.query(
        'ALTER TABLE "section" DROP COLUMN "installmentsCount"',
      );
    }

    // Reverse step 4: drop the FK and the id_course column.
    const table = await queryRunner.getTable('section');
    const fk = table?.foreignKeys.find((f) => f.name === 'FK_section_course');
    if (fk) {
      await queryRunner.dropForeignKey('section', fk);
    }
    const hasIdCourseColumn = await queryRunner.hasColumn(
      'section',
      'id_course',
    );
    if (hasIdCourseColumn) {
      await queryRunner.query('ALTER TABLE "section" DROP COLUMN "id_course"');
    }

    // Reverse steps 2/3: drop the parent course table entirely — every row
    // was derived 1:1 from a section, so no data is lost by dropping it.
    const hasCourseTable = await queryRunner.hasTable('course');
    if (hasCourseTable) {
      await queryRunner.query('DROP TABLE "course"');
    }

    // Reverse step 1: rename `section` back to `course`.
    const hasSectionTable = await queryRunner.hasTable('section');
    const hasLegacyCourseTable = await queryRunner.hasTable('course');
    if (hasSectionTable && !hasLegacyCourseTable) {
      await queryRunner.query('ALTER TABLE "section" RENAME TO "course"');
    }
  }
}
