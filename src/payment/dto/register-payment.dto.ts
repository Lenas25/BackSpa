import { IsISO8601, IsNumber, IsPositive } from 'class-validator';

export class RegisterPaymentDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'amount must be a valid decimal number with up to 2 decimal places',
    },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  amount: number;

  @IsISO8601({}, { message: 'paidDate must be a valid ISO 8601 date' })
  paidDate: string;
}
