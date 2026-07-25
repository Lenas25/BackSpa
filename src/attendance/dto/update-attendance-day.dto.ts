import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceRecordDto } from './attendance-record.dto';

// Bulk Day Save (locked decision, sdd/asistencia/decisions): one PATCH
// carries every present/absent toggle for the day, mirroring
// UpdateGradeDto's nested `grades` array shape (src/grade/dto).
export class UpdateAttendanceDayDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}
