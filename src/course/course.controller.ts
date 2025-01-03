import { Controller, Get, Post, Body, Patch, Param, Delete, Res, UseGuards } from '@nestjs/common';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import type { Response } from 'express';
import type { Course } from './entities/course.entity';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';


@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) { }

  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async create(@Body() createCourseDto: CreateCourseDto, @Res() response: Response): Promise<Response> {
    try {
      const newCourse = await this.courseService.create(createCourseDto);
      return response.status(200).json({
        message: 'Curso creado correctamente',
        data: newCourse,
      });
    } catch (e) {
      return response.status(400).json({
        message: 'Error creando el curso',
        error: e.message,
      });
    }
  }

  @Get()
  async findAll(@Res() response: Response): Promise<Response> {
    return response.status(200).json({
      message: "Cursos obtenidos correctamente",
      data: await this.courseService.findAll(),
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseGuards(AuthGuard, RolesGuard)
  async findOne(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const course = await this.courseService.findOne(id);
      return response.status(200).json({
        message: 'Se obtuvo el curso correctamente',
        data: course,
      });
    } catch (e) {
      return response.status(400).json({
        message: 'Error al obtener el curso',
        error: e.message,
      });
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async update(@Param('id') id: number, @Body() updateCourseDto: UpdateCourseDto, @Res() response: Response): Promise<Response> {
    try {
      const courseUpdated = await this.courseService.update(id, updateCourseDto);
      return response.status(200).json({
        message: "Curso actualizado",
        data: courseUpdated,
      });
    } catch (e) {
      return response.status(400).json({
        message: "Error al editar el curso",
        error: e.message,
      });
    }
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async remove(@Param('id') id: number, @Res() response: Response): Promise<Response> {
    try {
      const courseDeleted = await this.courseService.remove(id);
      return response.status(200).json({
        message: "Curso eliminado",
        data: courseDeleted,
      });
    } catch (e) {
      return response.status(400).json({
        message: "Error al eliminar el curso",
        error: e.message,
      });
    }
  }
}
