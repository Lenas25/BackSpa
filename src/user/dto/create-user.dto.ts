import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { Role } from "src/common/enums/role.enum";

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
  
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsString()
  @MinLength(9)
  phone: string;
}
