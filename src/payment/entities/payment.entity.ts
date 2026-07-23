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

  @Column({ type: 'date', nullable: true })
  paidDate: Date | null;
}
