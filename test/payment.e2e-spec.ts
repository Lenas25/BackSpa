import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as request from 'supertest';

// AuthGuard reads its verification secret from this module-level constant
// rather than an injected config value. Mock it so the real AuthGuard/
// RolesGuard chain can be exercised end-to-end with a JwtService we control
// in this test (signing and verifying with the same secret), instead of
// stubbing the guards out entirely — same pattern as section.e2e-spec.ts /
// grade.e2e-spec.ts.
const TEST_JWT_SECRET = 'test-secret-for-payment-e2e';
jest.mock('src/auth/constants/jwt.constants', () => ({
  jwtConstants: { secret: TEST_JWT_SECRET, expiresIn: '1h' },
}));

// eslint-disable-next-line import/first
import { PaymentController } from 'src/payment/payment.controller';
// eslint-disable-next-line import/first
import { PaymentService } from 'src/payment/payment.service';
// eslint-disable-next-line import/first
import { AuthGuard } from 'src/auth/guard/auth.guard';
// eslint-disable-next-line import/first
import { RolesGuard } from 'src/auth/guard/roles.guard';
// eslint-disable-next-line import/first
import { Role } from 'src/common/enums/role.enum';

// Role-Based Access (spec: "payment-management" / "student-payments-view"
// domains; design's Authorization table — sdd/pagos/design): full guard
// matrix against the REAL AuthGuard/RolesGuard chain — anonymous, alumno
// (own vs. other enrollment), tutor (denied everywhere), and admin — for
// every /payment route.
describe('/payment guard matrix (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const findBySection = jest.fn();
  const findByEnrollment = jest.fn();
  const pay = jest.fn();
  const unmark = jest.fn();

  const SECTION_ID = 1;
  const OWN_ENROLLMENT_ID = 7;
  const OTHER_ENROLLMENT_ID = 8;
  const PAYMENT_ID = 100;
  const ADMIN_ID = 'admin-1';
  const ALUMNO_ID = 'alumno-1';
  const TUTOR_ID = 'tutor-1';

  const signToken = (payload: { id: string; role: Role }) =>
    jwtService.sign(payload);
  const bearer = (token: string) => `Bearer ${token}`;
  const validPayBody = { amount: 100, paidDate: '2026-01-01' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentService,
          useValue: { findBySection, findByEnrollment, pay, unmark },
        },
        AuthGuard,
        RolesGuard,
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
    findBySection.mockReset().mockResolvedValue([]);
    findByEnrollment.mockReset().mockImplementation((id: number, user) => {
      if (Number(id) === OWN_ENROLLMENT_ID) {
        return Promise.resolve([]);
      }
      if (user?.role === Role.ALUMNO) {
        return Promise.reject(
          new ForbiddenException(
            'No tiene acceso a los datos de esta matrícula',
          ),
        );
      }
      return Promise.resolve([]);
    });
    pay.mockReset().mockResolvedValue({ id: PAYMENT_ID, status: 'cancelado' });
    unmark
      .mockReset()
      .mockResolvedValue({ id: PAYMENT_ID, status: 'pendiente' });
  });

  describe('GET /payment/section/:id', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .get(`/payment/section/${SECTION_ID}`)
        .expect(401);
      expect(findBySection).not.toHaveBeenCalled();
    });

    it('allows an admin', async () => {
      const token = signToken({ id: ADMIN_ID, role: Role.ADMIN });

      await request(app.getHttpServer())
        .get(`/payment/section/${SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(200);
      expect(findBySection).toHaveBeenCalled();
    });

    it('denies an alumno', async () => {
      const token = signToken({ id: ALUMNO_ID, role: Role.ALUMNO });

      await request(app.getHttpServer())
        .get(`/payment/section/${SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);
      expect(findBySection).not.toHaveBeenCalled();
    });

    it('denies a tutor', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get(`/payment/section/${SECTION_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);
      expect(findBySection).not.toHaveBeenCalled();
    });
  });

  describe('GET /payment/enrollment/:idEnrollment', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .get(`/payment/enrollment/${OWN_ENROLLMENT_ID}`)
        .expect(401);
    });

    it('allows an admin to read any enrollment', async () => {
      const token = signToken({ id: ADMIN_ID, role: Role.ADMIN });

      await request(app.getHttpServer())
        .get(`/payment/enrollment/${OTHER_ENROLLMENT_ID}`)
        .set('Authorization', bearer(token))
        .expect(200);
    });

    it('allows an alumno to read their own enrollment', async () => {
      const token = signToken({ id: ALUMNO_ID, role: Role.ALUMNO });

      await request(app.getHttpServer())
        .get(`/payment/enrollment/${OWN_ENROLLMENT_ID}`)
        .set('Authorization', bearer(token))
        .expect(200);
    });

    it("denies an alumno reading another alumno's enrollment (403 from service ownership check)", async () => {
      const token = signToken({ id: ALUMNO_ID, role: Role.ALUMNO });

      await request(app.getHttpServer())
        .get(`/payment/enrollment/${OTHER_ENROLLMENT_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);
    });

    it('denies a tutor outright (RolesGuard, never reaches the service)', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .get(`/payment/enrollment/${OWN_ENROLLMENT_ID}`)
        .set('Authorization', bearer(token))
        .expect(403);
      expect(findByEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /payment/:id', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}`)
        .send(validPayBody)
        .expect(401);
    });

    it('allows an admin', async () => {
      const token = signToken({ id: ADMIN_ID, role: Role.ADMIN });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}`)
        .set('Authorization', bearer(token))
        .send(validPayBody)
        .expect(200);
      expect(pay).toHaveBeenCalled();
    });

    it('denies an alumno', async () => {
      const token = signToken({ id: ALUMNO_ID, role: Role.ALUMNO });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}`)
        .set('Authorization', bearer(token))
        .send(validPayBody)
        .expect(403);
      expect(pay).not.toHaveBeenCalled();
    });

    it('denies a tutor', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}`)
        .set('Authorization', bearer(token))
        .send(validPayBody)
        .expect(403);
      expect(pay).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /payment/:id/unmark', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}/unmark`)
        .expect(401);
    });

    it('allows an admin', async () => {
      const token = signToken({ id: ADMIN_ID, role: Role.ADMIN });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}/unmark`)
        .set('Authorization', bearer(token))
        .expect(200);
      expect(unmark).toHaveBeenCalled();
    });

    it('denies an alumno', async () => {
      const token = signToken({ id: ALUMNO_ID, role: Role.ALUMNO });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}/unmark`)
        .set('Authorization', bearer(token))
        .expect(403);
      expect(unmark).not.toHaveBeenCalled();
    });

    it('denies a tutor', async () => {
      const token = signToken({ id: TUTOR_ID, role: Role.TUTOR });

      await request(app.getHttpServer())
        .patch(`/payment/${PAYMENT_ID}/unmark`)
        .set('Authorization', bearer(token))
        .expect(403);
      expect(unmark).not.toHaveBeenCalled();
    });
  });
});
