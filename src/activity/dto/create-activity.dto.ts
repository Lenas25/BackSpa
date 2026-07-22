import { IsArray, IsDecimal, IsNegative, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, ValidateNested } from "class-validator";
import { ActivityDto } from "./activity.dto";
import { Type } from "class-transformer";

export class CreateActivityDto {
  @IsOptional()
  id: number;

  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  name: string;

  // Per-activity bounds (spec: "section-management" domain, user-approved
  // change 2026-07-22) — kept even though the sum-to-100 requirement was
  // removed: an activity must still weigh strictly more than 0% and no more
  // than 100%.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'percentage must be a valid decimal number with up to 2 decimal places' })
  @IsPositive({ message: 'percentage must be greater than 0' })
  @Max(100, { message: 'percentage must not exceed 100' })
  percentage: number;


  @IsOptional()
  new?: boolean;

}
