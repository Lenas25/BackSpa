import { IsNotEmpty, IsNumber } from 'class-validator';

export class UserIdDto {
  @IsNotEmpty()
  id: string;
}