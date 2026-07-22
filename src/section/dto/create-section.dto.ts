import { Transform, Type } from "class-transformer";
import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { CreateActivityDto } from "src/activity/dto/create-activity.dto";


export class CreateSectionDto {
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => value.trim())
  name: string;

  @IsISO8601()
  initialDate: Date;

  @IsISO8601()
  endDate: Date;

  @IsNumber()
  duration: number;

  @IsOptional()
  @IsNumber()
  installmentsCount?: number;

  // Activity Percentage Validation (spec: "section-management" domain,
  // user-approved change 2026-07-22) — the sum of activity percentages is no
  // longer required to equal 100 server-side; it's an indicator-only value
  // (client shows a warning above 100%, never blocks the save). Per-activity
  // bounds (CreateActivityDto: percentage > 0 and <= 100, name required)
  // remain enforced via @ValidateNested.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  activities: CreateActivityDto[];

  @IsOptional()
  @IsString()
  id_tutor: string;

  @IsNumber()
  id_course: number;
}
