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
import { SectionModule } from 'src/section/section.module';
import { SectionService } from 'src/section/section.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Grade]), ActivityModule, EnrollmentModule, UserModule, SectionModule,AuthModule],
  controllers: [GradeController],
  providers: [GradeService, EnrollmentService, ActivityService, SectionService],
  exports: [TypeOrmModule, GradeService],
})
export class GradeModule {}
