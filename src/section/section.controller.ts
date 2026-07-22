import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Res, UseGuards } from '@nestjs/common';
import { SectionService } from './section.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import type { Request, Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { SectionOwnershipGuard } from 'src/auth/guard/section-ownership.guard';


@Controller('section')
@UseGuards(AuthGuard, RolesGuard)
export class SectionController {
  constructor(private readonly sectionService: SectionService) { }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() createSectionDto: CreateSectionDto, @Res() response: Response): Promise<Response> {
    try {
      const newSection = await this.sectionService.create(createSectionDto);
      return response.status(200).json({
        message: 'Sección creada correctamente',
        data: newSection,
      });
    } catch (e) {
      return response.status(400).json({
        message: 'Error creando la sección',
        error: e.message,
      });
    }
  }

  // Role-Based Section Access: TUTOR is scoped to their own sections at the
  // service level here (no route :id to guard against for a list route).
  @Get()
  @Roles(Role.ADMIN, Role.TUTOR)
  async findAll(@Req() request: Request, @Res() response: Response): Promise<Response> {
    return response.status(200).json({
      message: "Secciones obtenidas correctamente",
      data: await this.sectionService.findAll(request.user as never),
    });
  }

  // Role-Based Section Access: SectionOwnershipGuard denies a TUTOR who is
  // not assigned to this specific section.
  @Get(':id')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(SectionOwnershipGuard)
  async findOne(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const section = await this.sectionService.findOne(id);
      return response.status(200).json({
        message: 'Se obtuvo la sección correctamente',
        data: section,
      });
    } catch (e) {
      return response.status(400).json({
        message: 'Error al obtener la sección',
        error: e.message,
      });
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param('id') id: number, @Body() updateSectionDto: UpdateSectionDto, @Res() response: Response): Promise<Response> {
    try {
      const sectionUpdated = await this.sectionService.update(id, updateSectionDto);
      return response.status(200).json({
        message: "Sección actualizada",
        data: sectionUpdated,
      });
    } catch (e) {
      return response.status(400).json({
        message: "Error al editar la sección",
        error: e.message,
      });
    }
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const sectionDeleted = await this.sectionService.remove(id);
      return response.status(200).json({
        message: "Sección eliminada",
        data: sectionDeleted,
      });
    } catch (e) {
      return response.status(400).json({
        message: "Error al eliminar la sección",
        error: e.message,
      });
    }
  }
}
