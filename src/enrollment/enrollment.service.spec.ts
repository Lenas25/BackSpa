import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EnrollmentService } from './enrollment.service';
import { Enrollment } from './entities/enrollment.entity';
import { User } from 'src/user/entities/user.entity';
import { Section } from 'src/section/entities/section.entity';
import { Role } from 'src/common/enums/role.enum';
import { PaymentService } from 'src/payment/payment.service';

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
  let paymentService: { generateForEnrollment: jest.Mock };

  const section = {
    id: 5,
    name: 'Cohorte Enero',
    installmentsCount: null,
  } as Section;
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
    paymentService = { generateForEnrollment: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        { provide: PaymentService, useValue: paymentService },
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

// Role-Based Section Access (spec: "tutor-scoping" domain) — GET /enrollment
// (findAll) MUST NOT leak every section's roster to a TUTOR; ADMIN keeps the
// full list, TUTOR is scoped to enrollments of sections they own.
describe('EnrollmentService.findAll — tutor section-scoped listing', () => {
  let service: EnrollmentService;
  let enrollmentRepository: { find: jest.Mock };

  const allEnrollments = [
    { id: 1, section: { id: 10, tutor: { id: 'tutor-own' } } },
    { id: 2, section: { id: 20, tutor: { id: 'tutor-other' } } },
  ];

  beforeEach(async () => {
    enrollmentRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: getRepositoryToken(Enrollment), useValue: enrollmentRepository },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Section), useValue: { findOne: jest.fn() } },
        {
          provide: PaymentService,
          useValue: { generateForEnrollment: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
  });

  it('returns every enrollment for an ADMIN, unfiltered', async () => {
    enrollmentRepository.find.mockResolvedValue(allEnrollments);

    const result = await service.findAll({ id: 'admin-1', role: Role.ADMIN });

    expect(enrollmentRepository.find).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(allEnrollments);
  });

  it('returns every enrollment when called with no requesting user (internal use)', async () => {
    enrollmentRepository.find.mockResolvedValue(allEnrollments);

    const result = await service.findAll();

    expect(enrollmentRepository.find).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(allEnrollments);
  });

  it('scopes results to only the sections a TUTOR owns', async () => {
    const ownEnrollments = [allEnrollments[0]];
    enrollmentRepository.find.mockResolvedValue(ownEnrollments);

    const result = await service.findAll({ id: 'tutor-own', role: Role.TUTOR });

    expect(enrollmentRepository.find).toHaveBeenCalledWith({
      where: { section: { tutor: { id: 'tutor-own' } } },
    });
    expect(result).toEqual(ownEnrollments);
  });

  it('returns an empty list for a TUTOR who owns no sections', async () => {
    enrollmentRepository.find.mockResolvedValue([]);

    const result = await service.findAll({ id: 'tutor-no-sections', role: Role.TUTOR });

    expect(result).toEqual([]);
  });
});

// Alumno sees own data only (spec: "tutor-scoping" domain).
describe('EnrollmentService.findOneByUser — alumno own-data scoping', () => {
  let service: EnrollmentService;
  let enrollmentRepository: { find: jest.Mock };
  let userRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    enrollmentRepository = { find: jest.fn() };
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: getRepositoryToken(Enrollment), useValue: enrollmentRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Section), useValue: { findOne: jest.fn() } },
        {
          provide: PaymentService,
          useValue: { generateForEnrollment: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    userRepository.findOne.mockResolvedValue({ id: 'student-1' });
    enrollmentRepository.find.mockResolvedValue([]);
  });

  it('allows an ALUMNO to fetch their own enrollments', async () => {
    await expect(
      service.findOneByUser('student-1', { id: 'student-1', role: Role.ALUMNO }),
    ).resolves.toBeDefined();
  });

  it('denies an ALUMNO fetching another user\'s enrollments', async () => {
    await expect(
      service.findOneByUser('student-2', { id: 'student-1', role: Role.ALUMNO }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an ADMIN to fetch any user\'s enrollments', async () => {
    await expect(
      service.findOneByUser('student-2', { id: 'admin-1', role: Role.ADMIN }),
    ).resolves.toBeDefined();
  });

  // Bug fix (E2E manual verification): the alumno panel renders the parent
  // course via enrollment -> section -> course, but findOneByUser only
  // loaded the 'section' relation (not the nested 'section.course'), so
  // TypeORM returned enrollment.section.course as undefined and the panel
  // rendered a blank course name/description/image for every student.
  it('loads the nested section.course relation so the alumno panel can render the parent course', async () => {
    await service.findOneByUser('student-1', { id: 'student-1', role: Role.ALUMNO });

    expect(enrollmentRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['section', 'user', 'section.course']),
      }),
    );
  });
});

