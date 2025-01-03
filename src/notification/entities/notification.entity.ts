import { Enrollment } from "src/enrollment/entities/enrollment.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ length: 100 })
  description: string;
  id_enrollment: number;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => Enrollment, (enrollment) => enrollment.notifications)
  @JoinColumn({ name: 'id_enrollment' })
  enrollment: Enrollment;

}
