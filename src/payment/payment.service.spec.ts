import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Role } from 'src/common/enums/role.enum';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let enrollmentRepository: { findOne: jest.Mock; find: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    paymentRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (rows) => rows),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    enrollmentRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Auto-Generation on Enrollment (spec: "payment-management" domain).
  describe('generateForEnrollment', () => {
    const enrollment = { id: 7 } as Enrollment;

    it('creates N pending installments numbered 1..N with no amount/date', async () => {
      const result = await service.generateForEnrollment(enrollment, 3);

      expect(paymentRepository.create).toHaveBeenCalledTimes(3);
      expect(paymentRepository.create).toHaveBeenNthCalledWith(1, {
        enrollment,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
      });
      expect(paymentRepository.create).toHaveBeenNthCalledWith(3, {
        enrollment,
        installmentNumber: 3,
        amount: null,
        paidDate: null,
      });
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ installmentNumber: 1 }),
          expect.objectContaining({ installmentNumber: 2 }),
          expect.objectContaining({ installmentNumber: 3 }),
        ]),
      );
      expect(result).toHaveLength(3);
    });

    it('creates 0 installments when count is null', async () => {
      const result = await service.generateForEnrollment(enrollment, null);

      expect(paymentRepository.create).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('creates 0 installments when count is 0', async () => {
      const result = await service.generateForEnrollment(enrollment, 0);

      expect(paymentRepository.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  // Count-Change Adjustment (spec: "payment-management" domain).
  describe('adjustForSection', () => {
    const enrollmentA = { id: 1 } as Enrollment;
    const enrollmentB = { id: 2 } as Enrollment;

    function mockTransaction(
      enrollments: Enrollment[],
      paymentsByEnrollmentId: Record<number, Payment[]>,
    ) {
      const enrollmentRepo = {
        find: jest.fn().mockResolvedValue(enrollments),
      };
      const txPaymentRepo = {
        find: jest.fn((options: any) => {
          const id = options.where.enrollment.id;
          return Promise.resolve(paymentsByEnrollmentId[id] ?? []);
        }),
        remove: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === Enrollment ? enrollmentRepo : txPaymentRepo,
        ),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { enrollmentRepo, txPaymentRepo };
    }

    it('adds new pending installments when the count increases', async () => {
      const existing = [
        {
          id: 100,
          installmentNumber: 1,
          paidDate: '2026-01-01',
        } as unknown as Payment,
        {
          id: 101,
          installmentNumber: 2,
          paidDate: '2026-02-01',
        } as unknown as Payment,
        { id: 102, installmentNumber: 3, paidDate: null } as unknown as Payment,
        { id: 103, installmentNumber: 4, paidDate: null } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction([enrollmentA], {
        1: existing,
      });

      await service.adjustForSection(5, 6);

      expect(txPaymentRepo.remove).not.toHaveBeenCalled();
      expect(txPaymentRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ installmentNumber: 5 }),
        expect.objectContaining({ installmentNumber: 6 }),
      ]);
    });

    it('removes only unpaid installments when the count decreases above the paid floor', async () => {
      const existing = [
        {
          id: 100,
          installmentNumber: 1,
          paidDate: '2026-01-01',
        } as unknown as Payment,
        {
          id: 101,
          installmentNumber: 2,
          paidDate: '2026-02-01',
        } as unknown as Payment,
        { id: 102, installmentNumber: 3, paidDate: null } as unknown as Payment,
        { id: 103, installmentNumber: 4, paidDate: null } as unknown as Payment,
        { id: 104, installmentNumber: 5, paidDate: null } as unknown as Payment,
        { id: 105, installmentNumber: 6, paidDate: null } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction([enrollmentA], {
        1: existing,
      });

      await service.adjustForSection(5, 3);

      expect(txPaymentRepo.remove).toHaveBeenCalledWith([
        existing[3],
        existing[4],
        existing[5],
      ]);
      expect(txPaymentRepo.save).not.toHaveBeenCalled();
    });

    it('blocks (400) a decrease below the highest paid installment and applies no changes', async () => {
      const existing = [
        {
          id: 100,
          installmentNumber: 1,
          paidDate: '2026-01-01',
        } as unknown as Payment,
        {
          id: 101,
          installmentNumber: 2,
          paidDate: '2026-02-01',
        } as unknown as Payment,
        {
          id: 102,
          installmentNumber: 3,
          paidDate: '2026-03-01',
        } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction([enrollmentA], {
        1: existing,
      });

      await expect(service.adjustForSection(5, 2)).rejects.toThrow(
        BadRequestException,
      );
      expect(txPaymentRepo.remove).not.toHaveBeenCalled();
      expect(txPaymentRepo.save).not.toHaveBeenCalled();
    });

    it('blocks the whole section adjustment if ANY enrollment would breach its paid floor', async () => {
      const paidEnrollment = [
        {
          id: 200,
          installmentNumber: 1,
          paidDate: '2026-01-01',
        } as unknown as Payment,
        {
          id: 201,
          installmentNumber: 2,
          paidDate: '2026-02-01',
        } as unknown as Payment,
      ];
      const safeEnrollment = [
        { id: 300, installmentNumber: 1, paidDate: null } as unknown as Payment,
        { id: 301, installmentNumber: 2, paidDate: null } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction([enrollmentA, enrollmentB], {
        1: paidEnrollment,
        2: safeEnrollment,
      });

      await expect(service.adjustForSection(5, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(txPaymentRepo.remove).not.toHaveBeenCalled();
    });

    it('treats a null count later set to N as a standard increase from 0', async () => {
      const { txPaymentRepo } = mockTransaction([enrollmentA], { 1: [] });

      await service.adjustForSection(5, 4);

      expect(txPaymentRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ installmentNumber: 1 }),
        expect.objectContaining({ installmentNumber: 2 }),
        expect.objectContaining({ installmentNumber: 3 }),
        expect.objectContaining({ installmentNumber: 4 }),
      ]);
    });

    it('is idempotent: re-running with the same count makes no changes', async () => {
      const existing = [
        {
          id: 100,
          installmentNumber: 1,
          paidDate: '2026-01-01',
        } as unknown as Payment,
        { id: 101, installmentNumber: 2, paidDate: null } as unknown as Payment,
        { id: 102, installmentNumber: 3, paidDate: null } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction([enrollmentA], {
        1: existing,
      });

      await service.adjustForSection(5, 3);

      expect(txPaymentRepo.remove).not.toHaveBeenCalled();
      expect(txPaymentRepo.save).not.toHaveBeenCalled();
    });
  });

  // Status derived from paidDate (design ADR), no DB status column.
  describe('toView', () => {
    // Mirrors the LOCAL-date-parts construction required of the service's
    // `localTodayIso()` helper (never `toISOString()`, which UTC-shifts).
    // Used only to build test input for the today/boundary cases below —
    // this is NOT importing the implementation, just building an expected
    // "today" string the same timezone-safe way.
    function todayIso(): string {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    it('maps a null paidDate to pendiente', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('pendiente');
    });

    it('maps a set paidDate to cancelado', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: 100,
        paidDate: new Date('2026-01-01') as unknown as Date,
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('cancelado');
    });

    // Manual due-date + "atrasado" derivation (client rule: a pending cuota
    // whose dueDate is in the past shows as atrasado — purely informational,
    // no late fee/mora).
    it('returns cancelado when paidDate is set, even if dueDate is in the past', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: 100,
        paidDate: '2026-01-01',
        dueDate: '2000-01-01',
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('cancelado');
    });

    it('returns cancelado when paidDate is set, even if dueDate is in the future', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: 100,
        paidDate: '2026-01-01',
        dueDate: '2100-01-01',
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('cancelado');
    });

    it('returns atrasado when paidDate is null and dueDate is strictly before today', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
        dueDate: '2000-01-01',
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('atrasado');
    });

    it('returns pendiente when paidDate is null and dueDate is null', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
        dueDate: null,
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('pendiente');
    });

    // Boundary: dueDate == today is NOT atrasado.
    it('returns pendiente when paidDate is null and dueDate is today', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
        dueDate: todayIso(),
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('pendiente');
    });

    it('returns pendiente when paidDate is null and dueDate is in the future', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
        dueDate: '2100-01-01',
      } as unknown as Payment;

      expect(service.toView(payment).status).toBe('pendiente');
    });

    it('includes dueDate in the view output', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
        dueDate: '2100-06-15',
      } as unknown as Payment;

      expect(service.toView(payment).dueDate).toBe('2100-06-15');
    });

    // Regression guard (sdd/pagos verify PR3/PR4 WARNING finding): Postgres
    // `numeric` columns hydrate as STRINGS via node-postgres. Every payment
    // endpoint routes through this shared mapper, so normalizing here
    // guarantees `amount` is always a JS number in every response,
    // regardless of whether the underlying entity came from a fresh DB read
    // (string) or a caller-supplied write (already a number).
    it('normalizes a string amount (as returned by a live Postgres numeric column) to a number', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: '175.50' as unknown as number,
        paidDate: '2026-01-01',
      } as unknown as Payment;

      const result = service.toView(payment);

      expect(result.amount).toBe(175.5);
      expect(typeof result.amount).toBe('number');
    });

    it('keeps a null amount as null (pending installment)', () => {
      const payment = {
        id: 1,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
      } as unknown as Payment;

      expect(service.toView(payment).amount).toBeNull();
    });
  });

  // Admin Payment Registration + Admin Payment Correction (spec:
  // "payment-management" domain). One method serves both: design's single
  // `PATCH /payment/:id` endpoint sets amount+paidDate whether the row is
  // currently pending (registration) or already paid (correction) — no
  // audit history, edit is a plain overwrite (design ADR "Pay vs unmark
  // API").
  describe('pay', () => {
    it('registers a payment on a pending installment', async () => {
      const pending = {
        id: 10,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
      } as unknown as Payment;
      paymentRepository.findOne.mockResolvedValue(pending);

      const result = await service.pay(10, {
        amount: 150.5,
        paidDate: '2026-07-23',
      });

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          amount: 150.5,
          paidDate: '2026-07-23',
        }),
      );
      expect(result.status).toBe('cancelado');
      expect(result.amount).toBe(150.5);
    });

    // Regression guard (sdd/pagos verify PR3/PR4 CRITICAL finding): asserts
    // the ISO date-only string is persisted UNCHANGED, with no `new Date()`
    // wrapping. This is a unit-level guard on the assignment logic only —
    // a mocked repository never touches the real pg driver, so it cannot
    // by itself catch node-postgres/TypeORM's timezone-dependent date
    // serialization. The actual persistence guard is the live curl+psql
    // round-trip check (see apply-progress / verify report evidence).
    it('does not wrap paidDate in a Date object (avoids TZ-dependent day/year rollback on persist)', async () => {
      const pending = {
        id: 20,
        installmentNumber: 1,
        amount: null,
        paidDate: null,
      } as unknown as Payment;
      paymentRepository.findOne.mockResolvedValue(pending);

      await service.pay(20, { amount: 50, paidDate: '2026-01-01' });

      const savedArg = paymentRepository.save.mock.calls[0][0];
      expect(typeof savedArg.paidDate).toBe('string');
      expect(savedArg.paidDate).toBe('2026-01-01');
    });

    it('corrects amount/paidDate on an already-paid installment', async () => {
      const paid = {
        id: 11,
        installmentNumber: 1,
        amount: 100,
        paidDate: new Date('2026-01-01'),
      } as unknown as Payment;
      paymentRepository.findOne.mockResolvedValue(paid);

      const result = await service.pay(11, {
        amount: 120,
        paidDate: '2026-02-01',
      });

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 11, amount: 120 }),
      );
      expect(result.status).toBe('cancelado');
      expect(result.amount).toBe(120);
    });

    it('rejects paying an installment that does not exist', async () => {
      paymentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.pay(999, { amount: 100, paidDate: '2026-01-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  // Admin Payment Correction — "Revert to pending" scenario. No audit
  // history: unmark is a plain clear of both fields (user decision).
  describe('unmark', () => {
    it('reverts a paid installment to pendiente, clearing amount and paidDate', async () => {
      const paid = {
        id: 12,
        installmentNumber: 2,
        amount: 100,
        paidDate: new Date('2026-01-01'),
      } as unknown as Payment;
      paymentRepository.findOne.mockResolvedValue(paid);

      const result = await service.unmark(12);

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 12, amount: null, paidDate: null }),
      );
      expect(result.status).toBe('pendiente');
      expect(result.amount).toBeNull();
    });

    it('is a no-op-safe overwrite when unmarking an already-pending installment', async () => {
      const pending = {
        id: 13,
        installmentNumber: 3,
        amount: null,
        paidDate: null,
      } as unknown as Payment;
      paymentRepository.findOne.mockResolvedValue(pending);

      const result = await service.unmark(13);

      expect(result.status).toBe('pendiente');
    });

    it('rejects unmarking an installment that does not exist', async () => {
      paymentRepository.findOne.mockResolvedValue(null);

      await expect(service.unmark(999)).rejects.toThrow(BadRequestException);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  // Section+Installment-Scoped Due Date (client rule, sdd/pagos due-date
  // refactor): a "Cuota N" due date applies to EVERY student's installment N
  // in the section, not to one Payment row. Mirrors adjustForSection's
  // section -> enrollments -> payments resolution/transaction pattern.
  // Assigns the validated date-only string straight through, same discipline
  // as `pay()`'s paidDate assignment.
  describe('setDueDateForSectionInstallment', () => {
    const enrollmentA = { id: 1 } as Enrollment;
    const enrollmentB = { id: 2 } as Enrollment;

    function mockTransaction(matchingPayments: Payment[]) {
      const enrollmentRepo = {
        find: jest.fn().mockResolvedValue([enrollmentA, enrollmentB]),
      };
      const txPaymentRepo = {
        find: jest.fn().mockResolvedValue(matchingPayments),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === Enrollment ? enrollmentRepo : txPaymentRepo,
        ),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { enrollmentRepo, txPaymentRepo };
    }

    it('sets dueDate on every matching installment-N row across the section and returns the refreshed section rows', async () => {
      const matching = [
        {
          id: 10,
          installmentNumber: 2,
          enrollment: enrollmentA,
          dueDate: null,
        } as unknown as Payment,
        {
          id: 11,
          installmentNumber: 2,
          enrollment: enrollmentB,
          dueDate: null,
        } as unknown as Payment,
      ];
      const { enrollmentRepo, txPaymentRepo } = mockTransaction(matching);

      // findBySection's refresh call runs against the outer (non-tx) repos.
      enrollmentRepository.find.mockResolvedValue([enrollmentA, enrollmentB]);
      paymentRepository.find.mockResolvedValue(
        matching.map((payment) => ({
          ...payment,
          dueDate: '2026-08-01',
        })),
      );

      const result = await service.setDueDateForSectionInstallment(5, 2, {
        dueDate: '2026-08-01',
      });

      expect(enrollmentRepo.find).toHaveBeenCalledWith({
        where: { section: { id: 5 } },
      });
      expect(txPaymentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ installmentNumber: 2 }),
        }),
      );
      expect(txPaymentRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ id: 10, dueDate: '2026-08-01' }),
        expect.objectContaining({ id: 11, dueDate: '2026-08-01' }),
      ]);
      const savedArg = txPaymentRepo.save.mock.calls[0][0];
      expect(savedArg.every((p: Payment) => typeof p.dueDate === 'string')).toBe(
        true,
      );
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 10, dueDate: '2026-08-01' }),
          expect.objectContaining({ id: 11, dueDate: '2026-08-01' }),
        ]),
      );
    });

    it('clears dueDate to null across the section when dto.dueDate is null', async () => {
      const matching = [
        {
          id: 10,
          installmentNumber: 2,
          enrollment: enrollmentA,
          dueDate: '2026-08-01',
        } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction(matching);
      enrollmentRepository.find.mockResolvedValue([enrollmentA]);
      paymentRepository.find.mockResolvedValue([
        { ...matching[0], dueDate: null },
      ]);

      const result = await service.setDueDateForSectionInstallment(5, 2, {
        dueDate: null,
      });

      expect(txPaymentRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ id: 10, dueDate: null }),
      ]);
      expect(result[0].dueDate).toBeNull();
    });

    it('does not touch other installment numbers: the query scopes strictly to the requested installmentNumber', async () => {
      // A real repository's `where: { installmentNumber }` filter would never
      // return rows for other installment numbers — this asserts that filter
      // is actually passed, so cuota 1/3/etc. rows in the same section are
      // untouched by this write.
      const onlyInstallmentTwo = [
        {
          id: 10,
          installmentNumber: 2,
          enrollment: enrollmentA,
          dueDate: null,
        } as unknown as Payment,
      ];
      const { txPaymentRepo } = mockTransaction(onlyInstallmentTwo);
      enrollmentRepository.find.mockResolvedValue([enrollmentA]);
      paymentRepository.find.mockResolvedValue([
        { ...onlyInstallmentTwo[0], dueDate: '2026-08-01' },
      ]);

      await service.setDueDateForSectionInstallment(5, 2, {
        dueDate: '2026-08-01',
      });

      const findArg = txPaymentRepo.find.mock.calls[0][0];
      expect(findArg.where.installmentNumber).toBe(2);
      const savedArg = txPaymentRepo.save.mock.calls[0][0];
      expect(
        savedArg.every((p: Payment) => p.installmentNumber === 2),
      ).toBe(true);
    });

    it('makes no changes when the section has no enrollments', async () => {
      const { txPaymentRepo, enrollmentRepo } = mockTransaction([]);
      enrollmentRepo.find.mockResolvedValue([]);
      enrollmentRepository.find.mockResolvedValue([]);

      const result = await service.setDueDateForSectionInstallment(5, 2, {
        dueDate: '2026-08-01',
      });

      expect(txPaymentRepo.find).not.toHaveBeenCalled();
      expect(txPaymentRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('makes no changes when no payment in the section matches the installment number', async () => {
      const { txPaymentRepo } = mockTransaction([]);
      enrollmentRepository.find.mockResolvedValue([enrollmentA]);
      paymentRepository.find.mockResolvedValue([]);

      const result = await service.setDueDateForSectionInstallment(5, 9, {
        dueDate: '2026-08-01',
      });

      expect(txPaymentRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  // Role-Based Access + Alumno Read-Only Mis Cuotas (spec:
  // "student-payments-view" domain). Alumno may only read installments for
  // an enrollment that is actually theirs; TUTOR is denied at the service
  // layer too (defense in depth — the controller's @Roles(ADMIN, ALUMNO)
  // already keeps TUTOR from reaching this method in practice, PR4 scope).
  describe('findByEnrollment', () => {
    const ownEnrollment = {
      id: 7,
      user: { id: 'alumno-1' },
    } as unknown as Enrollment;

    it('returns payments ordered by installment number for the owning alumno', async () => {
      enrollmentRepository.findOne.mockResolvedValue(ownEnrollment);
      const payments = [
        { id: 1, installmentNumber: 1, amount: null, paidDate: null },
        {
          id: 2,
          installmentNumber: 2,
          amount: 100,
          paidDate: new Date('2026-01-01'),
        },
      ] as unknown as Payment[];
      paymentRepository.find.mockResolvedValue(payments);

      const result = await service.findByEnrollment(7, {
        id: 'alumno-1',
        role: Role.ALUMNO,
      });

      expect(paymentRepository.find).toHaveBeenCalledWith({
        where: { enrollment: { id: 7 } },
        order: { installmentNumber: 'ASC' },
      });
      expect(result.map((p) => p.status)).toEqual(['pendiente', 'cancelado']);
    });

    it('allows ADMIN to read any enrollment', async () => {
      enrollmentRepository.findOne.mockResolvedValue(ownEnrollment);
      paymentRepository.find.mockResolvedValue([]);

      await expect(
        service.findByEnrollment(7, { id: 'admin-1', role: Role.ADMIN }),
      ).resolves.toEqual([]);
    });

    it('denies an alumno reading a different alumno enrollment (403)', async () => {
      enrollmentRepository.findOne.mockResolvedValue(ownEnrollment);

      await expect(
        service.findByEnrollment(7, { id: 'alumno-2', role: Role.ALUMNO }),
      ).rejects.toThrow(ForbiddenException);
      expect(paymentRepository.find).not.toHaveBeenCalled();
    });

    it('denies TUTOR at the service layer (defense in depth)', async () => {
      enrollmentRepository.findOne.mockResolvedValue(ownEnrollment);

      await expect(
        service.findByEnrollment(7, { id: 'tutor-1', role: Role.TUTOR }),
      ).rejects.toThrow(ForbiddenException);
      expect(paymentRepository.find).not.toHaveBeenCalled();
    });

    it('rejects when the enrollment does not exist', async () => {
      enrollmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findByEnrollment(999, { id: 'admin-1', role: Role.ADMIN }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // Section Detail Pagos Tab (spec: "payment-management" domain) — admin
  // grid data source. Returns a flat, per-installment list scoped to every
  // enrollment in the section (frontend groups by enrollmentId, PR6 scope).
  describe('findBySection', () => {
    it('returns an empty list when the section has no enrollments', async () => {
      enrollmentRepository.find.mockResolvedValue([]);

      const result = await service.findBySection(11);

      expect(enrollmentRepository.find).toHaveBeenCalledWith({
        where: { section: { id: 11 } },
      });
      expect(paymentRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns installments for every enrollment in the section, ordered by installment number', async () => {
      const enrollmentA = {
        id: 7,
        user: { id: 'alumno-1', name: 'Ana', lastName: 'Lopez' },
      } as unknown as Enrollment;
      const enrollmentB = {
        id: 8,
        user: { id: 'alumno-2', name: 'Beto', lastName: 'Diaz' },
      } as unknown as Enrollment;
      enrollmentRepository.find.mockResolvedValue([enrollmentA, enrollmentB]);

      const payments = [
        {
          id: 1,
          installmentNumber: 1,
          amount: null,
          paidDate: null,
          enrollment: enrollmentA,
        },
        {
          id: 2,
          installmentNumber: 1,
          amount: 100,
          paidDate: new Date('2026-01-01'),
          enrollment: enrollmentB,
        },
      ] as unknown as Payment[];
      paymentRepository.find.mockResolvedValue(payments);

      const result = await service.findBySection(11);

      expect(paymentRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['enrollment'],
          order: { installmentNumber: 'ASC' },
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 1,
          enrollmentId: 7,
          studentId: 'alumno-1',
          studentName: 'Ana Lopez',
          status: 'pendiente',
        }),
        expect.objectContaining({
          id: 2,
          enrollmentId: 8,
          studentId: 'alumno-2',
          studentName: 'Beto Diaz',
          status: 'cancelado',
        }),
      ]);
    });
  });
});
