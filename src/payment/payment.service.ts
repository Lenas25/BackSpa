import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { Role } from 'src/common/enums/role.enum';
import type { RequestingUser } from 'src/section/section.service';

export interface PaymentView {
  id: number;
  installmentNumber: number;
  amount: number | null;
  paidDate: Date | null;
  status: 'pendiente' | 'cancelado';
}

export interface PaymentSectionRow extends PaymentView {
  enrollmentId: number;
  studentId: string | undefined;
  studentName: string;
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
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

  // Admin Payment Registration + Admin Payment Correction (spec:
  // "payment-management" domain). Design's single `PATCH /payment/:id`
  // endpoint covers both: this method unconditionally overwrites
  // amount+paidDate whether the row is currently pending (registration) or
  // already paid (correction) — no separate "edit" method, no audit
  // history (design ADR "Pay vs unmark API").
  async pay(id: number, dto: RegisterPaymentDto): Promise<PaymentView> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new BadRequestException('La cuota no existe');
    }

    payment.amount = dto.amount;
    payment.paidDate = new Date(dto.paidDate);

    const saved = await this.paymentRepository.save(payment);
    return this.toView(saved);
  }

  // Admin Payment Correction — "Revert to pending" scenario (spec:
  // "payment-management" domain). No audit history: a plain clear of both
  // fields (user decision).
  async unmark(id: number): Promise<PaymentView> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new BadRequestException('La cuota no existe');
    }

    payment.amount = null;
    payment.paidDate = null;

    const saved = await this.paymentRepository.save(payment);
    return this.toView(saved);
  }

  // Alumno Read-Only Mis Cuotas + Role-Based Access (spec:
  // "student-payments-view" domain). Follows GradeService.findByEnrollment's
  // ownership idiom: ALUMNO only sees an enrollment that is actually theirs.
  async findByEnrollment(
    id: number,
    requestingUser?: RequestingUser,
  ): Promise<PaymentView[]> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id },
    });
    if (!enrollment) {
      throw new BadRequestException('La matrícula no existe');
    }

    this.assertEnrollmentOwnership(enrollment, requestingUser);

    const payments = await this.paymentRepository.find({
      where: { enrollment: { id } },
      order: { installmentNumber: 'ASC' },
    });

    return payments.map((payment) => this.toView(payment));
  }

  // Section Detail Pagos Tab (spec: "payment-management" domain) — admin
  // grid data source. Flat, per-installment list scoped to every enrollment
  // in the section; the frontend groups rows by `enrollmentId` into a
  // per-student accordion (design's Frontend Architecture, PR6 scope).
  async findBySection(sectionId: number): Promise<PaymentSectionRow[]> {
    const enrollments = await this.enrollmentRepository.find({
      where: { section: { id: sectionId } },
    });
    if (enrollments.length === 0) {
      return [];
    }

    const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    const payments = await this.paymentRepository.find({
      where: { enrollment: { id: In(enrollmentIds) } },
      relations: ['enrollment'],
      order: { installmentNumber: 'ASC' },
    });

    return payments.map((payment) => ({
      ...this.toView(payment),
      enrollmentId: payment.enrollment.id,
      studentId: payment.enrollment.user?.id,
      studentName: payment.enrollment.user
        ? `${payment.enrollment.user.name} ${payment.enrollment.user.lastName}`
        : '',
    }));
  }

  // TUTOR is denied regardless of section assignment (spec: "Role-Based
  // Access" requirement). This is defense in depth — PaymentController's
  // @Roles(ADMIN, ALUMNO) (PR4 scope) already keeps TUTOR from reaching this
  // method in practice, matching design's Authorization table.
  private assertEnrollmentOwnership(
    enrollment: Enrollment,
    requestingUser?: RequestingUser,
  ) {
    if (!requestingUser) {
      return;
    }
    if (requestingUser.role === Role.TUTOR) {
      throw new ForbiddenException('No tiene acceso a los datos de pagos');
    }
    if (
      requestingUser.role === Role.ALUMNO &&
      enrollment.user?.id !== requestingUser.id
    ) {
      throw new ForbiddenException(
        'No tiene acceso a los datos de esta matrícula',
      );
    }
  }
}
