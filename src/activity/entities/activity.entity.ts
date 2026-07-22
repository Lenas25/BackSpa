import { Exclude } from "class-transformer";
import { Section } from "src/section/entities/section.entity";
import { Grade } from "src/grade/entities/grade.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;
  // precision 5 (not 4): numeric(4,2) tops out at 99.99, which cannot store
  // a single activity weighted at exactly 100% — a valid case per the
  // "Activity Percentage Validation" spec requirement. See migration
  // WidenActivityPercentagePrecision1737504100000.
  @Column({ type: 'decimal', nullable: true, precision: 5, scale: 2 })
  percentage: number;


  @ManyToOne(() => Section, (section) => section.activities, { onDelete: 'CASCADE' , onUpdate: 'CASCADE'})
  @JoinColumn({ name: 'id_course' })
  @Exclude({ toPlainOnly: true })
  section: Section;
  
  @OneToMany(() => Grade, (grades) => grades.activity, {onDelete: 'CASCADE', onUpdate: 'CASCADE'})
  grades: Grade[];

}
