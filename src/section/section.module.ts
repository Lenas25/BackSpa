import { forwardRef, Module } from '@nestjs/common';
import { SectionService } from './section.service';
import { SectionController } from './section.controller';
import { Section } from './entities/section.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityModule } from 'src/activity/activity.module';
import { ActivityService } from 'src/activity/activity.service';
import { UserModule } from 'src/user/user.module';
import { UserService } from 'src/user/user.service';
import { CourseModule } from 'src/course/course.module';
import { CourseService } from 'src/course/course.service';

@Module({
  imports: [TypeOrmModule.forFeature([Section]), AuthModule, forwardRef(() => ActivityModule), UserModule, forwardRef(() => CourseModule)],
  controllers: [SectionController],
  providers: [SectionService, ActivityService, UserService, CourseService],
  exports: [TypeOrmModule, SectionService],
})
export class SectionModule {}
