import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    paymentRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (rows) => rows),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
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
        { id: 100, installmentNumber: 1, paidDate: '2026-01-01' } as unknown as Payment,
        { id: 101, installmentNumber: 2, paidDate: '2026-02-01' } as unknown as Payment,
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
        { id: 100, installmentNumber: 1, paidDate: '2026-01-01' } as unknown as Payment,
        { id: 101, installmentNumber: 2, paidDate: '2026-02-01' } as unknown as Payment,
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
        { id: 100, installmentNumber: 1, paidDate: '2026-01-01' } as unknown as Payment,
        { id: 101, installmentNumber: 2, paidDate: '2026-02-01' } as unknown as Payment,
        { id: 102, installmentNumber: 3, paidDate: '2026-03-01' } as unknown as Payment,
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
        { id: 200, installmentNumber: 1, paidDate: '2026-01-01' } as unknown as Payment,
        { id: 201, installmentNumber: 2, paidDate: '2026-02-01' } as unknown as Payment,
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
        { id: 100, installmentNumber: 1, paidDate: '2026-01-01' } as unknown as Payment,
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
  });
});