// Auto-Generation on Enrollment (design ADR "Lifecycle Rules" —
// sdd/pagos/design): generateForEnrollment fires once per NEWLY enrolled
// student, post-dedupe, inside EnrollmentService.update's usersToAdd loop —
// re-activations and removals are untouched.
describe('EnrollmentService.update — installment generation hook', () => {
  let service: EnrollmentService;
  let enrollmentRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let sectionRepository: { findOne: jest.Mock };
  let paymentService: { generateForEnrollment: jest.Mock };

  const section = {
    id: 5,
    name: 'Cohorte Enero',
    installmentsCount: 3,
  } as Section;
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
    paymentService = { generateForEnrollment: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        {
          provide: PaymentService,
          useValue: paymentService,
        },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    sectionRepository.findOne.mockResolvedValue(section);
  });

  it('generates pending installments for a newly enrolled student using the section installmentsCount', async () => {
    const savedEnrollment = {
      id: 42,
      user: studentA,
      section,
      active: true,
    };
    enrollmentRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([savedEnrollment]);
    userRepository.findOne.mockResolvedValue(studentA);
    enrollmentRepository.create.mockImplementation((data) => data);
    enrollmentRepository.save.mockResolvedValue(savedEnrollment);

    await service.update(section.id, { users: [{ id: 'user-a' }] } as never);

    expect(paymentService.generateForEnrollment).toHaveBeenCalledTimes(1);
    expect(paymentService.generateForEnrollment).toHaveBeenCalledWith(
      savedEnrollment,
      3,
    );
  });

  it('does not generate installments for a user who was already enrolled (re-activation only)', async () => {
    const existingEnrollment = { id: 1, user: studentA, active: false };
    enrollmentRepository.find
      .mockResolvedValueOnce([existingEnrollment])
      .mockResolvedValueOnce([existingEnrollment]);
    enrollmentRepository.save.mockResolvedValue(existingEnrollment);

    await service.update(section.id, { users: [{ id: 'user-a' }] } as never);

    expect(paymentService.generateForEnrollment).not.toHaveBeenCalled();
  });

  it('passes through a null installmentsCount when the section has no installment plan configured', async () => {
    const sectionWithoutCount = {
      id: 6,
      name: 'Cohorte Julio',
      installmentsCount: null,
    } as unknown as Section;
    sectionRepository.findOne.mockResolvedValue(sectionWithoutCount);
    const savedEnrollment = {
      id: 43,
      user: studentA,
      section: sectionWithoutCount,
      active: true,
    };
    enrollmentRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([savedEnrollment]);
    userRepository.findOne.mockResolvedValue(studentA);
    enrollmentRepository.create.mockImplementation((data) => data);
    enrollmentRepository.save.mockResolvedValue(savedEnrollment);

    await service.update(sectionWithoutCount.id, {
      users: [{ id: 'user-a' }],
    } as never);

    expect(paymentService.generateForEnrollment).toHaveBeenCalledWith(
      savedEnrollment,
      null,
    );
  });

  // Error propagation: EnrollmentService.update's broad try/catch must not
  // mangle an HttpException's original message into a generic wrapped one
  // (mirrors the same guarantee added to SectionService.update).
  it('propagates an HttpException from generateForEnrollment intact, without wrapping its message', async () => {
    const originalMessage =
      'No se puede reducir la cantidad de cuotas a 2: ya existen cuotas pagadas.';
    enrollmentRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    userRepository.findOne.mockResolvedValue(studentA);
    enrollmentRepository.create.mockImplementation((data) => data);
    enrollmentRepository.save.mockResolvedValue({
      id: 42,
      user: studentA,
      section,
      active: true,
    });
    paymentService.generateForEnrollment.mockRejectedValue(
      new BadRequestException(originalMessage),
    );

    await expect(
      service.update(section.id, { users: [{ id: 'user-a' }] } as never),
    ).rejects.toMatchObject({ message: originalMessage });
  });
});
