import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';

const TEST_JWT_SECRET = 'test-secret-for-grade-e2e';
jest.mock('src/auth/constants/jwt.constants', () => ({
  jwtConstants: { secret: TEST_JWT_SECRET, expiresIn: '1h' },
}));

// eslint-disable-next-line import/first
import { GradeController } from 'src/grade/grade.controller';
// eslint-disable-next-line import/first
import { GradeService } from 'src/grade/grade.service';
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

// Tutor Grade Registration Scope (spec: "tutor-scoping" domain) — a TUTOR
// may only register grades for Sections they are assigned to.
describe('PATCH /grade/:id (e2e) — Tutor Grade Registration Scope', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const update = jest.fn();
  const sectionRepository = { findOne: jest.fn() };

  const OWN_SECTION_ID = 1;
  const OTHER_SECTION_ID = 2;
  const TUTOR_ID = 'tutor-own';
  const OTHER_TUTOR_ID = 'tutor-other';

  const signToken = (payload: { id: string; role: Role }) => jwtService.sign(payload);
  const bearer = (token: string) => `Bearer ${token}`;
  const validBody = { id_activity: 1, grades: [{ id_enrollment: 1, grade: 8 }] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [GradeController],
      providers: [
        { provide: GradeService, useValue: { update } },
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
    update.mockReset().mockResolvedValue([]);
    sectionRepository.findOne.mockReset().mockImplementation(({ where: { id } }) => {
      if (id === OWN_SECTION_ID) return Promise.resolve({ id, tutor: { id: TUTOR_ID } });
      if (id === OTHER_SECTION_ID) return Promise.resolve({ id, tutor: { id: OTHER_TUTOR_ID } });
      return Promise.resolve(null);
    });
  });

  it('rejects a TUTOR registering a grade for a section they do not own', async () => {
    const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

    await request(app.getHttpServer())
      .patch(`/grade/${OTHER_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .send(validBody)
      .expect(403);

    expect(update).not.toHaveBeenCalled();
  });

  it('allows a TUTOR to register a grade for their own section', async () => {
    const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

    await request(app.getHttpServer())
      .patch(`/grade/${OWN_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .send(validBody)
      .expect(200);

    // Route params arrive as strings (no ParseIntPipe on this pre-existing
    // route), matching the rest of this codebase's controllers.
    expect(update).toHaveBeenCalledWith(String(OWN_SECTION_ID), expect.objectContaining(validBody));
  });

  it('allows an ADMIN to register a grade for any section', async () => {
    const token = signToken({ id: 'admin-1', role: Role.ADMIN });

    await request(app.getHttpServer())
      .patch(`/grade/${OTHER_SECTION_ID}`)
      .set('Authorization', bearer(token))
      .send(validBody)
      .expect(200);
  });
});
