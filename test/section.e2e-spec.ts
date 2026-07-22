import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';

// AuthGuard reads its verification secret from this module-level constant
// rather than an injected config value. Mock it so the real AuthGuard/
// RolesGuard/SectionOwnershipGuard chain can be exercised end-to-end with a
// JwtService we control in this test (signing and verifying with the same
// secret), instead of stubbing the guards out entirely.
const TEST_JWT_SECRET = 'test-secret-for-section-e2e';
jest.mock('src/auth/constants/jwt.constants', () => ({
  jwtConstants: { secret: TEST_JWT_SECRET, expiresIn: '1h' },
}));

// eslint-disable-next-line import/first
import { SectionController } from 'src/section/section.controller';
// eslint-disable-next-line import/first
import { SectionService } from 'src/section/section.service';
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

// Role-Based Section Access (spec: "tutor-scoping" domain) — full guard
// matrix against the REAL AuthGuard/RolesGuard/SectionOwnershipGuard chain:
// anonymous, alumno, tutor (own vs. other section), and admin.
describe('/section guard matrix (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const findAll = jest.fn();
  const findOne = jest.fn();
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
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [SectionController],
      providers: [
        { provide: SectionService, useValue: { findAll, findOne } },
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
    findAll.mockReset().mockResolvedValue([]);
    findOne.mockReset().mockResolvedValue({ id: OWN_SECTION_ID, name: 'Cohorte Enero' });
    sectionRepository.findOne.mockReset().mockImplementation(({ where: { id } }) => {
      if (id === OWN_SECTION_ID) {
        return Promise.resolve({ id: OWN_SECTION_ID, tutor: { id: TUTOR_ID } });
      }
      if (id === OTHER_SECTION_ID) {
        return Promise.resolve({ id: OTHER_SECTION_ID, tutor: { id: OTHER_TUTOR_ID } });
      }
      return Promise.resolve(null);
    });
  });

  describe('GET /section (list)', () => {
    it('rejects an anonymous request with 401', async () => {
      await request(app.getHttpServer()).get('/section').expect(401);
    });

    it('rejects an ALUMNO with 403', async () => {
      const token = signToken({ id: 'student-1', role: Role.ALUMNO });

      await request(app.getHttpServer())
        .get('/section')
        .set('Authorization', bearer(token))
        .expect(403);
    });

    it('allows a TUTOR and forwards their identity to the service for ownership scoping', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get('/section')
        .set('Authorization', bearer(token))
        .expect(200);

      expect(findAll).toHaveBeenCalledWith(
        expect.objectContaining({ id: TUTOR_ID, role: Role.TUTOR }),
      );
    });

    it('allows an ADMIN', async () => {
      const token = signToken({ id: 'admin-1', role: Role.ADMIN });

      await request(app.getHttpServer())
        .get('/section')
        .set('Authorization', bearer(token))
        .expect(200);
    });
  });

  describe('GET /section/:id (detail) — SectionOwnershipGuard', () => {
    it('rejects an anonymous request with 401', async () => {
      await request(app.getHttpServer()).get(`/section/${OWN_SECTION_ID}`).expect(401);
    });

    it('rejects an ALUMNO with 403 before the ownership guard even runs', async () => {
      const token = signToken({ id: 'student-1', role: Role.ALUMNO });

      await request(app.getHttpServer())
        .get(`/section/${OWN_SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);

      expect(sectionRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejects a TUTOR not assigned to the requested section with 403', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get(`/section/${OTHER_SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);
    });

    it('allows a TUTOR assigned to their own section', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get(`/section/${OWN_SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(200);
    });

    it('allows an ADMIN regardless of tutor assignment', async () => {
      const token = signToken({ id: 'admin-1', role: Role.ADMIN });

      await request(app.getHttpServer())
        .get(`/section/${OTHER_SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(200);
    });

    it('returns 404 through the guard when the section does not exist', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get('/section/999')
        .set('Authorization', bearer(token))
        .expect(404);
    });
  });
});
