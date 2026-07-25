import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `attendance_day` and `attendance` tables (per-section daily
 * roster header + per-enrollment child rows). Mirrors Payment's
 * parent/child shape (see 1784827310927-CreatePayment.ts) but with NO
 * backfill: locked product decision (sdd/asistencia/decisions) is that
 * Attendance rows are generated only by AttendanceService.createDay, for
 * enrollments ACTIVE at that moment — a late-enrolling student is never
 * retroactively added to past days, so this migration must not synthesize
 * any historical rows. It only creates empty tables.
 *
 * Schema:
 *  - `attendance_day`: `id_section` FK -> section(id) ON DELETE CASCADE,
 *    `date` (Postgres `date`, handled end-to-end as a "YYYY-MM-DD" string —
 *    see payment.entity.ts's `paidDate` comment for why `new Date(...)`
 *    must never touch this column), UNIQUE(id_section, date).
 *  - `attendance`: `id_attendance_day` FK -> attendance_day(id) ON DELETE
 *    CASCADE, `id_enrollment` FK -> enrollment(id) ON DELETE CASCADE,
 *    `present boolean NOT NULL DEFAULT true`, UNIQUE(id_attendance_day,
 *    id_enrollment).
 *
 * Guarded: each table's creation is skipped if it already exists (fresh
 * install ordering / re-run safety). No data is ever inserted by this
 * migration, so re-running it is always a pure no-op after the first run.
 */
export class CreateAttendance1784942159432 implements MigrationInterface {
  name = 'CreateAttendance1784942159432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAttendanceDayTable =
      await queryRunner.hasTable('attendance_day');

    if (!hasAttendanceDayTable) {
      await queryRunner.query(`
        CREATE TABLE "attendance_day" (
          "id" SERIAL PRIMARY KEY,
          "id_section" integer NOT NULL,
          "date" date NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_attendance_day_section_date" UNIQUE ("id_section", "date"),
          CONSTRAINT "FK_attendance_day_section" FOREIGN KEY ("id_section")
            REFERENCES "section"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
    }

    const hasAttendanceTable = await queryRunner.hasTable('attendance');

    if (!hasAttendanceTable) {
      await queryRunner.query(`
        CREATE TABLE "attendance" (
          "id" SERIAL PRIMARY KEY,
          "id_attendance_day" integer NOT NULL,
          "id_enrollment" integer NOT NULL,
          "present" boolean NOT NULL DEFAULT true,
          CONSTRAINT "UQ_attendance_day_enrollment" UNIQUE ("id_attendance_day", "id_enrollment"),
          CONSTRAINT "FK_attendance_attendance_day" FOREIGN KEY ("id_attendance_day")
            REFERENCES "attendance_day"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_attendance_enrollment" FOREIGN KEY ("id_enrollment")
            REFERENCES "enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAttendanceTable = await queryRunner.hasTable('attendance');
    if (hasAttendanceTable) {
      await queryRunner.query('DROP TABLE "attendance"');
    }

    const hasAttendanceDayTable =
      await queryRunner.hasTable('attendance_day');
    if (hasAttendanceDayTable) {
      await queryRunner.query('DROP TABLE "attendance_day"');
    }
  }
}
