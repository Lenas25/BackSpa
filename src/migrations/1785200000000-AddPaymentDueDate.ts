import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `payment.dueDate` (nullable `date`): a manually-set fecha de
 * vencimiento per installment (client rule — see PaymentService.toView()'s
 * "atrasado" derivation, sdd/pagos/dueDate design). Purely informational;
 * no late fee/mora/extra amount is computed from it, and status stays
 * DERIVED (never a stored column, same ADR as the original Payment table).
 *
 * Guarded: skipped if the `payment` table doesn't exist yet (fresh install
 * ordering — CreatePayment1784827310927 already creates it, and a future
 * fresh install should define `dueDate` there instead) or if the column
 * already exists (safe to re-run).
 */
export class AddPaymentDueDate1785200000000 implements MigrationInterface {
  name = 'AddPaymentDueDate1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentTable = await queryRunner.hasTable('payment');
    if (!hasPaymentTable) {
      return;
    }

    const hasDueDateColumn = await queryRunner.hasColumn(
      'payment',
      'dueDate',
    );
    if (!hasDueDateColumn) {
      await queryRunner.query(
        'ALTER TABLE "payment" ADD COLUMN "dueDate" date NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentTable = await queryRunner.hasTable('payment');
    if (!hasPaymentTable) {
      return;
    }

    const hasDueDateColumn = await queryRunner.hasColumn(
      'payment',
      'dueDate',
    );
    if (hasDueDateColumn) {
      await queryRunner.query('ALTER TABLE "payment" DROP COLUMN "dueDate"');
    }
  }
}
