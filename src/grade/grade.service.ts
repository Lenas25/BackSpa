import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Grade } from './entities/grade.entity';
import { Repository } from 'typeorm';
import { Activity } from 'src/activity/entities/activity.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Course } from 'src/course/entities/course.entity';

@Injectable()
export class GradeService {
  private readonly logger = new Logger(GradeService.name);

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
          id,
        },
      });
      if (!activity) {
        throw new BadRequestException("La actividad no existe");
      }
  
      const grades = await this.gradeRepository.find({
        where: {
          id_activity: id,
        },
        relations: ['enrollment'],
      });
  
      const activeGrades = grades.filter(grade => grade.enrollment.active);
  
      return activeGrades;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async update(courseId: number, updateGradeDto: UpdateGradeDto) {
    try {
      const { id_activity, grades } = updateGradeDto;

      // 1. Validar que el curso y la actividad existan
      const course = await this.courseRepository.findOne({
        where: { id: courseId },
      });
      if (!course) {
        throw new BadRequestException('El curso no existe');
      }

      const activity = await this.activityRepository.findOne({
        where: { id: id_activity, course: { id: courseId } },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad no existe o no pertenece a este curso',
        );
      }

      // 2. Guardar todas las notas (crear o actualizar)
      // Usamos un Set para guardar los IDs de las matrículas que modificamos
      const affectedEnrollmentIds = new Set<number>();

      for (const gradeDto of grades) {
        const { id_enrollment, grade } = gradeDto;

        // Validar que la matrícula pertenezca al curso
        const enrollment = await this.enrollmentRepository.findOne({
          where: { id: id_enrollment, course: { id: courseId } },
        });

        // Si la matrícula no existe o no es de este curso, la saltamos.
        if (!enrollment) {
          this.logger.warn(
            `Matrícula ${id_enrollment} no encontrada para curso ${courseId}. Saltando.`,
          );
          continue;
        }

        // Buscar si ya existe una nota (Upsert)
        let gradeEntity = await this.gradeRepository.findOne({
          where: { id_activity, id_enrollment },
        });

        if (gradeEntity) {
          // Actualizar nota existente
          gradeEntity.grade = grade;
          await this.gradeRepository.save(gradeEntity);
        } else {
          // Crear nueva nota
          const newGrade = this.gradeRepository.create({
            id_activity,
            id_enrollment,
            grade,
          });
          await this.gradeRepository.save(newGrade);
        }

        // Marcar esta matrícula para recalcular su nota final
        affectedEnrollmentIds.add(id_enrollment);
      }

      // 3. Recalcular la nota final para cada estudiante afectado
      this.logger.log(
        `Recalculando notas finales para ${affectedEnrollmentIds.size} estudiantes...`,
      );
      for (const enrollmentId of affectedEnrollmentIds) {
        await this.recalculateFinalGrade(enrollmentId);
      }

      // 4. Devolver las notas actualizadas de esta actividad (como en tu lógica original)
      return await this.gradeRepository.find({
        where: { id_activity },
      });
    } catch (e) {
      this.logger.error(`Error en update: ${e.message}`, e.stack);
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Recalcula la nota final para una matrícula específica basándose en TODAS
   * sus notas y los porcentajes de las actividades del curso.
   * @param enrollmentId - El ID de la matrícula a recalcular.
   */
  private async recalculateFinalGrade(enrollmentId: number) {
    try {
      // 1. Obtener la matrícula y el ID de su curso
      const enrollment = await this.enrollmentRepository.findOne({
        where: { id: enrollmentId },
        relations: ['course'],
      });

      if (!enrollment || !enrollment.course) {
        throw new Error(
          `Matrícula o curso asociado no encontrado para ID ${enrollmentId}`,
        );
      }

      const courseId = enrollment.course.id;

      // 2. Obtener TODAS las notas de esta matrícula
      const allGrades = await this.gradeRepository.find({
        where: { id_enrollment: enrollmentId },
      });

      // 3. Obtener TODAS las actividades de este curso
      const allActivities = await this.activityRepository.find({
        where: { course: { id: courseId } },
      });

      // 4. Mapear actividades por ID para fácil acceso a su porcentaje
      const activityPercentageMap = new Map<number, number>();
      allActivities.forEach((act) => {
        activityPercentageMap.set(act.id, Number(act.percentage));
      });

      // 5. Calcular la nueva nota final
      let newFinalGrade = 0;
      for (const grade of allGrades) {
        const percentage = activityPercentageMap.get(grade.id_activity);

        if (percentage) {
          newFinalGrade += Number(grade.grade) * percentage;
        } else {
          // Esto puede pasar si se eliminó una actividad pero la nota persiste
          this.logger.warn(
            `Actividad ${grade.id_activity} no encontrada para cálculo de nota. Saltando.`,
          );
        }
      }

      // 6. Actualizar la nota final en la matrícula (redondeando a 2 decimales)
      enrollment.final_grade = Number(newFinalGrade.toFixed(2));
      await this.enrollmentRepository.save(enrollment);

      this.logger.log(
        `Nota final para matrícula ${enrollmentId} actualizada a: ${enrollment.final_grade}`,
      );
    } catch (error) {
      // Loguear el error pero no detener el proceso de otros estudiantes
      this.logger.error(
        `Fallo al recalcular nota final para matrícula ${enrollmentId}: ${error.message}`,
        error.stack,
      );
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
          enrollment:{
            id,
          },
        },
        relations: ['activity']
      });
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
