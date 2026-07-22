import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { UserModule } from 'src/user/user.module';
import { SectionModule } from 'src/section/section.module';
import { UserService } from 'src/user/user.service';
import { SectionService } from 'src/section/section.service';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityModule } from 'src/activity/activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment]), UserModule, SectionModule, AuthModule, ActivityModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, UserService, SectionService, ActivityService],
  exports: [TypeOrmModule, EnrollmentService],
})
export class EnrollmentModule {}
