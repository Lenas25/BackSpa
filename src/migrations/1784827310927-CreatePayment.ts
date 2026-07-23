import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `payment` table (installment lifecycle for enrollments) and
 * backfills pending installments for every pre-existing enrollment, based on
 * its section's `installmentsCount`.
 *
 * Schema (design ADRs, sdd/pagos/design):
 *  - `id_enrollment`: FK -> enrollment(id), ON DELETE CASCADE (deleting an
 *    enrollment or its section removes its payments).
 *  - `installmentNumber`: 1-based sequence within the enrollment.
 *  - `amount numeric(10,2) NULL`, `paidDate date NULL`: both null while
 *    pending. Status is NOT a column — it is derived from `paidDate` in
 *    PaymentService.toView(), so no dual-write drift is possible.
 *  - `UNIQUE(id_enrollment, installmentNumber)`: DB-enforced, so concurrent
 *    generation/backfill cannot double-insert the same installment.
 *
 * Guarded: table creation is skipped if `payment` already exists (fresh
 * install ordering / re-run). The backfill INSERT is always attempted but is
 * itself idempotent (`WHERE NOT EXISTS`), so re-running this migration is a
 * safe no-op once the backfill has completed.
 *
 * Production execution of this backfill is explicitly deferred (see
 * sdd/pagos/design Open Questions) — this migration ships as guarded local
 * code, validated against the local dev DB only.
 */
export class CreatePayment1784827310927 implements MigrationInterface {
  name = 'CreatePayment1784827310927';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentTable = await queryRunner.hasTable('payment');

    if (!hasPaymentTable) {
      await queryRunner.query(`
        CREATE TABLE "payment" (
          "id" SERIAL PRIMARY KEY,
          "id_enrollment" integer NOT NULL,
          "installmentNumber" integer NOT NULL,
          "amount" numeric(10,2),
          "paidDate" date,
          CONSTRAINT "UQ_payment_enrollment_installment" UNIQUE ("id_enrollment", "installmentNumber"),
          CONSTRAINT "FK_payment_enrollment" FOREIGN KEY ("id_enrollment")
            REFERENCES "enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
    }

    // Backfill: one pending installment per (enrollment, 1..installmentsCount)
    // for every enrollment whose section has a positive installmentsCount.
    // Idempotent via NOT EXISTS — safe to re-run after partial or full
    // completion, and safe to re-run on every deploy since it only ever
    // inserts missing rows, never touches existing ones.
    await queryRunner.query(`
      INSERT INTO "payment" ("id_enrollment", "installmentNumber")
      SELECT e."id", gs.installment_number
      FROM "enrollment" e
      JOIN "section" s ON s."id" = e."id_course"
      CROSS JOIN generate_series(1, s."installmentsCount") AS gs(installment_number)
      WHERE s."installmentsCount" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "payment" p
          WHERE p."id_enrollment" = e."id"
            AND p."installmentNumber" = gs.installment_number
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentTable = await queryRunner.hasTable('payment');
    if (hasPaymentTable) {
      await queryRunner.query('DROP TABLE "payment"');
    }
  }
}
