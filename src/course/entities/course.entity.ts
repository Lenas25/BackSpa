import { Exclude } from "class-transformer";
import { Activity } from "src/activity/entities/activity.entity";
import { Enrollment } from "src/enrollment/entities/enrollment.entity";
import { User } from "src/user/entities/user.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Course {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: "varchar", length: 100 })
  name: string;
  @Column({ type: "text", nullable: true })
  description: string;
  @Column({ type: "varchar", length: 255 })
  imageUrl: string;
  @Column({ type: "date" })
  initialDate: Date;
  @Column({ type: "date" })
  endDate: Date;
  @Column({ type: "int" })
  duration: number;
  @Column({ type: "boolean", default: true })
  isActive: boolean;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;


  @OneToMany(() => Enrollment, (enrollments) => enrollments.course)
  enrollments: Enrollment[];

  @OneToMany(() => Activity, (activities) => activities.course)
  activities: Activity[];

  @ManyToOne(() => User, (user) => user.courses)
  @JoinColumn({ name: 'id_tutor' })
  tutor: User;
}
