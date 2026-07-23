import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

export interface PaymentView {
  id: number;
  installmentNumber: number;
  amount: number | null;
  paidDate: Date | null;
  status: 'pendiente' | 'cancelado';
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Status is derived from paidDate, never a DB column (design ADR "Status:
  // derived from paidDate" — sdd/pagos/design). Only payment endpoints
  // return this view.
  toView(payment: Payment): PaymentView {
    return {
      id: payment.id,
      installmentNumber: payment.installmentNumber,
      amount: payment.amount,
      paidDate: payment.paidDate,
      status: payment.paidDate ? 'cancelado' : 'pendiente',
    };
  }

  // Auto-Generation on Enrollment (spec: "payment-management" domain).
  // `count` is the section's `installmentsCount` at enrollment time; null or
  // 0 creates no installments. Called from EnrollmentService.update's
  // `usersToAdd` loop, post-dedupe, once per newly enrolled student.
  async generateForEnrollment(
    enrollment: Enrollment,
    count: number | null | undefined,
  ): Promise<Payment[]> {
    const installmentsCount = count ?? 0;
    if (installmentsCount <= 0) {
      return [];
    }

    const pendingInstallments = Array.from(
      { length: installmentsCount },
      (_, index) =>
        this.paymentRepository.create({
          enrollment,
          installmentNumber: index + 1,
          amount: null,
          paidDate: null,
        }),
    );

    return await this.paymentRepository.save(pendingInstallments);
  }

  // Count-Change Adjustment (spec: "payment-management" domain). Runs
  // transactionally across every enrollment of the section: the paid-floor
  // is validated for ALL enrollments FIRST — if any enrollment already has
  // a paid installment above `newCount`, the whole adjustment is rejected
  // with a 400 and NO enrollment is mutated (design ADR "Adjustment
  // atomicity" — sdd/pagos/design). Only after every enrollment clears the
  // floor does it remove unpaid installments above `newCount` and insert
  // missing pending installments up to `newCount`. Idempotent: re-running
  // with the same count is a no-op (also covers "null count set later" —
  // that is just a standard increase from 0).
  async adjustForSection(
    sectionId: number,
    newCount: number | null | undefined,
  ): Promise<void> {
    const targetCount = Math.max(newCount ?? 0, 0);

    await this.dataSource.transaction(async (manager) => {
      const enrollmentRepository = manager.getRepository(Enrollment);
      const paymentRepository = manager.getRepository(Payment);

      const enrollments = await enrollmentRepository.find({
        where: { section: { id: sectionId } },
      });

      const paymentsByEnrollment = new Map<Enrollment, Payment[]>();
      for (const enrollment of enrollments) {
        const payments = await paymentRepository.find({
          where: { enrollment: { id: enrollment.id } },
        });
        paymentsByEnrollment.set(enrollment, payments);
      }

      for (const [enrollment, payments] of paymentsByEnrollment) {
        const highestPaidInstallment = payments
          .filter((payment) => payment.paidDate != null)
          .reduce(
            (max, payment) => Math.max(max, payment.installmentNumber),
            0,
          );

        if (highestPaidInstallment > targetCount) {
          throw new BadRequestException(
            `No se puede reducir la cantidad de cuotas a ${targetCount}: la matrícula ${enrollment.id} ya tiene cuotas pagadas hasta la cuota ${highestPaidInstallment}.`,
          );
        }
      }

      for (const [enrollment, payments] of paymentsByEnrollment) {
        const installmentsToRemove = payments.filter(
          (payment) =>
            payment.paidDate == null && payment.installmentNumber > targetCount,
        );
        if (installmentsToRemove.length > 0) {
          await paymentRepository.remove(installmentsToRemove);
        }

        const existingInstallmentNumbers = new Set(
          payments
            .filter((payment) => payment.installmentNumber <= targetCount)
            .map((payment) => payment.installmentNumber),
        );

        const installmentsToAdd: Payment[] = [];
        for (
          let installmentNumber = 1;
          installmentNumber <= targetCount;
          installmentNumber++
        ) {
          if (!existingInstallmentNumbers.has(installmentNumber)) {
            installmentsToAdd.push(
              paymentRepository.create({
                enrollment,
                installmentNumber,
                amount: null,
                paidDate: null,
              }),
            );
          }
        }
        if (installmentsToAdd.length > 0) {
          await paymentRepository.save(installmentsToAdd);
        }
      }
    });
  }
}
