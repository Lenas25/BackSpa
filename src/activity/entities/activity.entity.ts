import { Exclude } from "class-transformer";
import { Course } from "src/course/entities/course.entity";
import { Grade } from "src/grade/entities/grade.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;
  @Column({ type: 'decimal', nullable: true, precision: 4, scale: 2 })
  percentage: number;


  @ManyToOne(() => Course, (course) => course.activities, { onDelete: 'CASCADE' , onUpdate: 'CASCADE'})
  @JoinColumn({ name: 'id_course' })
  @Exclude({ toPlainOnly: true })
  course: Course;
  
  @OneToMany(() => Grade, (grades) => grades.activity, {onDelete: 'CASCADE', onUpdate: 'CASCADE'})
  grades: Grade[];

}
