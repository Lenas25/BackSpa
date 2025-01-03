import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Course } from 'src/course/entities/course.entity';
import { Grade } from 'src/grade/entities/grade.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { Transform } from 'class-transformer';

@Entity()
export class Enrollment {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  @Transform(({ value }) => Number.parseFloat(value))
  final_grade: number;
  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  enrollment_date: Date;
  @Column({type: 'boolean', default: true, nullable: true})
  active: boolean;


  @ManyToOne(() => User, (user) => user.enrollments,{
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: true
  })
  @JoinColumn({ name: 'id_user' })
  user?: User;

  @ManyToOne(() => Course, (course) => course.enrollments,{
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    eager: true
  })
  @JoinColumn({ name: 'id_course' })
  course: Course;

  @OneToMany(() => Grade, (grades) => grades.enrollment)
  grades: Grade[];
  
  @OneToMany(() => Notification, (notifications) => notifications.enrollment)
  notifications: Notification[];
}
