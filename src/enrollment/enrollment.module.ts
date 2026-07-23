import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { UserModule } from 'src/user/user.module';
import { SectionModule } from 'src/section/section.module';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentModule } from 'src/payment/payment.module';

// SectionService/UserService/PaymentService are NOT re-declared here:
// SectionModule, UserModule, and PaymentModule already export them (plus
// their TypeOrmModule repositories), so importing those modules is
// sufficient. Re-declaring a service that an imported module already
// provides creates a second, module-local instance whose own dependencies
// must resolve strictly from THIS module's imports — which previously broke
// here (SectionService's CourseRepository dependency was not available in
// EnrollmentModule's scope, crash-looping app boot).
@Module({
  imports: [
    TypeOrmModule.forFeature([Enrollment]),
    UserModule,
    SectionModule,
    AuthModule,
    PaymentModule,
  ],
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [TypeOrmModule, EnrollmentService],
})
export class EnrollmentModule {}
