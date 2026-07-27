import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDayDto } from './dto/create-attendance-day.dto';
import { UpdateAttendanceDayDto } from './dto/update-attendance-day.dto';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { AttendanceOwnershipGuard } from 'src/auth/guard/attendance-ownership.guard';

// Role-Based Access (mirrors payment/grade): ADMIN has full read/write on
// every route; TUTOR is scoped to sections they own via
// AttendanceOwnershipGuard, applied to every section-scoped route — reads
// included. Attendance rosters and metrics contain student names and
// present/absent records, so unscoped reads would leak another tutor's
// section data (fixed cross-tenant read exposure — was HIGH). The section
// id isn't always a plain `:id` route param, so AttendanceOwnershipGuard is
// used here instead of SectionOwnershipGuard — see the guard's own comment
// for how it resolves the section per route. ALUMNO has one endpoint,
// GET /attendance/enrollment/:enrollmentId (self-read only) — its
// ownership is enrollment-based, not section-based, so it deliberately
// does NOT use AttendanceOwnershipGuard; see that route's own comment.
@Controller('attendance')
@UseGuards(AuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('day')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async createDay(
    @Body() createAttendanceDayDto: CreateAttendanceDayDto,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const day = await this.attendanceService.createDay(
        createAttendanceDayDto.sectionId,
        createAttendanceDayDto.date,
      );
      return response.status(201).json({
        message: 'Día de asistencia creado correctamente',
        data: day,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al crear el día de asistencia',
        error: e.message,
      });
    }
  }

  @Get('section/:sectionId')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async findDaysBySection(
    @Param('sectionId') sectionId: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const days = await this.attendanceService.findDaysBySection(sectionId);
      return response.status(200).json({
        message: 'Días de asistencia obtenidos correctamente',
        data: days,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener los días de asistencia',
        error: e.message,
      });
    }
  }

  @Get('day/:dayId')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async findDayRoster(
    @Param('dayId') dayId: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const roster = await this.attendanceService.findDayRoster(dayId);
      return response.status(200).json({
        message: 'Asistencia del día obtenida correctamente',
        data: roster,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener la asistencia del día',
        error: e.message,
      });
    }
  }

  @Patch('day/:dayId')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async updateDay(
    @Param('dayId') dayId: number,
    @Body() updateAttendanceDayDto: UpdateAttendanceDayDto,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const roster = await this.attendanceService.updateDay(
        dayId,
        updateAttendanceDayDto.records,
      );
      return response.status(200).json({
        message: 'Asistencia actualizada correctamente',
        data: roster,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al actualizar la asistencia',
        error: e.message,
      });
    }
  }

  @Delete('day/:dayId')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async deleteDay(
    @Param('dayId') dayId: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      await this.attendanceService.deleteDay(dayId);
      return response.status(200).json({
        message: 'Día de asistencia eliminado correctamente',
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al eliminar el día de asistencia',
        error: e.message,
      });
    }
  }

  @Get('metrics/section/:sectionId')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AttendanceOwnershipGuard)
  async metricsBySection(
    @Param('sectionId') sectionId: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const metrics =
        await this.attendanceService.metricsBySection(sectionId);
      return response.status(200).json({
        message: 'Métricas de asistencia obtenidas correctamente',
        data: metrics,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener las métricas de asistencia',
        error: e.message,
      });
    }
  }

  // Student self-attendance-read (mirrors GradeController.findByEnrollment):
  // ownership here is ENROLLMENT-based (does this enrollment belong to the
  // requesting alumno / the requesting tutor's section?), not
  // SECTION-based, so AttendanceOwnershipGuard does NOT apply — it only
  // resolves a section id and has no notion of "is this enrollment mine".
  // The check instead runs inside AttendanceService.attendanceByEnrollment
  // (assertEnrollmentOwnership), exactly like
  // GradeService.findByEnrollment's assertEnrollmentOwnership.
  @Get('enrollment/:enrollmentId')
  @Roles(Role.ADMIN, Role.TUTOR, Role.ALUMNO)
  async attendanceByEnrollment(
    @Param('enrollmentId') enrollmentId: number,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const attendance = await this.attendanceService.attendanceByEnrollment(
        enrollmentId,
        request.user as never,
      );
      return response.status(200).json({
        message: 'Asistencia de la matrícula obtenida correctamente',
        data: attendance,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener la asistencia de la matrícula',
        error: e.message,
      });
    }
  }
}
