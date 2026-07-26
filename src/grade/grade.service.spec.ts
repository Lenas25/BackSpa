import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
  let enrollmentRepository: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };

  const TUTOR_ID = 'tutor-own';
  const OTHER_TUTOR_ID = 'tutor-other';

  beforeEach(async () => {
    sectionRepository = { findOne: jest.fn() };
    gradeRepository = { find: jest.fn() };
    activityRepository = { findOne: jest.fn(), find: jest.fn() };
    enrollmentRepository = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };

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

  // SECTION GRADE REPORT (PLAN_FEATURES 4.4): feeds the client-side PDF
  // report — one response with the section's activities plus every
  // student's per-activity grades and weighted average. TUTOR/ADMIN
  // ownership scoping for this endpoint is enforced at the HTTP layer by
  // SectionOwnershipGuard (see section-ownership.guard.spec.ts); these
  // specs only assert the service returns correct report data.
  describe('reportBySection', () => {
    const SECTION_ID = 7;

    it('throws BadRequestException when the section does not exist', async () => {
      sectionRepository.findOne.mockResolvedValue(null);

      await expect(service.reportBySection(SECTION_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns section info, all activities ordered by id, and one grades entry per activity per student (null where ungraded)', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: SECTION_ID,
        name: 'Sección A',
        course: { name: 'Curso X' },
      });
      activityRepository.find.mockResolvedValue([
        { id: 1, name: 'Actividad 1', percentage: 60 },
        { id: 2, name: 'Actividad 2', percentage: 40 },
      ]);
      enrollmentRepository.find.mockResolvedValue([
        {
          id: 100,
          active: true,
          user: { id: 'user-1', name: 'Ana', lastName: 'Pérez' },
        },
        {
          id: 101,
          active: true,
          user: { id: 'user-2', name: 'Luis', lastName: 'Gómez' },
        },
      ]);
      gradeRepository.find.mockResolvedValue([
        { id_enrollment: 100, id_activity: 1, grade: 18 },
        // enrollment 100 has no grade for activity 2 (ungraded)
        { id_enrollment: 101, id_activity: 1, grade: 14 },
        { id_enrollment: 101, id_activity: 2, grade: 16 },
      ]);

      const report = await service.reportBySection(SECTION_ID);

      expect(report.section).toEqual({
        id: SECTION_ID,
        name: 'Sección A',
        courseName: 'Curso X',
      });
      expect(report.activities).toEqual([
        { id: 1, name: 'Actividad 1', percentage: 60 },
        { id: 2, name: 'Actividad 2', percentage: 40 },
      ]);

      const [student1, student2] = report.students;

      expect(student1.enrollmentId).toBe(100);
      expect(student1.dni).toBe('user-1');
      expect(student1.fullName).toBe('Ana Pérez');
      expect(student1.grades).toEqual([
        { activityId: 1, grade: 18 },
        { activityId: 2, grade: null },
      ]);

      expect(student2.grades).toEqual([
        { activityId: 1, grade: 14 },
        { activityId: 2, grade: 16 },
      ]);
    });

    it('computes average as the weighted formula over GRADED activities only (matches recalculateFinalGrade)', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: SECTION_ID,
        name: 'Sección A',
        course: { name: 'Curso X' },
      });
      // 4 activities, but the student only has grades on 2 of them — the
      // denominator must be only those 2 activities' percentages, not all 4.
      activityRepository.find.mockResolvedValue([
        { id: 1, name: 'A1', percentage: 25 },
        { id: 2, name: 'A2', percentage: 25 },
        { id: 3, name: 'A3', percentage: 25 },
        { id: 4, name: 'A4', percentage: 25 },
      ]);
      enrollmentRepository.find.mockResolvedValue([
        { id: 200, active: true, user: { id: 'user-3', name: 'Marta', lastName: 'Ruiz' } },
      ]);
      gradeRepository.find.mockResolvedValue([
        { id_enrollment: 200, id_activity: 1, grade: 18 },
        { id_enrollment: 200, id_activity: 2, grade: 16 },
      ]);

      const report = await service.reportBySection(SECTION_ID);

      // (18*25 + 16*25) / (25+25) = 17
      expect(report.students[0].average).toBe(17);
    });

    it('returns average null and all grades null for a student with no grades at all', async () => {
      sectionRepository.findOne.mockResolvedValue({
        id: SECTION_ID,
        name: 'Sección A',
        course: { name: 'Curso X' },
      });
      activityRepository.find.mockResolvedValue([
        { id: 1, name: 'A1', percentage: 60 },
        { id: 2, name: 'A2', percentage: 40 },
      ]);
      enrollmentRepository.find.mockResolvedValue([
        { id: 300, active: true, user: { id: 'user-4', name: 'Diego', lastName: 'Soto' } },
      ]);
      gradeRepository.find.mockResolvedValue([]);

      const report = await service.reportBySection(SECTION_ID);

      expect(report.students[0].average).toBeNull();
      expect(report.students[0].grades).toEqual([
        { activityId: 1, grade: null },
        { activityId: 2, grade: null },
      ]);
    });
  });
});
