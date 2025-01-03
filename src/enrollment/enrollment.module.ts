import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { UserModule } from 'src/user/user.module';
import { CourseModule } from 'src/course/course.module';
import { UserService } from 'src/user/user.service';
import { CourseService } from 'src/course/course.service';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment]), UserModule, CourseModule, AuthModule, ActivityModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, UserService, CourseService, ActivityService],
  exports: [TypeOrmModule, EnrollmentService],
})
export class EnrollmentModule {}
