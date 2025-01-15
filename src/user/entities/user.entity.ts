import { MinLength } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: string;
  @Column({ length: 100 })
  name: string;
  @Column({ length: 100 })
  lastName: string;
  @Column({ unique: true, length: 60 })
  username: string;
  @Column()
  password: string;
  @Column({ type: 'enum', enum: Role, default: Role.ALUMNO })
  role: Role;
  @Column({ length: 20, nullable: true })
  phone: string;
  @Column({ unique: true, length: 60 })
  email: string;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;


  @OneToMany(() => Enrollment, (enrollments) => enrollments.user)
  enrollments: Enrollment[];

}