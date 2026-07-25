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

// Role-Based Section Access for Attendance mutations AND reads — same
// ADMIN-bypass / TUTOR-must-own-the-section shape as SectionOwnershipGuard
// (src/auth/guard/section-ownership.guard.ts). SectionOwnershipGuard itself
// is NOT reused unmodified here because it only ever reads a section id off
// `request.params.id`, and Attendance's section-scoped routes carry the
// section id in different places depending on the route:
//   - POST   /attendance/day                 -> request.body.sectionId
//   - PATCH  /attendance/day/:dayId          -> resolved via AttendanceDay -> section
//   - DELETE /attendance/day/:dayId          -> resolved via AttendanceDay -> section
//   - GET    /attendance/day/:dayId          -> resolved via AttendanceDay -> section
//   - GET    /attendance/section/:sectionId  -> request.params.sectionId
//   - GET    /attendance/metrics/section/:sectionId -> request.params.sectionId
//
// SECURITY (fixed IDOR, was CRITICAL): resolution is keyed on the ACTUAL
// resource of the route, never "trust body first". `params.dayId` is
// checked FIRST and, when present, is the ONLY source of truth — body's
// sectionId is ignored entirely on those routes. A caller could otherwise
// spoof `body.sectionId` to a section they own while `:dayId` in the path
// pointed at a different tutor's day, mutating or deleting data outside
// their scope. `params.sectionId` (path param, read-only routes) is
// resolved next, ahead of `body.sectionId`, since path params on a GET
// can't be tampered with independently of the resource being requested.
// `body.sectionId` is trusted last, only for the creation route
// (POST /attendance/day) which has no existing resource to key off.
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
    params?: { dayId?: unknown; sectionId?: unknown };
  }): Promise<number> {
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

    if (request.params?.sectionId) {
      return Number(request.params.sectionId);
    }

    if (request.body?.sectionId) {
      return Number(request.body.sectionId);
    }

    throw new ForbiddenException('No tiene acceso a esta sección');
  }
}
