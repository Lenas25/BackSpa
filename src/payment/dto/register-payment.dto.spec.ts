import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterPaymentDto } from './register-payment.dto';

describe('RegisterPaymentDto', () => {
  const validPayload = { amount: 150.5, paidDate: '2026-07-23' };

  it('accepts a valid amount and ISO paidDate', async () => {
    const dto = plainToInstance(RegisterPaymentDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects amount = 0 (must be greater than 0)', async () => {
    const dto = plainToInstance(RegisterPaymentDto, {
      ...validPayload,
      amount: 0,
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'amount')).toBeDefined();
  });

  it('rejects a negative amount', async () => {
    const dto = plainToInstance(RegisterPaymentDto, {
      ...validPayload,
      amount: -10,
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'amount')).toBeDefined();
  });

  it('rejects an amount with more than 2 decimal places', async () => {
    const dto = plainToInstance(RegisterPaymentDto, {
      ...validPayload,
      amount: 150.555,
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'amount')).toBeDefined();
  });

  it('rejects a non-ISO paidDate', async () => {
    const dto = plainToInstance(RegisterPaymentDto, {
      ...validPayload,
      paidDate: '23/07/2026',
    });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'paidDate')).toBeDefined();
  });

  it('rejects a missing paidDate', async () => {
    const dto = plainToInstance(RegisterPaymentDto, { amount: 100 });

    const errors = await validate(dto, {
      validationError: { target: false },
    });

    expect(errors.find((e) => e.property === 'paidDate')).toBeDefined();
  });
});
