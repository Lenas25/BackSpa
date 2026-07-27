import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { Grade } from 'src/grade/entities/grade.entity';
import { Activity } from 'src/activity/entities/activity.entity';
import { Notification } from 'src/notification/entities/notification.entity';
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
//
// Grade/Activity/Notification are registered as bare repositories (not via
// GradeModule/ActivityModule/NotificationModule) on purpose: EnrollmentService
// only needs read/write access to those entities to compute the
// finishSection verdict and write notifications — it does not need their
// service layers. Importing GradeModule here would also be circular, since
// GradeModule already imports EnrollmentModule.
@Module({
  imports: [
    TypeOrmModule.forFeature([Enrollment, Grade, Activity, Notification]),
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
