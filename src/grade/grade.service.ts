import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Grade } from './entities/grade.entity';
import { Repository } from 'typeorm';
import { Activity } from 'src/activity/entities/activity.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Course } from 'src/course/entities/course.entity';

@Injectable()
export class GradeService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Grade)
    private readonly gradeRepository: Repository<Grade>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
  ) { }


  async findOne(id: number) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id
        }
      });
      if (!activity) {
        throw new BadRequestException("La actividad no existe");
      }
      return await this.gradeRepository.find({
        where: {
          id_activity: id
        },
        relations: ['enrollment']
      });
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async update(id: number, updateGradeDto: UpdateGradeDto) {
    try {
      const course = await this.courseRepository.findOne({
        where: {
          id
        }
      });
      if (!course) {
        throw new BadRequestException("El curso no existe");
      }

      const activity = await this.activityRepository.findOne({
        where: {
          id: updateGradeDto.id_activity
        }
      });
      if (!activity) {
        throw new BadRequestException("La actividad no existe");
      }

      for (const grade of updateGradeDto.grades) {
        const enrollment = await this.enrollmentRepository.findOne({
          where: {
            id: grade.id_enrollment,
            course
          }
        })
        if (!enrollment) {
          continue;
        }

        const gradeEntity = await this.gradeRepository.findOne({
          where: {
            id_activity: updateGradeDto.id_activity,
            id_enrollment: grade.id_enrollment
          }
        });

        const activitySearch = await this.activityRepository.findOne({
          where: {
            id: updateGradeDto.id_activity
          }
        });
        
        if (gradeEntity) {
          const restado = enrollment.final_grade - (Number(gradeEntity.grade) * Number(activitySearch.percentage));
          enrollment.final_grade = restado + (Number(grade.grade) * Number(activitySearch.percentage));
          await this.enrollmentRepository.save(enrollment);
          gradeEntity.grade = grade.grade;
          await this.gradeRepository.save(gradeEntity);
        } else {
          const newGrade = this.gradeRepository.create({
            id_activity: activity.id,
            id_enrollment: grade.id_enrollment,
            grade: grade.grade
          });

          enrollment.final_grade = Number(enrollment.final_grade) + (Number(grade.grade) * Number(activitySearch.percentage));
          await this.enrollmentRepository.save(enrollment);
          await this.gradeRepository.save(newGrade);
        }

      }

      return await this.gradeRepository.find({
        where: {
          id_activity: updateGradeDto.id_activity
        }
      });

    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async findByEnrollment(id: number) {
    try {
      const enrollment = await this.enrollmentRepository.findOne({
        where: {
          id
        }
      });
      if (!enrollment) {
        throw new BadRequestException("La matricula no existe");
      }
      return await this.gradeRepository.find({
        where: {
          enrollment
        },
        relations: ['activity']
      });
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
