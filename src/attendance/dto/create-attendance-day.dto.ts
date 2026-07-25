import { IsISO8601, IsNumber, IsPositive } from 'class-validator';

export class CreateAttendanceDayDto {
  @IsNumber({}, { message: 'sectionId must be a number' })
  @IsPositive({ message: 'sectionId must be greater than 0' })
  sectionId: number;

  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date' })
  date: string;
}
