import { Transform, Type } from "class-transformer";
import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { CreateActivityDto } from "src/activity/dto/create-activity.dto";
import { ActivitiesSumTo100 } from "src/common/validators/activities-sum-to-100.validator";


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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  @ActivitiesSumTo100()
  activities: CreateActivityDto[];

  @IsOptional()
  @IsString()
  id_tutor: string;

  @IsNumber()
  id_course: number;
}
