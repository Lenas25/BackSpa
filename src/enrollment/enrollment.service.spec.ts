import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EnrollmentService } from './enrollment.service';
import { Enrollment } from './entities/enrollment.entity';
import { User } from 'src/user/entities/user.entity';
import { Section } from 'src/section/entities/section.entity';

// Duplicate Enrollment Rejection / Multi-Section Enrollment (spec:
// "section-enrollment" domain) — a student MAY be enrolled in multiple
// Sections simultaneously, but MUST NOT end up with two enrollment rows for
// the SAME section.
describe('EnrollmentService — duplicate enrollment rules', () => {
  let service: EnrollmentService;
  let enrollmentRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let sectionRepository: { findOne: jest.Mock };

  const section = { id: 5, name: 'Cohorte Enero' } as Section;
  const studentA = { id: 'user-a' } as User;

  beforeEach(async () => {
    enrollmentRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    userRepository = { findOne: jest.fn() };
    sectionRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: getRepositoryToken(Enrollment), useValue: enrollmentRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    sectionRepository.findOne.mockResolvedValue(section);
  });

  it('does not create a second enrollment when the same user id is submitted twice in one request', async () => {
    enrollmentRepository.find
      .mockResolvedValueOnce([]) // currentEnrollments (none yet)
      .mockResolvedValueOnce([]); // final re-fetch at the end of update()
    userRepository.findOne.mockResolvedValue(studentA);
    enrollmentRepository.create.mockImplementation((data) => data);
    enrollmentRepository.save.mockResolvedValue({});

    await service.update(section.id, {
      users: [{ id: 'user-a' }, { id: 'user-a' }],
    } as never);

    const createCallsForUserA = enrollmentRepository.create.mock.calls.filter(
      ([data]) => data.user?.id === 'user-a',
    );
    expect(createCallsForUserA).toHaveLength(1);
  });

  it('does not re-create an enrollment for a user already enrolled in the section', async () => {
    const existingEnrollment = { id: 1, user: studentA, active: true };
    enrollmentRepository.find
      .mockResolvedValueOnce([existingEnrollment])
      .mockResolvedValueOnce([existingEnrollment]);
    enrollmentRepository.save.mockResolvedValue(existingEnrollment);

    await service.update(section.id, { users: [{ id: 'user-a' }] } as never);

    expect(enrollmentRepository.create).not.toHaveBeenCalled();
  });

  it('allows the same user to be enrolled in a different section (multi-section enrollment)', async () => {
    const otherSection = { id: 6, name: 'Cohorte Julio' } as Section;
    sectionRepository.findOne.mockResolvedValue(otherSection);
    enrollmentRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    userRepository.findOne.mockResolvedValue(studentA);
    enrollmentRepository.create.mockImplementation((data) => data);
    enrollmentRepository.save.mockResolvedValue({});

    await service.update(otherSection.id, { users: [{ id: 'user-a' }] } as never);

    expect(enrollmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ user: studentA, section: otherSection }),
    );
  });
});
