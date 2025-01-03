import { Controller, Get, Post, Body, Patch, Param, Delete, Res, UseGuards } from '@nestjs/common';
import { GradeService } from './grade.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Response } from 'express';
import { Grade } from './entities/grade.entity';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';

@Controller('grade')
@UseGuards(AuthGuard, RolesGuard)
export class GradeController {
  constructor(private readonly gradeService: GradeService) { }

  @Get(':id')
  async findOne(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const grade = await this.gradeService.findOne(id);
      return response.status(200).json({
        message: "Actividad encontrada",
        data: grade
      })
    } catch (e) {
      return response.status(400).json({
        message: "Error al buscar la actividad",
        error: e.message
      });
    }
  }

  @Get('/enrollment/:idEnrollment')
  async findByEnrollment(@Param('idEnrollment') idEnrollment: number, @Res() response: Response): Promise<Response> {
    try {
      const grade = await this.gradeService.findByEnrollment(idEnrollment);
      return response.status(200).json({
        message: "Matrícula encontrada",
        data: grade
      })
    } catch (e) {
      return response.status(400).json({
        message: "Error al buscar la matrícula",
        error: e.message
      });
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TUTOR)
  async update(@Param('id') id: number, @Body() updateGradeDto: UpdateGradeDto, @Res() response: Response): Promise<Response> {
    try {
      const grade = await this.gradeService.update(id, updateGradeDto);
      return response.status(200).json({
        message: "Actividad actualizada",
        data: grade
      })
    } catch (e) {
      return response.status(400).json({
        message: "Error al registrar o actualizar las notas",
        error: e.message
      });
    }
  }
}