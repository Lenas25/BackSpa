import { Transform } from "class-transformer";
import { IsEmail, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import type { Role } from "src/common/enums/role.enum";

export class CreateUserDto {
  @IsNumber()
  id: string;
  @IsString()
  @MinLength(3)
  @Transform(({value}) => value.trim())
  name: string;
  
  @IsString()
  @MinLength(3)
  @Transform(({value}) => value.trim())
  lastName: string;

  @IsEmail()
  @MinLength(10)
  @Transform(({value}) => value.trim())
  email: string;
  
  @IsString()
  @MinLength(3)
  @Transform(({value}) => value.trim())
  username: string;
  
  @IsString()
  password: string;
  
  @IsString()
  @IsOptional()
  @Transform(({value}) => value.toUpperCase())
  role?: Role;

  @IsString()
  @MinLength(9)
  phone: string;
}
