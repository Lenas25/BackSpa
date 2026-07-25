import { IsBoolean, IsNumber } from 'class-validator';

export class AttendanceRecordDto {
  @IsNumber()
  enrollmentId: number;

  @IsBoolean()
  present: boolean;
}
