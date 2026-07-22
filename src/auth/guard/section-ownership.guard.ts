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
import { Role } from 'src/common/enums/role.enum';

// Role-Based Section Access (spec: "tutor-scoping" domain) — ADMIN has full
// access to Sections; TUTOR access is limited to Sections they are assigned
// to. Applied to id-keyed `/section/:id*` routes; list-level scoping
// (`GET /section`) is handled separately at the service level, since there
// is no route param to check ownership against there.
@Injectable()
export class SectionOwnershipGuard implements CanActivate {
  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
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

    const sectionId = Number(request.params?.id);

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
}
