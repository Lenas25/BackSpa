import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetDueDateDto } from './set-due-date.dto';

describe('SetDueDateDto', () => {
  it('accepts a valid ISO date-only string', async () => {
    const dto = plainToInstance(SetDueDateDto, { dueDate: '2026-08-01' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts null (clears the due date)', async () => {
    const dto = plainToInstance(SetDueDateDto, { dueDate: null });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-ISO date string', async () => {
    const dto = plainToInstance(SetDueDateDto, { dueDate: '01/08/2026' });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'dueDate')).toBeDefined();
  });

  it('rejects a missing dueDate', async () => {
    const dto = plainToInstance(SetDueDateDto, {});

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'dueDate')).toBeDefined();
  });
});
