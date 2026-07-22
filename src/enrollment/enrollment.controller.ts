import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Res, UseGuards, HttpException } from '@nestjs/common';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { EnrollmentService } from './enrollment.service';
import type { Request, Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { SectionOwnershipGuard } from 'src/auth/guard/section-ownership.guard';

@Controller('enrollment')
@UseGuards(AuthGuard, RolesGuard)
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) { }

  // Role-Based Section Access: TUTOR is scoped to enrollments of their own
  // sections at the service level here (no route :id to guard against for a
  // list route) — mirrors the pattern used by SectionController.findAll.
  @Get()
  @Roles(Role.ADMIN, Role.TUTOR)
  async findAll(@Req() request: Request) {
    return this.enrollmentService.findAll(request.user as never);
  }

  // Por usuario. Alumno sees own data only (spec: "tutor-scoping" domain):
  // EnrollmentService.findOneByUser rejects an ALUMNO requesting an id that
  // isn't their own.
  @Get(':id')
  @UseGuards(AuthGuard)
  async findOneByUser(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<Response> {
    try {
      const enrollment = await this.enrollmentService.findOneByUser(id, request.user as never);
      return response.status(201).json({
        message: "Asignación encontrada",
        data: enrollment,
      });
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 400;
      return response.status(status).json({
        message: "Error al obtener asignaciones basadas en usuarios",
        error: error.message,
      });
    }
  }

  // Por sección (route path kept as `/course/:id` — public API contract,
  // still referenced by the frontend as `courseId`). `id` here IS the
  // section id, so SectionOwnershipGuard applies directly: a TUTOR may only
  // read the roster of their own sections.
  @Get('/course/:id')
  @UseGuards(AuthGuard, SectionOwnershipGuard)
  async findOneBySection(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const enrollment = await this.enrollmentService.findOneBySection(id);
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
  @Roles(Role.ADMIN)
  async finishSection(@Param('id') id:number, @Res() response: Response): Promise<Response> {
    try {
      const enrollmentFinished = await this.enrollmentService.finishSection(id);
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
