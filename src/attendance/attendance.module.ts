import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDay } from './entities/attendance-day.entity';
import { Attendance } from './entities/attendance.entity';
import { Section } from 'src/section/entities/section.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceOwnershipGuard } from 'src/auth/guard/attendance-ownership.guard';

// AttendanceModule owns the attendance-day lifecycle. It registers the
// Section and Enrollment repository TOKENS here directly (safe — see
// PaymentModule's comment: registering a repository token in multiple
// modules is fine, the documented anti-pattern that crash-looped app boot
// is re-declaring another module's SERVICE as a local provider, which this
// module does not do).
@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceDay, Attendance, Section, Enrollment]),
    AuthModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceOwnershipGuard],
  exports: [TypeOrmModule, AttendanceService],
})
export class AttendanceModule {}
