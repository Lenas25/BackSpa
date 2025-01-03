import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res() response: Response): Promise<Response> {
    try{
      const user = await this.authService.login(loginDto);
      return response.status(200).json({
        message: 'Usuario logueado correctamente',
        data: user
      });
    }catch(e){
      return response.status(401).json({
        message: "Credenciales inválidas",
        error: e.message
      });
    }
  }
}
