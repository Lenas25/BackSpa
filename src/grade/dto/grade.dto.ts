import { IsDecimal, IsNumber } from "class-validator";


export class GradeDto {
  @IsNumber()
  id_enrollment: number;

  @IsNumber()
  grade: number;
}