import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `institution_config` table: a FIXED-ID SINGLETON table
 * (id = 1, always) holding institution-specific text used to render the
 * "Constancia de Calificaciones" PDF (header lines, signatory, grade scale,
 * etc.). See InstitutionConfigService for how reads/updates always target
 * the id = 1 row (create-on-read with seed defaults, with a duplicate-key
 * fallback for concurrent first-reads).
 *
 * Schema:
 *  - `id integer PRIMARY KEY`: NOT auto-increment/serial. The single row is
 *    always inserted with id = 1, so a second row is impossible at the DB
 *    layer — this is what makes the singleton invariant unbreakable even
 *    under concurrent app-layer reads (unlike a plain findOne()-then-create
 *    with no DB constraint).
 *  - `header_lines jsonb NOT NULL`: ordered top-of-document lines. jsonb
 *    (NOT a comma-joined simple-array) because a line may itself contain a
 *    comma, which would corrupt that format.
 *  - `min_approving integer NOT NULL`: minimum approving grade, 0..20
 *    (enforced at the DTO layer on PATCH).
 *  - All other text fields are varchar/text, matching
 *    InstitutionConfig entity column types.
 *
 * Guarded: table creation is skipped if `institution_config` already exists
 * (fresh install ordering / re-run). The single default row (id = 1) is
 * seeded right after creation, guarded by an existence check on id = 1 so
 * re-running this migration never inserts a second row.
 */
export class CreateInstitutionConfig1785129403665
  implements MigrationInterface
{
  name = 'CreateInstitutionConfig1785129403665';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('institution_config');

    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE "institution_config" (
          "id" integer PRIMARY KEY,
          "academyName" character varying NOT NULL,
          "headerLines" jsonb NOT NULL,
          "signatoryName" character varying NOT NULL DEFAULT '',
          "signatoryTitle" character varying NOT NULL DEFAULT '',
          "city" character varying NOT NULL DEFAULT '',
          "contactFooter" character varying NOT NULL DEFAULT '',
          "gradeScaleText" text NOT NULL,
          "minApproving" integer NOT NULL,
          "approvedLabel" character varying NOT NULL,
          "failedLabel" character varying NOT NULL
        )
      `);
    }

    // Seed the single default row (id = 1) — guarded by an existence check
    // on id = 1 so this is safe to re-run (never inserts a second row once
    // the singleton row exists).
    const [existing] = await queryRunner.query(
      `SELECT 1 FROM "institution_config" WHERE "id" = 1`,
    );

    if (!existing) {
      await queryRunner.query(
        `
        INSERT INTO "institution_config" (
          "id",
          "academyName",
          "headerLines",
          "signatoryName",
          "signatoryTitle",
          "city",
          "contactFooter",
          "gradeScaleText",
          "minApproving",
          "approvedLabel",
          "failedLabel"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
        [
          1,
          'Alejandra Academia de Belleza',
          JSON.stringify([
            'República Bolivariana de Venezuela',
            'Ministerio del Poder Popular para la Educación',
            'Alejandra Academia de Belleza',
          ]),
          '',
          'Directora',
          '',
          '',
          'Los resultados se interpretan en la escala numérica del 0 al 20; la calificación mínima aprobatoria es 15.',
          15,
          'APROBADO',
          'DESAPROBADO',
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('institution_config');
    if (hasTable) {
      await queryRunner.query('DROP TABLE "institution_config"');
    }
  }
}
