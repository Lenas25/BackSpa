import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { jwtConstants } from "src/auth/constants/jwt.constants";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException("No existe token de autenticación");
    }

    try{
      const payload = await this.jwtService.verifyAsync(
        token,
        { secret: jwtConstants.secret }
      );

      if (!payload) {
        throw new UnauthorizedException("Token inválido");
      }
      request.user = payload;
    }catch(e){
      throw new UnauthorizedException("Token inválido");
    }
    return true;
  }

  private extractTokenFromHeader(request: Request) {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}