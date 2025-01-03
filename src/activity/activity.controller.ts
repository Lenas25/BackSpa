import { Controller, Get, Post, Body, Patch, Param, Delete, Res, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityDto } from './dto/activity.dto';
import { Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';

@Controller('activity')
@UseGuards(AuthGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) { }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() createActivityDto: CreateActivityDto, @Res() response: Response): Promise<Response> {
    try {
      const activities = await this.activityService.create(createActivityDto);
      return response.status(201).json({
        message: 'Actividades creadas con éxito',
        data: activities
      });
    } catch (error) {
      return response.status(400).json({
        message: 'Error al crear las actividades',
        error: error.message
      });
    }
  }

  // Por curso
  @Get(':id')
  async findOne(@Param('id') id: number) {
    try {
      const activitiesPerCourse = await this.activityService.findOne(id);
      return {
        message: 'Actividades encontradas con éxito',
        data: activitiesPerCourse
      }
    } catch (error) {
      return {
        message: 'Error al encontrar las actividades',
        error: error.message
      }
    }
  }

  // Por actividad
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param('id') id: number, @Body() updateActivityDto: ActivityDto) {
    try {
      const activity = await this.activityService.update(id, updateActivityDto);
      return {
        message: 'Actividad actualizada con éxito',
        data: activity
      }
    } catch (error) {
      return {
        message: 'Error al actualizar la actividad',
        error: error.message
      }
    }
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: number) {
    try {
      const activity = await this.activityService.remove(id);
      return {
        message: 'Actividad eliminada con éxito',
        data: activity
      }
    } catch (error) {
      return {
        message: 'Error al eliminar la actividad',
        error: error.message
      }
    }
  }
}
