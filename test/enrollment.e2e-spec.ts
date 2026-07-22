import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';

const TEST_JWT_SECRET = 'test-secret-for-enrollment-e2e';
jest.mock('src/auth/constants/jwt.constants', () => ({
  jwtConstants: { secret: TEST_JWT_SECRET, expiresIn: '1h' },
}));

// eslint-disable-next-line import/first
import { EnrollmentController } from 'src/enrollment/enrollment.controller';
// eslint-disable-next-line import/first
import { EnrollmentService } from 'src/enrollment/enrollment.service';
// eslint-disable-next-line import/first
import { AuthGuard } from 'src/auth/guard/auth.guard';
// eslint-disable-next-line import/first
import { RolesGuard } from 'src/auth/guard/roles.guard';
// eslint-disable-next-line import/first
import { SectionOwnershipGuard } from 'src/auth/guard/section-ownership.guard';
// eslint-disable-next-line import/first
import { Section } from 'src/section/entities/section.entity';
// eslint-disable-next-line import/first
import { Role } from 'src/common/enums/role.enum';

describe('GET /enrollment/course/:id (e2e) — tutor section-roster scoping', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const findOneBySection = jest.fn();
  const sectionRepository = { findOne: jest.fn() };

  const OWN_SECTION_ID = 1;
  const OTHER_SECTION_ID = 2;
  const TUTOR_ID = 'tutor-own';
  const OTHER_TUTOR_ID = 'tutor-other';

  const signToken = (payload: { id: string; role: Role }) => jwtService.sign(payload);
  const bearer = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [EnrollmentController],
      providers: [
        { provide: EnrollmentService, useValue: { findOneBySection } },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        AuthGuard,
        RolesGuard,
        SectionOwnershipGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findOneBySection.mockReset().mockResolvedValue([]);
    sectionRepository.findOne.mockReset().mockImplementation(({ where: { id } }) => {
      if (id === OWN_SECTION_ID) return Promise.resolve({ id, tutor: { id: TUTOR_ID } });
      if (id === OTHER_SECTION_ID) return Promise.resolve({ id, tutor: { id: OTHER_TUTOR_ID } });
      return Promise.resolve(null);
    });
  });

  it('rejects a TUTOR requesting another tutor\'s section roster', async () => {
    const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

    await request(app.getHttpServer())
      .get(`/enrollment/course/${OTHER_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .expect(403);
  });

  it('allows a TUTOR to read their own section roster', async () => {
    const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

    await request(app.getHttpServer())
      .get(`/enrollment/course/${OWN_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .expect(201);
  });

  it('allows an ADMIN to read any section roster', async () => {
    const token = signToken({ id: 'admin-1', role: Role.ADMIN });

    await request(app.getHttpServer())
      .get(`/enrollment/course/${OTHER_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .expect(201);
  });

  it('rejects an ALUMNO from reading a section roster', async () => {
    const token = signToken({ id: 'student-1', role: Role.ALUMNO });

    await request(app.getHttpServer())
      .get(`/enrollment/course/${OWN_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .expect(403);
  });
});

// Role-Based Section Access (spec: "tutor-scoping" domain) — GET /enrollment
// (findAll) MUST NOT leak every section's roster to a TUTOR; only ADMIN gets
// the unfiltered platform-wide list.
describe('GET /enrollment (e2e) — findAll tutor scoping', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const findAll = jest.fn();

  const signToken = (payload: { id: string; role: Role }) => jwtService.sign(payload);
  const bearer = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [EnrollmentController],
      providers: [
        { provide: EnrollmentService, useValue: { findAll } },
        { provide: getRepositoryToken(Section), useValue: { findOne: jest.fn() } },
        AuthGuard,
        RolesGuard,
        SectionOwnershipGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findAll.mockReset().mockResolvedValue([]);
  });

  it('allows an ADMIN to list every enrollment', async () => {
    const token = signToken({ id: 'admin-1', role: Role.ADMIN });

    await request(app.getHttpServer())
      .get('/enrollment')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', role: Role.ADMIN }),
    );
  });

  it('allows a TUTOR to list enrollments, scoped by the service to their own sections', async () => {
    const token = signToken({ id: 'tutor-1', role: Role.TUTOR });

    await request(app.getHttpServer())
      .get('/enrollment')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tutor-1', role: Role.TUTOR }),
    );
  });

  it('rejects an ALUMNO from listing enrollments', async () => {
    const token = signToken({ id: 'student-1', role: Role.ALUMNO });

    await request(app.getHttpServer())
      .get('/enrollment')
      .set('Authorization', bearer(token))
      .expect(403);
  });
});
