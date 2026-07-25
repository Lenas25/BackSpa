import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from 'src/section/entities/section.entity';
import { AttendanceDay } from 'src/attendance/entities/attendance-day.entity';
import { Role } from 'src/common/enums/role.enum';

// Role-Based Section Access for Attendance mutations — same ADMIN-bypass /
// TUTOR-must-own-the-section shape as SectionOwnershipGuard
// (src/auth/guard/section-ownership.guard.ts). SectionOwnershipGuard itself
// is NOT reused unmodified here because it only ever reads a section id off
// `request.params.id`, and Attendance's section-scoped mutations carry the
// section id in different places depending on the route:
//   - POST   /attendance/day          -> request.body.sectionId
//   - PATCH  /attendance/day/:dayId   -> resolved via AttendanceDay -> section
//   - DELETE /attendance/day/:dayId   -> resolved via AttendanceDay -> section
// Read routes (GET /attendance/section/:sectionId,
// GET /attendance/day/:dayId, GET /attendance/metrics/section/:sectionId)
// intentionally do NOT use this guard, mirroring GradeController's own
// precedent: SectionOwnershipGuard there is applied only to the mutating
// PATCH, not to its GET reads.
@Injectable()
export class AttendanceOwnershipGuard implements CanActivate {
  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(AttendanceDay)
    private readonly attendanceDayRepository: Repository<AttendanceDay>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.role === Role.ADMIN) {
      return true;
    }

    if (user?.role !== Role.TUTOR) {
      throw new ForbiddenException('No tiene acceso a esta sección');
    }

    const sectionId = await this.resolveSectionId(request);

    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
      relations: ['tutor'],
    });

    if (!section) {
      throw new NotFoundException('Sección no encontrada');
    }

    if (!section.tutor || section.tutor.id !== user.id) {
      throw new ForbiddenException('No tiene acceso a esta sección');
    }

    return true;
  }

  private async resolveSectionId(request: {
    body?: { sectionId?: unknown };
    params?: { dayId?: unknown };
  }): Promise<number> {
    if (request.body?.sectionId) {
      return Number(request.body.sectionId);
    }

    const dayId = Number(request.params?.dayId);
    if (dayId) {
      const day = await this.attendanceDayRepository.findOne({
        where: { id: dayId },
        relations: ['section'],
      });
      if (!day) {
        throw new NotFoundException('El día de asistencia no existe');
      }
      return day.section.id;
    }

    throw new ForbiddenException('No tiene acceso a esta sección');
  }
}
