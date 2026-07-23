import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from './course/course.module';
import { SectionModule } from './section/section.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { NotificationModule } from './notification/notification.module';
import { ActivityModule } from './activity/activity.module';
import { GradeModule } from './grade/grade.module';
import { Grade } from './grade/entities/grade.entity';
import { Course } from './course/entities/course.entity';
import { Section } from './section/entities/section.entity';
import { Enrollment } from './enrollment/entities/enrollment.entity';
import { User } from './user/entities/user.entity';
import { Notification } from './notification/entities/notification.entity';
import { Activity } from './activity/entities/activity.entity';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guard/roles.guard';
import { ImagesModule } from './images/images.module';
import { PaymentModule } from './payment/payment.module';
import { Payment } from './payment/entities/payment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    UserModule,
    CourseModule,
    SectionModule,
    EnrollmentModule,
    NotificationModule,
    ActivityModule,
    GradeModule,
    PaymentModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT) : 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      // Schema changes are managed exclusively through TypeORM migrations
      // (npm run migration:run). Auto-sync is disabled permanently to avoid
      // uncontrolled DDL against the course/section tables. See
      // BackSpa/docs/deploy-runbook.md.
      synchronize: false,
      entities: [
        Grade,
        Course,
        Section,
        Enrollment,
        User,
        Notification,
        Activity,
        Payment,
      ],
      // Local Postgres has no SSL. Set DB_SSL=true for managed providers that require it.
      ssl:
        process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    ImagesModule,
  ],
})
export class AppModule {}
