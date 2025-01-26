import { forwardRef, Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { Course } from './entities/course.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityModule } from 'src/activity/activity.module';
import { ActivityService } from 'src/activity/activity.service';
import { UserModule } from 'src/user/user.module';
import { UserService } from 'src/user/user.service';

@Module({
  imports: [TypeOrmModule.forFeature([Course]), AuthModule, forwardRef(() => ActivityModule), UserModule],
  controllers: [CourseController],
  providers: [CourseService, ActivityService, UserService],
  exports: [TypeOrmModule, CourseService],
})
export class CourseModule {}
