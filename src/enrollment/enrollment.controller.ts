import { Controller, Get, Post, Body, Patch, Param, Delete, Res, UseGuards } from '@nestjs/common';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentService } from './enrollment.service';
import type { Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';

@Controller('enrollment')
@UseGuards(AuthGuard, RolesGuard)
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) { }

  @Get()
  @Roles(Role.ADMIN, Role.TUTOR)
  async findAll() {
    return this.enrollmentService.findAll();
  }

  // Por usuario
  @Get(':id')
  @UseGuards(AuthGuard)
  async findOneByUser(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const enrollment = await this.enrollmentService.findOneByUser(id);
      return response.status(201).json({
        message: "Asignación encontrada",
        data: enrollment,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al obtener asignaciones basadas en usuarios",
        error: error.message,
      });
    }
  }

  // Por curso
  @Get('/course/:id')
  @UseGuards(AuthGuard)
  async findOneByCourse(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const enrollment = await this.enrollmentService.findOneByCourse(id);
      return response.status(201).json({
        message: "Asignación encontrada",
        data: enrollment,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al obtener las asignaciones basadas en un curso",
        error: error.message,
      });
    }
  }

  // Por curso
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param('id') id: number, @Body() updateEnrollmentDto: UpdateEnrollmentDto, @Res() response: Response): Promise<Response> {
    try {
      const enrollmentUpdated = await this.enrollmentService.update(id, updateEnrollmentDto);
      return response.status(200).json({
        message: "Asignación actualizada",
        data: enrollmentUpdated,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al actualizar la asignación",
        error: error.message,
      });
    }
  }

  @Patch('/finish/:id')
  async finishCourse(@Param('id') id:number, @Res() response: Response): Promise<Response> {
    try {
      const enrollmentFinished = await this.enrollmentService.finishCourse(id);
      return response.status(200).json({
        message: "Curso finalizado",
        data: enrollmentFinished,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al finalizar el curso",
        error: error.message,
      });
    }
  }
}
