import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { GradeService } from './grade.service';
import { Grade } from './entities/grade.entity';
import { Activity } from 'src/activity/entities/activity.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Section } from 'src/section/entities/section.entity';
import { Role } from 'src/common/enums/role.enum';

// Role-Based Section Access (spec: "tutor-scoping" domain) — TUTOR is
// limited to students and grades of their own Sections. Grade reads here
// are keyed by activity/enrollment id, so ownership needs a join through
// the activity/enrollment's section, done at the service level.
describe('GradeService — tutor ownership scoping', () => {
  let service: GradeService;
  let sectionRepository: { findOne: jest.Mock };
  let gradeRepository: { find: jest.Mock };
  let activityRepository: { findOne: jest.Mock; find: jest.Mock };
  let enrollmentRepository: { findOne: jest.Mock; save: jest.Mock };

  const TUTOR_ID = 'tutor-own';
  const OTHER_TUTOR_ID = 'tutor-other';

  beforeEach(async () => {
    sectionRepository = { findOne: jest.fn() };
    gradeRepository = { find: jest.fn() };
    activityRepository = { findOne: jest.fn(), find: jest.fn() };
    enrollmentRepository = { findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeService,
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        { provide: getRepositoryToken(Grade), useValue: gradeRepository },
        { provide: getRepositoryToken(Activity), useValue: activityRepository },
        { provide: getRepositoryToken(Enrollment), useValue: enrollmentRepository },
      ],
    }).compile();

    service = module.get<GradeService>(GradeService);
  });

  describe('findOne (by activity id)', () => {
    it('allows a TUTOR who owns the activity\'s section', async () => {
      activityRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: TUTOR_ID } },
      });
      gradeRepository.find.mockResolvedValue([{ enrollment: { active: true } }]);

      await expect(
        service.findOne(1, { id: TUTOR_ID, role: Role.TUTOR }),
      ).resolves.toBeDefined();
    });

    it('denies a TUTOR who does not own the activity\'s section', async () => {
      activityRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: OTHER_TUTOR_ID } },
      });

      await expect(
        service.findOne(1, { id: TUTOR_ID, role: Role.TUTOR }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an ADMIN unconditionally', async () => {
      activityRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: OTHER_TUTOR_ID } },
      });
      gradeRepository.find.mockResolvedValue([]);

      await expect(
        service.findOne(1, { id: 'admin-1', role: Role.ADMIN }),
      ).resolves.toBeDefined();
    });

    it('is unrestricted when called with no requesting user (internal use)', async () => {
      activityRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: OTHER_TUTOR_ID } },
      });
      gradeRepository.find.mockResolvedValue([]);

      await expect(service.findOne(1)).resolves.toBeDefined();
    });
  });

  describe('findByEnrollment', () => {
    it('allows a TUTOR who owns the enrollment\'s section', async () => {
      enrollmentRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: TUTOR_ID } },
        user: { id: 'student-1' },
      });
      gradeRepository.find.mockResolvedValue([]);

      await expect(
        service.findByEnrollment(1, { id: TUTOR_ID, role: Role.TUTOR }),
      ).resolves.toBeDefined();
    });

    it('denies a TUTOR who does not own the enrollment\'s section', async () => {
      enrollmentRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: OTHER_TUTOR_ID } },
        user: { id: 'student-1' },
      });

      await expect(
        service.findByEnrollment(1, { id: TUTOR_ID, role: Role.TUTOR }),
      ).rejects.toThrow(ForbiddenException);
    });

    // Alumno sees own data only (spec: "tutor-scoping" domain).
    it('allows an ALUMNO to read their own enrollment\'s grades', async () => {
      enrollmentRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: TUTOR_ID } },
        user: { id: 'student-1' },
      });
      gradeRepository.find.mockResolvedValue([]);

      await expect(
        service.findByEnrollment(1, { id: 'student-1', role: Role.ALUMNO }),
      ).resolves.toBeDefined();
    });

    it('denies an ALUMNO reading another student\'s enrollment grades', async () => {
      enrollmentRepository.findOne.mockResolvedValue({
        id: 1,
        section: { id: 1, tutor: { id: TUTOR_ID } },
        user: { id: 'student-1' },
      });

      await expect(
        service.findByEnrollment(1, { id: 'student-2', role: Role.ALUMNO }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // Backend bugfix: recalculateFinalGrade multiplied grade × whole-number
  // percentage without dividing, so enrollment.final_grade (numeric(4,2),
  // max 99.99) overflowed on real data (e.g. 18 * 60 = 1080). The rule is a
  // weighted running average — final = Σ(grade_i × pct_i) / Σ(pct_i of
  // GRADED activities) — mirroring src/utils/gradeAverage.ts on the
  // frontend, which was already updated when the %=100 requirement was
  // removed.
  describe('recalculateFinalGrade (weighted average)', () => {
    const ENROLLMENT_ID = 42;
    let enrollment: {
      id: number;
      section: { id: number };
      final_grade: number;
    };

    beforeEach(() => {
      enrollment = { id: ENROLLMENT_ID, section: { id: 1 }, final_grade: 0 };
      enrollmentRepository.findOne.mockResolvedValue(enrollment);
      enrollmentRepository.save.mockImplementation(async (e) => e);
    });

    it('computes a weighted average instead of the raw percentage-scaled sum', async () => {
      gradeRepository.find.mockResolvedValue([
        { id_activity: 1, grade: 18 },
        { id_activity: 2, grade: 16 },
      ]);
      activityRepository.find.mockResolvedValue([
        { id: 1, percentage: 60 },
        { id: 2, percentage: 40 },
      ]);

      await (service as any).recalculateFinalGrade(ENROLLMENT_ID);

      // 18*60 + 16*40 = 1720 (the overflow bug); the correct weighted
      // average divides by the total weight: 1720 / 100 = 17.2.
      expect(enrollment.final_grade).toBeCloseTo(17.2, 2);
    });

    it('divides only by the percentage of graded activities on partial grading', async () => {
      gradeRepository.find.mockResolvedValue([{ id_activity: 1, grade: 18 }]);
      activityRepository.find.mockResolvedValue([
        { id: 1, percentage: 60 },
        { id: 2, percentage: 40 }, // ungraded — must not dilute the average
      ]);

      await (service as any).recalculateFinalGrade(ENROLLMENT_ID);

      expect(enrollment.final_grade).toBe(18);
    });

    it('sets final_grade to 0 when nothing has been graded yet', async () => {
      gradeRepository.find.mockResolvedValue([]);
      activityRepository.find.mockResolvedValue([
        { id: 1, percentage: 60 },
        { id: 2, percentage: 40 },
      ]);

      await (service as any).recalculateFinalGrade(ENROLLMENT_ID);

      expect(enrollment.final_grade).toBe(0);
    });

    it('guards against division by zero when graded activities carry no weight', async () => {
      gradeRepository.find.mockResolvedValue([{ id_activity: 1, grade: 20 }]);
      activityRepository.find.mockResolvedValue([{ id: 1, percentage: 0 }]);

      await (service as any).recalculateFinalGrade(ENROLLMENT_ID);

      expect(enrollment.final_grade).toBe(0);
    });

    it('never produces a value that overflows numeric(4,2)', async () => {
      gradeRepository.find.mockResolvedValue([
        { id_activity: 1, grade: 20 },
        { id_activity: 2, grade: 19 },
      ]);
      activityRepository.find.mockResolvedValue([
        { id: 1, percentage: 60 },
        { id: 2, percentage: 40 },
      ]);

      await (service as any).recalculateFinalGrade(ENROLLMENT_ID);

      expect(enrollment.final_grade).toBeLessThanOrEqual(99.99);
    });
  });
});
