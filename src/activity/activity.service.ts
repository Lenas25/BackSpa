import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Activity } from './entities/activity.entity';
import { Repository } from 'typeorm';
import { Course } from 'src/course/entities/course.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityDto } from './dto/activity.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) { }

  async create(createActivityDto: CreateActivityDto) {
    // try {
    //   const course = await this.courseRepository.findOne({
    //     where: {
    //       id: createActivityDto.id_course
    //     }
    //   });
    //   if (!course) {
    //     throw new NotFoundException('Curso no encontrado');
    //   }
    //   for (const activity of createActivityDto.activities) {
    //     const newActivity = this.activityRepository.create(activity);
    //     newActivity.course = course;
    //     await this.activityRepository.save(newActivity);
    //   }
    //   return await this.activityRepository.find({
    //     where: {
    //       course
    //     }
    //   });
    // } catch (error) {
    //   throw new BadRequestException(error);
    // }
  }

  async findOne(id: number) {
    try {
      const course = await this.courseRepository.findOne({
        where: {
          id
        }
      })
      if (!course) {
        throw new NotFoundException('Actividades relacionadas a curso no encontrado');
      }

      return await this.activityRepository.find({
        where: {
          course
        }
      })
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async update(id: number, updateActivityDto: ActivityDto) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id
        }
      });
      if (!activity) {
        throw new NotFoundException('Actividad no encontrada');
      }
      await this.activityRepository.update(id, updateActivityDto);
      return await this.activityRepository.findOne({
        where: {
          id
        }
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  async remove(id: number) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id
        }
      });
      if (!activity) {
        throw new NotFoundException('Actividad no encontrada');
      }
      await this.activityRepository.remove(activity);
      return {
        message: "Actividad eliminada"
      }
    } catch (error) {
      throw new BadRequestException(error);
    }
  }
}
