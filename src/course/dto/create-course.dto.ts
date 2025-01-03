import { Transform, Type } from "class-transformer";
import { IsArray, IsDate, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { CreateActivityDto } from "src/activity/dto/create-activity.dto";


export class CreateCourseDto {
  @IsString()
  @MinLength(3)
  @Transform(({value}) => value.trim())
  name: string;

  @IsString()
  @IsOptional()
  @Transform(({value}) => value.trim())
  description: string;

  @IsString()
  @IsOptional()
  imageUrl: string;

  @IsDate()
  @Transform(({ value }) => new Date(value))
  initialDate: Date;

  @IsDate()
  @Transform(({ value }) => new Date(value))
  endDate: Date;

  @IsNumber()
  duration: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  activities: CreateActivityDto[];
}
