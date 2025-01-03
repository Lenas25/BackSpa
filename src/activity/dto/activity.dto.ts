import { IsDecimal, IsNumber, IsString } from "class-validator";


export class ActivityDto {
  @IsString()
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'percentage must be a valid decimal number with up to 2 decimal places' })
  percentage: number;

}
