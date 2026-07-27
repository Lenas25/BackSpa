import { IsISO8601, Matches, ValidateIf } from 'class-validator';

// Admin-Only Manual Due Date (client rule): `dueDate` must be either a
// DATE-ONLY "YYYY-MM-DD" string or explicit `null` (clears the due date) —
// the key itself is required, so an omitted `dueDate` (undefined) falls
// through to validation and fails.
//
// Two decorators, both required:
//  - @Matches restricts the SHAPE to exactly "YYYY-MM-DD". `@IsISO8601`
//    alone (even with `strict: true`) still accepts full timestamps like
//    "2026-07-28T02:00:00-05:00"; since the entity column is `date` and the
//    write path assigns the string straight through without a DB round-trip
//    (TypeORM does not re-read a plain `date` column after save), a
//    timestamp would echo back an unnormalized `dueDate` and skew the
//    derived status. The regex closes that at the trust boundary.
//  - @IsISO8601({ strict: true }) rejects shapes that match the regex but
//    are not real calendar dates (e.g. "2026-13-40").
export class SetDueDateDto {
  @ValidateIf((dto: SetDueDateDto) => dto.dueDate !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dueDate must be a date-only string in YYYY-MM-DD format',
  })
  @IsISO8601({ strict: true }, { message: 'dueDate must be a valid ISO 8601 date' })
  dueDate: string | null;
}
