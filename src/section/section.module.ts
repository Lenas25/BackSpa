import { forwardRef, Module } from '@nestjs/common';
import { SectionService } from './section.service';
import { SectionController } from './section.controller';
import { Section } from './entities/section.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityModule } from 'src/activity/activity.module';
import { UserModule } from 'src/user/user.module';
import { CourseModule } from 'src/course/course.module';

// ActivityService/UserService/CourseService are NOT re-declared here:
// ActivityModule/UserModule/CourseModule already export them (plus their
// TypeOrmModule repositories) — see EnrollmentModule for why re-declaring a
// service that an imported module already provides is an anti-pattern.
@Module({
  imports: [TypeOrmModule.forFeature([Section]), AuthModule, forwardRef(() => ActivityModule), UserModule, forwardRef(() => CourseModule)],
  controllers: [SectionController],
  providers: [SectionService],
  exports: [TypeOrmModule, SectionService],
})
export class SectionModule {}
