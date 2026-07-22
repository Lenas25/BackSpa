import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Res } from '@nestjs/common';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { Section } from 'src/section/entities/section.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Enrollment } from './entities/enrollment.entity';
import { Role } from 'src/common/enums/role.enum';
import type { RequestingUser } from 'src/section/section.service';

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
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

          await this.enrollmentRepository.save(newEnrollment);
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


  async finishSection(id: number) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        }
      });
      const enrollments = await this.enrollmentRepository.find({
        where: {
          active: true,
          section:{
            id: section.id
          }
        }
      });

      for (const enrollment of enrollments) {
        enrollment.active = false;
        await this.enrollmentRepository.save(enrollment);
      }

      section.isActive = false;
      await this.sectionRepository.save(section);
      return enrollments;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }


}