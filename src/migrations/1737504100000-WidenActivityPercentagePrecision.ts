import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `activity.percentage` from numeric(4,2) to numeric(5,2).
 *
 * Discovered while validating the "Activity Percentage Validation" feature
 * (activities within a Section MUST sum to exactly 100%) against a real
 * Postgres instance: numeric(4,2) allows at most 4 total digits with 2 after
 * the decimal point, i.e. a maximum storable value of 99.99. A Section with
 * a single activity weighted at 100% (a fully valid, spec-compliant case —
 * e.g. "Final Exam = 100%") could never actually be persisted; the INSERT
 * would fail with a Postgres "numeric field overflow" error. numeric(5,2)
 * allows up to 999.99, comfortably covering the 0-100 range with 2 decimal
 * places while leaving headroom.
 *
 * Guarded: checks the column's current precision before altering, so this
 * is a safe no-op if already widened (idempotent re-run) or if the
 * `activity` table doesn't exist yet (fresh install ordering — InitialSchema
 * already creates it at the correct precision going forward, see below).
 */
export class WidenActivityPercentagePrecision1737504100000 implements MigrationInterface {
  name = 'WidenActivityPercentagePrecision1737504100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('activity');
    if (!table) {
      return;
    }

    const percentageColumn = table.findColumnByName('percentage');
    if (!percentageColumn || percentageColumn.precision === 5) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "activity" ALTER COLUMN "percentage" TYPE numeric(5,2)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('activity');
    if (!table) {
      return;
    }

    const percentageColumn = table.findColumnByName('percentage');
    if (!percentageColumn || percentageColumn.precision === 4) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "activity" ALTER COLUMN "percentage" TYPE numeric(4,2)',
    );
  }
}
