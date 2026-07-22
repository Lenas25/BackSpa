import { Transform } from "class-transformer";
import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateCourseDto {
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => value.trim())
  name: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value.trim())
  description: string;

  @IsString()
  @IsOptional()
  imageUrl: string;
}
