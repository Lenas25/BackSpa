
import { Activity } from 'src/activity/entities/activity.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { User } from 'src/user/entities/user.entity';
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity() 
export class Grade {
  @PrimaryColumn()
  id_enrollment: number; 
  @PrimaryColumn()
  id_activity: number; 
  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: false, default:0 })
  grade: number;


  @ManyToOne(() => Enrollment, (enrollment) => enrollment.grades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_enrollment' })
  enrollment: Enrollment;

  @ManyToOne(() => Activity, (activity) => activity.grades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;
}
