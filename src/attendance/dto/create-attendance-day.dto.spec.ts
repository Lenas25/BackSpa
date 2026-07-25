import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAttendanceDayDto } from './create-attendance-day.dto';

describe('CreateAttendanceDayDto', () => {
  const validPayload = { sectionId: 5, date: '2026-07-24' };

  it('accepts a plain YYYY-MM-DD date string', async () => {
    const dto = plainToInstance(CreateAttendanceDayDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // Date-only invariant (Finding 4): the frontend design deliberately keeps
  // `date` a bare YYYY-MM-DD string to avoid an America/Lima timezone-shift
  // bug that a full datetime would reintroduce (a UTC datetime near
  // midnight can serialize to the wrong calendar day for Lima's UTC-5
  // offset). @IsISO8601() accepts full datetimes, which defeats that
  // design — this must be rejected at the DTO boundary.
  it('rejects a full ISO 8601 datetime (defeats the date-only design)', async () => {
    const dto = plainToInstance(CreateAttendanceDayDto, {
      ...validPayload,
      date: '2026-07-24T23:00:00Z',
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'date')).toBeDefined();
  });

  it('rejects a non-date string', async () => {
    const dto = plainToInstance(CreateAttendanceDayDto, {
      ...validPayload,
      date: 'not-a-date',
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'date')).toBeDefined();
  });

  it('rejects a missing date', async () => {
    const dto = plainToInstance(CreateAttendanceDayDto, { sectionId: 5 });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'date')).toBeDefined();
  });
});
