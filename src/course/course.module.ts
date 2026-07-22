import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { Course } from './entities/course.entity';
import { Section } from 'src/section/entities/section.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  // Section is registered here (not imported via SectionModule) purely to
  // give CourseService a read-only repository for the delete-guard count
  // query, without introducing a circular module dependency with
  // SectionModule (which already depends on CourseModule).
  imports: [TypeOrmModule.forFeature([Course, Section]), AuthModule],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [TypeOrmModule, CourseService],
})
export class CourseModule {}
