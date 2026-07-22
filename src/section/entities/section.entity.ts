import { Exclude } from "class-transformer";
import { Activity } from "src/activity/entities/activity.entity";
import { Course } from "src/course/entities/course.entity";
import { Enrollment } from "src/enrollment/entities/enrollment.entity";
import { User } from "src/user/entities/user.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Section {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: "varchar", length: 100 })
  name: string;
  @Column({ type: "date" })
  initialDate: Date;
  @Column({ type: "date" })
  endDate: Date;
  @Column({ type: "int" })
  duration: number;
  @Column({ type: "int", nullable: true })
  installmentsCount: number;
  @Column({ type: "boolean", default: true })
  isActive: boolean;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;


  @ManyToOne(() => Course, (course) => course.sections, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'id_course' })
  course: Course;

  @OneToMany(() => Enrollment, (enrollments) => enrollments.section)
  enrollments: Enrollment[];

  @OneToMany(() => Activity, (activities) => activities.section)
  activities: Activity[];

  @ManyToOne(() => User, (user) => user.sections)
  @JoinColumn({ name: 'id_tutor' })
  tutor: User;
}
