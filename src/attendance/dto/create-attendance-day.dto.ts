import { IsNumber, IsPositive, Matches } from 'class-validator';

export class CreateAttendanceDayDto {
  @IsNumber({}, { message: 'sectionId must be a number' })
  @IsPositive({ message: 'sectionId must be greater than 0' })
  sectionId: number;

  // Deliberately date-only (Finding 4): @IsISO8601() also accepts full
  // datetimes (e.g. '2026-07-24T23:00:00Z'), which defeats the
  // YYYY-MM-DD-string design used to avoid the America/Lima
  // timezone-shift bug (a UTC datetime near midnight can serialize to the
  // wrong calendar day for Lima's UTC-5 offset). Enforce the plain-date
  // shape at the boundary instead.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}
