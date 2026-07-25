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
