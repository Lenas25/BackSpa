import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { AuthModule } from 'src/auth/auth.module';

// PaymentModule owns the installment lifecycle. It registers BOTH the
// Payment and Enrollment repositories here (registering a repository token
// in two modules is safe — the documented anti-pattern is re-declaring
// SERVICES as local providers, which this module does not do). This keeps
// EnrollmentModule/SectionModule free to import PaymentModule directly
// without introducing a Section -> Payment -> Enrollment -> Section import
// cycle that would otherwise require forwardRef across three modules.
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Enrollment]), AuthModule],
  exports: [TypeOrmModule],
})
export class PaymentModule {}
