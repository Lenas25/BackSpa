import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AttendanceDay } from './attendance-day.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

// Attendance is the per-enrollment child row of an AttendanceDay (mirrors
// Payment's per-installment child row off Enrollment). One row per
// (day, enrollment). No-backfill rule (locked decision,
// sdd/asistencia/decisions): AttendanceService.createDay only inserts a row
// here for enrollments that were ACTIVE at the moment the day was created —
// a late-enrolling student is never retroactively added to past days, so
// their attendance % denominator (AttendanceService.metricsBySection) is
// only the days they actually have a row for.
@Entity()
@Unique(['day', 'enrollment'])
export class Attendance {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AttendanceDay, (day) => day.attendances, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'id_attendance_day' })
  day: AttendanceDay;

  @ManyToOne(() => Enrollment, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'id_enrollment' })
  enrollment: Enrollment;

  @Column({ type: 'boolean', default: true })
  present: boolean;
}
