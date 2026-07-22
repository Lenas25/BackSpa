import { Module } from '@nestjs/common';
import { GradeService } from './grade.service';
import { GradeController } from './grade.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grade } from './entities/grade.entity';
import { ActivityModule } from 'src/activity/activity.module';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { UserModule } from 'src/user/user.module';
import { SectionModule } from 'src/section/section.module';
import { AuthModule } from 'src/auth/auth.module';

// EnrollmentService/ActivityService/SectionService are NOT re-declared here:
// EnrollmentModule/ActivityModule/SectionModule already export them (plus
// their TypeOrmModule repositories) — see EnrollmentModule for why
// re-declaring a service that an imported module already provides is the
// same anti-pattern that crash-looped app boot (a module-local SectionService
// instance here could not resolve CourseRepository either).
@Module({
  imports: [TypeOrmModule.forFeature([Grade]), ActivityModule, EnrollmentModule, UserModule, SectionModule, AuthModule],
  controllers: [GradeController],
  providers: [GradeService],
  exports: [TypeOrmModule, GradeService],
})
export class GradeModule {}
