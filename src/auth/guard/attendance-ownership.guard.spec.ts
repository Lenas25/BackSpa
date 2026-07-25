import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceOwnershipGuard } from './attendance-ownership.guard';
import { Role } from 'src/common/enums/role.enum';

describe('AttendanceOwnershipGuard', () => {
  let sectionRepository: { findOne: jest.Mock };
  let attendanceDayRepository: { findOne: jest.Mock };
  let guard: AttendanceOwnershipGuard;

  const buildContext = (
    user: unknown,
    { body, params }: { body?: Record<string, unknown>; params?: Record<string, unknown> } = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          body: body ?? {},
          params: params ?? {},
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    sectionRepository = { findOne: jest.fn() };
    attendanceDayRepository = { findOne: jest.fn() };
    guard = new AttendanceOwnershipGuard(
      sectionRepository as never,
      attendanceDayRepository as never,
    );
  });

  it('allows ADMIN unconditionally, without resolving a section', async () => {
    const context = buildContext(
      { role: Role.ADMIN, id: 'admin-1' },
      { body: { sectionId: 5 } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sectionRepository.findOne).not.toHaveBeenCalled();
  });

  it('denies an ALUMNO outright', async () => {
    const context = buildContext(
      { role: Role.ALUMNO, id: 'student-1' },
      { body: { sectionId: 5 } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('resolving the section id from request.body.sectionId (POST /attendance/day)', () => {
    it('allows a TUTOR assigned to the section', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-own' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { body: { sectionId: 5 } },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(sectionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 5 },
        relations: ['tutor'],
      });
    });

    it('denies a TUTOR not assigned to the section', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-other' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { body: { sectionId: 5 } },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('resolving the section id via AttendanceDay (PATCH/DELETE .../:dayId)', () => {
    it('allows a TUTOR who owns the day\'s section', async () => {
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 5 },
      });
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-own' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { dayId: 1 } },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(attendanceDayRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['section'],
      });
    });

    it('denies a TUTOR not assigned to the day\'s section', async () => {
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 5 },
      });
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-other' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { dayId: 1 } },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when the attendance day does not exist', async () => {
      attendanceDayRepository.findOne.mockResolvedValue(null);
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { dayId: 999 } },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    // IDOR regression (Finding 1): a TUTOR who owns section A cannot spoof
    // body.sectionId=A to bypass ownership on a dayId that actually belongs
    // to section B. The route's real target is the dayId, so the section
    // MUST be resolved from the day and body.sectionId must be ignored,
    // even when both are present on the request.
    it('denies a TUTOR when body.sectionId (owned) is spoofed alongside a dayId belonging to a DIFFERENT section', async () => {
      // dayId 1 really belongs to section 5, owned by 'tutor-other'.
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 5 },
      });
      // section 6 is owned by the caller ('tutor-own') — this is the
      // spoofed body.sectionId. If the guard ever resolves against it
      // instead of the day's real section, this mock would let it through.
      sectionRepository.findOne.mockImplementation(({ where: { id } }) =>
        Promise.resolve(
          id === 5
            ? { id: 5, tutor: { id: 'tutor-other' } }
            : { id: 6, tutor: { id: 'tutor-own' } },
        ),
      );
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { dayId: 1 }, body: { sectionId: 6 } },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      expect(sectionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 5 },
        relations: ['tutor'],
      });
    });
  });

  describe('resolving the section id from request.params.sectionId (GET /attendance/section/:sectionId, GET /attendance/metrics/section/:sectionId)', () => {
    it('allows a TUTOR assigned to the section', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-own' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { sectionId: 5 } },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(sectionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 5 },
        relations: ['tutor'],
      });
    });

    it('denies a TUTOR not assigned to the section', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: 5,
        tutor: { id: 'tutor-other' },
      });
      const context = buildContext(
        { role: Role.TUTOR, id: 'tutor-own' },
        { params: { sectionId: 5 } },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('throws NotFoundException when the resolved section does not exist', async () => {
    const context = buildContext(
      { role: Role.TUTOR, id: 'tutor-own' },
      { body: { sectionId: 999 } },
    );
    sectionRepository.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('denies a TUTOR when neither a section id nor a dayId can be resolved', async () => {
    const context = buildContext({ role: Role.TUTOR, id: 'tutor-own' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
