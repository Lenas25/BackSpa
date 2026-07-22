import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Grade } from './entities/grade.entity';
import { Repository } from 'typeorm';
import { Activity } from 'src/activity/entities/activity.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Section } from 'src/section/entities/section.entity';
import { Role } from 'src/common/enums/role.enum';
import type { RequestingUser } from 'src/section/section.service';

@Injectable()
export class GradeService {
  private readonly logger = new Logger(GradeService.name);

  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(Grade)
    private readonly gradeRepository: Repository<Grade>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
  ) { }


  // Role-Based Section Access (spec: "tutor-scoping" domain) — TUTOR is
  // limited to grades of their own Sections. `id` here is an activity id, so
  // ownership requires a join through the activity's section.
  async findOne(id: number, requestingUser?: RequestingUser) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id,
        },
        relations: ['section', 'section.tutor'],
      });
      if (!activity) {
        throw new BadRequestException("La actividad no existe");
      }

      this.assertSectionOwnership(activity.section, requestingUser);

      const grades = await this.gradeRepository.find({
        where: {
          id_activity: id,
        },
        relations: ['enrollment'],
      });

      const activeGrades = grades.filter(grade => grade.enrollment.active);

      return activeGrades;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  // TUTOR may only read grades/students of Sections they are assigned to;
  // ADMIN (or callers with no user context, e.g. internal use) are
  // unrestricted.
  private assertSectionOwnership(section: Section | undefined, requestingUser?: RequestingUser) {
    if (!requestingUser || requestingUser.role !== Role.TUTOR) {
      return;
    }
    if (!section?.tutor || section.tutor.id !== requestingUser.id) {
      throw new ForbiddenException('No tiene acceso a los datos de esta sección');
    }
  }

  // Enrollment-keyed reads add one more case on top of assertSectionOwnership:
  // Alumno sees own data only (spec: "tutor-scoping" domain) — an ALUMNO may
  // only read grades for an enrollment that is actually theirs.
  private assertEnrollmentOwnership(enrollment: Enrollment, requestingUser?: RequestingUser) {
    if (requestingUser?.role === Role.ALUMNO) {
      if (enrollment.user?.id !== requestingUser.id) {
        throw new ForbiddenException('No tiene acceso a los datos de esta matrícula');
      }
      return;
    }
    this.assertSectionOwnership(enrollment.section, requestingUser);
  }

  async update(sectionId: number, updateGradeDto: UpdateGradeDto) {
    try {
      const { id_activity, grades } = updateGradeDto;

      // 1. Validar que la sección y la actividad existan
      const section = await this.sectionRepository.findOne({
        where: { id: sectionId },
      });
      if (!section) {
        throw new BadRequestException('La sección no existe');
      }

      const activity = await this.activityRepository.findOne({
        where: { id: id_activity, section: { id: sectionId } },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad no existe o no pertenece a esta sección',
        );
      }

      // 2. Guardar todas las notas (crear o actualizar)
      // Usamos un Set para guardar los IDs de las matrículas que modificamos
      const affectedEnrollmentIds = new Set<number>();

      for (const gradeDto of grades) {
        const { id_enrollment, grade } = gradeDto;

        // Validar que la matrícula pertenezca a la sección
        const enrollment = await this.enrollmentRepository.findOne({
          where: { id: id_enrollment, section: { id: sectionId } },
        });

        // Si la matrícula no existe o no es de esta sección, la saltamos.
        if (!enrollment) {
          this.logger.warn(
            `Matrícula ${id_enrollment} no encontrada para sección ${sectionId}. Saltando.`,
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
        relations: ['section'],
      });

      if (!enrollment || !enrollment.section) {
        throw new Error(
          `Matrícula o sección asociada no encontrada para ID ${enrollmentId}`,
        );
      }

      const sectionId = enrollment.section.id;

      // 2. Obtener TODAS las notas de esta matrícula
      const allGrades = await this.gradeRepository.find({
        where: { id_enrollment: enrollmentId },
      });

      // 3. Obtener TODAS las actividades de esta sección
      const allActivities = await this.activityRepository.find({
        where: { section: { id: sectionId } },
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


  async findByEnrollment(id: number, requestingUser?: RequestingUser) {
    try {
      const enrollment = await this.enrollmentRepository.findOne({
        where: {
          id
        },
        relations: ['section', 'section.tutor'],
      });
      if (!enrollment) {
        throw new BadRequestException("La matricula no existe");
      }

      this.assertEnrollmentOwnership(enrollment, requestingUser);

      return await this.gradeRepository.find({
        where: {
          enrollment:{
            id,
          },
        },
        relations: ['activity']
      });
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new BadRequestException(e.message);
    }
  }
}
