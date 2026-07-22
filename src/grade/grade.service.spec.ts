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
  let activityRepository: { findOne: jest.Mock };
  let enrollmentRepository: { findOne: jest.Mock };

  const TUTOR_ID = 'tutor-own';
  const OTHER_TUTOR_ID = 'tutor-other';

  beforeEach(async () => {
    sectionRepository = { findOne: jest.fn() };
    gradeRepository = { find: jest.fn() };
    activityRepository = { findOne: jest.fn() };
    enrollmentRepository = { findOne: jest.fn() };

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
});
