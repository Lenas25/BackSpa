import { IsArray, IsDecimal, IsNegative, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { ActivityDto } from "./activity.dto";
import { Type } from "class-transformer";

export class CreateActivityDto {
  @IsOptional()
  id: number;

  @IsString()
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'percentage must be a valid decimal number with up to 2 decimal places' })
  percentage: number;

  
  @IsOptional()
  new?: boolean;

}
