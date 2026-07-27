import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Section } from 'src/section/entities/section.entity';
import { Attendance } from './attendance.entity';

// AttendanceDay is a per-section, per-calendar-day roster header. One row
// per (section, date); Attendance rows are its per-enrollment child rows —
// mirrors Payment's parent/child shape (per-enrollment child rows generated
// from a parent, see src/payment/entities/payment.entity.ts). Locked
// product decisions (sdd/asistencia/decisions): no retroactive backfill,
// all-present default on creation, additive-only guarded migration.
@Entity()
@Unique(['section', 'date'])
export class AttendanceDay {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Section, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'id_section' })
  section: Section;

  // Typed as a plain "YYYY-MM-DD" string, NOT `Date`, on purpose (same
  // lesson as Payment.paidDate — see payment.entity.ts's comment on that
  // field for the full root-cause trace). Never wrap this in
  // `new Date(...)` on read or write: node-postgres/TypeORM already
  // hydrate a `date`-typed column back into a "YYYY-MM-DD" string, and
  // constructing a `Date` from a date-only ISO string parses it as UTC
  // midnight, which rolls the date back a day on any host west of UTC
  // (e.g. America/Lima, UTC-5) once TypeORM reads LOCAL getters off it.
  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @OneToMany(() => Attendance, (attendance) => attendance.day)
  attendances: Attendance[];
}
