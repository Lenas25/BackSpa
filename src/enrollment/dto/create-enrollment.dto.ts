import { IsArray, IsBoolean, IsDate, IsNumber, IsOptional, ValidateNested } from "class-validator";
import { Course } from "src/course/entities/course.entity";
import { UserIdDto } from "./userId.dto";
import { Transform, Type } from "class-transformer";

export class CreateEnrollmentDto {
    @IsNumber()
    @IsOptional()
    id_course: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserIdDto)
    @IsOptional()
    users: UserIdDto[];

    @IsNumber()
    @IsOptional()
    final_grade: number;

    @IsDate()
    @IsOptional()
    enrollment_date: Date;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value !== undefined ? value : true)
    active: boolean;
}
