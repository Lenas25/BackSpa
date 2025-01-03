import { IsArray, IsNumber, ValidateNested } from "class-validator";
import { GradeDto } from "./grade.dto";
import { Type } from "class-transformer";

export class CreateGradeDto {
  @IsNumber()
  id_activity: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades: GradeDto[];

}
