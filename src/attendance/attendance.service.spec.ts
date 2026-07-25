import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceDay } from './entities/attendance-day.entity';
import { Attendance } from './entities/attendance.entity';
import { Section } from 'src/section/entities/section.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Role } from 'src/common/enums/role.enum';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceDayRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let attendanceRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let sectionRepository: { findOne: jest.Mock };
  let enrollmentRepository: { find: jest.Mock; findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    attendanceDayRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (day) => ({ id: 1, ...day })),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(async (day) => day),
    };
    attendanceRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (rows) => rows),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    sectionRepository = { findOne: jest.fn() };
    enrollmentRepository = { find: jest.fn(), findOne: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getRepositoryToken(AttendanceDay),
          useValue: attendanceDayRepository,
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: attendanceRepository,
        },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add Day + All-Present Default + No-Backfill (locked decisions,
  // sdd/asistencia/decisions).
  describe('createDay', () => {
    const section = { id: 5 } as Section;

    function mockTransaction(activeEnrollments: Enrollment[]) {
      const dayRepo = {
        create: jest.fn((data) => data),
        save: jest.fn(async (day) => ({ id: 1, ...day })),
      };
      const attendanceRepo = {
        create: jest.fn((data) => data),
        save: jest.fn(async (rows) =>
          rows.map((row: any, index: number) => ({ id: index + 1, ...row })),
        ),
      };
      const enrollmentRepo = {
        find: jest.fn().mockResolvedValue(activeEnrollments),
      };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === AttendanceDay) return dayRepo;
          if (entity === Attendance) return attendanceRepo;
          if (entity === Enrollment) return enrollmentRepo;
          throw new Error('unexpected entity requested from manager');
        }),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { dayRepo, attendanceRepo, enrollmentRepo };
    }

    it('creates the day and generates all-present rows for ACTIVE enrollments only', async () => {
      sectionRepository.findOne.mockResolvedValue(section);
      attendanceDayRepository.findOne.mockResolvedValue(null);

      const activeA = {
        id: 10,
        active: true,
        user: { name: 'Ana', lastName: 'Lopez' },
      } as unknown as Enrollment;
      const activeB = {
        id: 11,
        active: true,
        user: { name: 'Beto', lastName: 'Diaz' },
      } as unknown as Enrollment;
      const { attendanceRepo, enrollmentRepo } = mockTransaction([
        activeA,
        activeB,
      ]);

      const result = await service.createDay(5, '2026-07-24');

      expect(enrollmentRepo.find).toHaveBeenCalledWith({
        where: { section: { id: 5 }, active: true },
      });
      expect(attendanceRepo.create).toHaveBeenCalledTimes(2);
      expect(attendanceRepo.create).toHaveBeenNthCalledWith(1, {
        day: expect.objectContaining({ section, date: '2026-07-24' }),
        enrollment: activeA,
        present: true,
      });
      expect(result.date).toBe('2026-07-24');
      expect(result.sectionId).toBe(5);
      expect(result.totalCount).toBe(2);
      expect(result.presentCount).toBe(2);
      expect(result.roster).toEqual([
        { enrollmentId: 10, studentName: 'Ana Lopez', present: true },
        { enrollmentId: 11, studentName: 'Beto Diaz', present: true },
      ]);
    });

    it('creates a day with an empty roster when the section has no active enrollments', async () => {
      sectionRepository.findOne.mockResolvedValue(section);
      attendanceDayRepository.findOne.mockResolvedValue(null);
      mockTransaction([]);

      const result = await service.createDay(5, '2026-07-24');

      expect(result.roster).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.presentCount).toBe(0);
    });

    it('rejects with 409 when a day already exists for this (section, date)', async () => {
      sectionRepository.findOne.mockResolvedValue(section);
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 99,
      } as AttendanceDay);

      await expect(service.createDay(5, '2026-07-24')).rejects.toThrow(
        ConflictException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects when the section does not exist', async () => {
      sectionRepository.findOne.mockResolvedValue(null);

      await expect(service.createDay(999, '2026-07-24')).rejects.toThrow(
        BadRequestException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    // TOCTOU regression (Finding 3): the pre-check above is racy — a
    // concurrent request can pass it and then hit the DB's
    // UNIQUE(section,date) constraint inside the transaction. That must
    // still surface as 409 Conflict, not a raw QueryFailedError (which the
    // controller would otherwise default to 400).
    it('translates a concurrent unique-violation (23505) from the transactional insert into 409 Conflict', async () => {
      sectionRepository.findOne.mockResolvedValue(section);
      attendanceDayRepository.findOne.mockResolvedValue(null); // pre-check sees no row yet

      const uniqueViolation = Object.assign(
        new Error('duplicate key value violates unique constraint'),
        { code: '23505' },
      );
      dataSource.transaction.mockRejectedValue(uniqueViolation);

      await expect(service.createDay(5, '2026-07-24')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findDaysBySection', () => {
    it('returns an empty list when the section has no attendance days', async () => {
      attendanceDayRepository.find.mockResolvedValue([]);

      const result = await service.findDaysBySection(5);

      expect(result).toEqual([]);
      expect(attendanceRepository.find).not.toHaveBeenCalled();
    });

    it('returns days ordered by date with derived present/total counts', async () => {
      const dayA = { id: 1, date: '2026-07-01' } as AttendanceDay;
      const dayB = { id: 2, date: '2026-07-02' } as AttendanceDay;
      attendanceDayRepository.find.mockResolvedValue([dayA, dayB]);
      attendanceRepository.find.mockResolvedValue([
        { id: 100, present: true, day: { id: 1 } },
        { id: 101, present: false, day: { id: 1 } },
        { id: 102, present: true, day: { id: 2 } },
      ] as unknown as Attendance[]);

      const result = await service.findDaysBySection(5);

      expect(attendanceDayRepository.find).toHaveBeenCalledWith({
        where: { section: { id: 5 } },
        order: { date: 'ASC' },
      });
      expect(result).toEqual([
        {
          id: 1,
          sectionId: 5,
          date: '2026-07-01',
          presentCount: 1,
          totalCount: 2,
        },
        {
          id: 2,
          sectionId: 5,
          date: '2026-07-02',
          presentCount: 1,
          totalCount: 1,
        },
      ]);
    });
  });

  describe('findDayRoster', () => {
    it('returns the day plus its per-enrollment present/absent roster', async () => {
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 1,
        date: '2026-07-01',
        section: { id: 5 },
      } as AttendanceDay);
      attendanceRepository.find.mockResolvedValue([
        {
          id: 100,
          present: true,
          enrollment: { id: 10, user: { name: 'Ana', lastName: 'Lopez' } },
        },
        {
          id: 101,
          present: false,
          enrollment: { id: 11, user: { name: 'Beto', lastName: 'Diaz' } },
        },
      ] as unknown as Attendance[]);

      const result = await service.findDayRoster(1);

      expect(result.sectionId).toBe(5);
      expect(result.presentCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.roster).toEqual([
        { enrollmentId: 10, studentName: 'Ana Lopez', present: true },
        { enrollmentId: 11, studentName: 'Beto Diaz', present: false },
      ]);
    });

    // Defensive guard on Enrollment.user shape: some read paths in this
    // codebase can surface a relation as an array rather than a single
    // object; studentName resolution must not throw either way.
    it('resolves studentName even if enrollment.user is unexpectedly an array', async () => {
      attendanceDayRepository.findOne.mockResolvedValue({
        id: 1,
        date: '2026-07-01',
        section: { id: 5 },
      } as AttendanceDay);
      attendanceRepository.find.mockResolvedValue([
        {
          id: 100,
          present: true,
          enrollment: {
            id: 10,
            user: [{ name: 'Ana', lastName: 'Lopez' }],
          },
        },
      ] as unknown as Attendance[]);

      const result = await service.findDayRoster(1);

      expect(result.roster[0].studentName).toBe('Ana Lopez');
    });

    it('rejects when the day does not exist', async () => {
      attendanceDayRepository.findOne.mockResolvedValue(null);

      await expect(service.findDayRoster(999)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // Bulk Day Save (locked decision, sdd/asistencia/decisions).
  describe('updateDay', () => {
    function mockTransaction(existingAttendance: Attendance[]) {
      const attendanceRepo = {
        find: jest.fn().mockResolvedValue(existingAttendance),
        save: jest.fn(async (rows) => rows),
      };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === Attendance) return attendanceRepo;
          throw new Error('unexpected entity requested from manager');
        }),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { attendanceRepo };
    }

    it('bulk toggles present flags for the given enrollmentIds in one transaction', async () => {
      attendanceDayRepository.findOne
        .mockResolvedValueOnce({ id: 1 } as AttendanceDay) // existence check
        .mockResolvedValueOnce({
          id: 1,
          date: '2026-07-01',
          section: { id: 5 },
        } as AttendanceDay); // re-read inside findDayRoster

      const existing = [
        { id: 100, present: true, enrollment: { id: 10 } },
        { id: 101, present: true, enrollment: { id: 11 } },
      ] as unknown as Attendance[];
      const { attendanceRepo } = mockTransaction(existing);

      attendanceRepository.find.mockResolvedValue([
        {
          id: 100,
          present: false,
          enrollment: { id: 10, user: { name: 'Ana', lastName: 'Lopez' } },
        },
        {
          id: 101,
          present: true,
          enrollment: { id: 11, user: { name: 'Beto', lastName: 'Diaz' } },
        },
      ] as unknown as Attendance[]);

      const result = await service.updateDay(1, [
        { enrollmentId: 10, present: false },
      ]);

      expect(attendanceRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ id: 100, present: false }),
      ]);
      expect(
        result.roster.find((row) => row.enrollmentId === 10)?.present,
      ).toBe(false);
    });

    it('ignores enrollmentIds that are not part of this day', async () => {
      attendanceDayRepository.findOne
        .mockResolvedValueOnce({ id: 1 } as AttendanceDay)
        .mockResolvedValueOnce({
          id: 1,
          date: '2026-07-01',
          section: { id: 5 },
        } as AttendanceDay);

      const existing = [
        { id: 100, present: true, enrollment: { id: 10 } },
      ] as unknown as Attendance[];
      const { attendanceRepo } = mockTransaction(existing);
      attendanceRepository.find.mockResolvedValue(existing);

      await service.updateDay(1, [{ enrollmentId: 999, present: false }]);

      expect(attendanceRepo.save).not.toHaveBeenCalled();
    });

    it('rejects updating a day that does not exist', async () => {
      attendanceDayRepository.findOne.mockResolvedValue(null);

      await expect(service.updateDay(999, [])).rejects.toThrow(
        BadRequestException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteDay', () => {
    it('deletes the day (its Attendance rows cascade via the DB FK)', async () => {
      const day = { id: 1 } as AttendanceDay;
      attendanceDayRepository.findOne.mockResolvedValue(day);

      await service.deleteDay(1);

      expect(attendanceDayRepository.remove).toHaveBeenCalledWith(day);
    });

    it('rejects deleting a day that does not exist', async () => {
      attendanceDayRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteDay(999)).rejects.toThrow(
        BadRequestException,
      );
      expect(attendanceDayRepository.remove).not.toHaveBeenCalled();
    });
  });

  // Metrics + No-Backfill Denominator (locked decision,
  // sdd/asistencia/decisions).
  describe('metricsBySection', () => {
    it('returns an empty list when the section has no active enrollments', async () => {
      enrollmentRepository.find.mockResolvedValue([]);

      const result = await service.metricsBySection(5);

      expect(result).toEqual([]);
      expect(attendanceRepository.find).not.toHaveBeenCalled();
    });

    it('computes totalDays from the enrollment own Attendance row count, NOT the section total day count (no-backfill)', async () => {
      // The section may have 5 recorded days total, but a late-enrolling
      // student only ever gets rows for days created after they joined —
      // here, 2 of them.
      const lateJoiner = {
        id: 200,
        user: { name: 'Cora', lastName: 'Ruiz' },
      } as unknown as Enrollment;
      enrollmentRepository.find.mockResolvedValue([lateJoiner]);
      attendanceRepository.find.mockResolvedValue([
        { id: 1, present: true, enrollment: { id: 200 } },
        { id: 2, present: false, enrollment: { id: 200 } },
      ] as unknown as Attendance[]);

      const result = await service.metricsBySection(5);

      expect(result).toEqual([
        {
          enrollmentId: 200,
          studentName: 'Cora Ruiz',
          presentDays: 1,
          totalDays: 2,
          percentage: 50,
        },
      ]);
    });

    it('reports 0% for an active enrollment with zero Attendance rows', async () => {
      const brandNew = {
        id: 300,
        user: { name: 'Dan', lastName: 'Vega' },
      } as unknown as Enrollment;
      enrollmentRepository.find.mockResolvedValue([brandNew]);
      attendanceRepository.find.mockResolvedValue([]);

      const result = await service.metricsBySection(5);

      expect(result).toEqual([
        {
          enrollmentId: 300,
          studentName: 'Dan Vega',
          presentDays: 0,
          totalDays: 0,
          percentage: 0,
        },
      ]);
    });

    it('rounds the percentage to the nearest integer', async () => {
      const enrollment = {
        id: 400,
        user: { name: 'Eli', lastName: 'Cruz' },
      } as unknown as Enrollment;
      enrollmentRepository.find.mockResolvedValue([enrollment]);
      attendanceRepository.find.mockResolvedValue([
        { id: 1, present: true, enrollment: { id: 400 } },
        { id: 2, present: true, enrollment: { id: 400 } },
        { id: 3, present: false, enrollment: { id: 400 } },
      ] as unknown as Attendance[]);

      const result = await service.metricsBySection(5);

      // 2/3 = 66.66...% -> rounds to 67
      expect(result[0].percentage).toBe(67);
    });
  });

  // Student self-attendance-read (spec: alumno own-data access, mirrors
  // GradeService.findByEnrollment) — ownership is enforced IN THE SERVICE,
  // not via AttendanceOwnershipGuard (that guard is section-based, this
  // route's ownership is enrollment-based).
  describe('attendanceByEnrollment', () => {
    it('ALUMNO reading their own enrollment succeeds with correct shape', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1', name: 'Ana', lastName: 'Lopez' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      attendanceRepository.find.mockResolvedValue([
        { present: true, day: { date: '2026-07-01' } },
        { present: false, day: { date: '2026-07-02' } },
      ] as unknown as Attendance[]);

      const result = await service.attendanceByEnrollment(10, {
        id: 'user-1',
        role: Role.ALUMNO,
      });

      expect(enrollmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
        relations: ['section', 'section.tutor'],
      });
      expect(result).toEqual({
        enrollmentId: 10,
        studentName: 'Ana Lopez',
        presentDays: 1,
        totalDays: 2,
        percentage: 50,
        days: [
          { date: '2026-07-01', present: true },
          { date: '2026-07-02', present: false },
        ],
      });
    });

    it('ALUMNO reading another student enrollment is rejected with ForbiddenException', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);

      await expect(
        service.attendanceByEnrollment(10, {
          id: 'user-2',
          role: Role.ALUMNO,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(attendanceRepository.find).not.toHaveBeenCalled();
    });

    it('totalDays reflects only this enrollment own Attendance row count (no-backfill)', async () => {
      // The section may have 5 recorded days total, but this enrollment
      // only has 2 Attendance rows of its own.
      const enrollment = {
        id: 200,
        user: { id: 'user-200', name: 'Cora', lastName: 'Ruiz' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      attendanceRepository.find.mockResolvedValue([
        { present: true, day: { date: '2026-07-01' } },
        { present: false, day: { date: '2026-07-02' } },
      ] as unknown as Attendance[]);

      const result = await service.attendanceByEnrollment(200, {
        id: 'user-200',
        role: Role.ALUMNO,
      });

      expect(result.totalDays).toBe(2);
    });

    it('rounds percentage to the nearest integer', async () => {
      const enrollment = {
        id: 400,
        user: { id: 'user-400', name: 'Eli', lastName: 'Cruz' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      attendanceRepository.find.mockResolvedValue([
        { present: true, day: { date: '2026-07-01' } },
        { present: true, day: { date: '2026-07-02' } },
        { present: false, day: { date: '2026-07-03' } },
      ] as unknown as Attendance[]);

      const result = await service.attendanceByEnrollment(400, {
        id: 'user-400',
        role: Role.ALUMNO,
      });

      // 2/3 = 66.66...% -> rounds to 67
      expect(result.percentage).toBe(67);
    });

    it('orders days ascending by date and keeps date as a raw string', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1', name: 'Ana', lastName: 'Lopez' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      // Returned out of order on purpose to prove the service sorts them.
      attendanceRepository.find.mockResolvedValue([
        { present: true, day: { date: '2026-07-03' } },
        { present: false, day: { date: '2026-07-01' } },
        { present: true, day: { date: '2026-07-02' } },
      ] as unknown as Attendance[]);

      const result = await service.attendanceByEnrollment(10, {
        id: 'user-1',
        role: Role.ALUMNO,
      });

      expect(result.days.map((d) => d.date)).toEqual([
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
      ]);
      result.days.forEach((d) => {
        expect(typeof d.date).toBe('string');
      });
    });

    it('TUTOR reading an enrollment of their own section succeeds', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1', name: 'Ana', lastName: 'Lopez' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      attendanceRepository.find.mockResolvedValue([]);

      const result = await service.attendanceByEnrollment(10, {
        id: 'tutor-1',
        role: Role.TUTOR,
      });

      expect(result.enrollmentId).toBe(10);
    });

    it('TUTOR reading an enrollment outside their section is rejected with ForbiddenException', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);

      await expect(
        service.attendanceByEnrollment(10, {
          id: 'tutor-2',
          role: Role.TUTOR,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN reads any enrollment unrestricted', async () => {
      const enrollment = {
        id: 10,
        user: { id: 'user-1', name: 'Ana', lastName: 'Lopez' },
        section: { id: 5, tutor: { id: 'tutor-1' } },
      } as unknown as Enrollment;
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      attendanceRepository.find.mockResolvedValue([]);

      const result = await service.attendanceByEnrollment(10, {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(result.enrollmentId).toBe(10);
    });

    it('rejects when the enrollment does not exist', async () => {
      enrollmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.attendanceByEnrollment(999, {
          id: 'admin-1',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
