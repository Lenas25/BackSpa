import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule } from './course/course.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { NotificationModule } from './notification/notification.module';
import { ActivityModule } from './activity/activity.module';
import { GradeModule } from './grade/grade.module';
import { Grade } from './grade/entities/grade.entity';
import { Course } from './course/entities/course.entity';
import { Enrollment } from './enrollment/entities/enrollment.entity';
import { User } from './user/entities/user.entity';
import { Notification } from './notification/entities/notification.entity';
import { Activity } from './activity/entities/activity.entity';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guard/roles.guard';
import { ImagesModule } from './images/images.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    UserModule,
    CourseModule,
    EnrollmentModule,
    NotificationModule,
    ActivityModule,
    GradeModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT) : 3306,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      entities: [Grade, Course, Enrollment, User, Notification, Activity],
    }),
    AuthModule,
    ImagesModule,
  ],
})
export class AppModule {}