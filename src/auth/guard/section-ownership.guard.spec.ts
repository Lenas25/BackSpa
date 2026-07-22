import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SectionOwnershipGuard } from './section-ownership.guard';
import { Role } from 'src/common/enums/role.enum';

// Role-Based Section Access (spec: "tutor-scoping" domain) — ADMIN has full
// access to Sections; TUTOR has read-only access limited to their own
// Sections; any other role attempting id-keyed Section access is denied.
describe('SectionOwnershipGuard', () => {
  let sectionRepository: { findOne: jest.Mock };
  let guard: SectionOwnershipGuard;

  const buildContext = (user: unknown, sectionId: unknown = 5): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { id: sectionId },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    sectionRepository = { findOne: jest.fn() };
    guard = new SectionOwnershipGuard(sectionRepository as never);
  });

  it('allows ADMIN unconditionally, without querying the section', async () => {
    const context = buildContext({ role: Role.ADMIN, id: 'admin-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sectionRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows a TUTOR assigned to the requested section', async () => {
    sectionRepository.findOne.mockResolvedValue({ id: 5, tutor: { id: 'tutor-own' } });
    const context = buildContext({ role: Role.TUTOR, id: 'tutor-own' }, 5);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sectionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 5 },
      relations: ['tutor'],
    });
  });

  it('denies a TUTOR not assigned to the requested section', async () => {
    sectionRepository.findOne.mockResolvedValue({ id: 5, tutor: { id: 'tutor-other' } });
    const context = buildContext({ role: Role.TUTOR, id: 'tutor-own' }, 5);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('denies a TUTOR when the section has no assigned tutor at all', async () => {
    sectionRepository.findOne.mockResolvedValue({ id: 5, tutor: null });
    const context = buildContext({ role: Role.TUTOR, id: 'tutor-own' }, 5);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the section does not exist', async () => {
    sectionRepository.findOne.mockResolvedValue(null);
    const context = buildContext({ role: Role.TUTOR, id: 'tutor-own' }, 999);

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('denies an ALUMNO from id-keyed section access', async () => {
    const context = buildContext({ role: Role.ALUMNO, id: 'student-1' }, 5);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(sectionRepository.findOne).not.toHaveBeenCalled();
  });
});
