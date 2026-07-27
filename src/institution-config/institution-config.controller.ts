import { Body, Controller, Get, HttpException, Patch, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InstitutionConfigService } from './institution-config.service';
import { UpdateInstitutionConfigDto } from './dto/update-institution-config.dto';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';

@Controller('institution-config')
@UseGuards(AuthGuard, RolesGuard)
export class InstitutionConfigController {
  constructor(
    private readonly institutionConfigService: InstitutionConfigService,
  ) {}

  // ADMIN and TUTOR both read the config to render the PDF report.
  @Get()
  @Roles(Role.ADMIN, Role.TUTOR)
  async get(@Res() response: Response): Promise<Response> {
    try {
      const config = await this.institutionConfigService.get();
      return response.status(200).json({
        message: 'Configuración de la institución encontrada',
        data: config,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al buscar la configuración de la institución',
        error: e.message,
      });
    }
  }

  // ADMIN only: this text goes straight onto the official PDF.
  @Patch()
  @Roles(Role.ADMIN)
  async update(
    @Body() updateInstitutionConfigDto: UpdateInstitutionConfigDto,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const config = await this.institutionConfigService.update(
        updateInstitutionConfigDto,
      );
      return response.status(200).json({
        message: 'Configuración de la institución actualizada',
        data: config,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al actualizar la configuración de la institución',
        error: e.message,
      });
    }
  }
}
