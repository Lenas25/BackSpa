import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Res } from '@nestjs/common';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { Section } from 'src/section/entities/section.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Enrollment } from './entities/enrollment.entity';
import { Role } from 'src/common/enums/role.enum';
import type { RequestingUser } from 'src/section/section.service';
import { PaymentService } from 'src/payment/payment.service';
import { Grade } from 'src/grade/entities/grade.entity';
import { Activity } from 'src/activity/entities/activity.entity';
import { Notification } from 'src/notification/entities/notification.entity';

// Finalizar / Reabrir sección — business rule: the passing grade for the
// finish-section verdict is 15 on the 0-20 scale. This is DELIBERATELY a
// separate constant from institution-config.minApproving: that one gates
// whether a "constancia" (certificate) can be issued and is admin-editable;
// this one is the fixed APROBADO/DESAPROBADO cut used only for the
// finish-notification verdict.
const PASSING_GRADE = 15;

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(Grade)
    private readonly gradeRepository: Repository<Grade>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly paymentService: PaymentService,
  ) { }

  // Role-Based Section Access (spec: "tutor-scoping" domain) — TUTOR is
  // limited to enrollments of Sections they own when listing; ADMIN (or
  // callers with no user context, e.g. internal use) see every enrollment.
  async findAll(requestingUser?: RequestingUser) {
    if (requestingUser?.role === Role.TUTOR) {
      return await this.enrollmentRepository.find({
        where: { section: { tutor: { id: requestingUser.id } } },
      });
    }
    return await this.enrollmentRepository.find(undefined);
  }

  // Alumno sees own data only (spec: "tutor-scoping" domain) — an ALUMNO
  // may only fetch their own enrollments, never another student's.
  async findOneByUser(id: string, requestingUser?: RequestingUser) {
    if (requestingUser?.role === Role.ALUMNO && requestingUser.id !== id) {
      throw new ForbiddenException('No tiene acceso a los datos de este usuario');
    }

    try {
      const user = await this.userRepository.findOne({
        where: {
          id
        }
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }
      const enrollment = await this.enrollmentRepository.find({
        where: {
          user :{
            id: user.id
          }
        },
        relations: ['section', 'user', 'section.course']
      });
      if (!enrollment) {
        throw new NotFoundException('Matrícula no encontrada');
      }
      return enrollment;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async findOneBySection(id: number) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        }
      });
      if (!section) {
        throw new NotFoundException('Sección no encontrada');
      }
      const enrollment = await this.enrollmentRepository.find({
        where: {
          section: {
            id: section.id
          },
          active: true
        }
      });
      if (!enrollment) {
        throw new NotFoundException('Matrícula no encontrada');
      }
      return enrollment;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async update(id: number, updateEnrollmentDto: UpdateEnrollmentDto) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        }
      });
      if (!section) {
        throw new NotFoundException('Sección no encontrada');
      }

      const currentEnrollments = await this.enrollmentRepository.find({
        where: {
          section: {
            id: section.id
          }
        },
        relations: ['user'],
      });

      // Duplicate Enrollment Rejection (spec: "section-enrollment" domain):
      // dedupe the incoming payload itself first (a caller submitting the
      // same user id twice must never create two enrollment rows for the
      // same section), then exclude anyone already enrolled in this section.
      const uniqueIncomingUsers = Array.from(
        new Map(updateEnrollmentDto.users.map((user) => [user.id, user])).values(),
      );

      const usersToAdd = uniqueIncomingUsers.filter(
        (newUser) => !currentEnrollments.some((enrollment) => enrollment.user.id === newUser.id)
      );

      const enrollmentsToRemove = currentEnrollments.filter(
        (enrollment) => !uniqueIncomingUsers.some((newUser) => newUser.id === enrollment.user.id)
      );

      for (const userToAdd of usersToAdd) {
        const user = await this.userRepository.findOne({
          where: {
            id: userToAdd.id
          }
        });

        if (user) {
          const newEnrollment = this.enrollmentRepository.create({
            ...updateEnrollmentDto,
            user,
            section,
            active: true
          });

          const savedEnrollment =
            await this.enrollmentRepository.save(newEnrollment);

          // Auto-Generation on Enrollment (design ADR "Lifecycle Rules" —
          // sdd/pagos/design): fires once per NEWLY enrolled student only,
          // post-dedupe. PaymentService itself skips null/0 counts.
          await this.paymentService.generateForEnrollment(
            savedEnrollment,
            section.installmentsCount,
          );
        }
      }

      for (const enrollmentToRemove of enrollmentsToRemove) {
        await this.enrollmentRepository.delete(enrollmentToRemove);
      }

      for (const enrollment of currentEnrollments) {
        if (uniqueIncomingUsers.some((newUser) => newUser.id === enrollment.user.id)) {
          enrollment.active = true;
          await this.enrollmentRepository.save(enrollment);
        }
      }

      return await this.enrollmentRepository.find({
        where: {
          section: {
            id: section.id
          }
        },
        relations: ['user']
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }


  // Finalizar sección (manual, admin-only). Client rules: finishing does
  // NOT lock editing (section stays editable), has NO completeness
  // requirement (a student with missing grades is simply DESAPROBADO), and
  // is reversible via reopenSection. Only flags are flipped — no row is
  // ever deleted or purged.
  async finishSection(id: number) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        },
        relations: ['course'],
      });
      const enrollments = await this.enrollmentRepository.find({
        where: {
          active: true,
          section:{
            id: section.id
          }
        }
      });

      // Weighted-average percentage map, built once for the whole section —
      // SAME formula as GradeService.recalculateFinalGrade / reportBySection
      // (Σ(nota×pct) / Σ(pct de actividades calificadas)). We deliberately
      // recompute from grades here instead of trusting enrollment.final_grade,
      // which is not guaranteed to be fresh while the section is active.
      const activities = await this.activityRepository.find({
        where: { section: { id: section.id } },
      });
      const activityPercentageMap = new Map<number, number>();
      activities.forEach((activity) => {
        activityPercentageMap.set(activity.id, Number(activity.percentage));
      });

      const courseName = section.course?.name ?? '';

      for (const enrollment of enrollments) {
        enrollment.active = false;
        await this.enrollmentRepository.save(enrollment);

        // Notify on finish: one Notification per finished student with the
        // APROBADO/DESAPROBADO verdict at the PASSING_GRADE boundary.
        const { average, verdict } = await this.computeFinalVerdict(
          enrollment.id,
          activityPercentageMap,
        );

        // description column is varchar(100) — truncate defensively so a
        // long course/section name can never fail the insert.
        const description = `El curso ${courseName} — ${section.name} finalizó. Tu nota final: ${average.toFixed(2)} (${verdict}).`.slice(0, 100);

        const notification = this.notificationRepository.create({
          description,
          enrollment,
        });
        await this.notificationRepository.save(notification);
      }

      section.isActive = false;
      await this.sectionRepository.save(section);
      return enrollments;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  // Reabrir sección — the inverse of finishSection. Reactivates every
  // enrollment of the section and flips the section back to isActive=true.
  // No data is deleted or recreated; existing grades/notifications are left
  // untouched.
  async reopenSection(id: number) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        }
      });
      const enrollments = await this.enrollmentRepository.find({
        where: {
          section: {
            id: section.id
          }
        }
      });

      for (const enrollment of enrollments) {
        enrollment.active = true;
        await this.enrollmentRepository.save(enrollment);
      }

      section.isActive = true;
      await this.sectionRepository.save(section);
      return enrollments;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  // Weighted average per enrollment, same formula as
  // GradeService.recalculateFinalGrade: only graded activities contribute,
  // both to the weighted sum and to the total weight. No graded activities
  // (or zero total weight) => average 0 => DESAPROBADO.
  private async computeFinalVerdict(
    enrollmentId: number,
    activityPercentageMap: Map<number, number>,
  ): Promise<{ average: number; verdict: 'APROBADO' | 'DESAPROBADO' }> {
    const grades = await this.gradeRepository.find({
      where: { id_enrollment: enrollmentId },
    });

    let weightedSum = 0;
    let totalWeight = 0;
    for (const grade of grades) {
      const percentage = activityPercentageMap.get(grade.id_activity);
      if (percentage) {
        weightedSum += Number(grade.grade) * percentage;
        totalWeight += percentage;
      }
    }

    const average = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;
    const verdict: 'APROBADO' | 'DESAPROBADO' =
      average >= PASSING_GRADE ? 'APROBADO' : 'DESAPROBADO';

    return { average, verdict };
  }

}