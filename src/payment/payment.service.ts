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
import { SetDueDateDto } from './dto/set-due-date.dto';
import { Role } from 'src/common/enums/role.enum';
import type { RequestingUser } from 'src/section/section.service';

export interface PaymentView {
  id: number;
  installmentNumber: number;
  amount: number | null;
  paidDate: string | null;
  dueDate: string | null;
  status: 'pendiente' | 'cancelado' | 'atrasado';
}

// LOCAL date-parts string, built the same way `paidDate`/`dueDate` are
// validated and stored ("YYYY-MM-DD"). Deliberately NOT `toISOString()`,
// which reads UTC and shifts the calendar day on any host east of UTC-0 at
// certain times of day. Both operands of the `<` comparison below are
// zero-padded "YYYY-MM-DD" strings, so a plain string compare is correct
// and timezone-safe — no `new Date(...)` parsing needed on either side.
function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // Status is derived from paidDate/dueDate, never a DB column (design ADR
  // "Status: derived from paidDate" — sdd/pagos/design; extended by the
  // dueDate/atrasado feature). Only payment endpoints return this view.
  //
  // "atrasado" derivation (client rule): paidDate always wins — a paid
  // installment is "cancelado" even if its dueDate is in the past. Only a
  // still-PENDING installment (paidDate null) with a dueDate strictly
  // before today becomes "atrasado". This is purely informational: no late
  // fee/mora/extra amount is computed anywhere from this status.
  //
  // `amount` normalization (bugfix, sdd/pagos verify PR3/PR4 WARNING
  // finding): Postgres `numeric` columns are hydrated by node-postgres as
  // STRINGS (e.g. "175.50"), while `pay()`/`unmark()` echo back the
  // caller-supplied JS number without a round-trip through the DB — so the
  // same field returned `string` on GET and `number` on PATCH. Normalizing
  // here, in the single shared view-mapper every payment endpoint routes
  // through, guarantees `amount` is always a `number` (or `null` while
  // pending) regardless of which code path produced the underlying
  // `Payment` entity. NOTE: this codebase does NOT wire up
  // `ClassSerializerInterceptor` anywhere and every controller builds its
  // response manually via `@Res() response.json(...)`, so a class-
  // transformer `@Transform` decorator on the entity (the pattern used by
  // `Enrollment.final_grade`) would silently never run for these routes —
  // confirmed no `instanceToPlain`/`ClassSerializerInterceptor` usage
  // anywhere in `src/`. Normalizing explicitly here is the fix that
  // actually reaches the response.
  toView(payment: Payment): PaymentView {
    let status: PaymentView['status'];
    if (payment.paidDate != null) {
      status = 'cancelado';
    } else if (payment.dueDate != null && payment.dueDate < localTodayIso()) {
      status = 'atrasado';
    } else {
      status = 'pendiente';
    }

    return {
      id: payment.id,
      installmentNumber: payment.installmentNumber,
      amount: payment.amount === null ? null : Number(payment.amount),
      paidDate: payment.paidDate,
      dueDate: payment.dueDate ?? null,
      status,
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
    // bugfix (sdd/pagos verify PR3/PR4 CRITICAL finding): do NOT construct
    // `new Date(dto.paidDate)`. `dto.paidDate` is already a date-only ISO
    // string validated by `@IsISO8601` — assigning it straight through to
    // this `date`-typed column avoids TypeORM's Date-object persist path
    // (which reads LOCAL timezone getters off a UTC-parsed instant and
    // silently rolls the date back a day, or a year on Jan 1st, on any
    // host west of UTC). See entities/payment.entity.ts's `paidDate` field
    // comment for the full root-cause trace.
    payment.paidDate = dto.paidDate;

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

  // Section+Installment-Scoped Due Date (client rule, sdd/pagos due-date
  // refactor): a "Cuota N" due date belongs to the SECTION, not to an
  // individual student's Payment row — setting it must apply to EVERY
  // student's installment N in that section. Mirrors adjustForSection's
  // section -> enrollments -> payments resolution and transaction pattern
  // (design ADR "Adjustment atomicity" — sdd/pagos/design — extended here to
  // due-date writes). Assigns the DTO's validated string (or null) straight
  // through: never construct `new Date(dto.dueDate)` (see
  // entities/payment.entity.ts's `dueDate` field comment for the TZ
  // root-cause trace shared with `paidDate`). Returns the refreshed section
  // rows via `findBySection` so the caller always sees the full updated
  // grid, not just the rows touched by this write.
  async setDueDateForSectionInstallment(
    sectionId: number,
    installmentNumber: number,
    dto: SetDueDateDto,
  ): Promise<PaymentSectionRow[]> {
    await this.dataSource.transaction(async (manager) => {
      const enrollmentRepository = manager.getRepository(Enrollment);
      const paymentRepository = manager.getRepository(Payment);

      const enrollments = await enrollmentRepository.find({
        where: { section: { id: sectionId } },
      });
      if (enrollments.length === 0) {
        return;
      }

      const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
      const payments = await paymentRepository.find({
        where: {
          enrollment: { id: In(enrollmentIds) },
          installmentNumber,
        },
      });

      if (payments.length === 0) {
        return;
      }

      for (const payment of payments) {
        payment.dueDate = dto.dueDate;
      }
      await paymentRepository.save(payments);
    });

    return this.findBySection(sectionId);
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
