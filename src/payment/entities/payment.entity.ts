import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

// Payment models a single installment for an Enrollment. Status is NOT a
// column: it is derived from `paidDate` (null → pendiente, set → cancelado)
// in PaymentService.toView() — see design ADR "Status: derived from
// paidDate" (sdd/pagos/design). Keeping status out of the schema makes
// inconsistent pending/paid states unrepresentable.
@Entity()
@Unique(['enrollment', 'installmentNumber'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Enrollment, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'id_enrollment' })
  enrollment: Enrollment;

  @Column({ type: 'int' })
  installmentNumber: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  amount: number | null;

  // Typed as a plain "YYYY-MM-DD" string, NOT `Date`, on purpose (bugfix,
  // sdd/pagos verify PR3/PR4 CRITICAL finding). node-postgres/TypeORM
  // already hydrate a `date`-typed column back into a "YYYY-MM-DD" string
  // (TypeORM's DateUtils.mixedDateToDateString extracts LOCAL Date getters
  // from the driver's already-local-midnight-parsed Date, so reads are
  // stable regardless of host TZ). The corruption only happened on WRITE:
  // wrapping the DTO's date-only ISO string in `new Date(...)` parses it as
  // UTC midnight (per the JS spec), and TypeORM's persist path then reads
  // LOCAL getters off that UTC instant — on any host with a negative UTC
  // offset (e.g. America/Lima, UTC-5) that rolls the date back one day
  // (and across a year boundary on Jan 1st). Assigning the validated
  // ISO date-only string straight through (see PaymentService.pay) skips
  // Date-object construction entirely and removes the TZ round-trip.
  @Column({ type: 'date', nullable: true })
  paidDate: string | null;
}
