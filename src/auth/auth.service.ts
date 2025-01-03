import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService, private readonly jwtService: JwtService) { }

  async login(loginDto: LoginDto) {
    const user = await this.userService.findByUsername(loginDto.username);
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!user) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const payload = { role: user.role, id: user.id };
    const token = await this.jwtService.signAsync(payload);

    return {
      token
    };
  }
}
