import { Module } from '@nestjs/common';
import { GradeService } from './grade.service';
import { GradeController } from './grade.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grade } from './entities/grade.entity';
import { ActivityModule } from 'src/activity/activity.module';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { EnrollmentService } from 'src/enrollment/enrollment.service';
import { ActivityService } from 'src/activity/activity.service';
import { UserModule } from 'src/user/user.module';
import { CourseModule } from 'src/course/course.module';
import { CourseService } from 'src/course/course.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Grade]), ActivityModule, EnrollmentModule, UserModule, CourseModule,AuthModule],
  controllers: [GradeController],
  providers: [GradeService, EnrollmentService, ActivityService, CourseService],
  exports: [TypeOrmModule, GradeService],
})
export class GradeModule {}
