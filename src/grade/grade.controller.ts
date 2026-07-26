import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Res, UseGuards, HttpException } from '@nestjs/common';
import { GradeService } from './grade.service';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Request, Response } from 'express';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { SectionOwnershipGuard } from 'src/auth/guard/section-ownership.guard';

@Controller('grade')
@UseGuards(AuthGuard, RolesGuard)
export class GradeController {
  constructor(private readonly gradeService: GradeService) { }

  // Roster-style read (all students' grades for one activity) — restricted
  // to ADMIN/TUTOR. An alumno's own-data path is
  // EnrollmentService.findOneByUser, not this endpoint.
  @Get(':id')
  @Roles(Role.ADMIN, Role.TUTOR)
  async findOne(@Param('id') id: number, @Req() request: Request, @Res() response: Response): Promise<Response> {
    try {
      const grade = await this.gradeService.findOne(id, request.user as never);
      return response.status(200).json({
        message: "Actividad encontrada",
        data: grade
      })
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: "Error al buscar la actividad",
        error: e.message
      });
    }
  }

  // SECTION GRADE REPORT (PLAN_FEATURES 4.4): feeds the client-side PDF
  // report — one response with the section's activities plus every
  // student's per-activity grades and weighted average. `id` here IS the
  // section id (same as PATCH /grade/:id), so SectionOwnershipGuard
  // applies directly: a TUTOR is restricted to their own section, ADMIN is
  // unrestricted. Route declared before ':id' so 'report' isn't parsed as
  // an :id value.
  @Get('report/:id')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(SectionOwnershipGuard)
  async reportBySection(@Param('id') id: number, @Req() request: Request, @Res() response: Response): Promise<Response> {
    try {
      const report = await this.gradeService.reportBySection(id, request.user as never);
      return response.status(200).json({
        message: "Reporte de notas generado",
        data: report
      })
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: "Error al generar el reporte de notas",
        error: e.message
      });
    }
  }

  // No @Roles restriction: ALUMNO uses this to fetch their OWN grades (see
  // GradeService.findByEnrollment's ownership check — an alumno may only
  // read grades for an enrollment that is actually theirs).
  @Get('/enrollment/:idEnrollment')
  async findByEnrollment(@Param('idEnrollment') idEnrollment: number, @Req() request: Request, @Res() response: Response): Promise<Response> {
    try {
      const grade = await this.gradeService.findByEnrollment(idEnrollment, request.user as never);
      return response.status(200).json({
        message: "Matrícula encontrada",
        data: grade
      })
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: "Error al buscar la matrícula",
        error: e.message
      });
    }
  }

  // Tutor Grade Registration Scope (spec: "tutor-scoping" domain): `id` here
  // IS the section id (see GradeService.update(sectionId, ...)), so the same
  // SectionOwnershipGuard used for /section/:id applies directly.
  @Patch(':id')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(SectionOwnershipGuard)
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